-- ---------------------------------------------------------------------------
-- 035 — Referral system
--
-- Every user gets a unique referral_code (issued lazily by
-- lib/referrals.ts#ensureReferralCode, not backfilled here, so this
-- migration stays a pure schema change with no data rewrite). Sharing it
-- (via /ref/[code]) and someone signing up under it creates a `referrals`
-- row — but that row starts 'pending', never 'qualified', because signing
-- up is not itself a reward-worthy outcome (see referral_settings below).
--
-- referred_user_id is UNIQUE so an account can be attributed to exactly one
-- referrer, ever — the DB enforces this, not just application code, so a
-- bug or a race can't double-attribute someone. The CHECK blocks a user
-- from referring themselves at the data layer too.
--
-- referral_settings mirrors the platform_fee_config pattern (migration
-- 016): admin-editable, append-only, read as "the most recent row". It
-- holds the ONE qualifying action currently live, so which real-world
-- action (first purchase, seller verification, first published product,
-- or bare registration) counts as a "successful" referral can change
-- without a code deploy. Seeded to 'first_purchase' — a real transaction,
-- not a click or a signup — so launch day doesn't accidentally reward
-- every signup.
--
-- referral_rewards exists so the reward architecture is real and queryable
-- from day one, but nothing in this migration or lib/referrals.ts assigns
-- a reward_type or amount — that activation is a deliberate later step
-- (see the task spec: "do not activate a specific reward amount yet").
-- ---------------------------------------------------------------------------

alter table users add column if not exists referral_code text unique;
create index if not exists users_referral_code_idx on users(referral_code);

create table if not exists referrals (
  id text primary key,
  referrer_user_id text not null references users(id) on delete cascade,
  -- Unique, not just indexed — one attribution per account, enforced by
  -- Postgres, not just by lib/referrals.ts checking before it inserts.
  referred_user_id text not null unique references users(id) on delete cascade,
  -- Snapshot of the code actually used, kept even if the referrer's code
  -- is ever regenerated — the history should show what really happened.
  referral_code text not null,
  status text not null default 'pending' check (status in ('pending', 'qualified', 'rewarded')),
  qualifying_action text check (qualifying_action in ('registration', 'first_purchase', 'seller_verification', 'first_product')),
  qualified_at timestamptz,
  reward_status text not null default 'none' check (reward_status in ('none', 'pending', 'issued', 'claimed')),
  reward_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint referrals_no_self_referral check (referrer_user_id <> referred_user_id)
);

create index if not exists referrals_referrer_idx on referrals(referrer_user_id);
create index if not exists referrals_code_idx on referrals(referral_code);
create index if not exists referrals_status_idx on referrals(status);

create table if not exists referral_rewards (
  id text primary key,
  referral_id text not null references referrals(id) on delete cascade,
  -- The referrer — who the reward belongs to. Denormalized off referrals
  -- for the common "list a user's own rewards" query, same tradeoff
  -- product_images makes duplicating product_id.
  user_id text not null references users(id) on delete cascade,
  -- Nullable on purpose: the reward EXISTS (so an admin can see "this
  -- referral earned a reward slot") before any campaign has decided what
  -- it actually is.
  reward_type text check (reward_type in ('credit', 'discount', 'voucher', 'subscription_benefit', 'physical_gift')),
  status text not null default 'pending' check (status in ('pending', 'issued', 'claimed', 'void')),
  amount numeric,
  meta jsonb,
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  claimed_at timestamptz
);

create index if not exists referral_rewards_user_idx on referral_rewards(user_id);
create index if not exists referral_rewards_referral_idx on referral_rewards(referral_id);

create table if not exists referral_settings (
  id text primary key,
  active_qualifying_action text not null check (active_qualifying_action in ('registration', 'first_purchase', 'seller_verification', 'first_product')),
  created_by text references users(id),
  created_at timestamptz not null default now()
);

create index if not exists referral_settings_created_at_idx on referral_settings(created_at desc);

insert into referral_settings (id, active_qualifying_action, created_by)
values ('rs_default', 'first_purchase', null)
on conflict (id) do nothing;

-- Defense-in-depth only, same as every other table — see the AUTHORIZATION
-- MODEL comment at the top of schema.sql. Real access control is in the
-- API route code (service role bypasses RLS entirely), not here.
alter table referrals enable row level security;
alter table referral_rewards enable row level security;
alter table referral_settings enable row level security;
