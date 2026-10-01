-- ---------------------------------------------------------------------------
-- 031 — Storefront layout templates
--
-- Store subscription plans have always had a `customizationLevel` ("none" |
-- "basic" | "advanced" | "full"), but until now the only thing it ever
-- gated was uploading a logo/banner image (migration 011) — Basic,
-- Business, and Pro Store all unlocked the exact same thing. This gives
-- customizationLevel a second, real benefit: a seller on a paid plan can
-- pick a different LAYOUT for their public storefront (/store/<slug>), not
-- just drop in a logo. Which templates a plan actually unlocks is decided
-- in code (lib/subscriptions.ts#STORE_TEMPLATES), not here — this column
-- just remembers the seller's choice.
--
-- Defaults every seller (including every existing one) to 'classic', which
-- is deliberately defined as exactly the storefront layout that already
-- existed before this migration — so nothing visually changes for anyone
-- who never opens the new picker.
-- ---------------------------------------------------------------------------

alter table sellers add column if not exists store_template text not null default 'classic';
