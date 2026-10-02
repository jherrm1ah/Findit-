-- ---------------------------------------------------------------------------
-- 040 — Ad campaigns: paid Sponsored slides in Home's promo carousel.
--
-- Mirrors boost_plans/boosts (migration 018) almost exactly, on purpose:
-- ad_campaign_plans holds pricing as DATA (an admin can change "₦3,000 for
-- 7 days" without a deploy, same as every other *_plans table in this app),
-- and ad_campaigns is one row per paid campaign, activated only from the
-- Paystack webhook once a charge is confirmed — never on a client's say-so.
--
-- Unlike boosts (which extends a single shared products.boosted_until and
-- so needs the CAS dance in lib/boosts.ts#applyBoostedUntil), each campaign
-- is its own independent row with its own ends_at — there's nothing shared
-- to race over, so activation is a plain idempotent insert, keyed by
-- payment_id exactly like boosts.payment_id (migration 029) so a
-- redelivered webhook event can retry safely instead of creating a second
-- campaign for the same charge.
--
-- No separate status column for "taken down" vs "expired" — same idiom as
-- boosts: "is this currently active" is just ends_at > now(). An admin
-- taking a campaign down (lib/adCampaigns.ts#takeDownCampaign) sets ends_at
-- to the moment of takedown, which is both simpler and reuses every reader
-- that already only looks at ends_at. taken_down_at/taken_down_reason exist
-- purely as an audit trail of WHY it stopped, not to decide whether it's
-- still live.
-- ---------------------------------------------------------------------------

create table if not exists ad_campaign_plans (
  id text primary key,
  name text not null,
  duration_days integer not null check (duration_days > 0),
  price integer not null check (price >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ad_campaigns (
  id text primary key,
  seller_id text not null references sellers(id) on delete cascade,
  plan_id text not null references ad_campaign_plans(id),
  headline text not null,
  body text not null,
  cta_label text not null default 'Shop now',
  image_url text not null,
  -- Where tapping the slide goes. Null = the seller's own public store
  -- page — the same destination a buyer already lands on from the seller
  -- directory, so a campaign never needs its own separate landing page.
  target_product_id text references products(id) on delete set null,
  amount integer not null check (amount >= 0),
  payment_id text references payments(id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  taken_down_at timestamptz,
  taken_down_reason text,
  -- Mirrors boosts' boost_expiry_notified_at (migration 030): lets the
  -- cron sweep (lib/adCampaigns.ts#notifyExpiredAdCampaigns) tell "already
  -- told this seller their campaign ended" apart from "just ended, notify
  -- once" — without it, a daily sweep would re-notify every run forever.
  ended_notified_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists ad_campaigns_payment_id_key on ad_campaigns(payment_id) where payment_id is not null;
create index if not exists ad_campaigns_seller_id_idx on ad_campaigns(seller_id);
-- What the Home carousel and the admin list both filter/sort on — "every
-- currently-active campaign" and "what's ending soonest."
create index if not exists ad_campaigns_ends_at_idx on ad_campaigns(ends_at);

alter table payments drop constraint if exists payments_kind_check;
alter table payments add constraint payments_kind_check
  check (kind in ('subscription', 'order', 'boost', 'fee', 'other', 'ad_campaign'));

alter table ad_campaign_plans enable row level security;
alter table ad_campaigns enable row level security;

-- Starting prices, same spirit as boost_plans' own seed (migration 018) —
-- an admin should review and adjust these before launch, not treat them as
-- a permanent decision made here. Priced above boost (a homepage carousel
-- slide every buyer sees is a bigger placement than one reordered product
-- card in Near you/Browse).
insert into ad_campaign_plans (id, name, duration_days, price, sort_order) values
  ('adcamp_3d', '3-day Sponsored slide', 3, 5000, 0),
  ('adcamp_7d', '7-day Sponsored slide', 7, 9000, 1),
  ('adcamp_14d', '14-day Sponsored slide', 14, 15000, 2)
on conflict (id) do nothing;
