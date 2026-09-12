-- ---------------------------------------------------------------------------
-- 012 — Seller trust & verification
--
-- Adds a real seller-verification system on top of the existing pending/
-- approved/rejected admin gate (sellers.status), which stays exactly as it
-- is and keeps controlling whether a seller can transact at all. This
-- migration adds a SEPARATE, richer layer: who is this seller, what do they
-- sell, where do they operate, and what evidence backs that up — surfaced
-- to buyers as a New / Verified / Trusted badge (see
-- lib/sellerVerification.ts), never a hard gate on selling.
--
-- Design notes:
--   - Public-safe profile fields (seller_type, category, description,
--     years_selling, social_links, has_physical_store, and a coarse
--     public_state/city/area) live directly on `sellers`, since that table
--     is already the seller/store record.
--   - Anything private — a precise shop address, exact coordinates, a
--     website used only for verification — lives in a SEPARATE table,
--     seller_verification_details, specifically so an existing (or future)
--     `select('*')` on `sellers` (this codebase has several) can never
--     accidentally leak it. Same reasoning for evidence: its own table,
--     storing only a path into a PRIVATE storage bucket, never a public URL.
--   - RLS is enabled on both new tables with NO policies, matching every
--     other table in this schema — see the note at the top of this file
--     for why (no Supabase Auth session, so no auth.uid() to key a policy
--     on) and the note at the top of schema.sql for the fuller story. Real
--     access control (a seller sees only their own submission; evidence is
--     served only via signed URLs to the owning seller or an admin) is
--     enforced in the Next.js API layer, exactly like everything else here.
-- ---------------------------------------------------------------------------

alter table users add column if not exists email text;
-- Partial unique index rather than a plain unique constraint: most accounts
-- have no email at all (this app is phone-first), and a plain unique
-- constraint on a nullable column already allows multiple NULLs in
-- Postgres — this index just makes that explicit and is here in case a
-- future migration tool checks for it.
create unique index if not exists users_email_unique_idx on users(email) where email is not null;

alter table sellers add column if not exists seller_type text
  check (seller_type in ('physical_store', 'online_business', 'home_based', 'both', 'individual', 'other'));
alter table sellers add column if not exists category text;
alter table sellers add column if not exists description text;
alter table sellers add column if not exists years_selling text;
alter table sellers add column if not exists social_links jsonb;
alter table sellers add column if not exists has_physical_store boolean;
-- Coarse, public-safe location — an area/neighborhood, not a street
-- address. Shown on the public storefront; the real address (when there is
-- one) lives in seller_verification_details below and is never exposed to
-- buyers.
alter table sellers add column if not exists public_state text;
alter table sellers add column if not exists public_city text;
alter table sellers add column if not exists public_area text;

alter table sellers add column if not exists verification_status text not null default 'incomplete'
  check (verification_status in ('incomplete', 'pending', 'approved', 'rejected', 'needs_info'));
alter table sellers add column if not exists verification_submitted_at timestamptz;
alter table sellers add column if not exists verification_reviewed_at timestamptz;
alter table sellers add column if not exists verification_reviewed_by text references users(id);
alter table sellers add column if not exists verification_rejection_reason text;

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
  -- A path inside the private "seller-verification" storage bucket
  -- (for photo evidence) OR a plain text value (for a social handle/link) —
  -- exactly one of the two, never a public URL.
  storage_path text,
  text_value text,
  note text,
  created_at timestamptz not null default now(),
  check ((storage_path is not null) <> (text_value is not null))
);
create index if not exists seller_verification_evidence_seller_id_idx on seller_verification_evidence(seller_id);

alter table seller_verification_details enable row level security;
alter table seller_verification_evidence enable row level security;
