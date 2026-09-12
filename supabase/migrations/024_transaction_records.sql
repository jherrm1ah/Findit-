-- ---------------------------------------------------------------------------
-- 024 — Verified Transaction Records.
--
-- A record is created exactly once, when an order reaches the only state this
-- app treats as genuinely complete: escrow_status 'released'. That happens on
-- buyer confirmation of delivery (lib/repo.ts#confirmDelivery) or when an
-- admin resolves a dispute in the seller's favour (#resolveOrderIssue), and
-- since migration 021 neither is reachable without a confirmed payment. An
-- abandoned, cancelled, unpaid or refunded order therefore cannot produce
-- one — not by policy, but because it never reaches the state that creates it.
--
-- WHY A NEW TABLE. orders already changes over its life: status advances,
-- escrow moves, an issue is opened and settled. A verification record must
-- say what was true at completion and keep saying it, so it snapshots the
-- handful of fields a verifier needs rather than joining live rows that will
-- have moved on. Everything else stays where it lives — this duplicates no
-- payment, seller or product system, and holds no money state of its own.
-- ---------------------------------------------------------------------------

create table if not exists transaction_records (
  -- Internal key, never shown to anyone.
  id text primary key,

  -- The public identifier. Random, not sequential and not derived from any
  -- internal id, phone number or order reference, so it reveals nothing about
  -- volume and cannot be walked. Format: FI-XXXXXXXX over a 32-character
  -- ambiguity-free alphabet, about 1.1e12 possibilities.
  code text not null unique,

  -- ONE record per order, enforced here rather than in application code.
  -- This is what makes creation idempotent: a retried completion, a
  -- redelivered webhook or two concurrent confirmations all collide on this
  -- constraint, and the second one returns the first one's record.
  order_id text not null unique references orders(id) on delete restrict,

  -- Who it belongs to, for the private views. Never published.
  buyer_user_id text not null references users(id) on delete restrict,
  seller_id text references sellers(id),

  -- ---- Snapshots, true as of completion and never recomputed ----
  -- A seller can rename their business and a listing can be edited or
  -- deleted; neither may rewrite what a completed transaction said.
  seller_name text not null,
  item_name text not null,
  product_id text references products(id) on delete set null,
  amount integer not null check (amount >= 0),
  currency text not null default 'NGN',
  -- The trust level the seller actually held at the time, so a verifier is
  -- never shown a badge earned later, nor denied one lost since.
  seller_verification_level text not null default 'new'
    check (seller_verification_level in ('new', 'verified', 'trusted')),
  paid_at timestamptz,
  completed_at timestamptz not null,

  -- Current state. Changed ONLY alongside an event row below, never silently:
  -- a refund does not erase the completion, it adds to it.
  status text not null default 'completed'
    check (status in ('completed', 'disputed', 'refunded')),

  -- Foundation for item-level identity (deliberately unused for now). A
  -- generic listing such as "Black T-shirt" must not become a permanently
  -- trackable physical object, so every record today is 'listing' scope. A
  -- future phase can mark specific high-value goods 'item' and attach an
  -- identifier, which is why the column exists now and the identifier does
  -- not: collecting serial numbers before there is a designed, secured use
  -- for them would be gathering sensitive data for nothing.
  record_scope text not null default 'listing'
    check (record_scope in ('listing', 'item')),

  created_at timestamptz not null default now()
);

create index if not exists transaction_records_buyer_idx on transaction_records(buyer_user_id);
create index if not exists transaction_records_seller_idx on transaction_records(seller_id);
create index if not exists transaction_records_seller_name_idx on transaction_records(seller_name);
create index if not exists transaction_records_completed_at_idx on transaction_records(completed_at desc);

alter table transaction_records enable row level security;

-- ---------------------------------------------------------------------------
-- The history itself: append-only.
--
-- Nothing that happens after completion edits the record's snapshot columns.
-- A dispute, a refund or an admin correction each add a row here and move
-- `status`, so the verification page can say "completed, and subsequently
-- refunded" rather than quietly presenting a refunded transaction as a clean
-- one. Previous and new values are kept so a correction is explainable.
--
-- This table is also the extension point for everything the record is meant
-- to grow into — ownership transfer, warranty, repair, resale and provenance
-- are all events against a transaction, not new tables.
-- ---------------------------------------------------------------------------

create table if not exists transaction_record_events (
  id text primary key,
  transaction_record_id text not null references transaction_records(id) on delete cascade,
  event_type text not null
    check (event_type in ('completed', 'dispute_opened', 'dispute_resolved', 'refunded', 'admin_correction')),
  -- 'system' covers anything the application did on its own (the completion
  -- itself, a webhook-driven refund); the others name a real person.
  actor_type text not null check (actor_type in ('system', 'buyer', 'seller', 'admin')),
  actor_id text references users(id) on delete set null,
  reason text,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists transaction_record_events_record_idx
  on transaction_record_events(transaction_record_id, created_at);

alter table transaction_record_events enable row level security;
