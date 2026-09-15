import { getDb, assertNoError } from "./db";
import { ValidationError } from "./errors";

type Row = Record<string, unknown>;

// A buyer "report this listing" queue, the same report → admin-resolves
// shape as the existing disputed-orders flow (lib/repo.ts#listDisputedOrders/
// resolveOrderIssue), plus the moderation action an admin takes on the
// PRODUCT itself. Deliberately two separate things: resolving a report just
// closes that one report (see resolveProductReport); moderateProduct is the
// admin's actual decision about the listing, since one product can collect
// several reports and a single dismiss shouldn't require re-deciding the
// listing's fate each time. See migration 027.

export type ProductReportReason = "prohibited_item" | "counterfeit" | "scam" | "spam" | "inappropriate" | "other";
export type ProductReportStatus = "open" | "resolved" | "dismissed";
export type ProductModerationStatus = "active" | "under_review" | "removed";

export const REPORT_REASONS: ProductReportReason[] = [
  "prohibited_item",
  "counterfeit",
  "scam",
  "spam",
  "inappropriate",
  "other",
];

export const REPORT_REASON_LABELS: Record<ProductReportReason, string> = {
  prohibited_item: "Prohibited item",
  counterfeit: "Possible counterfeit",
  scam: "Possible scam",
  spam: "Spam",
  inappropriate: "Inappropriate content",
  other: "Other",
};

const MAX_DETAILS_LENGTH = 1000;

