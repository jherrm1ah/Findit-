-- ---------------------------------------------------------------------------
-- 010 — Store subscriptions (FindIt Store tiers + FindIt Pro)
--
-- Adds a real, backend-enforced subscription system on top of the existing
-- `sellers` record (a store IS a seller — see 009's note on why the app
-- isn't building storefront identity on business_name text anymore). Does
-- NOT touch or duplicate products/orders/offers/sellers in any way.
--
-- Design notes:
--   - subscription_plans holds every plan's price + limits/capabilities as
--     DATA, not code, so an admin can edit ₦2,000 -> ₦2,500 without a
--     deploy. Seeded with the 5 real plans below; safe to re-run.
--   - subscriptions covers BOTH a seller's Store plan and a user's FindIt
--     Pro plan through one shape, distinguished by owner_type/owner_id,
--     rather than two near-identical tables — a seller who is also a Pro
--     subscriber then has two rows resolved through the same code path
--     instead of two separate ones.
--   - subscription_events is an append-only audit trail (upgrades,
--     downgrades, trial start/end, cancellations, payment failures) so
--     support/admin can see exactly what happened to a subscription.
--   - payments records every provider transaction (Paystack today,
--     provider-agnostic by design) whether or not it's tied to a
--     subscription (boosts/fees can post here too later).
--   - products.active lets a downgrade deactivate the seller's excess
--     listings WITHOUT deleting them — see lib/subscriptions.ts.
--
-- As with every other table in this schema, RLS is enabled below with NO
-- policies. This app has no Supabase Auth session (see the top of
-- schema.sql), so there is no auth.uid() to key a real per-row policy on —
-- writing policies here would be security theater. All real enforcement of
-- "is this seller's own subscription" happens in the Next.js API layer,
-- exactly like every other table.
-- ---------------------------------------------------------------------------

create table if not exists subscription_plans (
  id text primary key,
  -- 'store' plans gate a seller's storefront (Free/Basic/Business/Pro);
  -- 'platform' plans are account-wide add-ons (FindIt Pro) independent of
  -- whether the account is also a seller.
  kind text not null check (kind in ('store', 'platform')),
  name text not null,
  price_monthly integer not null check (price_monthly >= 0),
  price_yearly integer, -- null where a plan has no annual option
  -- null = effectively unlimited (still subject to reasonable system caps
  -- enforced elsewhere, per spec). Only meaningful for kind='store'.
  product_limit integer,
  storage_limit_mb integer,
  analytics_level text not null default 'none' check (analytics_level in ('none', 'basic', 'advanced', 'full')),
  customization_level text not null default 'none' check (customization_level in ('none', 'basic', 'advanced', 'full')),
  featured_listing_access boolean not null default false,
  priority_support boolean not null default false,
  pro_badge boolean not null default false,
  trial_days integer not null default 0,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id text primary key,
  owner_type text not null check (owner_type in ('store', 'platform')),
  -- sellers.id for owner_type='store', users.id for owner_type='platform'.
  -- Not a single FK since it points at two different tables depending on
  -- owner_type; ownership is verified in the API layer before any write.
  owner_id text not null,
  plan_id text not null references subscription_plans(id),
  status text not null default 'active'
    check (status in ('active', 'trialing', 'past_due', 'cancelled', 'expired')),
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'yearly')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_type, owner_id)
);
create index if not exists subscriptions_owner_idx on subscriptions(owner_type, owner_id);
create index if not exists subscriptions_status_idx on subscriptions(status);

create table if not exists subscription_events (
  id text primary key,
  subscription_id text not null references subscriptions(id) on delete cascade,
  type text not null, -- e.g. created, upgraded, downgraded, trial_started, trial_ended, renewed, cancelled, payment_failed
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists subscription_events_subscription_id_idx on subscription_events(subscription_id);
create index if not exists subscription_events_created_at_idx on subscription_events(created_at desc);

create table if not exists payments (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  subscription_id text references subscriptions(id),
  kind text not null default 'subscription' check (kind in ('subscription', 'boost', 'fee', 'other')),
  amount integer not null check (amount >= 0),
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'refunded')),
  provider text not null default 'paystack',
  provider_reference text unique,
  metadata jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payments_user_id_idx on payments(user_id);
create index if not exists payments_subscription_id_idx on payments(subscription_id);
create index if not exists payments_status_idx on payments(status);

-- Lets a downgrade deactivate a seller's excess listings instead of
-- deleting them — see lib/subscriptions.ts#applyPlanChange. Existing rows
-- default to active so this is a no-op for every listing that exists today.
alter table products add column if not exists active boolean not null default true;
create index if not exists products_active_idx on products(active);

alter table subscription_plans enable row level security;
alter table subscriptions enable row level security;
alter table subscription_events enable row level security;
alter table payments enable row level security;

-- ---------------------------------------------------------------------------
-- Seed data — the real FindIt plans from the product spec. Prices are in
-- NGN (whole naira, matching products.price's convention). Uses upsert-by-id
-- so re-running this file updates names/limits but never creates duplicates;
-- an admin can still change prices later via the admin API without editing
-- this file again.
-- ---------------------------------------------------------------------------

insert into subscription_plans
  (id, kind, name, price_monthly, price_yearly, product_limit, storage_limit_mb,
   analytics_level, customization_level, featured_listing_access, priority_support, pro_badge, trial_days, sort_order)
values
  ('store_free', 'store', 'Free Seller', 0, null, 10, 100, 'none', 'none', false, false, false, 0, 0),
  ('store_basic', 'store', 'Basic Store', 2000, null, 50, 500, 'basic', 'basic', true, false, false, 30, 1),
  ('store_business', 'store', 'Business Store', 5000, null, 200, 2000, 'advanced', 'advanced', true, true, false, 30, 2),
  ('store_pro', 'store', 'Pro Store', 10000, null, null, 10000, 'full', 'full', true, true, true, 30, 3),
  ('findit_pro', 'platform', 'FindIt Pro', 3500, 35000, null, null, 'advanced', 'none', true, true, true, 0, 10)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  price_monthly = excluded.price_monthly,
  price_yearly = excluded.price_yearly,
  product_limit = excluded.product_limit,
  storage_limit_mb = excluded.storage_limit_mb,
  analytics_level = excluded.analytics_level,
  customization_level = excluded.customization_level,
  featured_listing_access = excluded.featured_listing_access,
  priority_support = excluded.priority_support,
  pro_badge = excluded.pro_badge,
  trial_days = excluded.trial_days,
  sort_order = excluded.sort_order,
  updated_at = now();
