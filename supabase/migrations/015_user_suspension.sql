-- ---------------------------------------------------------------------------
-- 015 — Platform-level account suspension.
--
-- Before this, only a SELLER account had a lifecycle status
-- (pending/approved/rejected/suspended, see migration 013) — there was no
-- way to restrict a plain buyer account at all, even an abusive one. This
-- adds the same idea one level up, on users itself: any account (buyer,
-- seller, or admin) can be suspended, independent of whatever seller-status
-- it might also have.
--
-- Enforcement (see lib/auth.ts#getUserForToken): a suspended account is
-- treated as logged out on its very next request — not just blocked from
-- logging in again — so this takes effect immediately, not on next login.
-- Sessions are NOT destroyed on suspend: reactivating an account restores
-- whatever session it already had, rather than forcing a fresh login.
-- ---------------------------------------------------------------------------

alter table users add column if not exists suspended boolean not null default false;
alter table users add column if not exists suspended_reason text;
alter table users add column if not exists suspended_at timestamptz;
