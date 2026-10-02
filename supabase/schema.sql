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
  -- Issued lazily (lib/referrals.ts#ensureReferralCode) on first use rather
  -- than backfilled for every existing account at once — see migration 035.
  referral_code text unique,
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
  expires_at timestamptz not null,
  -- Staff sign-in (migration 020). Null = locked. Being logged in as an
  -- admin is not enough to reach admin routes; the password is re-verified
  -- on the staff screen and stamped here, and every admin route requires a
  -- stamp newer than ADMIN_UNLOCK_MINUTES. Per-session on purpose, so an
  -- unlock on one device never unlocks another.
  admin_unlocked_at timestamptz
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
  -- Dedicated public storefront (migration 023). Null until a seller on a
  -- PAID plan claims one; permanent once claimed, so shared links keep
  -- working even after a rename or a downgrade. Whether the page is publicly
  -- visible is computed from the live subscription on every request, never
  -- stored — see lib/store.ts.
  store_slug text,
  store_slug_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Real backing for the Store subscription "customization" feature (see
  -- subscription_plans.customization_level below) — settable only when the
  -- seller's current plan allows it (lib/subscriptions.ts#assertCanCustomizeStore),
  -- and rendered on the public storefront (SellerProfile.jsx). Null until set.
  logo_url text,
  banner_url text,
  -- Migration 031 — which storefront LAYOUT this seller has picked, gated
  -- by the same customization_level as logo_url/banner_url above (see
  -- lib/subscriptions.ts#STORE_TEMPLATES for what each level unlocks).
  -- 'classic' is exactly the layout that existed before this column did, so
  -- every seller who never opens the picker renders identically to before.
  store_template text not null default 'classic',
  -- Migration 032 — a curated accent color pair (see
  -- lib/subscriptions.ts#STORE_ACCENTS), gated the same plain way
  -- logo_url/banner_url are (any paid customization unlocks every preset —
  -- no progressive tier ladder like store_template has). 'violet' is the
  -- exact color every storefront already rendered in before this column
  -- existed.
  store_accent text not null default 'violet',
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
create index if not exists sellers_verification_reviewed_by_idx on sellers(verification_reviewed_by);

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

-- Only sellers who have claimed a storefront carry a slug, so the index is
-- partial. It is also what makes allocation safe under concurrency: the app
-- tries candidates and lets a unique violation decide the winner.
create unique index if not exists sellers_store_slug_unique_idx
  on sellers(store_slug)
  where store_slug is not null;

-- Every slug a store has ever used keeps resolving to that same store, so a
-- link shared months ago never lands on a stranger's shop. See migration 023.
create table if not exists store_slug_aliases (
  slug text primary key,
  seller_id text not null references sellers(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists store_slug_aliases_seller_id_idx on store_slug_aliases(seller_id);
alter table store_slug_aliases enable row level security;

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
  boosted_until timestamptz,
  -- Migration 030 — dedupes the scheduled "your boost ended" notification
  -- (see app/api/cron/expirations) against THIS specific boosted_until,
  -- not the listing forever: lib/boosts.ts#applyBoostedUntil clears it back
  -- to null every time it extends boosted_until, so stacking another boost
  -- later still gets its own notification when that one eventually lapses.
  boost_expiry_notified_at timestamptz,
  -- ---- Real listing details (migration 026) ----
  -- Nullable with no default, on purpose: a listing that predates this
  -- migration has no honest answer for "what condition is this?" or "does
  -- this include delivery?", and silently defaulting every existing row
  -- would assert something nobody actually said. The seller form requires
  -- these going forward (see lib/repo.ts#validateProductInput); an old,
  -- unedited listing just shows "Not specified" until its seller updates it.
  -- qty is the one exception — defaulting an existing single listing to
  -- "1 available" is a safe, harmless assumption, not a trust claim.
  description text,
  condition text check (condition in ('New', 'Used')),
  qty integer not null default 1 check (qty >= 0),
  -- Free-text pickup/delivery-area note, same spirit as requests.location —
  -- never geocoded, distinct from lat/lng above (which is the SELLER
  -- ACCOUNT's location, captured for "near you" sorting, not a statement
  -- about this specific item).
  location text,
  delivery_option text check (delivery_option in ('Delivery', 'Pickup', 'Both')),
  color text,
  variation text,
  -- ---- Moderation (migration 027) ----
  -- Deliberately separate from `active` above, which already means something
  -- else entirely: a Store-subscription downgrade hiding excess listings.
  -- Collapsing the two into one flag would make "why is this listing
  -- hidden?" ambiguous to both the seller and support.
  moderation_status text not null default 'active'
    check (moderation_status in ('active', 'under_review', 'removed')),
  moderation_reason text,
  moderated_by text references users(id),
  moderated_at timestamptz
);
create index if not exists products_seller_id_idx on products(seller_id);
create index if not exists products_seller_idx on products(seller);
create index if not exists products_created_at_idx on products(created_at desc);
create index if not exists products_active_idx on products(active);
create index if not exists products_boosted_until_idx on products(boosted_until);
create index if not exists products_moderation_status_idx on products(moderation_status);
create index if not exists products_moderated_by_idx on products(moderated_by);

-- ---------------------------------------------------------------------------
-- product_images (migration 026) — up to MAX_PRODUCT_IMAGES (lib/repo.ts)
-- photos per listing, not just one. products.image_url above is kept as the
-- cover photo (sort_order 0's url, denormalized by createProduct/
-- updateProduct) so every existing reader keeps rendering the cover exactly
-- as before; this table is what ProductDetail's photo gallery actually reads.
-- ---------------------------------------------------------------------------

create table if not exists product_images (
  id text primary key,
  product_id text not null references products(id) on delete cascade,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists product_images_product_id_idx on product_images(product_id, sort_order);
alter table product_images enable row level security;

-- ---------------------------------------------------------------------------
-- moderation_rules / product_reports (migration 027)
--
-- moderation_rules — an admin-editable list of prohibited-item keywords,
-- the same "admin manages a list of configurable rows" pattern as
-- `categories`. A rule's severity decides what happens when a listing's
-- name/description matches its keyword: 'block' refuses the create/update
-- outright, 'flag' lets it through but leaves it for a human to look at.
--
-- product_reports — a buyer "report this listing" queue, the same
-- report/resolve shape as the disputed-orders flow.
-- ---------------------------------------------------------------------------

create table if not exists moderation_rules (
  id text primary key,
  -- Matched case-insensitively against the listing's name and description
  -- (see lib/moderationRules.ts) — not a regex, so an admin without
  -- engineering help can safely add one.
  keyword text not null,
  reason text not null,
  severity text not null default 'flag' check (severity in ('flag', 'block')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists moderation_rules_active_idx on moderation_rules(active);
alter table moderation_rules enable row level security;

create table if not exists product_reports (
  id text primary key,
  product_id text not null references products(id) on delete cascade,
  reporter_id text not null references users(id) on delete cascade,
  reason text not null check (reason in ('prohibited_item', 'counterfeit', 'scam', 'spam', 'inappropriate', 'other')),
  -- Optional context from the reporter; capped the same way
  -- validateProductInput caps description (lib/repo.ts) — a report is free
  -- text a stranger writes about someone else's listing, not a field with
  -- an inherent shape.
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by text references users(id),
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_reports_product_id_idx on product_reports(product_id);
create index if not exists product_reports_status_idx on product_reports(status);
create index if not exists product_reports_reporter_id_idx on product_reports(reporter_id);
create index if not exists product_reports_resolved_by_idx on product_reports(resolved_by);
alter table product_reports enable row level security;

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
  -- See migration 039 — when this order first reached 'Dispatched' (or
  -- skipped straight past it). The anchor the 7-day escrow auto-release
  -- timer counts from; null until the seller dispatches.
  dispatched_at timestamptz,
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
  seller_payout_amount integer,
  -- Display/audit snapshot only (migration 036) — how much FindIt referral
  -- credit reduced what the buyer paid via Paystack. Never part of the fee
  -- split above: seller_payout_amount is still computed from the FULL
  -- price, so a referral credit is FindIt subsidizing the buyer, never a
  -- discount taken out of the seller's payout.
  credit_applied integer not null default 0,
  constraint orders_credit_applied_nonneg check (credit_applied >= 0),
  -- ---- Money invariants (migration 021) ----
  -- Already enforced in application code (lib/payments.ts) before these
  -- existed — these are the backstop, not a replacement for those checks.
  -- Nullable columns are allowed to be null (unpaid orders haven't been
  -- fee-split yet) and constrained only once set.
  constraint orders_platform_fee_amount_nonneg
    check (platform_fee_amount is null or platform_fee_amount >= 0),
  constraint orders_seller_payout_amount_nonneg
    check (seller_payout_amount is null or seller_payout_amount >= 0),
  constraint orders_platform_fee_bps_range
    check (platform_fee_bps is null or (platform_fee_bps >= 0 and platform_fee_bps <= 10000)),
  -- The platform's cut plus the seller's cut must equal the order price,
  -- exactly, whenever both are set (they're written together, never one
  -- without the other — see lib/payments.ts#confirmOrderPayment).
  constraint orders_fee_split_reconciles
    check (
      platform_fee_amount is null
      or seller_payout_amount is null
      or platform_fee_amount + seller_payout_amount = price
    ),
  -- 'held'/'released' both assert FindIt is holding real money for this
  -- order — neither is reachable until payment_status confirms the charge.
  -- 'refunded' is deliberately allowed alongside a non-paid payment_status:
  -- a charge later reversed can legitimately leave the two out of step.
  constraint orders_escrow_requires_payment
    check (escrow_status not in ('held', 'released') or payment_status = 'paid'),
  -- A paid order without its fee snapshot has lost that record permanently —
  -- there's no way to reconstruct which rate applied after the fact.
  constraint orders_paid_has_fee_snapshot
    check (payment_status <> 'paid' or platform_fee_bps is not null)
);
create index if not exists orders_user_id_idx on orders(user_id);
create index if not exists orders_seller_idx on orders(seller);
create index if not exists orders_escrow_status_idx on orders(escrow_status)
  where escrow_status = 'disputed';
create index if not exists orders_seller_id_idx on orders(seller_id);
create index if not exists orders_request_id_idx on orders(request_id);

-- ---------------------------------------------------------------------------
-- reviews (migration 025) — a real, listable, repliable form of a review.
-- orders already carries `reviewed`/`my_rating`/`review_comment`, and every
-- rating computation in the app keeps reading those — this table doesn't
-- replace them. What was missing was anywhere for a review's actual TEXT to
-- be found again: it sat on the order forever, invisible to any other buyer,
-- with no way for the seller to answer it. One row per order (the same
-- one-review-per-order rule orders.reviewed already implied, now enforced),
-- carrying a snapshot of the seller identity the same way transaction_records
-- does below.
-- ---------------------------------------------------------------------------

create table if not exists reviews (
  id text primary key,
  order_id text not null unique references orders(id) on delete restrict,
  buyer_user_id text not null references users(id) on delete restrict,
  seller_id text references sellers(id),
  seller_name text not null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  -- The seller's one reply — a single pair of columns, not an events table,
  -- since a reply is a courtesy response the seller may revise, not a fact
  -- whose history needs to be tamper-evident.
  seller_reply text,
  seller_replied_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reviews_seller_id_idx on reviews(seller_id);
create index if not exists reviews_seller_name_idx on reviews(seller_name);
create index if not exists reviews_buyer_user_id_idx on reviews(buyer_user_id);
create index if not exists reviews_created_at_idx on reviews(created_at desc);
alter table reviews enable row level security;

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
create index if not exists conversations_seller_id_idx on conversations(seller_id);

create table if not exists messages (
  id text primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  sender_id text not null references users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read boolean not null default false
);
create index if not exists messages_conversation_id_idx on messages(conversation_id);
create index if not exists messages_sender_id_idx on messages(sender_id);

-- ---------------------------------------------------------------------------
-- support_tickets / support_ticket_messages (migration 019)
--
-- A real in-app support ticket system — mirrors the conversations/messages
-- shape above (a ticket is the thread, messages are the back-and-forth)
-- rather than a static FAQ page. See lib/support.ts.
-- ---------------------------------------------------------------------------

create table if not exists support_tickets (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  subject text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  user_has_unread boolean not null default false,
  admin_has_unread boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Migration 033 — decided once at creation from the filer's plan at that
  -- moment (lib/support.ts#createTicket), never re-derived later. Business
  -- Store, Pro Store, and FindIt Pro are the only plans with
  -- subscription_plans.priority_support = true today.
  priority boolean not null default false
);
create index if not exists support_tickets_user_id_idx on support_tickets(user_id);
create index if not exists support_tickets_status_idx on support_tickets(status);
create index if not exists support_tickets_priority_idx on support_tickets(priority);

create table if not exists support_ticket_messages (
  id text primary key,
  ticket_id text not null references support_tickets(id) on delete cascade,
  sender_id text not null references users(id) on delete cascade,
  is_admin boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists support_ticket_messages_ticket_id_idx on support_ticket_messages(ticket_id);
create index if not exists support_ticket_messages_sender_id_idx on support_ticket_messages(sender_id);

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
create index if not exists saved_items_product_id_idx on saved_items(product_id);

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
create index if not exists admin_actions_admin_id_idx on admin_actions(admin_id);

-- ---------------------------------------------------------------------------
-- Verified Transaction Records (migration 024)
--
-- Created exactly once, when an order reaches escrow_status 'released' — the
-- only state this app treats as genuinely complete, and one that migration
-- 021 makes unreachable without a confirmed payment. The snapshot columns say
-- what was true at completion and are never recomputed; everything that
-- happens afterwards is appended to transaction_record_events instead.
-- ---------------------------------------------------------------------------

create table if not exists transaction_records (
  id text primary key,
  -- Public, random, non-sequential. Not derived from any internal id, order
  -- reference or phone number.
  code text not null unique,
  -- One record per order. This constraint is what makes creation idempotent.
  order_id text not null unique references orders(id) on delete restrict,
  buyer_user_id text not null references users(id) on delete restrict,
  seller_id text references sellers(id),
  seller_name text not null,
  item_name text not null,
  product_id text references products(id) on delete set null,
  amount integer not null check (amount >= 0),
  currency text not null default 'NGN',
  seller_verification_level text not null default 'new'
    check (seller_verification_level in ('new', 'verified', 'trusted')),
  paid_at timestamptz,
  completed_at timestamptz not null,
  status text not null default 'completed'
    check (status in ('completed', 'disputed', 'refunded')),
  -- Foundation for future item-level identity. Every record today is
  -- listing-scope: a generic listing must not become a permanently trackable
  -- physical object.
  record_scope text not null default 'listing'
    check (record_scope in ('listing', 'item')),
  created_at timestamptz not null default now()
);
create index if not exists transaction_records_buyer_idx on transaction_records(buyer_user_id);
create index if not exists transaction_records_seller_idx on transaction_records(seller_id);
create index if not exists transaction_records_seller_name_idx on transaction_records(seller_name);
create index if not exists transaction_records_completed_at_idx on transaction_records(completed_at desc);
create index if not exists transaction_records_product_id_idx on transaction_records(product_id);
alter table transaction_records enable row level security;

-- Append-only history. A dispute, refund or admin correction adds a row here
-- and moves transaction_records.status; nothing rewrites the snapshot. This
-- is also the extension point for ownership transfer, warranty and repair
-- history, which are events against a transaction rather than new tables.
create table if not exists transaction_record_events (
  id text primary key,
  transaction_record_id text not null references transaction_records(id) on delete cascade,
  event_type text not null
    check (event_type in ('completed', 'dispute_opened', 'dispute_resolved', 'refunded', 'admin_correction')),
  actor_type text not null check (actor_type in ('system', 'buyer', 'seller', 'admin')),
  actor_id text references users(id) on delete set null,
  reason text,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index if not exists transaction_record_events_record_idx
  on transaction_record_events(transaction_record_id, created_at);
create index if not exists transaction_record_events_actor_id_idx on transaction_record_events(actor_id);
alter table transaction_record_events enable row level security;

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
-- rate_limits (migration 022) — the real rate limiter. lib/rateLimit.ts's
-- in-process JS Map only ever worked for a single-process app; FindIt runs
-- on Vercel, where every request may land on a different serverless
-- instance, each with its own empty Map, reset on every cold start. One row
-- per key here, incremented atomically by check_rate_limit() below, fixes
-- both problems — every instance reads/writes the same counter, and it
-- survives cold starts. The in-memory limiter is kept as a fallback only,
-- so a database blip degrades protection rather than locking everyone out.
-- ---------------------------------------------------------------------------

create table if not exists rate_limits (
  -- The caller-supplied bucket, e.g. 'login:<ip>:<phone>' or 'order:<user id>'.
  key text primary key,
  -- Start of the current window. Rolled forward, not appended to, so this
  -- table stays one row per key rather than one row per attempt.
  window_start timestamptz not null default now(),
  hits integer not null default 0
);
create index if not exists rate_limits_window_start_idx on rate_limits(window_start);
alter table rate_limits enable row level security;

-- Atomic check-and-increment — one round trip, one statement, so two
-- concurrent requests can never both read the same count and both decide
-- they're under the limit. search_path pinned to public (migration 028,
-- fixing a Supabase security-linter warning about a mutable search_path on
-- a function that resolves an unqualified table name).
create or replace function check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_cutoff timestamptz := v_now - make_interval(secs => p_window_seconds);
  v_hits integer;
  v_window_start timestamptz;
begin
  insert into rate_limits as rl (key, window_start, hits)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set
      -- Still inside the window: count up. Window expired: start a new one
      -- at 1, which is this very request.
      hits = case when rl.window_start > v_cutoff then rl.hits + 1 else 1 end,
      window_start = case when rl.window_start > v_cutoff then rl.window_start else v_now end
  returning rl.hits, rl.window_start into v_hits, v_window_start;

  -- Opportunistic garbage collection. Keys are unbounded (every distinct IP
  -- and phone combination makes one), so something has to remove stale rows;
  -- doing it on roughly one call in two hundred keeps it free in the common
  -- case and avoids needing a scheduled job. A day is far longer than any
  -- window this app uses.
  if random() < 0.005 then
    delete from rate_limits where window_start < v_now - interval '1 day';
  end if;

  if v_hits > p_max then
    return query
      select
        false,
        greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer);
  else
    return query select true, 0;
  end if;
end;
$$;

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
create index if not exists subscriptions_plan_id_idx on subscriptions(plan_id);

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
  kind text not null default 'subscription' check (kind in ('subscription', 'order', 'boost', 'fee', 'other', 'ad_campaign')),
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
create index if not exists platform_fee_config_created_by_idx on platform_fee_config(created_by);

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
  -- See migration 037: true only when a transfer attempt reached Paystack
  -- but its outcome couldn't be confirmed (connection dropped mid-request)
  -- — the one case retrySellerPayout refuses to auto-retry, since the
  -- original may have already gone through.
  transfer_unconfirmed boolean not null default false,
  unique (order_id)
);
create index if not exists payouts_seller_id_idx on payouts(seller_id);
create index if not exists payouts_status_idx on payouts(status);

-- ---------------------------------------------------------------------------
-- referrals (migration 035) — see that migration file for the full design
-- note. referral_settings mirrors platform_fee_config just above: admin-
-- editable, append-only, read as "the most recent row".
-- ---------------------------------------------------------------------------

create table if not exists referrals (
  id text primary key,
  referrer_user_id text not null references users(id) on delete cascade,
  referred_user_id text not null unique references users(id) on delete cascade,
  referral_code text not null,
  status text not null default 'pending' check (status in ('pending', 'qualified', 'rewarded')),
  qualifying_action text check (qualifying_action in ('registration', 'first_purchase', 'seller_verification', 'first_product')),
  qualified_at timestamptz,
  reward_status text not null default 'none' check (reward_status in ('none', 'pending', 'issued', 'claimed')),
  reward_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint referrals_no_self_referral check (referrer_user_id <> referred_user_id)
);
create index if not exists referrals_referrer_idx on referrals(referrer_user_id);
create index if not exists referrals_code_idx on referrals(referral_code);
create index if not exists referrals_status_idx on referrals(status);

create table if not exists referral_rewards (
  id text primary key,
  referral_id text not null references referrals(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  reward_type text check (reward_type in ('credit', 'discount', 'voucher', 'subscription_benefit', 'physical_gift')),
  status text not null default 'pending' check (status in ('pending', 'issued', 'claimed', 'void')),
  amount numeric,
  -- How much of `amount` is still unspent (migration 036) — a lump credit
  -- rarely matches an order's price exactly, so this supports partial
  -- spend across one or more orders. Null for the inert, pre-036 shell
  -- rows; a reward only flips to 'claimed' once this reaches 0.
  remaining_amount integer,
  constraint referral_rewards_remaining_amount_range
    check (remaining_amount is null or (remaining_amount >= 0 and remaining_amount <= amount)),
  -- See migration 038: which Nth-referral milestone this reward is for,
  -- for this user. The unique constraint below is what actually stops two
  -- referrals qualifying for the same referrer at nearly the same instant
  -- from both independently issuing a reward for the same milestone.
  milestone_number integer not null,
  meta jsonb,
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  claimed_at timestamptz,
  unique (user_id, milestone_number)
);
create index if not exists referral_rewards_user_idx on referral_rewards(user_id);
create index if not exists referral_rewards_referral_idx on referral_rewards(referral_id);

create table if not exists referral_settings (
  id text primary key,
  active_qualifying_action text not null check (active_qualifying_action in ('registration', 'first_purchase', 'seller_verification', 'first_product')),
  created_by text references users(id),
  created_at timestamptz not null default now()
);
create index if not exists referral_settings_created_at_idx on referral_settings(created_at desc);

-- referral_reward_config / referral_credit_applications (migration 036) —
-- see that migration file for the full design note. In short:
-- referral_reward_config mirrors referral_settings just above (admin-
-- editable, append-only); referral_credit_applications is the ledger of
-- exactly how much of which reward went toward which checkout attempt, so
-- an abandoned/failed checkout can give reserved credit back instead of
-- losing it (see lib/referrals.ts#reserveCredit / releaseCredit).

create table if not exists referral_reward_config (
  id text primary key,
  milestone_size integer not null check (milestone_size > 0),
  reward_amount integer not null check (reward_amount >= 0),
  created_by text references users(id),
  created_at timestamptz not null default now()
);
create index if not exists referral_reward_config_created_at_idx on referral_reward_config(created_at desc);

create table if not exists referral_credit_applications (
  id text primary key,
  reward_id text not null references referral_rewards(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  payment_id text not null references payments(id) on delete cascade,
  order_id text not null references orders(id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  released_at timestamptz
);
create index if not exists referral_credit_applications_reward_idx on referral_credit_applications(reward_id);
create index if not exists referral_credit_applications_user_idx on referral_credit_applications(user_id);
create index if not exists referral_credit_applications_payment_idx on referral_credit_applications(payment_id);

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
  amount integer not null check (amount >= 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- Migration 029 — lets lib/boosts.ts#activateBoost tell "already applied
  -- for this exact payment" apart from "new payment, apply it", so a
  -- redelivered Paystack webhook event can retry safely instead of
  -- double-extending the boost.
  payment_id text references payments(id)
);
create index if not exists boosts_product_id_idx on boosts(product_id);
create index if not exists boosts_seller_id_idx on boosts(seller_id);
create index if not exists boosts_boost_plan_id_idx on boosts(boost_plan_id);
create unique index if not exists boosts_payment_id_key on boosts(payment_id) where payment_id is not null;

-- ---------------------------------------------------------------------------
-- ad_campaign_plans / ad_campaigns (migration 040)
--
-- A paid Sponsored slide in Home's promo carousel, sitting alongside the
-- app's own Request-first slide. Mirrors boost_plans/boosts above almost
-- exactly — ad_campaign_plans holds pricing as DATA; ad_campaigns is the
-- append-only purchase record, activated only from the Paystack webhook.
-- Unlike boosts, each campaign is its own independent row (nothing shared
-- to race over), so there's no CAS dance — just a plain insert, idempotent
-- on payment_id exactly like boosts.payment_id. "Currently active" is
-- always ends_at > now(), never a stored status column — an admin taking a
-- campaign down just sets ends_at to the moment of takedown (see
-- lib/adCampaigns.ts#takeDownCampaign); taken_down_at/taken_down_reason are
-- an audit trail of why, not what decides whether it's still live.
-- ---------------------------------------------------------------------------

create table if not exists ad_campaign_plans (
  id text primary key,
  name text not null,
  duration_days integer not null check (duration_days > 0),
  price integer not null check (price >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ad_campaigns (
  id text primary key,
  seller_id text not null references sellers(id) on delete cascade,
  plan_id text not null references ad_campaign_plans(id),
  headline text not null,
  body text not null,
  cta_label text not null default 'Shop now',
  image_url text not null,
  -- Where tapping the slide goes. Null = the seller's own public store
  -- page — the same destination a buyer already lands on from the seller
  -- directory, so a campaign never needs its own separate landing page.
  target_product_id text references products(id) on delete set null,
  amount integer not null check (amount >= 0),
  payment_id text references payments(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  taken_down_at timestamptz,
  taken_down_reason text,
  -- Mirrors boosts.boost_expiry_notified_at — lets the cron sweep
  -- (lib/adCampaigns.ts#notifyExpiredAdCampaigns) tell "already told this
  -- seller their campaign ended" apart from "just ended, notify once".
  ended_notified_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists ad_campaigns_payment_id_key on ad_campaigns(payment_id) where payment_id is not null;
create index if not exists ad_campaigns_seller_id_idx on ad_campaigns(seller_id);
create index if not exists ad_campaigns_ends_at_idx on ad_campaigns(ends_at);

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
alter table referrals enable row level security;
alter table referral_rewards enable row level security;
alter table referral_reward_config enable row level security;
alter table referral_credit_applications enable row level security;
alter table referral_settings enable row level security;
alter table categories enable row level security;
alter table boost_plans enable row level security;
alter table boosts enable row level security;
alter table ad_campaign_plans enable row level security;
alter table ad_campaigns enable row level security;
alter table support_tickets enable row level security;
alter table support_ticket_messages enable row level security;

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

insert into referral_settings (id, active_qualifying_action, created_by)
values ('rs_default', 'first_purchase', null)
on conflict (id) do nothing;

insert into referral_reward_config (id, milestone_size, reward_amount, created_by)
values ('rrc_default', 10, 1100, null)
on conflict (id) do nothing;

insert into boost_plans (id, name, duration_days, price, sort_order) values
  ('boost_3d', '3-day Boost', 3, 1000, 0),
  ('boost_7d', '7-day Boost', 7, 2000, 1),
  ('boost_14d', '14-day Boost', 14, 3500, 2)
on conflict (id) do nothing;

-- Starting prices, same spirit as boost_plans' own seed above — an admin
-- should review and adjust these before launch. Priced above boost (a
-- homepage carousel slide every buyer sees is a bigger placement than one
-- reordered product card in Near you/Browse).
insert into ad_campaign_plans (id, name, duration_days, price, sort_order) values
  ('adcamp_3d', '3-day Sponsored slide', 3, 5000, 0),
  ('adcamp_7d', '7-day Sponsored slide', 7, 9000, 1),
  ('adcamp_14d', '14-day Sponsored slide', 14, 15000, 2)
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
