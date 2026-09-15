import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL sendBroadcast against the fake Supabase client. Added
// a title/body length cap alongside the same gap already fixed for chat
// messages and support tickets this session — sendBroadcast writes one
// notifications row per recipient, so an uncapped body isn't just one
// oversized row, it's one per every user in the audience.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { sendBroadcast } = await import("./broadcast");
const { ValidationError } = await import("./errors");

function seedUsers() {
  return {
    users: [
      { id: "u_buyer_1", role: "buyer", notifications_enabled: true },
      { id: "u_buyer_2", role: "buyer", notifications_enabled: false },
      { id: "u_seller_1", role: "seller", notifications_enabled: true },
      { id: "u_admin_1", role: "admin", notifications_enabled: true },
    ],
  };
}

beforeEach(() => {
  fakeDb.reset(seedUsers());
});

describe("sendBroadcast", () => {
  it("notifies only opted-in users in the chosen audience", async () => {
    const result = await sendBroadcast("Maintenance tonight", "FindIt will be briefly offline at 11pm.", "buyers");
    expect(result).toEqual({ audience: "buyers", recipientCount: 1 });
    const notifications = fakeDb.dump("notifications");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].user_id).toBe("u_buyer_1");
    expect(notifications[0].type).toBe("admin_broadcast");
  });

  it("never reaches admin accounts, even with audience 'all'", async () => {
    const result = await sendBroadcast("News", "Something new shipped.", "all");
    expect(result.recipientCount).toBe(2); // the one opted-in buyer + the one seller
    const recipients = fakeDb.dump("notifications").map((n) => n.user_id);
    expect(recipients).not.toContain("u_admin_1");
  });

  it("rejects an empty title or body", async () => {
    await expect(sendBroadcast("   ", "body", "all")).rejects.toThrow(ValidationError);
    await expect(sendBroadcast("title", "   ", "all")).rejects.toThrow(ValidationError);
  });

  it("rejects a title or body over the length cap", async () => {
    await expect(sendBroadcast("x".repeat(201), "fine", "all")).rejects.toThrow(/title.*under 200/i);
    await expect(sendBroadcast("fine", "x".repeat(2001), "all")).rejects.toThrow(/message.*under 2000/i);
  });

  it("rejects an unknown audience", async () => {
    await expect(sendBroadcast("t", "b", "everyone" as unknown as "all")).rejects.toThrow(ValidationError);
  });
});
