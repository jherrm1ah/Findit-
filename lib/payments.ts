// Real marketplace payments: the platform fee, and what happens once an
// order's Paystack charge is confirmed or a delivery/refund needs real
// money to move. Order-payment INITIATION (creating the Paystack checkout
// session itself) lives in the route (app/api/orders/[id]/pay), the same
// split already used for store-subscription checkout in
// app/api/sellers/me/subscription/route.ts — this file is the business
// logic underneath it, not the HTTP/Paystack-call plumbing.

import { getDb, assertNoError } from "./db";
import { ValidationError, getOrder, notifySellerOfNewOrder, Order } from "./repo";
import {
  isPaystackConfigured,
  initiateTransfer,
  refundTransaction,
  resolveAccountNumber,
  createTransferRecipient,
} from "./paystack";

type Row = Record<string, unknown>;

function randomId(prefix: string): string {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Platform fee — admin-editable, append-only (see migration 016)      */
/* ------------------------------------------------------------------ */

export async function getCurrentPlatformFeeBps(): Promise<number> {
  const db = getDb();
  const result = await db
    .from("platform_fee_config")
    .select("fee_bps")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = assertNoError(result, "loading platform fee config") as Row | null;
  if (!row) {
    // Shouldn't happen — schema.sql seeds a default row — but fail loudly
    // rather than silently charging 0% if it's ever missing.
    throw new Error("No platform fee is configured.");
  }
  return row.fee_bps as number;
}

// Pure — the actual split math, unit-testable without a database. Floors
// the fee so fee + payout never exceeds the order price by a kobo from
// rounding (the platform absorbs the fractional kobo, not the seller).
export function computeFeeSplit(priceNaira: number, feeBps: number): { feeAmount: number; payoutAmount: number } {
  const feeAmount = Math.floor((priceNaira * feeBps) / 10000);
  return { feeAmount, payoutAmount: priceNaira - feeAmount };
}

export async function setPlatformFeeBps(feeBps: number, adminId: string): Promise<void> {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10000) {
    throw new ValidationError("Fee must be a whole number of basis points between 0 and 10000 (0%–100%).");
  }
  const db = getDb();
  const result = await db.from("platform_fee_config").insert({
    id: randomId("fee_"),
    fee_bps: feeBps,
    created_by: adminId,
  });
  assertNoError(result, "setting platform fee");
}

export type FeeHistoryEntry = { id: string; feeBps: number; createdBy: string | null; createdAt: string };

