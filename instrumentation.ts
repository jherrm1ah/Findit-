// Next.js's own instrumentation hook (requires experimental.instrumentationHook
// in next.config.mjs on Next 14) — the standard place to load runtime-specific
// setup. register() runs once per runtime at boot; NEXT_RUNTIME tells us
// which one we're in, so the Node-only and Edge-only Sentry configs never
// load into the wrong bundle.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Reports an error thrown by a Server Component / Server Action that Next's
// own error boundaries would otherwise swallow before it ever reaches
// app/error.tsx or lib/errors.ts.
export const onRequestError = Sentry.captureRequestError;
