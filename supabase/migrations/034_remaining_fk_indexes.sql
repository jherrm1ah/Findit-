-- ---------------------------------------------------------------------------
-- 034 — Index the five foreign keys flagged by Supabase's own performance
-- advisor that migration 021's pass missed, because they didn't exist yet:
-- all five belong to tables added in 025-027 (reviews, product moderation,
-- product reports), which landed after 021's indexing pass and were never
-- covered by a follow-up. Same reasoning as 021: an unindexed foreign key is
-- a sequential scan on every lookup through it and on every delete of the
-- parent row, and cheap to fix now versus under real load later.
-- ---------------------------------------------------------------------------

create index if not exists product_reports_reporter_id_idx on product_reports(reporter_id);
create index if not exists product_reports_resolved_by_idx on product_reports(resolved_by);
create index if not exists products_moderated_by_idx on products(moderated_by);
create index if not exists transaction_record_events_actor_id_idx on transaction_record_events(actor_id);
create index if not exists transaction_records_product_id_idx on transaction_records(product_id);
