-- ---------------------------------------------------------------------------
-- 019 — Support tickets
--
-- A real in-app support ticket system, replacing the static FAQ + mailto
-- link (components/findit-app/HelpSupport.jsx) with something an admin can
-- actually see and answer inside FindIt. Mirrors the existing buyer-seller
-- chat shape (conversations/messages) — a ticket is the thread, messages
-- are the back-and-forth — rather than inventing a different pattern for
-- essentially the same "two parties messaging over time" problem.
--
-- Unread tracking is two plain booleans on the ticket row (who has
-- something new to read), not per-message read receipts — a ticket can be
-- answered by any support admin, not one fixed counterpart, so "has THIS
-- admin read it" doesn't make sense the way it does for a 1:1 buyer/seller
-- chat.
-- ---------------------------------------------------------------------------

create table if not exists support_tickets (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  subject text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  -- Set true whenever the OTHER side just added a message; cleared when
  -- that side actually opens the ticket. A resolved ticket the user replies
  -- to reopens to 'open' (see lib/support.ts#addTicketMessage) — never
  -- silently stays "resolved" while new messages sit under it.
  user_has_unread boolean not null default false,
  admin_has_unread boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_user_id_idx on support_tickets(user_id);
create index if not exists support_tickets_status_idx on support_tickets(status);

create table if not exists support_ticket_messages (
  id text primary key,
  ticket_id text not null references support_tickets(id) on delete cascade,
  sender_id text not null references users(id) on delete cascade,
  is_admin boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists support_ticket_messages_ticket_id_idx on support_ticket_messages(ticket_id);

alter table support_tickets enable row level security;
alter table support_ticket_messages enable row level security;
