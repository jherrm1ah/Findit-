-- ---------------------------------------------------------------------------
-- 043 — Delivery at checkout: where an order goes, and what delivery costs.
--
-- Before this, an order had no delivery address at all (a seller only found
-- out where to send an item by asking in chat), and a delivery fee existed
-- only as free text on an offer, never in what the buyer paid.
--
-- Money model (see lib/delivery.ts and lib/payments.ts#confirmOrderPayment):
--   orders.price stays THE amount the buyer pays (item_price + delivery_fee),
--   so every existing rule built on it (Paystack amount, refunds, and
--   orders_fee_split_reconciles: platform_fee_amount + seller_payout_amount
--   = price) keeps holding. The platform fee is charged on item_price only;
--   the whole delivery fee goes to the seller, who pays for the delivery.
--
-- Additive only, like every migration here: existing rows keep working
-- (item_price is backfilled from price; everything else has a safe default).
-- ---------------------------------------------------------------------------

-- What the seller charges to deliver a listing. 0 = free delivery. Only
-- meaningful when delivery_option is 'Delivery' or 'Both'.
alter table products add column if not exists delivery_fee integer not null default 0;
alter table products drop constraint if exists products_delivery_fee_nonneg;
alter table products add constraint products_delivery_fee_nonneg check (delivery_fee >= 0);

-- An offer's delivery terms as numbers, alongside the old free-text
-- "delivery" column (kept, and still filled in, for display). Older offers
-- have delivery_option null: treated as "Both" with no fee.
alter table offers add column if not exists delivery_fee integer not null default 0;
alter table offers add column if not exists delivery_option text;
alter table offers drop constraint if exists offers_delivery_fee_nonneg;
alter table offers add constraint offers_delivery_fee_nonneg check (delivery_fee >= 0);
alter table offers drop constraint if exists offers_delivery_option_valid;
alter table offers add constraint offers_delivery_option_valid
  check (delivery_option is null or delivery_option in ('Delivery', 'Pickup', 'Both'));

-- Orders: the item price on its own, the choices the buyer had, what they
-- chose, the fee that applied and where it goes.
alter table orders add column if not exists item_price integer;
update orders set item_price = price where item_price is null;
alter table orders add column if not exists delivery_options text;         -- 'Delivery' | 'Pickup' | 'Both' (copied from the listing/offer)
alter table orders add column if not exists delivery_fee_quote integer not null default 0;  -- the fee IF delivered
alter table orders add column if not exists delivery_method text;          -- 'delivery' | 'pickup', null until the buyer chooses
alter table orders add column if not exists delivery_fee integer not null default 0;        -- the fee actually included in price
alter table orders add column if not exists delivery_address jsonb;        -- { fullName, phone, address, area, state, landmark }
-- Set the moment the buyer starts paying (app/api/orders/[id]/pay): from then
-- on the delivery method, and so the price, can't change, so a checkout link
-- opened at one price can never confirm an order at another. A single
-- conditional update on this row on each side makes that race-free.
alter table orders add column if not exists delivery_locked boolean not null default false;
alter table orders drop constraint if exists orders_delivery_method_valid;
alter table orders add constraint orders_delivery_method_valid
  check (delivery_method is null or delivery_method in ('delivery', 'pickup'));
alter table orders drop constraint if exists orders_delivery_fee_nonneg;
alter table orders add constraint orders_delivery_fee_nonneg check (delivery_fee >= 0 and delivery_fee_quote >= 0);
alter table orders drop constraint if exists orders_price_includes_delivery;
alter table orders add constraint orders_price_includes_delivery
  check (item_price is null or price = item_price + delivery_fee);

-- The buyer's last delivery address, so the next checkout is filled in.
-- Private to that account: only ever read back to its owner.
alter table users add column if not exists saved_delivery_address jsonb;
