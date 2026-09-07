-- ---------------------------------------------------------------------------
-- 008 — buyer delivery confirmation + escrow state
--
-- The app promises buyers, in onboarding, on the product page and at checkout,
-- that their payment is held by FindIt and only released once THEY confirm the
-- order arrived. Until now nothing implemented that: the seller alone drove the
-- order all the way to "Delivered", so a seller could mark an item delivered
-- that never arrived and the buyer had no way to say otherwise.
--
-- These columns make that promise real. "Delivered" now means the buyer said so.
-- ---------------------------------------------------------------------------

alter table orders add column if not exists buyer_confirmed_at timestamptz;

-- Where the money stands. There is no payment provider wired up yet, so this
-- is the record of what SHOULD happen to the funds — the hook a provider
-- integration reads later, and what the buyer and admin see today.
--   held      — money with FindIt, order still in flight (the default)
--   released  — buyer confirmed receipt, seller can be paid
--   disputed  — buyer reported a problem, an admin has to decide
--   refunded  — admin resolved a dispute in the buyer's favour
alter table orders add column if not exists escrow_status text not null default 'held'
  check (escrow_status in ('held', 'released', 'disputed', 'refunded'));

alter table orders add column if not exists issue_reported_at timestamptz;
alter table orders add column if not exists issue_note text;

-- Orders that already reached "Delivered" under the old seller-driven flow are
-- treated as settled, so this migration doesn't reopen historic orders or
-- suddenly ask buyers to confirm deliveries from weeks ago.
update orders
   set escrow_status = 'released',
       buyer_confirmed_at = coalesce(buyer_confirmed_at, created_at)
 where status = 'Delivered'
   and escrow_status = 'held';

-- The admin "reported problems" queue reads exactly this.
create index if not exists orders_escrow_status_idx on orders(escrow_status)
  where escrow_status = 'disputed';
