-- Migration: security-hardening changes from the security audit.
-- Run this once against your EXISTING Supabase project (SQL Editor -> paste
-- -> Run) if you already applied supabase/schema.sql before this change —
-- a fresh project can just run schema.sql, which already includes these.
--
-- Safe to re-run: uses IF NOT EXISTS / a guarded constraint add. Adds an
-- audit table and a data-integrity constraint only — no existing data is
-- modified or deleted. If any existing order row somehow has a price <= 0,
-- the constraint add below will fail loudly rather than silently — fix or
-- remove that row first if so (this app's own code has never been able to
-- create such a row, so this is only a concern if something else wrote
-- directly to the table).

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
alter table admin_actions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_price_check'
  ) then
    alter table orders add constraint orders_price_check check (price > 0);
  end if;
end $$;
