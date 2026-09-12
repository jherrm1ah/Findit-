-- ---------------------------------------------------------------------------
-- 018 — Listing boosts
--
-- A real Paystack-paid promotion for one of a seller's own listings — moves
-- it to the front of Home/Browse for a fixed window, ahead of the existing
-- Store-plan "featured" tier sort (see lib/repo.ts#sortForDisplay). Reuses
-- the same payments table/webhook machinery as orders/subscriptions
-- (payments.kind already allows 'boost' as of migration 016) rather than a
-- parallel payment system.
--
-- boost_plans holds pricing as DATA, not code — the same pattern as
-- subscription_plans (migration 010) — so an admin can change
-- "₦1,000 for 3 days" without a deploy. boosts is the append-only purchase
-- record (never updated after activation, matching the audit-trail
-- philosophy of subscription_events); products.boosted_until is the one
-- column anything actually SORTS on, and needs no cron to "expire" — the
-- sort just stops caring once now() passes it.
-- ---------------------------------------------------------------------------

create table if not exists boost_plans (
  id text primary key,
  name text not null,
  duration_days integer not null check (duration_days > 0),
  price integer not null check (price >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists boosts (
  id text primary key,
  product_id text not null references products(id) on delete cascade,
  seller_id text not null references sellers(id) on delete cascade,
  boost_plan_id text not null references boost_plans(id),
  amount integer not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists boosts_product_id_idx on boosts(product_id);
create index if not exists boosts_seller_id_idx on boosts(seller_id);

alter table products add column if not exists boosted_until timestamptz;
create index if not exists products_boosted_until_idx on products(boosted_until);

alter table boost_plans enable row level security;
alter table boosts enable row level security;

insert into boost_plans (id, name, duration_days, price, sort_order) values
  ('boost_3d', '3-day Boost', 3, 1000, 0),
  ('boost_7d', '7-day Boost', 7, 2000, 1),
  ('boost_14d', '14-day Boost', 14, 3500, 2)
on conflict (id) do nothing;
