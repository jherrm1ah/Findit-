-- ---------------------------------------------------------------------------
-- 036 — Activate referral rewards: a milestone credit, spendable at checkout
--
-- Turns the inert reward shell from migration 035 into a real, spendable
-- credit, structured as a MILESTONE rather than a per-referral payout —
-- every referral_reward_config.milestone_size-th successful referral earns
-- the referrer referral_reward_config.reward_amount in FindIt credit, not
-- every single one. See lib/referrals.ts#qualifyReferral.
--
-- referral_reward_config mirrors platform_fee_config / referral_settings:
-- admin-editable, append-only, read as "the most recent row" — so the
-- amount or batch size can change later without a code deploy, and without
-- rewriting what an already-issued reward was earned under.
--
-- remaining_amount on referral_rewards exists because a single lump credit
-- (e.g. ₦1,100) rarely matches an order's price exactly — it supports
-- PARTIAL spend across one or more orders rather than an all-or-nothing
-- voucher. amount is the original grant, frozen forever; remaining_amount
-- is what's left to spend. A reward's status only flips to 'claimed' once
-- remaining_amount reaches 0.
--
-- referral_credit_applications is the ledger of exactly how much of which
-- reward went toward which checkout attempt (payment_id). It exists so an
-- abandoned/failed checkout can give the reserved credit back (see
-- lib/referrals.ts#releaseCredit) rather than losing it — credit is
-- reserved the moment a checkout starts (before any Paystack call), never
-- only at confirmation, so two concurrent checkouts can never both spend
-- the same naira.
--
-- orders.credit_applied is a display/audit snapshot only, set once at
-- payment confirmation — it does NOT change what the seller is owed.
-- Seller payout is still computed from orders.price in full (lib/
-- payments.ts#confirmOrderPayment is unchanged); a referral credit is
-- FindIt subsidizing the buyer's price, never a discount the seller pays
-- for out of their own payout.
-- ---------------------------------------------------------------------------

create table if not exists referral_reward_config (
  id text primary key,
  milestone_size integer not null check (milestone_size > 0),
  reward_amount integer not null check (reward_amount >= 0),
  created_by text references users(id),
  created_at timestamptz not null default now()
);
create index if not exists referral_reward_config_created_at_idx on referral_reward_config(created_at desc);

insert into referral_reward_config (id, milestone_size, reward_amount, created_by)
values ('rrc_default', 10, 1100, null)
on conflict (id) do nothing;

alter table referral_rewards add column if not exists remaining_amount integer;
alter table referral_rewards add constraint referral_rewards_remaining_amount_range
  check (remaining_amount is null or (remaining_amount >= 0 and remaining_amount <= amount));

alter table orders add column if not exists credit_applied integer not null default 0;
alter table orders add constraint orders_credit_applied_nonneg check (credit_applied >= 0);

create table if not exists referral_credit_applications (
  id text primary key,
  reward_id text not null references referral_rewards(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  payment_id text not null references payments(id) on delete cascade,
  order_id text not null references orders(id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  -- Null while reserved/spent; set once released back to the reward's
  -- remaining_amount (checkout abandoned or the charge failed).
  released_at timestamptz
);
create index if not exists referral_credit_applications_reward_idx on referral_credit_applications(reward_id);
create index if not exists referral_credit_applications_user_idx on referral_credit_applications(user_id);
create index if not exists referral_credit_applications_payment_idx on referral_credit_applications(payment_id);

alter table referral_reward_config enable row level security;
alter table referral_credit_applications enable row level security;
