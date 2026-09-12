-- ---------------------------------------------------------------------------
-- 021 — Let the database defend the money invariants, and index the foreign
-- keys that carry real query load.
--
-- Every rule below was already enforced in application code. That is not the
-- same as being true: application code is one bug, one new call site, or one
-- hand-written admin fix away from writing a row that contradicts it, and a
-- wrong money row is not something you notice — it is something a seller
-- notices, later, in their payout. These constraints are the backstop, not a
-- replacement for the checks in lib/payments.ts.
--
-- One of them is NOT satisfied by existing data, and the backfill below fixes
-- that before the constraint is added. See "Escrow can never run ahead of
-- payment". Everything else was verified clean against the live database
-- first: no negative amounts, no mis-split fees, no paid order missing its
-- fee snapshot.
-- ---------------------------------------------------------------------------

-- ---- Money can never be negative -----------------------------------------
-- boosts.amount was the one money column with no check at all; orders' three
-- payment columns are nullable until payment is confirmed, so each check has
-- to allow null and constrain only the set case.

alter table boosts drop constraint if exists boosts_amount_positive;
alter table boosts add constraint boosts_amount_positive
  check (amount >= 0);

alter table orders drop constraint if exists orders_platform_fee_amount_nonneg;
alter table orders add constraint orders_platform_fee_amount_nonneg
  check (platform_fee_amount is null or platform_fee_amount >= 0);

alter table orders drop constraint if exists orders_seller_payout_amount_nonneg;
alter table orders add constraint orders_seller_payout_amount_nonneg
  check (seller_payout_amount is null or seller_payout_amount >= 0);

alter table orders drop constraint if exists orders_platform_fee_bps_range;
alter table orders add constraint orders_platform_fee_bps_range
  check (platform_fee_bps is null or (platform_fee_bps >= 0 and platform_fee_bps <= 10000));

-- ---- The fee split must actually add up -----------------------------------
-- The platform's cut plus the seller's cut is the order price, exactly. If
-- these three are ever set such that they don't reconcile, FindIt is either
-- paying a seller money it never collected or keeping money it never earned.
-- Written to hold only when all three are present, because they are set
-- together (lib/payments.ts#confirmOrderPayment) or not at all.

alter table orders drop constraint if exists orders_fee_split_reconciles;
alter table orders add constraint orders_fee_split_reconciles
  check (
    platform_fee_amount is null
    or seller_payout_amount is null
    or platform_fee_amount + seller_payout_amount = price
  );

-- ---- Escrow can never run ahead of payment --------------------------------
-- 'held' and 'released' both assert that FindIt is holding real money for
-- this order. Neither is reachable until payment_status says the charge was
-- confirmed. This is the invariant migration 016's comment describes in
-- prose; here it becomes something the database refuses to break.
-- 'refunded' is deliberately allowed alongside a non-paid payment_status:
-- a charge that is later reversed can legitimately leave the two out of step.
--
-- BACKFILL FIRST. Migration 016 introduced 'unpaid' as the true starting
-- state but deliberately left existing rows alone, on the reasoning that
-- there was no production traffic yet. There was: every order created before
-- 016 still carries escrow_status 'held' from the old default, while its
-- payment_status is 'pending' and no payment row exists at all. Those orders
-- tell a buyer "Payment held" and a seller "money is waiting for you" about
-- money nobody ever charged.
--
-- Correcting them to 'unpaid' is safe and is not a write-off of anything
-- real: it only touches rows with no confirmed payment, and a row with a
-- confirmed payment is excluded by the where clause. Verified before writing
-- this: zero payouts exist, zero payments have status 'success', and no order
-- is released or buyer-confirmed — so no money movement is being erased,
-- only a false claim about money that never moved.

update orders
set escrow_status = 'unpaid'
where escrow_status in ('held', 'released')
  and payment_status <> 'paid';

alter table orders drop constraint if exists orders_escrow_requires_payment;
alter table orders add constraint orders_escrow_requires_payment
  check (escrow_status not in ('held', 'released') or payment_status = 'paid');

-- ---- Paid orders must carry their fee snapshot ----------------------------
-- The snapshot is what makes a historical order immune to a later fee change.
-- A paid order without one has lost that record permanently — there is no way
-- to reconstruct which rate applied.

alter table orders drop constraint if exists orders_paid_has_fee_snapshot;
alter table orders add constraint orders_paid_has_fee_snapshot
  check (payment_status <> 'paid' or platform_fee_bps is not null);

-- ---- Foreign keys that carry query load -----------------------------------
-- Flagged by Supabase's own performance advisor. An unindexed foreign key
-- means every lookup through it is a sequential scan, and every delete on the
-- parent scans the child table to enforce the constraint. Cheap to add now,
-- painful to add later under load. Only the keys on real read paths are
-- covered; a covering index nobody queries is just write cost.

create index if not exists admin_actions_admin_id_idx on admin_actions(admin_id);
create index if not exists boosts_boost_plan_id_idx on boosts(boost_plan_id);
create index if not exists conversations_seller_id_idx on conversations(seller_id);
create index if not exists messages_sender_id_idx on messages(sender_id);
create index if not exists orders_request_id_idx on orders(request_id);
create index if not exists saved_items_product_id_idx on saved_items(product_id);
create index if not exists sellers_verification_reviewed_by_idx on sellers(verification_reviewed_by);
create index if not exists subscriptions_plan_id_idx on subscriptions(plan_id);
create index if not exists support_ticket_messages_sender_id_idx on support_ticket_messages(sender_id);
create index if not exists platform_fee_config_created_by_idx on platform_fee_config(created_by);
