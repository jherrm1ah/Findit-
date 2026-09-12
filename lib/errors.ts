import { NextResponse } from "next/server";

// Thrown for real, user-facing validation problems (bad input, business-rule
// violations) — safe to show verbatim to the client. Anything else that
// escapes a repo/lib function (a Postgres/network error via
// lib/db.ts#assertNoError, a bug, whatever) is NOT a ValidationError and must
// never be shown to the client as-is — see toClientError below. Lives here
// rather than in lib/repo.ts so lib/categories.ts (and any other module
// repo.ts itself needs to import from) can throw one without repo.ts and
// that module importing each other.
export class ValidationError extends Error {}

// Every API route's catch block should go through this instead of doing
// `err instanceof Error ? err.message : "..."` and returning that directly.
// A ValidationError is our own intentional, user-facing message (bad input,
// a business-rule violation) — safe to show verbatim. Anything else — a
// Postgres/network error from lib/db.ts#assertNoError, a bug, whatever —
// might contain internal details (column/constraint names, query fragments,
// stack info) that must never reach the client. Log the real error
// server-side and return a generic message instead.
export function toClientError(err: unknown, fallback = "Something went wrong — try again."): {
  status: number;
  body: { error: string };
} {
  if (err instanceof ValidationError) {
    return { status: 400, body: { error: err.message } };
  }
  console.error("[api]", err);
  return { status: 500, body: { error: fallback } };
}

export function errorResponse(err: unknown, fallback?: string): NextResponse {
  const { status, body } = toClientError(err, fallback);
  return NextResponse.json(body, { status });
}
