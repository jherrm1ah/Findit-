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

// Paystack signs every webhook body with HMAC-SHA512 of your secret key,
// sent as the x-paystack-signature header — verifying this is the ONLY
// thing standing between "a real payment happened" and "anyone who finds
// this URL can mark subscriptions paid for free." Timing-safe compare, same
// pattern as password verification in lib/auth.ts.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signatureHeader, "hex");
  return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
}
