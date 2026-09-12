-- ---------------------------------------------------------------------------
-- 011 — real backing for two plan features that were previously just config
-- with nothing reading them: store branding (customization_level) and the
-- Pro Store badge. See lib/subscriptions.ts / lib/repo.ts for how these are
-- now actually enforced and displayed, not just listed on the pricing page.
--
-- Purely additive — nullable columns, no existing data touched.
-- ---------------------------------------------------------------------------

alter table sellers add column if not exists logo_url text;
alter table sellers add column if not exists banner_url text;
