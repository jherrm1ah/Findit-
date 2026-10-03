-- ---------------------------------------------------------------------------
-- 042 — Same reasoning as 021/034: index every foreign key Supabase's own
-- performance advisor flags as uncovered. These five belong to tables added
-- after 034's pass (ad_campaigns in 040, referral_reward_config/
-- referral_settings in the referrals work) and were never covered by a
-- follow-up. An unindexed foreign key is a sequential scan on every lookup
-- through it and on every delete of the parent row.
-- ---------------------------------------------------------------------------

create index if not exists ad_campaigns_plan_id_idx on ad_campaigns(plan_id);
create index if not exists ad_campaigns_target_product_id_idx on ad_campaigns(target_product_id);
create index if not exists referral_credit_applications_order_id_idx on referral_credit_applications(order_id);
create index if not exists referral_reward_config_created_by_idx on referral_reward_config(created_by);
create index if not exists referral_settings_created_by_idx on referral_settings(created_by);
