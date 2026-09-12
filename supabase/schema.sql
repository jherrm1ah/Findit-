-- FindIt Naija — Postgres schema for Supabase.
--
-- Run this once against a fresh Supabase project (SQL Editor -> paste -> Run,
-- or `psql "$SUPABASE_DB_URL" -f supabase/schema.sql`). It only creates
-- objects — safe to re-run thanks to IF NOT EXISTS, but it does not seed any
-- data. There is no demo/mock content in this schema on purpose.
--
-- AUTHORIZATION MODEL — read this before assuming RLS protects anything here.
-- This app does NOT use Supabase Auth. Login is a custom phone+password
-- system (see lib/auth.ts) with our own session cookies. All database access
-- goes through Next.js API routes using the Supabase *service role* key,
-- which bypasses Row Level Security entirely — the same trust boundary this
-- app already used for Storage. Row Level Security is enabled below purely
-- as defense-in-depth (so the anon/public key — which nothing in this app
-- uses, but could leak — can't read or write anything without an explicit
-- policy). The real authorization check — "is this the logged-in user's own
-- data" — happens in the API route code, not in Postgres. If you later
-- migrate to Supabase Auth, revisit this file to add real per-user policies
-- keyed on auth.uid().

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- users / sessions
-- ---------------------------------------------------------------------------

