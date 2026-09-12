-- ---------------------------------------------------------------------------
-- 009 — seller_id: a reliable identity for products/orders/offers
--
-- Today products.seller, orders.seller, and offers.seller each store the
-- seller's business NAME as plain text — matched against sellers/users by
-- string equality everywhere in the app. business_name has no uniqueness
-- constraint, so two sellers can share a name; a rename requires rewriting
-- that string across three tables (see updateSellerBusinessName in
-- lib/auth.ts). This is the foundation FindIt Storefronts needs to NOT be
-- built on, and the first, safest step toward fixing it.
--
-- This migration is PURELY ADDITIVE. It does not touch the existing `seller`
-- text columns in any way — nothing is renamed, dropped, or made required.
-- Every existing feature keeps reading/writing exactly as it does today.
-- Safe to re-run: every statement is IF NOT EXISTS.
--
-- What comes after this file (not part of it):
--   - a one-time backfill that fills seller_id ONLY where a row's `seller`
--     text matches exactly one seller account — never a guess (see
--     app/api/admin/seller-identity/route.ts and lib/sellerIdentityMatch.ts)
--   - new writes start recording seller_id alongside the text column
--   - a verification report confirming seller_id can be trusted before
--     anything user-facing is ever switched to read it
-- ---------------------------------------------------------------------------

alter table products add column if not exists seller_id text references sellers(id);
alter table orders add column if not exists seller_id text references sellers(id);
alter table offers add column if not exists seller_id text references sellers(id);

create index if not exists products_seller_id_idx on products(seller_id);
create index if not exists orders_seller_id_idx on orders(seller_id);
create index if not exists offers_seller_id_idx on offers(seller_id);
