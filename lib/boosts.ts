import { getDb, assertNoError } from "./db";
import { ValidationError } from "./errors";

type Row = Record<string, unknown>;

// Real listing boosts — a seller pays (via Paystack) to move one of their
// own listings to the front of Home/Browse for a fixed window. Pricing
// lives in boost_plans as DATA (same "price/limits as data, not code"
// pattern as subscription_plans, see lib/subscriptions.ts), so an admin can
// change "₦1,000 for 3 days" without a deploy. The purchase INITIATION
// (creating the pending payment row, calling Paystack) lives in the route
// (app/api/products/[id]/boost), the same split already used for order/
// subscription checkout — this file is the business logic underneath it.

export type BoostPlan = {
  id: string;
  name: string;
  durationDays: number;
  price: number;
  sortOrder: number;
  active: boolean;
};

function rowToBoostPlan(row: Row): BoostPlan {
  return {
    id: row.id as string,
    name: row.name as string,
    durationDays: row.duration_days as number,
    price: row.price as number,
    sortOrder: row.sort_order as number,
    active: Boolean(row.active),
  };
}

// Seller-facing — active plans only, in display order.
export async function listBoostPlans(): Promise<BoostPlan[]> {
  const db = getDb();
  const result = await db.from("boost_plans").select("*").eq("active", true).order("sort_order", { ascending: true });
  const rows = assertNoError(result, "listing boost plans") as Row[];
  return rows.map(rowToBoostPlan);
}

export async function getBoostPlan(id: string): Promise<BoostPlan | null> {
  const db = getDb();
  const result = await db.from("boost_plans").select("*").eq("id", id).maybeSingle();
  const row = assertNoError(result, "loading boost plan") as Row | null;
  return row ? rowToBoostPlan(row) : null;
}

// Admin-only — includes inactive plans.
export async function listAllBoostPlansForAdmin(): Promise<BoostPlan[]> {
  const db = getDb();
  const result = await db.from("boost_plans").select("*").order("sort_order", { ascending: true });
  const rows = assertNoError(result, "listing all boost plans") as Row[];
  return rows.map(rowToBoostPlan);
}

const BOOST_PLAN_PATCH_COLUMNS: Record<string, string> = {
  name: "name",
  durationDays: "duration_days",
  price: "price",
  sortOrder: "sort_order",
  active: "active",
};

export async function updateBoostPlan(id: string, patch: Partial<Omit<BoostPlan, "id">>): Promise<BoostPlan> {
  const columns: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = BOOST_PLAN_PATCH_COLUMNS[key];
    if (column) columns[column] = value;
  }
  if (Object.keys(columns).length === 0) {
    throw new ValidationError("No editable fields provided.");
  }
  columns.updated_at = new Date().toISOString();

  const db = getDb();
  const result = await db.from("boost_plans").update(columns).eq("id", id).select().single();
  const row = assertNoError(result, "updating boost plan") as Row;
  return rowToBoostPlan(row);
}

// The ONLY place a boost is ever activated — called from the Paystack
// webhook once the charge is confirmed, never on a client-supplied "I
// paid." Extends from whichever is later, now or the listing's current
// boosted_until, so buying a second boost while one is still running adds
// on top of it rather than a shorter plan overwriting a longer remaining
// window.
export async function activateBoost(input: { productId: string; sellerId: string; boostPlanId: string; amount: number }): Promise<void> {
  const plan = await getBoostPlan(input.boostPlanId);
  if (!plan) throw new Error(`activateBoost: boost plan ${input.boostPlanId} not found`);

  const db = getDb();
  const productResult = await db.from("products").select("boosted_until").eq("id", input.productId).maybeSingle();
  const product = assertNoError(productResult, "loading product for boost activation") as Row | null;
  if (!product) throw new Error(`activateBoost: product ${input.productId} not found`);

  const currentBoostedUntil = product.boosted_until ? new Date(product.boosted_until as string).getTime() : 0;
  const base = Math.max(Date.now(), currentBoostedUntil);
  const endsAt = new Date(base + plan.durationDays * 24 * 60 * 60 * 1000);

  const updateResult = await db.from("products").update({ boosted_until: endsAt.toISOString() }).eq("id", input.productId);
  assertNoError(updateResult, "activating boost");

  const insertResult = await db.from("boosts").insert({
    id: "boost_" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase(),
    product_id: input.productId,
    seller_id: input.sellerId,
    boost_plan_id: input.boostPlanId,
    amount: input.amount,
    ends_at: endsAt.toISOString(),
  });
  assertNoError(insertResult, "recording boost purchase");
}