export async function listFeeHistory(): Promise<FeeHistoryEntry[]> {
  const db = getDb();
  const result = await db.from("platform_fee_config").select("*").order("created_at", { ascending: false }).limit(50);
  const rows = assertNoError(result, "loading fee history") as Row[];
  return rows.map((r) => ({
    id: r.id as string,
    feeBps: r.fee_bps as number,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

/* ------------------------------------------------------------------ */
/*  Order payment confirmation — called only from the Paystack webhook  */
/* ------------------------------------------------------------------ */

// The ONLY place an order is ever marked paid. Conditioned on
// payment_status still being 'pending' so a payments-row already claimed
// exactly once by the webhook (see the payments.status guard there) can
// still never double-apply this to the order itself if it were somehow
// invoked twice. Snapshots the fee at THIS moment — never recomputed later,
// so a subsequent fee change can't rewrite what an already-paid order's
// numbers were.
export async function confirmOrderPayment(orderId: string): Promise<void> {
  const order = await getOrder(orderId);
  if (!order) throw new Error(`confirmOrderPayment: order ${orderId} not found`);
  if (order.paymentStatus === "paid") return; // already applied — nothing to do

  const feeBps = await getCurrentPlatformFeeBps();
  const { feeAmount, payoutAmount } = computeFeeSplit(order.price, feeBps);

  const db = getDb();
  const result = await db
    .from("orders")
    .update({
      payment_status: "paid",
      paid_at: new Date().toISOString(),
      escrow_status: "held",
      platform_fee_bps: feeBps,
      platform_fee_amount: feeAmount,
      seller_payout_amount: payoutAmount,
    })
    .eq("id", orderId)
    .eq("payment_status", "pending")
    .select()
    .maybeSingle();
  const row = assertNoError(result, "confirming order payment") as Row | null;
  if (!row) return; // a concurrent call already applied this

  // The seller only learns about this order now that it's real money, not
  // at order creation (see lib/repo.ts#createOrderFromProduct/acceptOffer).
  await notifySellerOfNewOrder(order.seller, order);
}

/* ------------------------------------------------------------------ */
/*  Seller payouts                                                       */
/* ------------------------------------------------------------------ */

// Called once a buyer confirms delivery (escrow_status -> 'released').
// Real money movement (a Paystack Transfer) when the platform has Paystack
// configured AND the seller has a payout account on file; otherwise a
// clearly-labeled 'manual_required' row for an admin to settle off-platform
// and mark paid — never a status that claims a transfer happened when it
// didn't. The unique constraint on payouts.order_id makes a duplicate
// payout for the same order a database-level impossibility.
export async function initiateSellerPayout(order: Order): Promise<void> {
  if (!order.sellerId) {
    await recordManualPayout(order, "This order has no linked seller account (seller_id missing) to pay out to.");
    return;
  }
  if (order.sellerPayoutAmount === null) {
    await recordManualPayout(order, "This order was never marked paid, so no payout amount was ever computed.");
    return;
  }

  const db = getDb();
  const sellerResult = await db
    .from("sellers")
    .select("id, paystack_recipient_code")
    .eq("id", order.sellerId)
    .maybeSingle();
  const seller = assertNoError(sellerResult, "loading seller for payout") as Row | null;
  const recipientCode = (seller?.paystack_recipient_code as string | null) ?? null;

  if (!isPaystackConfigured()) {
    await recordManualPayout(order, "Payments aren't set up in this environment yet (no Paystack keys) — pay this seller manually and mark it paid.");
    return;
  }
  if (!recipientCode) {
    await recordManualPayout(order, "This seller hasn't added a payout bank account yet.");
    return;
  }

  const id = randomId("payout_");
  const insertResult = await db.from("payouts").insert({
    id,
    seller_id: order.sellerId,
    order_id: order.id,
    amount: order.sellerPayoutAmount,
    status: "processing",
  });
  // A unique violation here means a payout for this order already exists
  // (e.g. a duplicate call) — nothing more to do.
  if (insertResult.error) {
    if (insertResult.error.code === "23505") return;
    throw new Error(`recording payout: ${insertResult.error.message}`);
  }

  try {
    const transfer = await initiateTransfer({
      amountNaira: order.sellerPayoutAmount,
      recipientCode,
      reference: id,
      reason: `FindIt payout for order ${order.id}`,
    });
    // Paystack can require a dashboard-level OTP to actually release a
    // transfer — that's a manual step on FindIt's own Paystack account,
    // not something this code can complete, so it's tracked the same as
    // any other case a human needs to finish.
    const finalStatus = transfer.status === "success" ? "paid" : transfer.status === "pending" ? "processing" : "manual_required";
    await db
      .from("payouts")
      .update({
        status: finalStatus,
        provider_reference: transfer.transferCode,
        paid_at: finalStatus === "paid" ? new Date().toISOString() : null,
      })
      .eq("id", id);
  } catch (err) {
    await db
      .from("payouts")
      .update({ status: "failed", failure_reason: err instanceof Error ? err.message : String(err) })
      .eq("id", id);
  }
}

async function recordManualPayout(order: Order, reason: string): Promise<void> {
  if (!order.sellerId || order.sellerPayoutAmount === null) return;
  const db = getDb();
  const result = await db.from("payouts").insert({
    id: randomId("payout_"),
    seller_id: order.sellerId,
    order_id: order.id,
    amount: order.sellerPayoutAmount,
    status: "manual_required",
    failure_reason: reason,
  });
  // Same de-dupe reasoning as above — a payout row for this order already
  // existing isn't an error worth surfacing.
  if (result.error && result.error.code !== "23505") {
    throw new Error(`recording manual payout: ${result.error.message}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Refunds                                                              */
/* ------------------------------------------------------------------ */

// Called from resolveOrderIssue(outcome: "refunded") — reverses the
// buyer's ORIGINAL Paystack charge for real, rather than only flipping
// this app's own escrow_status to 'refunded' with no money actually
// moving. Never blocks the admin's decision on the refund call failing —
// the order is still marked refunded either way, and the failure is
// surfaced back to the caller to show/log, since an admin has already
// decided the buyer is owed their money regardless of a transient
// Paystack error.
export async function refundOrderPayment(orderId: string): Promise<{ refunded: boolean; reason?: string }> {
  const db = getDb();
  const paymentResult = await db
    .from("payments")
    .select("provider_reference")
    .eq("order_id", orderId)
    .eq("kind", "order")
    .eq("status", "success")
    .order("paid_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const payment = assertNoError(paymentResult, "loading order payment for refund") as Row | null;
  if (!payment?.provider_reference) {
    return { refunded: false, reason: "No successful payment on file for this order to refund." };
  }
  if (!isPaystackConfigured()) {
    return { refunded: false, reason: "Payments aren't set up in this environment yet — refund the buyer manually outside FindIt." };
  }
  try {
    await refundTransaction({ transactionReference: payment.provider_reference as string });
    return { refunded: true };
  } catch (err) {
    return { refunded: false, reason: err instanceof Error ? err.message : "Paystack refund request failed." };
  }
}

/* ------------------------------------------------------------------ */
/*  Seller payout account                                                */
/* ------------------------------------------------------------------ */

export type SellerPayoutAccount = { hasAccount: boolean; bankAccountName: string | null; maskedAccountNumber: string | null };

export async function getSellerPayoutAccount(sellerId: string): Promise<SellerPayoutAccount> {
  const db = getDb();
  const result = await db
    .from("sellers")
    .select("bank_account_number, bank_account_name")
    .eq("id", sellerId)
    .maybeSingle();
  const row = assertNoError(result, "loading payout account") as Row | null;
  const accountNumber = (row?.bank_account_number as string | null) ?? null;
  return {
    hasAccount: Boolean(accountNumber),
    bankAccountName: (row?.bank_account_name as string | null) ?? null,
    maskedAccountNumber: accountNumber ? `••••${accountNumber.slice(-4)}` : null,
  };
}

// Resolves the real account name behind an account number + bank code
// (so a seller can see "does this look right?" before it's saved), creates
// the Paystack transfer recipient once, and saves both onto the seller —
// every future payout for this seller reuses the same recipient code.
export async function updateSellerPayoutAccount(
  sellerId: string,
  input: { accountNumber: string; bankCode: string }
): Promise<{ accountName: string }> {
  if (!isPaystackConfigured()) {
    throw new ValidationError("Payouts aren't set up in this environment yet — no Paystack keys configured.");
  }
  if (!/^\d{10}$/.test(input.accountNumber)) {
    throw new ValidationError("Enter a valid 10-digit account number.");
  }
  if (!input.bankCode.trim()) {
    throw new ValidationError("Choose your bank.");
  }

  const resolved = await resolveAccountNumber({ accountNumber: input.accountNumber, bankCode: input.bankCode });
  const { recipientCode } = await createTransferRecipient({
    accountNumber: input.accountNumber,
    bankCode: input.bankCode,
    name: resolved.accountName,
  });

  const db = getDb();
  const result = await db
    .from("sellers")
    .update({
      bank_account_number: input.accountNumber,
      bank_code: input.bankCode,
      bank_account_name: resolved.accountName,
      paystack_recipient_code: recipientCode,
    })
    .eq("id", sellerId);
  assertNoError(result, "saving payout account");

  return { accountName: resolved.accountName };
}

/* ------------------------------------------------------------------ */
/*  Admin: payout ledger + transaction ledger                           */
/* ------------------------------------------------------------------ */

export type PayoutListItem = {
  id: string;
  sellerId: string;
  sellerName: string | null;
  orderId: string;
  amount: number;
  status: string;
  providerReference: string | null;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
};

export async function listPayoutsForAdmin(status?: string): Promise<PayoutListItem[]> {
  const db = getDb();
  let query = db.from("payouts").select("*, sellers(name)").order("created_at", { ascending: false }).limit(200);
  if (status) query = query.eq("status", status);
  const result = await query;
  const rows = assertNoError(result, "listing payouts") as Row[];
  return rows.map((r) => ({
    id: r.id as string,
    sellerId: r.seller_id as string,
    sellerName: ((r.sellers as { name?: string } | null)?.name as string | undefined) ?? null,
    orderId: r.order_id as string,
    amount: r.amount as number,
    status: r.status as string,
    providerReference: (r.provider_reference as string | null) ?? null,
    failureReason: (r.failure_reason as string | null) ?? null,
    createdAt: r.created_at as string,
    paidAt: (r.paid_at as string | null) ?? null,
  }));
}

// The escape hatch for a 'manual_required' payout (no Paystack configured,
// or a seller with no payout account on file) — an admin pays the seller
// off-platform and records that they did, the same honest pattern already
// used for lib/subscriptions.ts#grantStorePlan. Never usable to mark an
// ALREADY 'paid' payout paid again (that would be claiming a second real
// transfer that never happened).
export async function markPayoutPaidManually(payoutId: string): Promise<void> {
  const db = getDb();
  const result = await db
    .from("payouts")
    .update({ status: "paid", paid_at: new Date().toISOString(), failure_reason: null })
    .eq("id", payoutId)
    .in("status", ["manual_required", "failed"])
    .select("id")
    .maybeSingle();
  const row = assertNoError(result, "marking payout paid") as Row | null;
  if (!row) throw new ValidationError("That payout isn't awaiting manual settlement.");
}

export type TransactionListItem = {
  id: string;
  kind: string;
  status: string;
  amount: number;
  userId: string;
  orderId: string | null;
  subscriptionId: string | null;
  providerReference: string | null;
  createdAt: string;
  paidAt: string | null;
};

// The real transaction ledger — every payment this platform has ever
// recorded (order or subscription), for the admin Transactions view.
export async function listTransactionsForAdmin(input: { kind?: string; page?: number }): Promise<{
  transactions: TransactionListItem[];
  page: number;
  totalPages: number;
  total: number;
}> {
  const PAGE_SIZE = 25;
  const db = getDb();
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = db.from("payments").select("*", { count: "exact" });
  if (input.kind) query = query.eq("kind", input.kind);
  const result = await query.order("created_at", { ascending: false }).range(from, to);
  const rows = assertNoError(result, "listing transactions") as Row[];
  const total = result.count ?? 0;

  return {
    transactions: rows.map((r) => ({
      id: r.id as string,
      kind: r.kind as string,
      status: r.status as string,
      amount: r.amount as number,
      userId: r.user_id as string,
      orderId: (r.order_id as string | null) ?? null,
      subscriptionId: (r.subscription_id as string | null) ?? null,
      providerReference: (r.provider_reference as string | null) ?? null,
      createdAt: r.created_at as string,
      paidAt: (r.paid_at as string | null) ?? null,
    })),
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
  };
}
