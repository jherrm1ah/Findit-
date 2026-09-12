import { getDb, assertNoError } from "./db";
import { ValidationError } from "./errors";
import { notifyBestEffort } from "./repo";

type Row = Record<string, unknown>;

// A real in-app support ticket system — a ticket is a thread (mirrors
// conversations/messages, the buyer-seller chat shape) rather than the
// static FAQ + mailto link this replaces
// (components/findit-app/HelpSupport.jsx). Any admin with the "support"
// permission domain can answer any ticket — unread tracking is two plain
// booleans on the ticket row, not per-message read receipts, since there's
// no fixed second party the way there is in a 1:1 buyer/seller chat.

export type TicketStatus = "open" | "resolved";

export type SupportTicket = {
  id: string;
  userId: string;
  subject: string;
  status: TicketStatus;
  userHasUnread: boolean;
  adminHasUnread: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SupportTicketMessage = {
  id: string;
  ticketId: string;
  senderId: string;
  isAdmin: boolean;
  body: string;
  createdAt: string;
};

function randomId(prefix: string): string {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
}

function rowToTicket(row: Row): SupportTicket {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    subject: row.subject as string,
    status: row.status as TicketStatus,
    userHasUnread: Boolean(row.user_has_unread),
    adminHasUnread: Boolean(row.admin_has_unread),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToMessage(row: Row): SupportTicketMessage {
  return {
    id: row.id as string,
    ticketId: row.ticket_id as string,
    senderId: row.sender_id as string,
    isAdmin: Boolean(row.is_admin),
    body: row.body as string,
    createdAt: row.created_at as string,
  };
}

export async function createTicket(userId: string, subject: string, body: string): Promise<SupportTicket> {
  const cleanSubject = subject.trim();
  const cleanBody = body.trim();
  if (!cleanSubject) throw new ValidationError("Give your ticket a short subject.");
  if (!cleanBody) throw new ValidationError("Describe what's going on.");

  const db = getDb();
  const id = randomId("tkt_");
  const insertResult = await db.from("support_tickets").insert({
    id,
    user_id: userId,
    subject: cleanSubject,
  });
  assertNoError(insertResult, "creating support ticket");

  const messageResult = await db.from("support_ticket_messages").insert({
    id: randomId("tktmsg_"),
    ticket_id: id,
    sender_id: userId,
    is_admin: false,
    body: cleanBody,
  });
  assertNoError(messageResult, "recording ticket message");

  const row = assertNoError(
    await db.from("support_tickets").select("*").eq("id", id).single(),
    "loading new ticket"
  ) as Row;
  return rowToTicket(row);
}

export async function listMyTickets(userId: string): Promise<SupportTicket[]> {
  const db = getDb();
  const result = await db.from("support_tickets").select("*").eq("user_id", userId).order("updated_at", { ascending: false });
  const rows = assertNoError(result, "listing your tickets") as Row[];
  return rows.map(rowToTicket);
}

export async function getTicket(ticketId: string): Promise<SupportTicket | null> {
  const db = getDb();
  const result = await db.from("support_tickets").select("*").eq("id", ticketId).maybeSingle();
  const row = assertNoError(result, "loading ticket") as Row | null;
  return row ? rowToTicket(row) : null;
}

export async function listTicketMessages(ticketId: string): Promise<SupportTicketMessage[]> {
  const db = getDb();
  const result = await db
    .from("support_ticket_messages")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  const rows = assertNoError(result, "listing ticket messages") as Row[];
  return rows.map(rowToMessage);
}

// Called when the OWNING user opens their own ticket — clears their unread
// flag. Never called for an admin viewing it; see markReadByAdmin below.
export async function markReadByUser(ticketId: string): Promise<void> {
  const db = getDb();
  const result = await db.from("support_tickets").update({ user_has_unread: false }).eq("id", ticketId);
  assertNoError(result, "marking ticket read");
}

export async function markReadByAdmin(ticketId: string): Promise<void> {
  const db = getDb();
  const result = await db.from("support_tickets").update({ admin_has_unread: false }).eq("id", ticketId);
  assertNoError(result, "marking ticket read");
}

// The user's own message on a resolved ticket reopens it — a resolved
// ticket with a new message underneath it staying "resolved" would hide
// exactly the thing that most needs an admin's attention. An admin's own
// reply never changes status on its own; they resolve it explicitly.
export async function addTicketMessage(ticketId: string, senderId: string, isAdmin: boolean, body: string): Promise<SupportTicketMessage> {
  const cleanBody = body.trim();
  if (!cleanBody) throw new ValidationError("Message can't be empty.");

  const ticket = await getTicket(ticketId);
  if (!ticket) throw new ValidationError("That ticket doesn't exist.");

  const db = getDb();
  const insertResult = await db.from("support_ticket_messages").insert({
    id: randomId("tktmsg_"),
    ticket_id: ticketId,
    sender_id: senderId,
    is_admin: isAdmin,
    body: cleanBody,
  });
  assertNoError(insertResult, "recording ticket message");

  const updateResult = await db
    .from("support_tickets")
    .update({
      status: !isAdmin && ticket.status === "resolved" ? "open" : ticket.status,
      user_has_unread: isAdmin,
      admin_has_unread: !isAdmin,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticketId);
  assertNoError(updateResult, "updating ticket");

  if (isAdmin) {
    await notifyBestEffort({
      userId: ticket.userId,
      type: "support_reply",
      title: "Support replied to your ticket",
      body: `"${ticket.subject}" — ${cleanBody.slice(0, 120)}`,
    });
  }

  const row = assertNoError(
    await db.from("support_ticket_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: false }).limit(1).single(),
    "loading new message"
  ) as Row;
  return rowToMessage(row);
}

export async function resolveTicket(ticketId: string): Promise<SupportTicket> {
  const db = getDb();
  const result = await db.from("support_tickets").update({ status: "resolved", updated_at: new Date().toISOString() }).eq("id", ticketId).select().maybeSingle();
  const row = assertNoError(result, "resolving ticket") as Row | null;
  if (!row) throw new ValidationError("That ticket doesn't exist.");
  return rowToTicket(row);
}

export type AdminTicketListItem = SupportTicket & { userName: string | null; userPhone: string | null };

// Admin-facing — every ticket across every user, newest activity first,
// with just enough identity to know who's asking without a second lookup.
export async function listTicketsForAdmin(status?: TicketStatus): Promise<AdminTicketListItem[]> {
  const db = getDb();
  let query = db.from("support_tickets").select("*, users(name, phone)").order("updated_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const result = await query;
  const rows = assertNoError(result, "listing tickets") as Row[];
  return rows.map((r) => ({
    ...rowToTicket(r),
    userName: ((r.users as { name?: string } | null)?.name as string | undefined) ?? null,
    userPhone: ((r.users as { phone?: string } | null)?.phone as string | undefined) ?? null,
  }));
}

export async function getOpenTicketCount(): Promise<number> {
  const db = getDb();
  const result = await db.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open");
  if (result.error) throw new Error(`counting open tickets: ${result.error.message}`);
  return result.count ?? 0;
}
