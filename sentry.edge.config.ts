// Edge runtime error monitoring (middleware, edge routes — this app has
// neither today, but Next.js loads this file regardless). Same optional
// contract as the other two config files.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 0,
});
