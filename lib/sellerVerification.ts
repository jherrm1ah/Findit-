import { getDb, assertNoError } from "./db";
import { ValidationError } from "./repo";
import { uploadVerificationEvidence, getSignedEvidenceUrl } from "./storage";
import { notifyBestEffort, logAdminAction } from "./repo";
import {
  SellerType,
  VerificationStatus,
  VerificationLevel,
  EvidenceKind,
  canSubmitVerification,
} from "./sellerVerificationLevels";

// Re-exported so existing importers of this module (API routes) don't need
// two import lines — the actual definitions live in
// lib/sellerVerificationLevels.ts, which has no server-only imports and is
// safe for client components (SellerOnboarding.jsx, SellerProfile.jsx) to
// import directly instead.
export {
  SELLER_TYPES,
  VERIFICATION_LEVEL_COPY,
  computeVerificationLevel,
  canSubmitVerification,
  type SellerType,
  type VerificationStatus,
  type VerificationLevel,
  type EvidenceKind,
} from "./sellerVerificationLevels";

type Row = Record<string, unknown>;

function randomId(prefix: string): string {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export type EvidenceItem = { kind: EvidenceKind; url: string | null; textValue: string | null; note: string | null };

export type VerificationOverview = {
  sellerType: SellerType | null;
  category: string | null;
  description: string | null;
  yearsSelling: string | null;
  socialLinks: Record<string, string> | null;
  hasPhysicalStore: boolean | null;
  publicState: string | null;
  publicCity: string | null;
  publicArea: string | null;
  shopAddress: string | null;
  lat: number | null;
  lng: number | null;
  website: string | null;
  status: VerificationStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  evidence: EvidenceItem[];
};

async function loadEvidence(sellerId: string): Promise<EvidenceItem[]> {
  const db = getDb();
  const result = await db.from("seller_verification_evidence").select("*").eq("seller_id", sellerId).order("created_at");
  const rows = assertNoError(result, "loading verification evidence") as Row[];
  const items: EvidenceItem[] = [];
  for (const row of rows) {
    const path = row.storage_path as string | null;
    items.push({
      kind: row.kind as EvidenceKind,
      url: path ? await getSignedEvidenceUrl(path) : null,
      textValue: (row.text_value as string | null) ?? null,
      note: (row.note as string | null) ?? null,
    });
  }
  return items;
}

// Everything the seller (or an admin) needs to see their own submission —
// the wizard's Review step, the dashboard's status card, and the admin
// review screen all read from this.
export async function getSellerVerificationOverview(sellerId: string): Promise<VerificationOverview> {
  const db = getDb();
  const sellerResult = await db.from("sellers").select("*").eq("id", sellerId).maybeSingle();
  const seller = assertNoError(sellerResult, "loading seller") as Row | null;
  if (!seller) throw new ValidationError("Seller not found.");

  const detailsResult = await db.from("seller_verification_details").select("*").eq("seller_id", sellerId).maybeSingle();
  const details = assertNoError(detailsResult, "loading verification details") as Row | null;

  const evidence = await loadEvidence(sellerId);

  return {
    sellerType: (seller.seller_type as SellerType | null) ?? null,
    category: (seller.category as string | null) ?? null,
    description: (seller.description as string | null) ?? null,
    yearsSelling: (seller.years_selling as string | null) ?? null,
    socialLinks: (seller.social_links as Record<string, string> | null) ?? null,
    hasPhysicalStore: (seller.has_physical_store as boolean | null) ?? null,
    publicState: (seller.public_state as string | null) ?? null,
    publicCity: (seller.public_city as string | null) ?? null,
    publicArea: (seller.public_area as string | null) ?? null,
    shopAddress: (details?.shop_address as string | null) ?? null,
    lat: (details?.lat as number | null) ?? null,
    lng: (details?.lng as number | null) ?? null,
    website: (details?.website as string | null) ?? null,
    status: seller.verification_status as VerificationStatus,
    submittedAt: (seller.verification_submitted_at as string | null) ?? null,
    reviewedAt: (seller.verification_reviewed_at as string | null) ?? null,
    rejectionReason: (seller.verification_rejection_reason as string | null) ?? null,
    evidence,
  };
}

export type SubmitVerificationInput = {
  sellerType: SellerType;
  category: string;
  description: string | null;
  yearsSelling: string | null;
  socialLinks: Record<string, string> | null;
  hasPhysicalStore: boolean;
  publicState: string | null;
  publicCity: string | null;
  publicArea: string | null;
  shopAddress: string | null;
  lat: number | null;
  lng: number | null;
  website: string | null;
  // Text-only evidence (social handles/links) — photo evidence comes in
  // separately as already-uploaded files, see photoEvidence.
  linkEvidence: Array<{ kind: EvidenceKind; textValue: string; note: string | null }>;
  photoEvidence: Array<{ kind: EvidenceKind; buffer: Buffer; declaredType: string; note: string | null }>;
};

// Replaces the seller's entire verification submission (profile fields,
// private details, and evidence) and moves status to 'pending' — this is
// the single write the wizard's final "Submit for verification" step makes.
// A resubmission after 'needs_info'/'rejected' fully replaces the previous
// evidence rather than appending to it, so an admin reviewing it again sees
// exactly what the seller intends today, not a growing pile of old files.
export async function submitVerification(sellerId: string, input: SubmitVerificationInput): Promise<void> {
  const check = canSubmitVerification({
    sellerType: input.sellerType,
    category: input.category,
    hasPhysicalStore: input.hasPhysicalStore,
    shopAddress: input.shopAddress,
    evidenceCount: input.linkEvidence.length + input.photoEvidence.length,
  });
  if (!check.ok) throw new ValidationError(check.reason);

  const db = getDb();

  const sellerUpdateResult = await db
    .from("sellers")
    .update({
      seller_type: input.sellerType,
      category: input.category.trim(),
      description: input.description?.trim() || null,
      years_selling: input.yearsSelling?.trim() || null,
      social_links: input.socialLinks ?? null,
      has_physical_store: input.hasPhysicalStore,
      public_state: input.publicState?.trim() || null,
      public_city: input.publicCity?.trim() || null,
      public_area: input.publicArea?.trim() || null,
      verification_status: "pending",
      verification_submitted_at: new Date().toISOString(),
      verification_reviewed_at: null,
      verification_rejection_reason: null,
    })
    .eq("id", sellerId);
  assertNoError(sellerUpdateResult, "updating seller profile");

  const detailsUpsertResult = await db.from("seller_verification_details").upsert({
    seller_id: sellerId,
    shop_address: input.hasPhysicalStore ? input.shopAddress?.trim() || null : null,
    lat: input.lat,
    lng: input.lng,
    website: input.website?.trim() || null,
    updated_at: new Date().toISOString(),
  });
  assertNoError(detailsUpsertResult, "updating verification details");

  const deleteResult = await db.from("seller_verification_evidence").delete().eq("seller_id", sellerId);
  assertNoError(deleteResult, "clearing previous evidence");

  const evidenceRows: Row[] = [];
  for (const link of input.linkEvidence) {
    if (!link.textValue.trim()) continue;
    evidenceRows.push({
      id: randomId("ev_"),
      seller_id: sellerId,
      kind: link.kind,
      storage_path: null,
      text_value: link.textValue.trim(),
      note: link.note?.trim() || null,
    });
  }
  for (const photo of input.photoEvidence) {
    const path = await uploadVerificationEvidence(photo.buffer, photo.declaredType, sellerId);
    evidenceRows.push({
      id: randomId("ev_"),
      seller_id: sellerId,
      kind: photo.kind,
      storage_path: path,
      text_value: null,
      note: photo.note?.trim() || null,
    });
  }
  if (evidenceRows.length > 0) {
    const insertResult = await db.from("seller_verification_evidence").insert(evidenceRows);
    assertNoError(insertResult, "saving verification evidence");
  }
}

// Real counts for the admin overview.
export async function getVerificationQueueCounts(): Promise<{ pending: number; needsInfo: number }> {
  const db = getDb();
  const [pending, needsInfo] = await Promise.all([
    db.from("sellers").select("id", { count: "exact", head: true }).eq("verification_status", "pending"),
    db.from("sellers").select("id", { count: "exact", head: true }).eq("verification_status", "needs_info"),
  ]);
  if (pending.error) throw new Error(`counting pending verifications: ${pending.error.message}`);
  if (needsInfo.error) throw new Error(`counting needs-info verifications: ${needsInfo.error.message}`);
  return { pending: pending.count ?? 0, needsInfo: needsInfo.count ?? 0 };
}

export async function listPendingVerifications(): Promise<Array<{ sellerId: string; sellerName: string; phone: string | null; overview: VerificationOverview }>> {
  const db = getDb();
  const result = await db
    .from("sellers")
    .select("id, name, verification_status, users(phone)")
    .in("verification_status", ["pending", "needs_info"])
    .order("verification_submitted_at", { ascending: true });
  const rows = assertNoError(result, "listing seller verification submissions") as Row[];

  const list = [];
  for (const row of rows) {
    const sellerId = row.id as string;
    const overview = await getSellerVerificationOverview(sellerId);
    const userRow = row.users as { phone: string } | { phone: string }[] | null;
    const phone = Array.isArray(userRow) ? userRow[0]?.phone ?? null : userRow?.phone ?? null;
    list.push({ sellerId, sellerName: row.name as string, phone, overview });
  }
  return list;
}

// Admin-only. Always logs to admin_actions (same pattern as seller approve/
// reject and every other high-impact admin action in this app) and always
// tells the seller what happened — an unexplained rejection is worse than
// no review system at all.
export async function adminReviewVerification(
  sellerId: string,
  adminId: string,
  action: "approved" | "rejected" | "needs_info",
  reason: string | null
): Promise<void> {
  const db = getDb();
  const sellerResult = await db.from("sellers").select("user_id, name, verification_status").eq("id", sellerId).maybeSingle();
  const seller = assertNoError(sellerResult, "loading seller") as Row | null;
  if (!seller) throw new ValidationError("Seller not found.");
  if (seller.verification_status !== "pending" && seller.verification_status !== "needs_info") {
    throw new ValidationError("This seller has no pending verification submission to review.");
  }
  if ((action === "rejected" || action === "needs_info") && !reason?.trim()) {
    throw new ValidationError("Give the seller a reason so they know what to fix.");
  }

  const updateResult = await db
    .from("sellers")
    .update({
      verification_status: action,
      verification_reviewed_at: new Date().toISOString(),
      verification_reviewed_by: adminId,
      verification_rejection_reason: action === "approved" ? null : reason!.trim(),
    })
    .eq("id", sellerId);
  assertNoError(updateResult, "updating verification status");

  await logAdminAction({
    adminId,
    action: `seller_verification.${action}`,
    targetType: "seller",
    targetId: sellerId,
    detail: { reason: reason?.trim() || null },
  });

  await notifyBestEffort({
    userId: seller.user_id as string,
    type: "seller",
    title:
      action === "approved"
        ? "You're a verified seller"
        : action === "needs_info"
          ? "More information needed for verification"
          : "Seller verification update",
    body:
      action === "approved"
        ? "FindIt has verified your seller profile — your storefront now shows the Verified badge."
        : action === "needs_info"
          ? `FindIt needs a bit more before approving your verification: ${reason}`
          : `Your seller verification wasn't approved: ${reason}`,
  });
}
