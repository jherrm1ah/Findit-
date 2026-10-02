-- The escrow auto-release timer (lib/repo.ts#autoReleaseStaleDeliveries,
-- run daily from app/api/cron/expirations) needs a real anchor point for
-- "how long has this order been sitting dispatched with no buyer action" —
-- there was previously no timestamp recording when an order first reached
-- the Dispatched stage. Set once, the first time an order reaches
-- Dispatched (or skips straight to a later status — see
-- updateOrderStatus), never overwritten after that.
alter table orders add column if not exists dispatched_at timestamptz;
