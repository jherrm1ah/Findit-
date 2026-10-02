-- lib/referrals.ts#maybeIssueMilestoneReward determined whether a reward
-- was due purely from a fresh COUNT of qualified referrals, deduplicated
-- only per REFERRAL (reward_status 'none' -> 'issued' on that one row) —
-- not per MILESTONE. Two different referrals for the same referrer
-- qualifying at nearly the same instant could both independently compute
-- "I'm the Nth" and both successfully claim their own referral row, issuing
-- two reward rows for what should have been a single milestone crossing.
-- milestone_number plus the unique constraint below makes the SECOND
-- insert for the same (user, milestone) fail with a real DB-level
-- conflict (23505), which the code now catches and backs out of cleanly.
alter table referral_rewards add column if not exists milestone_number integer;

-- Backfill: number each user's existing rewards in issued order. There is
-- no real reward data in production as of this migration (only a leftover
-- test row with no amount/issued_at) — this is a correctness formality,
-- not a real data migration.
update referral_rewards r
set milestone_number = sub.rn
from (
  select id, row_number() over (partition by user_id order by issued_at asc nulls first) as rn
  from referral_rewards
  where milestone_number is null
) sub
where r.id = sub.id;

alter table referral_rewards alter column milestone_number set not null;
alter table referral_rewards add constraint referral_rewards_user_milestone_unique unique (user_id, milestone_number);
