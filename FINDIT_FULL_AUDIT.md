# FindIt — Full Codebase Audit

**Date:** 2026-10-01
**Scope:** Complete, adversarial, end-to-end review of the FindIt codebase — frontend, API routes, business logic, database schema, payments, and configuration — performed with no assumption that existing code is correct because the app currently works.
**No real secrets, keys, or tokens appear anywhere in this document.**

This audit was performed in two layers:
1. **Direct, first-person review** of the highest-stakes file in the codebase — `lib/repo.ts` (2,721 lines: products, orders, escrow, requests/offers, messaging) — read start to finish, plus every API route it was cross-checked against for authorization.
2. **Four independent, adversarial deep-dives**, each reading its scope in full and reporting findings with exact file/line citations: (a) the rest of `lib/` excluding `repo.ts`, (b) every frontend component in `components/findit-app/`, (c) a dead-code/duplicate-code sweep of the whole repo, (d) a fresh, from-scratch re-audit of the Paystack payment integration against a 10-point checklist.

Every finding below was independently re-verified by reading the actual code myself before being reported as real or applied as a fix — several findings from the automated sweep were corrected or discarded after verification (see "False positives caught" below). This matches the lesson learned earlier in this engagement: a sub-agent's or prior pass's claim is a lead, not a fact, until the code itself confirms it.

---

## 1. Files and components inspected this pass

- **`lib/repo.ts`** (full, 2,721 lines) — personally read line-by-line.
- **All of `lib/`** except `repo.ts` and test files — `adminRoles.ts`, `adminRolesLevels.ts`, `ai.ts`, `alerts.ts`, `analytics.ts`, `auth.ts`, `boosts.ts`, `brandIcon.tsx`, `broadcast.ts`, `categories.js`, `categoryCatalog.ts`, `db.ts`, `errors.ts`, `geo.ts`, `moderationRules.ts`, `otp.ts`, `payments.ts`, `paystack.ts`, `phone.ts`, `productReports.ts`, `rateLimit.ts`, `requestMatching.ts`, `reviews.ts`, `risk.ts`, `sellerDirectory.ts`, `sellerIdentityMatch.ts`, `sellerPublicProfile.ts`, `sellerVerification.ts`, `sellerVerificationLevels.ts`, `sms.ts`, `storage.ts`, `store.ts`, `storeSlug.ts`, `subscriptions.ts`, `support.ts`, `transactionRecord.ts`.
- **Every file in `components/findit-app/`** (~30 screens + shared/support modules).
- **`app/store/[slug]/StoreBody.tsx`**, **`StoreListings.jsx`** (public storefront, no session).
- **Every `app/api/**` route** relevant to messaging, auth/OTP, admin verification, Paystack checkout/webhook, cron.
- **`next.config.mjs`, `vercel.json`, `app/api/cron/expirations/route.ts`** — infra/config, outside both agents' scopes.
- **Supabase client usage repo-wide** (confirmed no client-side code anywhere holds a Supabase key).
- **Full dead-code/duplicate-code sweep** of `lib/`, `components/findit-app/`, `app/**`, `scripts/`.

---

## 2. Issues found and fixed this pass

