-- ---------------------------------------------------------------------------
-- 013 — A real seller lifecycle: pending / approved / rejected / suspended.
--
-- Before this, sellers.status only ever blocked the 'rejected' case —
-- 'pending' behaved identically to 'approved' everywhere restricted seller
-- actions (listing, sending an offer, uploading images) were checked. This
-- makes the state machine real:
--   pending    -> can complete onboarding, cannot perform restricted actions
--   approved   -> normal selling privileges
--   rejected   -> restricted (unchanged from before)
--   suspended  -> restricted (new) — an admin can pull selling privileges
--                 from a previously-approved seller without deleting
--                 anything or touching their existing listings/orders
--
-- See lib/repo.ts#assertSellerCanTransact for the single source of truth
-- this enforces against (replacing three separate inline
-- `status === "rejected"` checks).
--
-- This DOES change behavior for any seller currently sitting in 'pending' —
-- they can no longer list/offer/upload until approved. That's the point:
-- 'pending' was never a real hold state before. No existing 'approved'
-- seller is affected.
-- ---------------------------------------------------------------------------

alter table sellers drop constraint if exists sellers_status_check;
alter table sellers add constraint sellers_status_check
  check (status in ('pending', 'approved', 'rejected', 'suspended'));

-- Reused for both a rejection reason and a suspension reason — an admin
-- decision that restricts a seller should always come with one, the same
-- principle already applied to seller verification review.
alter table sellers add column if not exists status_reason text;
