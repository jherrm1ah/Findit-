-- ---------------------------------------------------------------------------
-- 033 — Real priority support
--
-- "Priority support" has been listed as a Business Store/Pro Store/FindIt
-- Pro plan benefit since migration 010 (subscription_plans.priority_support)
-- without anything ever reading that column — every ticket was handled
-- identically regardless of plan, and the seller-facing screens correctly
-- labeled it "Coming soon" rather than falsely claiming it worked.
--
-- A ticket's priority is decided ONCE, at creation (lib/support.ts
-- #createTicket), from whatever plan the filer held at that moment — never
-- re-derived later. A seller who files a ticket on Pro and downgrades
-- before an admin answers keeps the priority flag; re-checking live plan
-- status on every read would also mean checking every ticket's filer's
-- current subscription on every admin list load, an N+1 this avoids
-- entirely by computing it once and storing it.
-- ---------------------------------------------------------------------------

alter table support_tickets add column if not exists priority boolean not null default false;
create index if not exists support_tickets_priority_idx on support_tickets(priority);
