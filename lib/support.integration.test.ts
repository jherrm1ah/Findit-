import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL createTicket/addTicketMessage against the fake
// Supabase client. Covers a gap found alongside the request/offer/messaging
// review earlier this session (lib/repo.ts#sendMessage had no length cap):
// support tickets had the same gap, on both the ticket subject and every
// message body.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { createTicket, addTicketMessage } = await import("./support");
const { ValidationError } = await import("./errors");

beforeEach(() => {
  fakeDb.reset();
});

describe("createTicket", () => {
  it("opens a ticket with a real subject and first message", async () => {
    const ticket = await createTicket("user_1", "Can't upload photos", "The upload button does nothing.");
    expect(ticket.subject).toBe("Can't upload photos");
    expect(ticket.status).toBe("open");
    expect(fakeDb.dump("support_ticket_messages")).toHaveLength(1);
  });

  it("rejects an empty subject or body", async () => {
    await expect(createTicket("user_1", "   ", "Something's wrong")).rejects.toThrow(ValidationError);
    await expect(createTicket("user_1", "Help", "   ")).rejects.toThrow(ValidationError);
  });

  it("rejects a subject or body over the length cap", async () => {
    await expect(createTicket("user_1", "x".repeat(201), "fine")).rejects.toThrow(/subject.*under 200/i);
    await expect(createTicket("user_1", "fine", "x".repeat(2001))).rejects.toThrow(/message.*under 2000/i);
  });
});

describe("addTicketMessage", () => {
  async function seedTicket() {
    return createTicket("user_1", "Help", "Original message");
  }

  it("adds a reply", async () => {
    const ticket = await seedTicket();
    const message = await addTicketMessage(ticket.id, "user_1", false, "Following up on this.");
    expect(message.body).toBe("Following up on this.");
  });

  it("rejects an empty message", async () => {
    const ticket = await seedTicket();
    await expect(addTicketMessage(ticket.id, "user_1", false, "   ")).rejects.toThrow(ValidationError);
  });

  it("rejects a message over the length cap", async () => {
    const ticket = await seedTicket();
    await expect(addTicketMessage(ticket.id, "user_1", false, "x".repeat(2001))).rejects.toThrow(/under 2000/i);
  });

  it("accepts a message right at the length cap", async () => {
    const ticket = await seedTicket();
    const message = await addTicketMessage(ticket.id, "user_1", false, "x".repeat(2000));
    expect(message.body).toHaveLength(2000);
  });
});