create table if not exists users (
  id text primary key,
  phone text not null unique,
  -- True only for accounts that passed OTP phone verification at signup
  -- (see lib/sms.ts). Defaults true so existing/pre-OTP accounts aren't
  -- retroactively locked out of anything that later checks this flag.
  phone_verified boolean not null default true,
  password_hash text not null,
  password_salt text not null,
  name text not null,
  role text not null check (role in ('buyer', 'seller', 'admin')),
  business_name text,
  -- The account's last-known location, set only when the user explicitly
  -- grants browser geolocation permission (never auto-collected, never
  -- inferred from a hardcoded city). Used to derive "near you" listings and
  -- requests via real distance math — see lib/geo.ts. Null until granted.
  lat double precision,
  lng double precision,
  location_updated_at timestamptz,
  avatar_url text,
  notifications_enabled boolean not null default true,
  -- Optional — this app is phone-first, and most accounts have no email.
  -- Collected during seller onboarding (lib/sellerVerification.ts) mainly
  -- so Paystack transactions can use a real address instead of a synthetic
  -- one; never required for login.
  email text,
  -- Set only when promoteToAdmin() overwrites role to 'admin' — records
  -- what the account actually was (buyer/seller) so demoteFromAdmin() can
  -- restore it exactly rather than guessing. Null for every account that
  -- was never promoted (including admins created directly via
  -- scripts/create-admin.mjs).
  previous_role text,
  -- Scoped admin sub-role — meaningful only when role='admin'. Narrows
  -- what an admin account can do (see lib/adminRoles.ts), enforced
  -- server-side on every admin route. 'super_admin' = full access, the
  -- default for every admin so nothing loses capability by default.
  admin_role text
    check (admin_role in ('super_admin', 'verification_admin', 'support_admin', 'finance_admin', 'moderation_admin')),
  -- Platform-level suspension — independent of a seller's own status
  -- (sellers.status above only restricts selling; this restricts using the
  -- account at all). See lib/auth.ts#getUserForToken: a suspended account
  -- is treated as logged out on its very next request, not just blocked
  -- from a future login.
  suspended boolean not null default false,
  suspended_reason text,
  suspended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user_id_idx on sessions(user_id);

-- ---------------------------------------------------------------------------
-- sellers — the admin-verification record for a seller account.
-- Properly linked to users now (the old SQLite version only linked these by
-- an "id starts with seller_" naming convention, which this fixes). `status`
-- is the account lifecycle gate (pending/approved/rejected/suspended) —
-- everything but 'approved' blocks listing/offering/editing, see
-- lib/repo.ts#assertSellerCanTransact. `verification_status` below is a
-- separate, richer layer (who is this seller, what evidence backs that up)
-- that drives the public New/Verified/Trusted badge — see
-- lib/sellerVerification.ts and migration 012. It never gates selling on
-- its own; it's trust information for buyers.
-- ---------------------------------------------------------------------------

create table if not exists sellers (
  id text primary key,
  user_id text not null unique references users(id) on delete cascade,
  name text not null,
  -- pending: can complete onboarding, cannot list/offer/upload yet.
  -- approved: normal selling privileges. rejected/suspended: restricted —
  -- see lib/repo.ts#assertSellerCanTransact, the single source of truth
  -- every restricted-action route checks against.
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  -- Reused for a rejection reason or a suspension reason — a decision that
  -- restricts a seller always comes with one shown back to them.
  status_reason text,
  created_at timestamptz not null default now(),
  -- Real backing for the Store subscription "customization" feature (see
  -- subscription_plans.customization_level below) — settable only when the
  -- seller's current plan allows it (lib/subscriptions.ts#assertCanCustomizeStore),
  -- and rendered on the public storefront (SellerProfile.jsx). Null until set.
  logo_url text,
  banner_url text,
  -- ---- Seller trust & verification (migration 012) ----
  -- Public-safe profile fields — see seller_verification_details below for
  -- the private ones (exact address/coordinates), kept in a separate table
  -- specifically so a `select('*')` on this table (this codebase has
  -- several) can never accidentally leak them.
  seller_type text
    check (seller_type in ('physical_store', 'online_business', 'home_based', 'both', 'individual', 'other')),
  category text,
  description text,
  years_selling text,
  social_links jsonb,
  has_physical_store boolean,
  public_state text,
  public_city text,
  public_area text,
  verification_status text not null default 'incomplete'
    check (verification_status in ('incomplete', 'pending', 'approved', 'rejected', 'needs_info')),
  verification_submitted_at timestamptz,
  verification_reviewed_at timestamptz,
  verification_reviewed_by text references users(id),
  verification_rejection_reason text,
  -- ---- Payout destination (migration 016) ----
  -- bank_account_name is resolved from Paystack's account-name lookup at
  -- the moment the seller enters their account number, shown back as the
  -- "does this look right?" confirmation before saving — a payout should
  -- never silently go to a mistyped account. paystack_recipient_code is
  -- created once (Paystack's Transfer Recipient API) and reused for every
  -- payout after that.
  bank_account_number text,
  bank_code text,
  bank_account_name text,
  paystack_recipient_code text
);

-- ---------------------------------------------------------------------------
-- seller_verification_details / seller_verification_evidence — the private
-- half of seller trust & verification. Kept out of `sellers` on purpose
-- (see the note above); RLS enabled with no policies, same as every other
-- table here (no Supabase Auth session to key a real policy on — see the
-- top of this file) — real access control (owning seller + admins only,
-- evidence served via signed URLs from a private bucket) lives in the
-- Next.js API layer. See lib/sellerVerification.ts.
-- ---------------------------------------------------------------------------

create table if not exists seller_verification_details (
  seller_id text primary key references sellers(id) on delete cascade,
  shop_address text,
  lat double precision,
  lng double precision,
  website text,
  updated_at timestamptz not null default now()
);

create table if not exists seller_verification_evidence (
  id text primary key,
  seller_id text not null references sellers(id) on delete cascade,
  kind text not null check (kind in ('product_photo', 'shop_photo', 'business_page', 'social_link', 'other')),
  storage_path text,
  text_value text,
  note text,
  created_at timestamptz not null default now(),
  check ((storage_path is not null) <> (text_value is not null))
);
create index if not exists seller_verification_evidence_seller_id_idx on seller_verification_evidence(seller_id);

-- ---------------------------------------------------------------------------
-- categories
--
-- The real, admin-editable product/request category taxonomy (see
-- lib/categoryCatalog.ts and migration 017) — replaces a hardcoded object.
-- icon_key names a lucide-react icon looked up client-side against a fixed,
-- known set; an unrecognized value just falls back to a generic icon.
-- Seeded with the same 15 categories the app already shipped with.
-- ---------------------------------------------------------------------------

create table if not exists categories (
  id text primary key,
  label text not null,
  icon_key text not null default 'Package',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists categories_active_idx on categories(active);
alter table categories enable row level security;
-- Seeded in the centralized "Seed data" section near the bottom of this
-- file, alongside subscription_plans/platform_fee_config/boost_plans.

-- ---------------------------------------------------------------------------
-- products
--
-- Dropped from the old schema: rating, verified, test_batch, marketing_cat,
-- loc. Those were either hardcoded fakes (verified, test_batch,
-- marketing_cat) or filled in by the synthetic catalogue generator (rating,
-- loc), and are not something a real product-creation form collects.
-- "verified" and "rating" are now computed at query time from real data
-- (the listing seller's real approval status and real order reviews) — see
-- lib/repo.ts. There is no real substitute for test_batch/marketing_cat, so
-- they're gone; "Trending" on the home screen now means "recently listed."
-- ---------------------------------------------------------------------------

create table if not exists products (
  id text primary key,
  category text not null,
  name text not null,
  price integer not null check (price > 0),
  seller text not null,
  -- Reliable identity alongside the text name above (see migration 009):
  -- nullable and unused by any user-facing query yet — see
  -- lib/sellerIdentityMatch.ts and app/api/admin/seller-identity/route.ts
  -- for the backfill/verification process before anything reads from it.
  seller_id text references sellers(id),
  image_url text,
  art integer not null default 0,
  -- Captured from the selling account's location at the time the listing was
  -- created (see lat/lng on users above) so buyers can be shown real nearby
  -- listings without any hardcoded city. Null if the seller had no location
  -- on file yet — such listings just don't get distance-sorted.
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  -- Lets a Store subscription downgrade deactivate excess listings instead
  -- of deleting them (see subscription_plans/subscriptions below and
  -- lib/subscriptions.ts#applyPlanChange). Defaults true so every listing
  -- created before this feature existed just keeps working.
  active boolean not null default true,
  -- Null = not currently boosted. A real Paystack-paid promotion (see
  -- boost_plans/boosts and lib/boosts.ts) that just moves this listing to
  -- the front of Home/Browse while now() < boosted_until — no cron needed
  -- to "expire" it, the sort just stops caring once the timestamp passes.
  boosted_until timestamptz
);
create index if not exists products_seller_id_idx on products(seller_id);
create index if not exists products_seller_idx on products(seller);
create index if not exists products_created_at_idx on products(created_at desc);
create index if not exists products_active_idx on products(active);
create index if not exists products_boosted_until_idx on products(boosted_until);

-- ---------------------------------------------------------------------------
-- requests / offers
--
-- requests.user_id is now required — a request has to belong to a real
-- logged-in buyer (previously requests had no owner at all, so a buyer could
-- never look their own request back up).
--
-- offers dropped verified/rating/orders_count for the same reason as
-- products: those were fabricated at insert time (both by the automatic
-- "3 sellers responded" simulation and by the one-click "Send offer" button,
-- which used to auto-fill a random price and a hardcoded 4.9-star/212-order
-- claim). A real offer is now a real form a seller fills in themselves —
-- price, delivery, eta, warranty, note are all seller-entered. verified and
-- rating are computed the same way as products, from that seller's real data.
-- ---------------------------------------------------------------------------

create table if not exists requests (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  title text not null,
  description text,
  category text, -- optional; set when the buyer accepts an AI classification suggestion
  budget_min integer,
  budget_max integer,
  qty integer not null default 1,
  location text, -- optional free-text note from the buyer (e.g. a delivery landmark), never geocoded
  lat double precision, -- real coordinates captured from the buyer at submission time, for sellers' "near you" queue
  lng double precision,
  condition text not null default 'New',
  deadline text,
  status text not null default 'open' check (status in ('open', 'matched', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists requests_user_id_idx on requests(user_id);
create index if not exists requests_status_idx on requests(status);

create table if not exists offers (
  id text primary key,
  request_id text not null references requests(id) on delete cascade,
  seller text not null,
  -- See seller_id on products above — same reliable-identity migration.
  seller_id text references sellers(id),
  price integer not null check (price > 0),
  delivery text not null,
  eta text not null,
  condition text not null,
  warranty text not null,
  note text,
  accepted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists offers_seller_id_idx on offers(seller_id);
create index if not exists offers_request_id_idx on offers(request_id);

-- ---------------------------------------------------------------------------
-- orders — user_id is now required (see "guest checkout" note in the repo
-- layer for why anonymous orders were removed: with no real per-guest
-- identity, every guest order shared one NULL bucket, so any guest could see
-- every other guest's orders. Placing a real order now requires login.)
-- ---------------------------------------------------------------------------

create table if not exists orders (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  item text not null,
  seller text not null,
  -- See seller_id on products above — same reliable-identity migration.
  seller_id text references sellers(id),
  price integer not null check (price > 0),
  status text not null default 'Awaiting payment',
  can_review boolean not null default false,
  reviewed boolean not null default false,
  my_rating integer check (my_rating between 1 and 5),
  review_comment text,
  request_id text references requests(id),
  created_at timestamptz not null default now(),
  -- Delivery is confirmed by the BUYER, never the seller: "Delivered" means
  -- the person who paid said the item arrived. See migration 008.
  buyer_confirmed_at timestamptz,
  -- unpaid | held | released | disputed | refunded — where the money
  -- stands. An order starts 'unpaid' (see payment_status below) and only
  -- ever becomes 'held' once a real Paystack charge is confirmed by
  -- webhook — see lib/payments.ts#confirmOrderPayment. Never set to 'held'
  -- at order-creation time; that would claim money is held when none has
  -- moved yet.
  escrow_status text not null default 'unpaid'
    check (escrow_status in ('unpaid', 'held', 'released', 'disputed', 'refunded')),
  issue_reported_at timestamptz,
  issue_note text,
  -- ---- Real payment (migration 016) ----
  -- Has THIS order actually been paid for? Distinct from escrow_status,
  -- which describes where already-collected money currently sits.
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed')),
  paid_at timestamptz,
  -- Snapshotted from platform_fee_config the moment payment is confirmed —
  -- frozen from then on, so a later fee change never rewrites what an
  -- already-paid order's numbers were.
  platform_fee_bps integer,
  platform_fee_amount integer,
  seller_payout_amount integer
);
create index if not exists orders_user_id_idx on orders(user_id);
create index if not exists orders_seller_idx on orders(seller);
create index if not exists orders_escrow_status_idx on orders(escrow_status)
  where escrow_status = 'disputed';
create index if not exists orders_seller_id_idx on orders(seller_id);

-- ---------------------------------------------------------------------------
-- notifications — also now always owned by a real user (no more shared
-- guest notifications backed by seed rows).
-- ---------------------------------------------------------------------------

create table if not exists notifications (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  unread boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_id_idx on notifications(user_id);

-- ---------------------------------------------------------------------------
-- conversations / messages (buyer-seller chat)
-- ---------------------------------------------------------------------------

create table if not exists conversations (
  id text primary key,
  buyer_id text not null references users(id) on delete cascade,
  seller_id text not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (buyer_id, seller_id)
);

create table if not exists messages (
  id text primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  sender_id text not null references users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read boolean not null default false
);
create index if not exists messages_conversation_id_idx on messages(conversation_id);

-- ---------------------------------------------------------------------------
-- saved_items — real wishlist/"save for later" (new; the old app faked this
-- with the same 3 hardcoded product ids for every account).
-- ---------------------------------------------------------------------------

create table if not exists saved_items (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);
create index if not exists saved_items_user_id_idx on saved_items(user_id);

-- ---------------------------------------------------------------------------
-- admin_actions — audit trail for destructive/high-impact admin actions
-- (seller approve/reject today). Written best-effort by the API layer
-- (lib/repo.ts#logAdminAction); a logging failure never blocks the action
-- itself. Nothing here is ever shown to non-admins.
-- ---------------------------------------------------------------------------

create table if not exists admin_actions (
  id text primary key,
  admin_id text not null references users(id) on delete cascade,
  action text not null,
  target_type text not null,
  target_id text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_actions_created_at_idx on admin_actions(created_at desc);

-- ---------------------------------------------------------------------------
-- otp_verifications — self-managed phone-verification codes (see lib/otp.ts
-- and lib/sms.ts). FindIt generates and hashes the code itself and sends it
-- as a plain SMS through Termii — Termii never sees or manages the code.
-- ---------------------------------------------------------------------------

create table if not exists otp_verifications (
  id text primary key,
  phone text not null,
  purpose text not null check (purpose in ('signup', 'reset')),
  otp_hash text not null,
  otp_salt text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  resend_count integer not null default 0,
  last_sent_at timestamptz not null default now(),
  used boolean not null default false,
  request_ip text
);
create index if not exists otp_verifications_phone_purpose_idx on otp_verifications(phone, purpose);
create index if not exists otp_verifications_expires_at_idx on otp_verifications(expires_at);
create index if not exists otp_verifications_created_at_idx on otp_verifications(created_at);

-- ---------------------------------------------------------------------------
-- subscription_plans / subscriptions / subscription_events / payments —
-- FindIt Store subscription tiers + FindIt Pro. See
-- supabase/migrations/010_store_subscriptions.sql for the full design notes
-- (why this is 4 tables instead of the 8 in the original spec, why
-- subscriptions covers both a seller's Store plan and a user's FindIt Pro
-- plan, why products.active exists). A fresh project gets this table and its
-- seed rows (the real plan prices/limits) directly from this file; an
-- existing project runs migration 010 once.
-- ---------------------------------------------------------------------------

create table if not exists subscription_plans (
  id text primary key,
  kind text not null check (kind in ('store', 'platform')),
  name text not null,
  price_monthly integer not null check (price_monthly >= 0),
  price_yearly integer,
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
  type text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists subscription_events_subscription_id_idx on subscription_events(subscription_id);
create index if not exists subscription_events_created_at_idx on subscription_events(created_at desc);

create table if not exists payments (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  subscription_id text references subscriptions(id),
  -- Real marketplace order payments (migration 016) alongside subscription
  -- payments — set only for kind = 'order'.
  order_id text references orders(id),
  kind text not null default 'subscription' check (kind in ('subscription', 'order', 'boost', 'fee', 'other')),
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
create index if not exists payments_order_id_idx on payments(order_id);
create index if not exists payments_status_idx on payments(status);

-- ---------------------------------------------------------------------------
-- platform_fee_config / payouts — the marketplace commission and the real
-- seller-payout ledger (migration 016). See the full design note in that
-- migration file; in short: the fee is admin-editable and append-only (the
-- current fee is just the latest row, so changing it never rewrites an
-- already-paid order's own frozen fee snapshot on the order itself), and a
-- payout is either a real Paystack Transfer or an honestly-labeled
-- 'manual_required' row — never a status that claims a payment moved when
-- it didn't.
-- ---------------------------------------------------------------------------

create table if not exists platform_fee_config (
  id text primary key,
  fee_bps integer not null check (fee_bps >= 0 and fee_bps <= 10000),
  created_by text references users(id),
  created_at timestamptz not null default now()
);
create index if not exists platform_fee_config_created_at_idx on platform_fee_config(created_at desc);

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

-- ---------------------------------------------------------------------------
-- boost_plans / boosts (migration 018)
--
-- A real Paystack-paid promotion for one of a seller's own listings — see
-- products.boosted_until above and lib/boosts.ts. boost_plans holds pricing
-- as DATA (same pattern as subscription_plans); boosts is the append-only
-- purchase record.
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

-- ---------------------------------------------------------------------------
-- Row Level Security — enabled with no policies (defense-in-depth only; see
-- the note at the top of this file). All real access control lives in the
-- Next.js API layer.
-- ---------------------------------------------------------------------------

alter table users enable row level security;
alter table sessions enable row level security;
alter table sellers enable row level security;
alter table products enable row level security;
alter table requests enable row level security;
alter table offers enable row level security;
alter table orders enable row level security;
alter table notifications enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table saved_items enable row level security;
alter table admin_actions enable row level security;
alter table otp_verifications enable row level security;
alter table subscription_plans enable row level security;
alter table subscriptions enable row level security;
alter table subscription_events enable row level security;
alter table payments enable row level security;
alter table seller_verification_details enable row level security;
alter table seller_verification_evidence enable row level security;
alter table platform_fee_config enable row level security;
alter table payouts enable row level security;
alter table categories enable row level security;
alter table boost_plans enable row level security;
alter table boosts enable row level security;

create unique index if not exists users_email_unique_idx on users(email) where email is not null;

-- ---------------------------------------------------------------------------
-- Seed data — the ONE deliberate exception to "no seed data" above. These
-- are real business configuration (the FindIt Store/Pro plan prices and
-- limits from the product spec), not demo/mock content — the app can't
-- provision a seller onto a plan that doesn't exist. Prices are in whole
-- NGN. Upsert-by-id: re-running this file updates names/limits here but
-- never creates duplicates, and an admin can still edit prices later via
-- the admin API without ever touching this file again.
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

-- A starting marketplace commission so the platform has a real, visible fee
-- from day one instead of the code treating "no config row" as free — an
-- admin should review this via the fee-config admin route and adjust it
-- before launch, not treat 5% as a permanent decision made here.
insert into platform_fee_config (id, fee_bps, created_by)
values ('fee_default', 500, null)
on conflict (id) do nothing;

insert into boost_plans (id, name, duration_days, price, sort_order) values
  ('boost_3d', '3-day Boost', 3, 1000, 0),
  ('boost_7d', '7-day Boost', 7, 2000, 1),
  ('boost_14d', '14-day Boost', 14, 3500, 2)
on conflict (id) do nothing;

insert into categories (id, label, icon_key, sort_order) values
  ('reading', 'Reading & Book Gadgets', 'BookOpen', 0),
  ('tools', 'Tools & Repair', 'Wrench', 1),
  ('organization', 'Home Organization', 'Package', 2),
  ('lighting', 'Lighting', 'Lightbulb', 3),
  ('cleaning', 'Cleaning', 'Droplet', 4),
  ('kitchen', 'Kitchen', 'Utensils', 5),
  ('bathroom', 'Bathroom & Personal Care', 'Droplets', 6),
  ('campus', 'Student & Campus', 'GraduationCap', 7),
  ('travel', 'Travel & Everyday Carry', 'Briefcase', 8),
  ('phonetech', 'Phone & Everyday Tech', 'Smartphone', 9),
  ('car', 'Car Products', 'Car', 10),
  ('power', 'Power & Connectivity', 'BatteryCharging', 11),
  ('weird', 'Weirdly Useful', 'Sparkles', 12),
  ('plant', 'Plant & Agriculture', 'Leaf', 13),
  ('desk', 'Desk Setup', 'Monitor', 14)
on conflict (id) do nothing;
