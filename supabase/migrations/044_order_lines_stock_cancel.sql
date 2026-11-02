-- ---------------------------------------------------------------------------
-- 044: what's in an order, stock that goes down, and cancelling unpaid orders.
--
-- lines: the products in an order, [{ productId, name, qty, unitPrice }].
--   A cart now becomes ONE order per seller (one checkout, one delivery fee)
--   instead of one order per item, and confirming payment takes each line's
--   qty off that product's stock (lib/repo.ts#decrementStockForOrder).
--   Empty for orders from an accepted request offer (no listing behind them)
--   and for orders placed before this migration.
--
-- cancelled_at / cancel_reason: an unpaid order can now be cancelled by the
--   buyer ('buyer'), or is closed automatically after 7 days unpaid
--   ('expired'). status becomes 'Cancelled'. A payment that still completes
--   later (an old checkout link) reopens it: the buyer paid, so it goes ahead.
--
-- Additive only.
-- ---------------------------------------------------------------------------

alter table orders add column if not exists lines jsonb not null default '[]'::jsonb;
alter table orders add column if not exists cancelled_at timestamptz;
alter table orders add column if not exists cancel_reason text;
alter table orders drop constraint if exists orders_cancel_reason_valid;
alter table orders add constraint orders_cancel_reason_valid
  check (cancel_reason is null or cancel_reason in ('buyer', 'expired'));

-- The daily sweep for unpaid orders to close.
create index if not exists orders_unpaid_created_idx on orders(created_at)
  where payment_status <> 'paid' and status = 'Awaiting payment';
