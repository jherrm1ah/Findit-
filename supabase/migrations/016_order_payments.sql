-- ---------------------------------------------------------------------------
-- 016 — Real marketplace payments: order payment status, configurable
-- platform fees (snapshotted per order), and seller payouts.
--
-- Before this, an order's escrow_status defaulted to 'held' the moment it
-- was CREATED — before any money had actually changed hands. Checkout.jsx
-- told the buyer "Payment held" and the seller got a "New order" push
-- notification, both immediately on creation, with no payment step at all
-- anywhere in the app. This migration adds the real states that were
-- missing so that stops being true:
--
--   orders.payment_status: has this specific order actually been paid for?
--   ('pending' until a webhook-confirmed Paystack charge says otherwise).
--   escrow_status gains 'unpaid' as the true starting state — 'held' now
--   only ever gets set once payment_status flips to 'paid' (see
--   lib/payments.ts#confirmOrderPayment). Existing rows are NOT backfilled:
--   this app has no seed data and no production traffic yet, so every
--   existing 'held'/'released' row already reflects the pre-payment world
--   this migration is replacing, not a real charge retroactively reinterpreted.
--
--   platform_fee_bps / platform_fee_amount / seller_payout_amount: snapshotted
--   onto the order the moment its payment is confirmed, from whatever
--   platform_fee_config says AT THAT MOMENT — so a later fee change never
--   retroactively changes what an already-paid order's numbers were. This is
--   the "historical transactions must preserve fee-at-time-of-transaction"
--   requirement; it's enforced by writing the values once and never
--   recomputing them from the live config again.
--
--   platform_fee_config: admin-editable, append-only. The current fee is
--   simply the most recently created row — changing the fee is inserting a
--   new row, never updating an old one, so the history this table already
--   *is* the audit trail. Seeded with one starting row below.
--
--   sellers gains real payout-destination fields (bank account + the
--   Paystack transfer-recipient code created once from them).
--
--   payouts: one row per order once its funds are released to the seller —
--   real money movement (a Paystack Transfer) when configured, or a clearly
--   marked 'manual_required' row when it isn't (no Paystack keys yet, or a
--   seller with no bank details on file) rather than pretending to pay
--   anyone. A unique constraint on order_id makes double-payout for the same
--   order a database-level impossibility, not just an app-level assumption.
-- ---------------------------------------------------------------------------

alter table orders add column if not exists payment_status text not null default 'pending'
  check (payment_status in ('pending', 'paid', 'failed'));
alter table orders add column if not exists paid_at timestamptz;
alter table orders add column if not exists platform_fee_bps integer;
alter table orders add column if not exists platform_fee_amount integer;
alter table orders add column if not exists seller_payout_amount integer;

alter table orders drop constraint if exists orders_escrow_status_check;
alter table orders add constraint orders_escrow_status_check
  check (escrow_status in ('unpaid', 'held', 'released', 'disputed', 'refunded'));
alter table orders alter column escrow_status set default 'unpaid';

alter table payments drop constraint if exists payments_kind_check;
alter table payments add constraint payments_kind_check
  check (kind in ('subscription', 'order', 'boost', 'fee', 'other'));
alter table payments add column if not exists order_id text references orders(id);
create index if not exists payments_order_id_idx on payments(order_id);

alter table sellers add column if not exists bank_account_number text;
alter table sellers add column if not exists bank_code text;
-- Resolved from Paystack's account-name lookup at the time the seller
-- entered their account number — shown back to them as the "does this look
-- right?" confirmation before saving, so a payout never silently goes to a
-- mistyped account.
alter table sellers add column if not exists bank_account_name text;
alter table sellers add column if not exists paystack_recipient_code text;

create table if not exists platform_fee_config (
  id text primary key,
  fee_bps integer not null check (fee_bps >= 0 and fee_bps <= 10000),
  created_by text references users(id),
  created_at timestamptz not null default now()
);
create index if not exists platform_fee_config_created_at_idx on platform_fee_config(created_at desc);

-- A starting default so the platform has SOME real, visible fee from day
-- one instead of the code silently treating "no config row" as free —
-- an admin should review this and adjust it via the fee-config admin route
-- before launch, not treat it as a permanent decision made here.
insert into platform_fee_config (id, fee_bps, created_by)
values ('fee_default', 500, null)
on conflict (id) do nothing;

create table if not exists payouts (
  id text primary key,
  seller_id text not null references sellers(id),
  order_id text not null references orders(id),
  amount integer not null check (amount > 0),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'failed', 'manual_required')),
  provider_reference text,
  failure_reason text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (order_id)
);
create index if not exists payouts_seller_id_idx on payouts(seller_id);
create index if not exists payouts_status_idx on payouts(status);

alter table platform_fee_config enable row level security;
alter table payouts enable row level security;
