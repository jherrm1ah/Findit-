-- ---------------------------------------------------------------------------
-- 027 — Product moderation: admin-configurable rules, buyer reports, and a
-- moderation state on products separate from the seller's own `active` flag.
--
-- Three pieces, same shape as the precedent each one is modeled on:
--
-- moderation_rules — an admin-editable list of prohibited-item keywords,
-- exactly the "admin manages a list of configurable rows" pattern already
-- used for `categories` (migration 017): text primary key, active flag,
-- created_at/updated_at, RLS enabled with no policies (service-role client
-- only, via lib/db.ts). A rule's severity decides what happens when a
-- listing's name/description matches its keyword: 'block' refuses the
-- create/update outright (see lib/repo.ts#validateProductInput's caller),
-- 'flag' lets it through but leaves it for a human to look at.
--
-- product_reports — a buyer "report this listing" queue, the same
-- report/resolve shape as the existing disputed-orders flow
-- (lib/repo.ts#listDisputedOrders/resolveOrderIssue,
-- app/api/admin/disputes/route.ts), not a disconnected new pattern.
--
-- products.moderation_* — deliberately separate columns from the existing
-- `active` boolean (schema.sql), which already means something else
-- entirely: a Store-subscription downgrade hiding excess listings. Collapsing
-- the two into one flag would make "why is this listing hidden?" ambiguous
-- to both the seller and support. Nullable/no-default reason & actor columns
-- for the same reason migration 026's new fields are nullable — most
-- existing rows have never been moderated and shouldn't claim otherwise.
-- ---------------------------------------------------------------------------

create table if not exists moderation_rules (
  id text primary key,
  -- Matched case-insensitively against the listing's name and description
  -- (see lib/moderationRules.ts) — not a regex, so an admin without
  -- engineering help can safely add one.
  keyword text not null,
  reason text not null,
  severity text not null default 'flag' check (severity in ('flag', 'block')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists moderation_rules_active_idx on moderation_rules(active);
alter table moderation_rules enable row level security;

create table if not exists product_reports (
  id text primary key,
  product_id text not null references products(id) on delete cascade,
  reporter_id text not null references users(id) on delete cascade,
  reason text not null check (reason in ('prohibited_item', 'counterfeit', 'scam', 'spam', 'inappropriate', 'other')),
  -- Optional context from the reporter; capped the same way
  -- validateProductInput caps description (lib/repo.ts) — a report is free
  -- text a stranger writes about someone else's listing, not a field with
  -- an inherent shape.
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by text references users(id),
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_reports_product_id_idx on product_reports(product_id);
create index if not exists product_reports_status_idx on product_reports(status);
alter table product_reports enable row level security;

alter table products add column if not exists moderation_status text not null default 'active'
  check (moderation_status in ('active', 'under_review', 'removed'));
alter table products add column if not exists moderation_reason text;
alter table products add column if not exists moderated_by text references users(id);
alter table products add column if not exists moderated_at timestamptz;
create index if not exists products_moderation_status_idx on products(moderation_status);
