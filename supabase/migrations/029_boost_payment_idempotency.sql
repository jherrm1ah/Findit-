-- ---------------------------------------------------------------------------
-- 029 — Idempotent boost activation
--
-- lib/boosts.ts#activateBoost isn't safe to call twice for the same
-- payment: it's additive (extends boosted_until further, inserts another
-- boosts row), not a no-op. That's fine the first time, but the paystack
-- webhook can legitimately redeliver the same charge.success event, and
-- until now activateBoost's own failures were just logged and dropped —
-- silently leaving a seller charged with no boost applied and no way to
-- recover. Fixing that means letting the webhook retry on failure, which
-- only works once activateBoost can tell "already applied for this exact
-- payment" apart from "new payment, apply it" — hence this column.
-- ---------------------------------------------------------------------------

alter table boosts add column if not exists payment_id text references payments(id);
create unique index if not exists boosts_payment_id_key on boosts(payment_id) where payment_id is not null;
