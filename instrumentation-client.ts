// Client-side error monitoring. Optional, same as every other integration
// key in this app (Gemini, Paystack, Termii) — with no DSN configured this
// is simply disabled and nothing about the app changes. Set
// NEXT_PUBLIC_SENTRY_DSN (see .env.example) to turn it on. The DSN is a
// public identifier, not a secret — Sentry's own SDKs are designed to have
// it embedded in client-side bundles.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  // Errors only for now, not performance tracing/session replay — keeps
  // this a focused "know when something breaks" tool rather than a second
  // analytics system. Raise this (0–1) later if you also want performance
  // monitoring.
  tracesSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
