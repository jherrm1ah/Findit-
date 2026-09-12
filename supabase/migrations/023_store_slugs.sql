-- ---------------------------------------------------------------------------
-- 023 — A dedicated, shareable public URL for every paid Store.
--
-- NO NEW STORE ENTITY. In this codebase a store already IS a seller plus
-- their subscription plus their products — see the comment on
-- GET /api/sellers, and the fact that branding, product limits and the Pro
-- badge all hang off sellers + subscriptions today. Introducing a `stores`
-- table would mean two places to ask "who owns this listing", and the
-- seller-identity work in migration 009 exists precisely because that kind
-- of ambiguity is expensive. So the slug lives on `sellers`.
--
-- Eligibility is deliberately NOT stored here. Whether a seller may have a
-- public storefront is a function of their live subscription, which lapses
-- on its own schedule (see isSubscriptionLapsed — this app resolves
-- subscription state at read time rather than running a cron). Copying
-- eligibility into a column would mean a second source of truth that goes
-- stale the moment a trial ends. The slug is permanent; the visibility of
-- the page it points at is computed on every request.
-- ---------------------------------------------------------------------------

alter table sellers add column if not exists store_slug text;
alter table sellers add column if not exists store_slug_claimed_at timestamptz;

-- Partial, because only sellers who have actually claimed a store carry one,
-- and a plain unique index would treat every null as distinct anyway. This
-- index is what makes slug allocation safe: the app tries candidate slugs and
-- lets a unique violation decide, rather than checking-then-inserting, which
-- two concurrent requests could both pass.
create unique index if not exists sellers_store_slug_unique_idx
  on sellers(store_slug)
  where store_slug is not null;

-- ---------------------------------------------------------------------------
-- Old slugs keep working forever.
--
-- A shared link is the whole point of this feature, so a seller renaming
-- their store must not silently break every link already sent to a customer.
-- The live slug never changes on its own when the business name changes; if a
-- seller deliberately changes it, the previous one is recorded here and keeps
-- resolving to the same store.
--
-- A slug that has ever been used is never handed to a different seller, which
-- is why lookups check this table too: otherwise an abandoned slug could be
-- claimed by someone else and an old shared link would quietly point a buyer
-- at a stranger's shop.
-- ---------------------------------------------------------------------------

create table if not exists store_slug_aliases (
  slug text primary key,
  seller_id text not null references sellers(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists store_slug_aliases_seller_id_idx on store_slug_aliases(seller_id);

alter table store_slug_aliases enable row level security;