All of the following were verified directly against the code (not just taken from an agent's report) before being fixed. `tsc --noEmit`, the full `vitest` suite (482 tests), and a production `next build` all pass clean after every fix below.

### 2.1 Seller-name-collision bug in verification-level computation — **fixed**
**File:** `lib/transactionRecord.ts`, `sellerVerificationLevelAt()` (~line 121)
**Problem:** The seller *lookup* correctly preferred `order.sellerId` when available, but the two queries that actually compute `orderCount`/`disputeCount`/`avgRating` (fed into `computeVerificationLevel`) filtered **only** by the `seller` business-name text column, unconditionally — never by `seller_id`. `business_name` has no uniqueness constraint (documented in `lib/sellerIdentityMatch.ts`), so two different sellers can legitimately share a name.
**Why it matters:** If Seller A and Seller B both trade as "Ade Enterprises," and A has a poor dispute record, completing an order for B would pull in A's disputes/ratings too — computing the wrong verification level, which gets permanently frozen onto that transaction's public `/verify/<code>` record.
**Fix:** Both queries now branch on `order.sellerId` exactly like the seller lookup above them does — scoped by `seller_id` when known, falling back to `seller` name **and** `seller_id IS NULL` only for legacy pre-migration-009 rows, matching the pattern already used everywhere else in the codebase (`sellerPublicProfile.ts`, `sellerDirectory.ts`, `risk.ts`).

### 2.2 Blank screen after refresh on Checkout — **fixed**
**File:** `components/findit-app/MainApp.jsx`, the screen-restore effect (~line 1295)
**Problem:** The general "restore whichever screen you were on after a hard refresh" mechanism (built earlier this session) blindly calls `go(wantedScreen)` for any screen found in the URL. Checkout is the one screen whose render is gated on more than `screen` alone — it also needs `checkoutOrder` (order/product/qty), which is only ever set in-memory by `buyNow()` and had nothing to reconstruct it from on a cold mount.
**Why it matters:** A buyer who refreshes mid-checkout (or whose tab gets reloaded by the OS) lands on a screen with header and bottom nav but a **completely empty body** — no error, no way back except guessing to tap a nav icon.
**Fix:** The restore effect now excludes `"checkout"` from screens it blindly restores, falling through to the safe home default instead.

### 2.3 Non-atomic business-name rename could permanently lock a seller out of their own orders — **fixed**
**File:** `lib/auth.ts`, `updateSellerBusinessName()` (~line 271)
**Problem:** The function updated `users.business_name`/`sellers.name` to the new name **first**, then propagated the rename across `products`/`orders`/`offers` in a plain sequential loop with no real transaction. If any table's update in that loop threw (a transient DB error), the function aborted with the new name already live everywhere a session reads it from, but some rows still on the old name. Worse: retrying the *exact same rename* would then see `oldName === trimmed` already and **skip the propagation loop entirely**, permanently stranding those rows. `sellerOwnsItem` (`lib/sellerIdentityMatch.ts`) requires the caller's current business name to match an item's seller text exactly once that item has a `seller_id` — so a stranded order/product would lock that seller out of acting on their own existing data, with no automatic recovery path.
**Fix:** Reordered so propagation across `products`/`orders`/`offers` happens **first**, and `sellers.name`/`users.business_name` are only updated **last**, after the loop fully succeeds. A partial failure now leaves the old name authoritative everywhere (nothing inconsistent), and retrying the same call correctly resumes the propagation (each table update is idempotent).

### 2.4 Silent exhaustion of a boost-activation retry loop — **fixed**
**File:** `lib/boosts.ts`, `applyBoostedUntil()` (~line 110)
**Problem:** The optimistic-concurrency loop that raises a product's `boosted_until` after a paid boost retries up to 5 times against a changing value, but if all 5 attempts lost the race, the function returned **silently** — no error, no log — despite the `boosts` row (the actual charge) already having committed. The seller would have paid for a boost that never visibly took effect, with zero operational visibility into why.
**Fix:** Added a `console.error` on loop exhaustion naming the product and the `boosted_until` value that should have been applied, so this is now visible server-side instead of indistinguishable from "nothing happened."

### 2.5 Unbounded full-table scan on every admin page load — **fixed**
**File:** `lib/risk.ts`, `getSellerRiskSignals()`
**Problem:** Pulled every single order row in the platform's history into memory with no `.limit()`, on every call — and this is called from `getAdminAlerts()`, which fires on every visit to the Admin tab.
**Fix:** Added a 20,000-row safety ceiling (ordered by recency), the same pattern and precedent as `LIST_PRODUCTS_SAFETY_LIMIT` added to `lib/repo.ts` earlier this session — a safety net, not real pagination.

### 2.6 Missing validation on admin-editable plan/category pricing fields — **fixed**
**Files:** `lib/boosts.ts#updateBoostPlan`, `lib/subscriptions.ts#updatePlan`, `lib/categoryCatalog.ts#createCategory`/`updateCategory`
**Problem:** Unlike `setPlatformFeeBps` (`lib/payments.ts`), which correctly validates its input range, these admin-only patch functions accepted any value for `price`, `durationDays`, `priceMonthly`, `priceYearly`, `productLimit`, `storageLimitMb`, `trialDays`, `sortOrder` with no check at all. A negative/zero `price` or `durationDays` would persist unrejected and flow straight into a real Paystack charge amount or a no-op boost.
**Fix:** Added the same style of bounded validation `setPlatformFeeBps` already uses (non-negative, integer where appropriate) to all four functions.

### 2.7 Password-length validation drift between client and server — **fixed**
**Files:** `components/findit-app/Login.jsx` (signup + reset-password), `components/findit-app/AccountDetails.jsx` (change-password)
**Problem:** The client-side "is this password long enough to submit" checks allowed 4+ characters, but the server (`app/api/auth/signup/route.ts`, `lib/auth.ts#changeUserPassword`/`resetPasswordForPhone`) requires 8+. For signup specifically, this meant a buyer could type a 5-character password, go through a **real SMS OTP round trip** (cost + rate-limit budget spent), and only then discover the server rejects it — after already verifying their phone.
**Fix:** Raised the client-side thresholds to 8 for signup and both password-reset/change flows, matching the server (and matching the placeholder text, which already said "At least 8 characters" even though the actual guard was 4). Login's own looser password check was deliberately left untouched — it's not where a password policy should newly be enforced.

### 2.8 Admin's typed reply discarded on send failure — **fixed**
**File:** `components/findit-app/AdminQueue.jsx`, `AdminTicketThread`'s `submit()`
**Problem:** `setDraft("")` ran **before** `await onSend(...)`, unconditionally — a failed send (network blip, server error) wiped the admin's typed reply with no way to recover it, forcing a full retype. The buyer-facing equivalent (`Thread.jsx`) already does this correctly (clears the draft only after success).
**Fix:** Moved `setDraft("")` to after `onSend` succeeds, matching `Thread.jsx`'s pattern exactly.

### 2.9 Missing stale-response guard on the support-ticket overlay — **fixed**
**Files:** `components/findit-app/MainApp.jsx#handleOpenTicket`, `components/findit-app/AdminQueue.jsx`'s `SupportAdmin.open()`
**Problem:** The buyer-facing message thread (`handleOpenThread`) already guards against a slow response from a thread the user already left landing late and silently resurrecting it (`threadRequestRef`, bumped on every open/back). Support tickets had no equivalent guard on either the buyer side or the admin side.
**Fix:** Added the identical ref-based guard (`ticketRequestRef` in `MainApp.jsx`, `openRequestRef` in `AdminQueue.jsx`) to both, bumped on open and on back, exactly mirroring the existing, already-proven pattern.

### 2.10 Phone-number length validation drift — **fixed**
**Files:** `app/api/auth/send-otp/route.ts`, `app/api/admin/users/lookup/route.ts`
**Problem:** Both accepted phone numbers as short as 8 characters, while `app/api/auth/signup/route.ts` requires 10+ — meaning a phone number too short to ever successfully sign up with could still trigger a real SMS send or an admin lookup query.
**Fix:** Raised both to 10, matching signup.

### 2.11 Confirmed-dead code removed
- `components/findit-app/motion.jsx` — `pressFade` (zero importers anywhere).
- `components/findit-app/location.js` — `clearStoredLocation()` (zero importers anywhere; confirmed this isn't a missing safety call — location is already keyed per-user, so nothing needs explicit clearing on logout).

### 2.12 Minor defensive hardening
- `app/store/[slug]/StoreListings.jsx` — local `naira()` helper was missing the `Number(...)` coercion the shared `components/findit-app/data.js#naira()` has, so it would throw (not degrade) on a non-numeric price. Added the coercion for consistency. (No live code path currently passes it anything but a real number — `products.price` is `NOT NULL` — so this was latent, not active.)
- `lib/otp.ts` — fixed a comment that incorrectly claimed a *resent* OTP code gets a fresh attempt budget; it actually (and correctly, more strictly) reuses the same row/budget as the code it replaced. Documentation-only; not a security weakening.

---

## 3. False positives caught during verification (not applied)

The dead-code sweep flagged several exports as having "zero importers anywhere" using a same-file-blind check. Verifying each individually before deleting anything caught that **5 of 7** flagged non-type exports were actually in active, real use within their own file:

- `lib/repo.ts#listOffersForRequest` — used internally by `listMyRequests` (same file).
- `lib/storeSlug.ts#SLUG_PATTERN` — used internally by `isValidStoreSlug` (same file).
- `lib/subscriptions.ts#DEFAULT_STORE_TEMPLATE` / `DEFAULT_STORE_ACCENT` — used extensively internally (same file).
- `lib/transactionRecord.ts#CODE_PREFIX` — used internally by `generateTransactionCode`/`normalizeTransactionCode` (same file).

Only `pressFade` and `clearStoredLocation` (section 2.11) were genuinely dead. **None of these were deleted** until confirmed by a direct grep against the specific file — a repo-wide "zero importers" check that doesn't also check same-file usage will produce false positives.

---

## 4. Issues found — require your decision (not fixed)

These are real, but either need a product/business decision, touch too much surface for a one-line safe fix, or are genuinely low enough severity that fixing speculatively risks doing more harm than leaving as documented.

| # | Area | Issue | Why not auto-fixed |
|---|------|-------|---------------------|
| 1 | **Supabase plan** | Project is on the Free tier — no automated backups, no point-in-time recovery, no database branching (confirmed by a failed `create_branch` call earlier this session). This is the single biggest standing risk to the whole platform: a bad migration, a bug, or `DELETE` typo has no restore path. | Pure billing decision — only you can authorize the upgrade. |
| 2 | **`charge.failed` webhook branch doesn't independently re-verify** | `app/api/payments/paystack/webhook/route.ts`'s `charge.failed` branch trusts the webhook's own event tag directly (gated only by HMAC signature), unlike `charge.success`, which independently re-calls `verifyTransaction()`. Low severity — only Paystack (holder of the secret) could forge this — but it's a real asymmetry with the one path in the codebase that got verification right. | Low severity, and "fixing" it means adding a new outbound API call into the webhook's failure path — a behavior change with its own new failure modes (timeout, rate limit) that deserves a deliberate decision, not a reflexive patch. |
| 3 | **Abandoned-checkout `payments` rows are never swept** | A buyer who starts checkout and never completes it leaves a permanently `pending` row in `payments` (harmless — nothing treats `pending` as paid, `provider_reference` stays unique) but it never gets cleaned up or marked `failed`. Pure data hygiene: the admin transaction ledger accumulates inert rows over time. | Needs a decision on retention policy (sweep after N days? just a dashboard filter?) rather than an arbitrary cutoff I'd be guessing at. |
| 4 | **Dead/unreachable UI code in `Checkout.jsx`** | `alreadyPaid`/`justConfirmed` and the "Delivery status" stepper assume `checkoutOrder.order` gets live-updated to reflect a real payment confirmation — but it's a one-time snapshot (see 2.2) and a real Paystack payment always redirects the browser away before any update could land. In practice, this "payment confirmed" celebration UI and the 5-stage stepper (frozen at "Seller preparing" even once paid) are currently unreachable in the real flow. | This is a real gap in the *intended* feature, not a bug introduced this pass — building a correct live-status view (e.g., polling order status post-redirect, or reading it from `Account.jsx`-style live state) is a small feature addition, not a one-line fix, and deserves your sign-off on the approach. |
| 5 | **`storagePrefix()` duplicated identically in 4 route files** | `app/api/auth/avatar/route.ts`, `app/api/products/route.ts`, `app/api/products/[id]/route.ts`, `app/api/sellers/me/branding/route.ts` each define the exact same helper. No bug — purely a DRY opportunity. | Cosmetic; touches 4 files for zero functional change. Flagging per your "unused/duplicate code" checklist item rather than touching working code without a reason. |
| 6 | **Naira/date formatting duplicated with no shared `lib/` helper** | `₦${X.toLocaleString("en-NG")}` is hand-rolled independently at 8 server-side call sites across `lib/repo.ts`, `lib/payments.ts`, `lib/subscriptions.ts`; date formatting similarly at ~15 frontend call sites. No drift found in either — just no single source of truth, so a future formatting change means touching many call sites. | Same reasoning as #5 — cosmetic, no bug, no urgency to refactor working, correct code. |

---

## 5. Security findings

**Overall:** the codebase is unusually well-defended for its size — compare-and-swap writes keyed on previously-read values (not just existence), idempotency via real unique DB constraints (not just app-level checks), and a consistently-applied seller_id-vs-business-name collision defense across almost every file that touches a seller's identity. The findings above (2.1, 2.3) are real exceptions to that otherwise-consistent pattern, now fixed.

- **No RLS reliance, by design, and verified safe:** the app uses a service-role Supabase client server-side exclusively (`lib/db.ts`). Confirmed via a repo-wide grep that **no client-side code anywhere** creates a Supabase client or holds `NEXT_PUBLIC_SUPABASE_*`/anon-key material — the browser never talks to Supabase directly, so the RLS-bypass-by-service-role architecture is safe as long as every authorization check lives in app code (which this audit, plus the earlier IDOR sweep this session, confirms it does).
- **Messaging/conversation routes** (`app/api/messages/route.ts`, `app/api/messages/[conversationId]/route.ts`, `app/api/orders/[id]/message/route.ts`) all correctly verify the caller is a real participant (`isParticipant`/`sellerOwnsItem`) before calling into `repo.ts` — checked directly, no gaps found.
- **Cron endpoint** (`app/api/cron/expirations/route.ts`) correctly checks `CRON_SECRET` as a bearer token when set; falls open only if the env var is unset, in which case the worst case is an idempotent sweep (notifications + lapsed-subscription checks) being triggered on demand — not a data-integrity risk.
- **CSP/security headers** (`next.config.mjs`): tightly scoped `script-src`/`style-src`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS, and a locked-down `Permissions-Policy`. All `/api/*` responses get `Cache-Control: no-store` unconditionally — relevant given this session's shared-device cross-account leak fixes (commit `9be1c15`).
- **Prior-session security fixes, re-confirmed still correct:** stored XSS in storefront JSON-LD (`c87c89f`), ambiguous `users` FK embeds silently breaking seller-approval writes (`12f2270`), three cross-account localStorage/cache leaks on a shared device (`9be1c15`).

---

## 6. Payment findings (Paystack)

A fresh, independent re-audit against your exact 10-point checklist was performed this pass, reading every Paystack-adjacent file from scratch with no reference to prior conclusions. **All 10 points confirmed safe:**

1. Secret key never reaches the client — confirmed (`lib/paystack.ts`, 6 server-only importers, zero `"use client"` usage, zero `NEXT_PUBLIC_*` key material anywhere).
2. Transaction references are genuinely unique — confirmed (`crypto.randomUUID()` at all 4 checkout routes, plus a real DB-level unique constraint on `payments.provider_reference`).
3. Payment verification is server-side and independent of the webhook payload — confirmed (`verifyTransaction()` makes a live outbound call to Paystack's own API; the webhook's own JSON body's status/amount fields are never trusted for the success decision).
4. Amount cannot be manipulated by the client — confirmed per route; every amount is resolved server-side from a DB record (`order.price`, `plan.price`), never from client-supplied JSON.
5. Successful payment updates the correct order/boost/subscription — confirmed; every downstream ID comes from the server-written `payments` row, never from the webhook's own `event.data.metadata`.
6. Duplicate webhook delivery cannot create duplicate side effects — confirmed; backed by real DB unique constraints (`payments.provider_reference`, `boosts.payment_id`, `payouts.order_id`), not just app-level checks.
7. Webhooks are securely verified — confirmed; timing-safe HMAC comparison, fails closed with no secret configured, hashes the exact raw body (not a re-serialized JSON copy).
8. Payment status cannot be changed by the frontend — confirmed; every writer of `payment_status`/`escrow_status` is webhook-only or admin-gated with a restricted literal outcome, backstopped by DB CHECK constraints.
9. Failed and cancelled payments are handled correctly — confirmed, including a concrete walkthrough of an abandoned checkout (stays `pending` indefinitely, never auto-flips to paid, retry correctly unblocks after 15 minutes).
10. The correct seller/order/user is associated with every transaction — confirmed; ownership is checked once at checkout-initiation against the URL path parameter, and every later step reuses that same server-verified chain.

Two low-severity gaps found and documented (not fixed) — see table in section 4, rows 2 and 3.

**Also re-confirmed from this session's prior payment-reliability fixes:** synthetic-email rejection fix (`075c73e`), Paystack's own rejection message now surfaced instead of a generic fallback (`8d3aaca`), dangling pending-payment rows on failed checkout init now marked `failed` immediately (`8d3aaca`), and the subscription lost-update race across plan changes (`83679f5`).

---

## 7. Database findings

- `supabase/schema.sql` was fully resynced earlier this session (commit `6fc90f0`) after drifting out of sync with 7 migrations — verified by dependency-ordering every table and confirming all 34 tables have RLS enabled with zero duplicate names.
- Migration 034 added the 5 FK-covering indexes Supabase's own performance advisor flagged as missing.
- Idempotency and race-safety are backed by real DB constraints, not just application logic, throughout: `payments.provider_reference` (unique), `boosts.payment_id` (unique, partial index), `payouts.order_id` (unique), `orders_escrow_requires_payment`/`orders_paid_has_fee_snapshot`/`orders_fee_split_reconciles` (CHECK constraints).
- **No new schema issues found this pass.**
- **Standing risk:** Supabase Free tier — no backups, no PITR (see section 4, row 1).

---

## 8. Performance findings

- `lib/risk.ts#getSellerRiskSignals` — unbounded full-table scan on every admin page load — **fixed** (section 2.5).
- `GET /api/products` — already bounded to 2,000 rows earlier this session (commit `6fc90f0`).
- No other unbounded queries found in this pass's review of `repo.ts`, the rest of `lib/`, or the API routes checked.

---

## 9. Production-readiness findings

- Security headers, CSP, and cache-control are all correctly configured (section 5).
- The cron endpoint is properly gated when `CRON_SECRET` is set — **recommend confirming it's actually set in the Vercel production environment**, since I could not independently re-verify this project's live env vars this pass (the Vercel project reference from earlier in this session no longer resolved when I tried).
- Branded 404 and Open Graph image already added (commit `6fc90f0`).
- Admin dashboard silent-failure pattern (false "all clear" on a failed fetch) has now been fixed across every screen checked this session: the original 8 `AdminQueue.jsx` sub-screens (`6fc90f0`), the seller-verification queue (`476e3c5`), and the two support-ticket overlays (section 2.9, this pass).

---

## 10. Remaining risks (not code — operational)

1. **No database backups/PITR** (Supabase Free tier) — see section 4. This remains the single largest risk to the business, independent of code quality.
2. **Vercel production env vars** — `CRON_SECRET` and the Paystack/Sentry keys should be spot-checked directly in the Vercel dashboard; I was not able to re-verify them live this pass.
3. **`Checkout.jsx`'s live payment-status UI is currently unreachable** (section 4, row 4) — not dangerous, but means a buyer never actually sees a true "payment confirmed, here's your live delivery status" screen today; they're redirected to Paystack and the order simply updates in the background.

---

## 11. Recommended next steps

1. Decide on the Supabase billing tier (backups/PITR) — this is the one item in this whole audit that money, not code, fixes.
2. Confirm `CRON_SECRET` is set in the live Vercel production environment.
3. If/when you want a real "payment confirmed, live delivery status" Checkout screen, that's a small, well-scoped feature (poll/refetch the order after the Paystack redirect) — flagged here rather than built speculatively.
4. The two Paystack-adjacent low-severity items (section 4, rows 2–3) are safe to leave as-is indefinitely; revisit only if you want defense-in-depth on `charge.failed` specifically, or want a scheduled sweep of abandoned pending payments for ledger hygiene.

---

## 12. Verification performed

- `npx tsc --noEmit` — clean, no errors.
- `npx vitest run` — 482 tests passed, 0 failed, across 45 test files.
- `rm -rf .next && npx next build` — clean production build, no errors or warnings introduced.

All fixes in section 2 are committed on `claude/pull-request-status-7tp2c7`, awaiting your explicit instruction to merge.
