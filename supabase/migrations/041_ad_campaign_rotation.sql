-- ---------------------------------------------------------------------------
-- 041 — Ad campaign rotation + real impression/click tracking.
--
-- Before this, GET /api/ad-campaigns/active returned EVERY currently-active
-- campaign, and Home's carousel appended all of them as slides — ten paid
-- campaigns meant a 12-slide carousel every buyer had to swipe through, and
-- every advertiser got shown to every buyer regardless of how many others
-- were also running. Scarce homepage inventory (one slide) was being
-- treated like Boost's effectively-unlimited inventory (every product can
-- be ranked into Near You/Browse without displacing anyone).
--
-- The fix (see lib/adCampaigns.ts#pickAdCampaignForImpression): each
-- request now picks ONE active campaign at random and counts that as an
-- impression for it, so exposure is spread across whatever's currently
-- running instead of stacking all of it onto one buyer's screen. Real
-- impressions/clicks (not projected) are what lets the Advertise card
-- show honest performance — "entered the rotation," not "guaranteed the
-- slot" — the same honesty rule every other plan/pricing screen in this
-- app already follows.
--
-- impressions/clicks are plain counters, incremented read-then-write, not
-- a CAS retry loop — unlike every money field in this codebase, a lost
-- increment under a rare concurrent race just slightly undercounts a
-- display metric nothing is billed on, not a correctness problem worth
-- the extra complexity.
-- ---------------------------------------------------------------------------

alter table ad_campaigns add column if not exists impressions integer not null default 0;
alter table ad_campaigns add column if not exists clicks integer not null default 0;
