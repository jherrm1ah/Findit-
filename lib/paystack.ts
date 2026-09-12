import crypto from "crypto";

// Thin wrapper around Paystack's REST API via fetch — no SDK dependency,
// same pattern as lib/sms.ts (Termii). Every function here is server-only.
//
// PAYSTACK_SECRET_KEY is deliberately optional at the env level, same as
// TERMII_API_KEY: this repo has no live Paystack account today, so
// isPaystackConfigured() lets the subscription checkout route degrade to a
// clear "payments aren't set up yet" response instead of silently failing
// or faking a successful charge. Once real keys are dropped into
// .env.local, every function below starts making real API calls with no
// other code changes needed.

const BASE_URL = "https://api.paystack.co";

export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY isn't set.");
  return key;
}

type PaystackResponse<T> = { status: boolean; message: string; data: T };

async function paystackFetch<T>(path: string, init?: RequestInit): Promise<PaystackResponse<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as PaystackResponse<T> | null;
  if (!res.ok || !body) {
    throw new Error(body?.message || `Paystack request failed (${res.status})`);
  }
  return body;
}

export type InitializeTransactionResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

// amountNaira is whole naira (matches products.price's convention elsewhere
// in this app) — Paystack's API wants kobo, so this is the one place that
// conversion happens.
export async function initializeTransaction(input: {
  email: string;
  amountNaira: number;
  reference: string;
  metadata?: Record<string, unknown>;
  callbackUrl?: string;
}): Promise<InitializeTransactionResult> {
  const body = await paystackFetch<{ authorization_url: string; access_code: string; reference: string }>(
    "/transaction/initialize",
    {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: Math.round(input.amountNaira * 100),
        reference: input.reference,
        metadata: input.metadata,
        callback_url: input.callbackUrl,
      }),
    }
  );
  return {
    authorizationUrl: body.data.authorization_url,
    accessCode: body.data.access_code,
    reference: body.data.reference,
  };
}

export type VerifyTransactionResult = {
  status: string; // "success" | "failed" | "abandoned" | ...
  reference: string;
  amountNaira: number;
  paidAt: string | null;
  metadata: Record<string, unknown> | null;
};

export async function verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
  const body = await paystackFetch<{
    status: string;
    reference: string;
    amount: number;
    paid_at: string | null;
    metadata: Record<string, unknown> | null;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  return {
    status: body.data.status,
    reference: body.data.reference,
    amountNaira: body.data.amount / 100,
    paidAt: body.data.paid_at,
    metadata: body.data.metadata,
  };
}

export type Bank = { name: string; code: string };

// Nigerian bank list for the seller payout-account form's dropdown — the
// bank_code Paystack needs is not something a seller would ever type
// correctly by hand.
export async function listBanks(): Promise<Bank[]> {
  const body = await paystackFetch<Array<{ name: string; code: string }>>(
    "/bank?country=nigeria&currency=NGN"
  );
  return body.data.map((b) => ({ name: b.name, code: b.code }));
}

export type ResolvedAccount = { accountNumber: string; accountName: string };

// Confirms an account number actually belongs to a real account at the
// named bank, and returns the account's real registered name — shown back
// to the seller as "does this look right?" before saving, so a payout can
// never silently go to a mistyped account number.
export async function resolveAccountNumber(input: {
  accountNumber: string;
  bankCode: string;
}): Promise<ResolvedAccount> {
  const body = await paystackFetch<{ account_number: string; account_name: string }>(
    `/bank/resolve?account_number=${encodeURIComponent(input.accountNumber)}&bank_code=${encodeURIComponent(input.bankCode)}`
  );
  return { accountNumber: body.data.account_number, accountName: body.data.account_name };
}

// Created once per seller and reused for every payout after that — Paystack
// needs a "recipient" object on file before it will accept a transfer to
// that account.
export async function createTransferRecipient(input: {
  accountNumber: string;
  bankCode: string;
  name: string;
}): Promise<{ recipientCode: string }> {
  const body = await paystackFetch<{ recipient_code: string }>("/transferrecipient", {
    method: "POST",
    body: JSON.stringify({
      type: "nuban",
      name: input.name,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: "NGN",
    }),
  });
  return { recipientCode: body.data.recipient_code };
}

export type TransferResult = { transferCode: string; status: string };

// Moves real money out of FindIt's Paystack balance to a seller's bank
// account — this is the actual payout, not a status flag. `status` on the
// response can be "success" (instant), "pending" (queued), or "otp" (the
// Paystack account needs a one-time PIN to authorize transfers, a
// dashboard-level setting on the platform's own Paystack account — not
// something this code can complete on its own, so a caller getting "otp"
// back should record the payout as needing manual attention rather than
// treating it as done).
export async function initiateTransfer(input: {
  amountNaira: number;
  recipientCode: string;
  reference: string;
  reason: string;
}): Promise<TransferResult> {
  const body = await paystackFetch<{ transfer_code: string; status: string }>("/transfer", {
    method: "POST",
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(input.amountNaira * 100),
      recipient: input.recipientCode,
      reference: input.reference,
      reason: input.reason,
    }),
  });
  return { transferCode: body.data.transfer_code, status: body.data.status };
}

// Refunds a buyer's original charge — a real reversal of money Paystack
// already collected, not just flipping this app's own escrow_status to
// 'refunded'. Omitting amountNaira refunds the full original charge.
export async function refundTransaction(input: {
  transactionReference: string;
  amountNaira?: number;
}): Promise<{ status: string }> {
  const body = await paystackFetch<{ status: string }>("/refund", {
    method: "POST",
    body: JSON.stringify({
      transaction: input.transactionReference,
      ...(input.amountNaira !== undefined ? { amount: Math.round(input.amountNaira * 100) } : {}),
    }),
  });
  return { status: body.data.status };
}

// Paystack signs every webhook body with HMAC-SHA512 of your secret key,
// sent as the x-paystack-signature header — verifying this is the ONLY
// thing standing between "a real payment happened" and "anyone who finds
// this URL can mark subscriptions paid for free." Timing-safe compare, same
// pattern as password verification in lib/auth.ts.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  // With no key configured there is nothing to verify against, so no caller
  // can be trusted — refuse rather than letting secretKey() throw. The
  // outcome was already fail-closed (an exception processes nothing), but it
  // surfaced as an unhandled 500, which Paystack treats as a transient
  // failure and retries indefinitely. A deployment with no key is exactly
  // the state this repo ships in, so this is the common path, not the edge.
  if (!isPaystackConfigured()) {
    console.error("[paystack] webhook received but PAYSTACK_SECRET_KEY isn't set — rejecting unverifiable delivery");
    return false;
  }
  const expected = crypto.createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signatureHeader, "hex");
  return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
}
