-- ---------------------------------------------------------------------------
-- 026 — A real product listing, not just a name/category/price/one photo.
--
-- Every new column here is nullable with no default, on purpose, for the
-- same reason lib/repo.ts#reportOrderIssue refuses to guess a seller's
-- identity from a name collision: a listing that predates this migration
-- has no honest answer for "what condition is this?" or "does this include
-- delivery?", and silently defaulting every existing row to 'New' or
-- 'Delivery' would assert something nobody actually said. The seller form
-- requires these going forward (see lib/repo.ts#validateProductInput); an
-- old, unedited listing just shows "Not specified" until its seller updates
-- it. qty is the one exception — defaulting an existing single listing to
-- "1 available" is a safe, harmless assumption, not a trust claim.
-- ---------------------------------------------------------------------------

alter table products add column if not exists description text;
alter table products add column if not exists condition text check (condition in ('New', 'Used'));
alter table products add column if not exists qty integer not null default 1 check (qty >= 0);
-- Free-text pickup/delivery-area note, same spirit as requests.location —
-- never geocoded, distinct from lat/lng above (which is the SELLER
-- ACCOUNT's location, captured for "near you" sorting, not a statement
-- about this specific item).
alter table products add column if not exists location text;
alter table products add column if not exists delivery_option text check (delivery_option in ('Delivery', 'Pickup', 'Both'));
alter table products add column if not exists color text;
alter table products add column if not exists variation text;

-- ---------------------------------------------------------------------------
-- Up to MAX_PRODUCT_IMAGES (lib/repo.ts) photos per listing, not just one.
-- products.image_url is kept as the cover photo (sort_order 0's url,
-- denormalized onto the product row by createProduct/updateProduct) so
-- every existing reader — ArtBlock and everything built on it, which is
-- every product grid in the app — needs no changes at all and keeps
-- rendering the cover exactly as before. This table is what ProductDetail's
-- new photo gallery actually reads.
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