export type ProductReport = {
  id: string;
  productId: string;
  reporterId: string;
  reason: ProductReportReason;
  details: string | null;
  status: ProductReportStatus;
  resolvedBy: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminProductReport = ProductReport & {
  productName: string | null;
  productSeller: string | null;
  productImageUrl: string | null;
  productModerationStatus: ProductModerationStatus | null;
  reporterName: string | null;
  reporterPhone: string | null;
};

function rowToReport(row: Row): ProductReport {
  return {
    id: row.id as string,
    productId: row.product_id as string,
    reporterId: row.reporter_id as string,
    reason: row.reason as ProductReportReason,
    details: (row.details as string | null) ?? null,
    status: row.status as ProductReportStatus,
    resolvedBy: (row.resolved_by as string | null) ?? null,
    resolutionNote: (row.resolution_note as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function randomId(): string {
  return "prpt_" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function reportProduct(input: {
  productId: string;
  reporterId: string;
  reason: ProductReportReason;
  details?: string | null;
}): Promise<ProductReport> {
  if (!REPORT_REASONS.includes(input.reason)) {
    throw new ValidationError("Choose a valid reason for the report.");
  }
  const details = input.details?.trim() || null;
  if (details && details.length > MAX_DETAILS_LENGTH) {
    throw new ValidationError(`Details must be under ${MAX_DETAILS_LENGTH} characters.`);
  }

  const db = getDb();
  const productResult = await db.from("products").select("id, moderation_status").eq("id", input.productId).maybeSingle();
  const productRow = assertNoError(productResult, "checking listing before reporting") as Row | null;
  if (!productRow) throw new ValidationError("That listing doesn't exist.");

  const existingResult = await db
    .from("product_reports")
    .select("id", { count: "exact", head: true })
    .eq("product_id", input.productId)
    .eq("reporter_id", input.reporterId)
    .eq("status", "open");
  if (existingResult.error) throw new Error(`checking existing reports: ${existingResult.error.message}`);
  if ((existingResult.count ?? 0) > 0) {
    throw new ValidationError("You've already reported this listing — we're reviewing it.");
  }

  const result = await db
    .from("product_reports")
    .insert({
      id: randomId(),
      product_id: input.productId,
      reporter_id: input.reporterId,
      reason: input.reason,
      details,
      status: "open",
    })
    .select()
    .single();
  const row = assertNoError(result, "filing product report") as Row;

  // A single report is enough to put a listing in front of a human — it
  // does NOT hide it, since that would let one bad-faith report take down a
  // real listing. Only moderateProduct below (an admin's own decision) does
  // that. Never downgrades a listing an admin already removed or that's
  // already under review.
  if (productRow.moderation_status === "active") {
    await db
      .from("products")
      .update({ moderation_status: "under_review", moderation_reason: `Reported: ${REPORT_REASON_LABELS[input.reason]}` })
      .eq("id", input.productId)
      .eq("moderation_status", "active");
  }

  return rowToReport(row);
}

// Admin-facing — every open report, newest first, with just enough listing
// and reporter identity to act without a second lookup (same shape as
// lib/support.ts#listTicketsForAdmin's users(name, phone) join).
export async function listOpenProductReportsForAdmin(): Promise<AdminProductReport[]> {
  const db = getDb();
  const result = await db
    .from("product_reports")
    .select("*, products(name, seller, image_url, moderation_status), users(name, phone)")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  const rows = assertNoError(result, "listing product reports") as Row[];
  return rows.map((r) => {
    const product = (r.products as Row | null) ?? null;
    const reporter = (r.users as Row | null) ?? null;
    return {
      ...rowToReport(r),
      productName: (product?.name as string | undefined) ?? null,
      productSeller: (product?.seller as string | undefined) ?? null,
      productImageUrl: (product?.image_url as string | undefined) ?? null,
      productModerationStatus: (product?.moderation_status as ProductModerationStatus | undefined) ?? null,
      reporterName: (reporter?.name as string | undefined) ?? null,
      reporterPhone: (reporter?.phone as string | undefined) ?? null,
    };
  });
}

// Closes one report. Doesn't touch the listing itself — see the module
// comment for why that's a separate decision (moderateProduct).
export async function resolveProductReport(
  reportId: string,
  adminId: string,
  outcome: "resolved" | "dismissed",
  note?: string | null
): Promise<ProductReport | null> {
  if (outcome !== "resolved" && outcome !== "dismissed") {
    throw new ValidationError("Resolution must be resolved or dismissed.");
  }
  const db = getDb();
  const result = await db
    .from("product_reports")
    .update({
      status: outcome,
      resolved_by: adminId,
      resolution_note: note?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .eq("status", "open")
    .select()
    .maybeSingle();
  const row = assertNoError(result, "resolving product report") as Row | null;
  if (!row) throw new ValidationError("That report has already been resolved.");
  return rowToReport(row);
}

const PRODUCT_MODERATION_STATUSES: ProductModerationStatus[] = ["active", "under_review", "removed"];

// The admin's actual decision about a listing — flag it for a closer look,
// remove it from sale, or restore it. Separate from resolveProductReport
// (above) on purpose: one listing can collect several reports, and taking
// this action doesn't require re-deciding each one — the admin route calls
// both together when a report is what prompted the decision.
export async function moderateProduct(
  adminId: string,
  productId: string,
  status: ProductModerationStatus,
  reason?: string | null
): Promise<{ id: string; moderationStatus: ProductModerationStatus; moderationReason: string | null } | null> {
  if (!PRODUCT_MODERATION_STATUSES.includes(status)) {
    throw new ValidationError("Unknown moderation status.");
  }
  const cleanReason = reason?.trim() || null;
  if (status !== "active" && !cleanReason) {
    throw new ValidationError("A reason is required when flagging or removing a listing.");
  }

  const db = getDb();
  const result = await db
    .from("products")
    .update({
      moderation_status: status,
      moderation_reason: status === "active" ? null : cleanReason,
      moderated_by: adminId,
      moderated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .select("id, moderation_status, moderation_reason")
    .maybeSingle();
  const row = assertNoError(result, "moderating product") as Row | null;
  if (!row) return null;
  return {
    id: row.id as string,
    moderationStatus: row.moderation_status as ProductModerationStatus,
    moderationReason: (row.moderation_reason as string | null) ?? null,
  };
}

export type AdminFlaggedProduct = {
  id: string;
  name: string;
  seller: string;
  imageUrl: string | null;
  moderationStatus: ProductModerationStatus;
  moderationReason: string | null;
  // How many OPEN reports this listing currently has — a listing can be
  // 'under_review' purely from a moderation_rules 'flag' match, with zero
  // reports at all, so this is a count to show, never something to gate on.
  openReportCount: number;
};

// Every currently-flagged listing, whichever of the two things put it there
// (a moderation rule match, or a buyer report) — the single admin queue for
// "what needs a human look right now", since a rule-triggered flag has no
// product_reports row to surface it through listOpenProductReportsForAdmin.
export async function listFlaggedProductsForAdmin(): Promise<AdminFlaggedProduct[]> {
  const db = getDb();
  const result = await db
    .from("products")
    .select("id, name, seller, image_url, moderation_status, moderation_reason")
    .eq("moderation_status", "under_review")
    .order("moderated_at", { ascending: false });
  const rows = assertNoError(result, "listing flagged products") as Row[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id as string);
  const reportsResult = await db.from("product_reports").select("product_id").eq("status", "open").in("product_id", ids);
  const reportRows = assertNoError(reportsResult, "counting flagged-product reports") as Row[];
  const openReportCounts = new Map<string, number>();
  for (const r of reportRows) {
    const productId = r.product_id as string;
    openReportCounts.set(productId, (openReportCounts.get(productId) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    seller: r.seller as string,
    imageUrl: (r.image_url as string | null) ?? null,
    moderationStatus: r.moderation_status as ProductModerationStatus,
    moderationReason: (r.moderation_reason as string | null) ?? null,
    openReportCount: openReportCounts.get(r.id as string) ?? 0,
  }));
}

// Real counts for the admin overview (§2 of the spec: "flagged products",
// "reported products") — same shape as lib/repo.ts#countDisputedOrders.
export async function countFlaggedProducts(): Promise<number> {
  const db = getDb();
  const result = await db.from("products").select("id", { count: "exact", head: true }).eq("moderation_status", "under_review");
  if (result.error) throw new Error(`counting flagged products: ${result.error.message}`);
  return result.count ?? 0;
}

export async function countOpenProductReports(): Promise<number> {
  const db = getDb();
  const result = await db.from("product_reports").select("id", { count: "exact", head: true }).eq("status", "open");
  if (result.error) throw new Error(`counting open product reports: ${result.error.message}`);
  return result.count ?? 0;
}
