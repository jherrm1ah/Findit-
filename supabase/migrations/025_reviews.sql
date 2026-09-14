-- ---------------------------------------------------------------------------
-- 025 — Reviews as a real, listable, repliable thing.
--
-- orders already carries `reviewed`, `my_rating` and `review_comment`, and
-- every rating computation in the app (lib/repo.ts#getSellerStatsMap,
-- lib/sellerPublicProfile.ts, lib/sellerDirectory.ts) keeps reading those —
-- this migration does not touch them. What was missing was anywhere for a
-- review's actual TEXT to be found again: it sat on the order forever,
-- invisible to any other buyer, with no way for the seller to answer it.
--
-- This table is that visible, answerable form. One row per order (the same
-- one-review-per-order rule orders.reviewed already implied, now enforced),
-- carrying a snapshot of the seller identity the same way transaction_records
-- does — a seller_id when the order had one, the business name always, so a
-- name-only legacy order can still produce a real review row.
-- ---------------------------------------------------------------------------

create table if not exists reviews (
  id text primary key,

  -- ONE review per order — the buyer already had exactly one my_rating/
  -- review_comment slot to fill on the order row; this constraint is what
  -- makes lib/reviews.ts#recordReview idempotent under a retried or
  -- double-submitted request.
  order_id text not null unique references orders(id) on delete restrict,
  buyer_user_id text not null references users(id) on delete restrict,

  -- Same dual-key pattern as transaction_records: the reliable id when the
  -- order had one, the business name always (so a pre-seller_id-backfill
  -- order can still produce a real review).
  seller_id text references sellers(id),
  seller_name text not null,

  rating integer not null check (rating between 1 and 5),
  comment text,

  -- The seller's one reply. A single pair of columns, not an events table
  -- like transaction_record_events — a reply is a courtesy response the
  -- seller may revise, not a fact whose history needs to be tamper-evident.
  seller_reply text,
  seller_replied_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists reviews_seller_id_idx on reviews(seller_id);
create index if not exists reviews_seller_name_idx on reviews(seller_name);
create index if not exists reviews_buyer_user_id_idx on reviews(buyer_user_id);
create index if not exists reviews_created_at_idx on reviews(created_at desc);

alter table reviews enable row level security;

-- Backfill: every review ever left through the old orders-only path becomes
-- a real row here too, so a seller's review LIST isn't suddenly empty the
-- day this ships just because their reviews predate it.
insert into reviews (id, order_id, buyer_user_id, seller_id, seller_name, rating, comment, created_at)
select
  'rvw_backfill_' || o.id,
  o.id,
  o.user_id,
  o.seller_id,
  o.seller,
  o.my_rating,
  o.review_comment,
  o.created_at
from orders o
where o.reviewed = true and o.my_rating is not null
on conflict (order_id) do nothing;
