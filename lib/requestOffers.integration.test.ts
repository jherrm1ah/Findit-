import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL addSellerOfferToRequest/sendMessage against the fake
// Supabase client. Covers two gaps a request/offer/messaging flow review
// found: a seller could still successfully send an offer on a request the
// buyer had already matched or that's no longer open (dead state, no error
// telling them why), and a chat message had no length cap at all.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { addSellerOfferToRequest, sendMessage, cancelRequest, listOpenRequests, ValidationError } = await import("./repo");

function seedRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req_1",
    user_id: "buyer_1",
    title: "Need a phone charger",
    status: "open",
    condition: "New",
    ...overrides,
  };
}

function offerInput() {
  return { price: 5000, delivery: "2000", eta: "1 day", warranty: "6 months" };
}

beforeEach(() => {
  fakeDb.reset({ requests: [seedRequest()] });
});

describe("addSellerOfferToRequest — request must still be open", () => {
  it("sends the offer, and notifies the buyer, on an open request", async () => {
    const offer = await addSellerOfferToRequest("req_1", "Terra Gadgets", "seller_1", offerInput());
    expect(offer?.price).toBe(5000);
    expect(fakeDb.dump("notifications")).toHaveLength(1);
  });

  it("refuses an offer on a request the buyer already matched", async () => {
    fakeDb.reset({ requests: [seedRequest({ status: "matched" })] });
    await expect(addSellerOfferToRequest("req_1", "Terra Gadgets", "seller_1", offerInput())).rejects.toThrow(
      ValidationError
    );
    expect(fakeDb.dump("offers")).toHaveLength(0);
    expect(fakeDb.dump("notifications")).toHaveLength(0);
  });

  it("refuses an offer on a cancelled request", async () => {
    fakeDb.reset({ requests: [seedRequest({ status: "cancelled" })] });
    await expect(addSellerOfferToRequest("req_1", "Terra Gadgets", "seller_1", offerInput())).rejects.toThrow(
      /isn't open/i
    );
  });

  it("returns null for a request that doesn't exist, same as before", async () => {
    expect(await addSellerOfferToRequest("nope", "Terra Gadgets", "seller_1", offerInput())).toBeNull();
  });
});

describe("sendMessage — length cap", () => {
  it("sends a normal message", async () => {
    const message = await sendMessage("conv_1", "user_1", "Is this still available?");
    expect(message.body).toBe("Is this still available?");
  });

  it("rejects an empty (or whitespace-only) message", async () => {
    await expect(sendMessage("conv_1", "user_1", "   ")).rejects.toThrow(ValidationError);
  });

  it("rejects a message over the length cap", async () => {
    await expect(sendMessage("conv_1", "user_1", "x".repeat(2001))).rejects.toThrow(/under 2000/i);
  });

  it("accepts a message right at the length cap", async () => {
    const message = await sendMessage("conv_1", "user_1", "x".repeat(2000));
    expect(message.body).toHaveLength(2000);
  });
});

// A buyer previously had no way to close their own open request at all —
// the status column already modeled 'cancelled', nothing ever wrote it.
describe("cancelRequest", () => {
  it("cancels the buyer's own open request", async () => {
    const cancelled = await cancelRequest("req_1", "buyer_1");
    expect(cancelled?.status).toBe("cancelled");
  });

  it("refuses to cancel someone else's request (IDOR check)", async () => {
    const result = await cancelRequest("req_1", "someone_else");
    expect(result).toBeNull();
    expect(fakeDb.dump("requests")[0].status).toBe("open");
  });

  it("refuses to cancel a request that's already matched", async () => {
    fakeDb.reset({ requests: [seedRequest({ status: "matched" })] });
    const result = await cancelRequest("req_1", "buyer_1");
    expect(result).toBeNull();
  });

  it("returns null for a request that doesn't exist", async () => {
    expect(await cancelRequest("nope", "buyer_1")).toBeNull();
  });
});

// The actual bug this closes: SellerDashboard.jsx used to gate its own
// "Send offer" button on offerCount > 0 — every seller's offers combined —
// so a request with even ONE offer from ANY seller read as "you already
// responded" for every OTHER seller too, hiding their own button on a
// request they'd never touched. myOfferSent is the per-seller signal that
// actually answers "did *I* offer on this."
describe("listOpenRequests — myOfferSent is per-seller, not the aggregate offerCount", () => {
  function seedTwoSellerRequest() {
    fakeDb.reset({
      requests: [{ id: "req_1", user_id: "buyer_1", title: "Need a blender", status: "open", created_at: new Date().toISOString() }],
      offers: [{ id: "off_1", request_id: "req_1", seller: "Kemi's Kitchen", seller_id: "seller_a", price: 5000 }],
    });
  }

  it("is false for a seller who never sent an offer, even though offerCount is 1", async () => {
    seedTwoSellerRequest();
    const [request] = await listOpenRequests("seller_b");
    expect(request.offerCount).toBe(1);
    expect(request.myOfferSent).toBe(false);
  });

  it("is true for the seller who actually sent the offer", async () => {
    seedTwoSellerRequest();
    const [request] = await listOpenRequests("seller_a");
    expect(request.myOfferSent).toBe(true);
  });

  it("is undefined (not checked at all) when called with no viewer — e.g. an admin", async () => {
    seedTwoSellerRequest();
    const [request] = await listOpenRequests();
    expect(request.myOfferSent).toBeUndefined();
    expect(request.offerCount).toBe(1);
  });
});
