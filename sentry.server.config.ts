// Server-side (Node runtime) error monitoring — everything inside
// app/api/**/route.ts and server components runs here. Optional, same as
// the client config: no DSN, no effect. See instrumentation.ts, which is
// what actually loads this file.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 0,
});
