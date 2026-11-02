-- ---------------------------------------------------------------------------
-- 045: phone alerts, and delivery fees that depend on the buyer's state.
--
-- push_subscriptions: one row per browser/phone where someone tapped "Turn on
--   alerts" (lib/outsideAlerts.ts). Only the server reads it (RLS on, no
--   policies, like every other table here).
--
-- products.delivery_state / delivery_fee_other: where a listing ships from,
--   and what delivery costs to OTHER states (delivery_fee stays the fee within
--   that state). Null = one flat fee everywhere, as before.
--
-- orders.delivery_from_state / delivery_fee_quote_other: the same two copied
--   onto the order, so checkout works out the fee from the address's state
--   (lib/deliveryShared.ts#feeForState). Null = flat delivery_fee_quote.
--
-- Additive only.
-- ---------------------------------------------------------------------------

create table if not exists push_subscriptions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id_idx on push_subscriptions(user_id);
alter table push_subscriptions enable row level security;

alter table products add column if not exists delivery_state text;
alter table products add column if not exists delivery_fee_other integer;
alter table products drop constraint if exists products_delivery_fee_other_nonneg;
alter table products add constraint products_delivery_fee_other_nonneg
  check (delivery_fee_other is null or delivery_fee_other >= 0);

alter table orders add column if not exists delivery_from_state text;
alter table orders add column if not exists delivery_fee_quote_other integer;
alter table orders drop constraint if exists orders_delivery_fee_quote_other_nonneg;
alter table orders add constraint orders_delivery_fee_quote_other_nonneg
  check (delivery_fee_quote_other is null or delivery_fee_quote_other >= 0);
