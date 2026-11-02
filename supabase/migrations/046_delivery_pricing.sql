-- ---------------------------------------------------------------------------
-- 046: delivery pricing, like a shop's shipping settings.
--
-- products.delivery_pricing:
--   'free'     delivery is included in the price (no fee at checkout)
--   'fixed'    delivery_fee, the same everywhere
--   'location' delivery_rates per state ({"Lagos": 2500, ...}); delivery_fee
--              for every state not listed
--   null       an older listing whose seller hasn't chosen yet: no fee is
--              charged, and buyers see "ask the seller", never "free"
--
-- orders.delivery_rates: the per-state fees copied onto the order (the
--   default is delivery_fee_quote). orders.delivery_fee_unset: the order came
--   from a listing with no pricing chosen, so checkout says so honestly.
--
-- Replaces the two-zone columns from 045 (products.delivery_state,
-- delivery_fee_other, orders.delivery_from_state, delivery_fee_quote_other),
-- which no released code ever wrote to.
-- ---------------------------------------------------------------------------

alter table products add column if not exists delivery_pricing text;
alter table products drop constraint if exists products_delivery_pricing_valid;
alter table products add constraint products_delivery_pricing_valid
  check (delivery_pricing is null or delivery_pricing in ('free', 'fixed', 'location'));
alter table products add column if not exists delivery_rates jsonb;

-- Listings that already have a delivery fee were priced on purpose.
update products set delivery_pricing = 'fixed'
  where delivery_pricing is null and delivery_option <> 'Pickup' and delivery_fee > 0;

alter table orders add column if not exists delivery_rates jsonb;
alter table orders add column if not exists delivery_fee_unset boolean not null default false;

alter table products drop constraint if exists products_delivery_fee_other_nonneg;
alter table products drop column if exists delivery_state;
alter table products drop column if exists delivery_fee_other;
alter table orders drop constraint if exists orders_delivery_fee_quote_other_nonneg;
alter table orders drop column if exists delivery_from_state;
alter table orders drop column if exists delivery_fee_quote_other;
