import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// Exercises the REAL submitVerification against the fake Supabase client.
// Covers the length caps added this session — none of these text fields
// (description, shop address, evidence links/notes, etc.) had anything
// stopping them before, unlike every other user-generated text field
// checked earlier this session (chat messages, support tickets,
// broadcasts, review comments).

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const { submitVerification } = await import("./sellerVerification");
const { ValidationError } = await import("./errors");

function seller(overrides: Record<string, unknown> = {}) {
  return {
    id: "seller_1",
    user_id: "user_1",
    name: "Terra Gadgets",
    verification_status: "incomplete",
    ...overrides,
  };
}

function validInput(overrides: Partial<Parameters<typeof submitVerification>[1]> = {}) {
  return {
    sellerType: "online_business" as const,
    category: "Electronics",
    description: "We sell gadgets.",
    yearsSelling: "2",
    socialLinks: null,
    hasPhysicalStore: false,
    publicState: "Lagos",
    publicCity: "Ikeja",
    publicArea: null,
    shopAddress: null,
    lat: null,
    lng: null,
    website: "https://example.com",
    linkEvidence: [{ kind: "social_link" as const, textValue: "https://instagram.com/terragadgets", note: null }],
    photoEvidence: [],
    ...overrides,
  };
}

beforeEach(() => {
  fakeDb.reset({ sellers: [seller()], seller_verification_details: [], seller_verification_evidence: [] });
});

describe("submitVerification — length caps", () => {
  // NOTE: the happy path isn't covered here — submitVerification's next
  // write after these checks is a .upsert(), which the fake Supabase
  // client doesn't implement (same documented gap as .rpc()/.contains()
  // elsewhere in this test suite). Every case below only needs to observe
  // that the ValidationError fires BEFORE that point, which it does.
  it("rejects a description over the length cap, before writing anything", async () => {
    await expect(
      submitVerification("seller_1", validInput({ description: "x".repeat(2001) }))
    ).rejects.toThrow(/under 2000/i);
    expect(fakeDb.dump("sellers")[0].verification_status).toBe("incomplete");
    expect(fakeDb.dump("seller_verification_evidence")).toHaveLength(0);
  });

  it("rejects an over-length short field (category, years selling, state/city/area, website)", async () => {
    await expect(
      submitVerification("seller_1", validInput({ category: "x".repeat(201) }))
    ).rejects.toThrow(/category.*under 200/i);
    await expect(
      submitVerification("seller_1", validInput({ website: "x".repeat(201) }))
    ).rejects.toThrow(/website.*under 200/i);
  });

  it("rejects an over-length evidence link or note", async () => {
    await expect(
      submitVerification(
        "seller_1",
        validInput({ linkEvidence: [{ kind: "social_link", textValue: "x".repeat(501), note: null }] })
      )
    ).rejects.toThrow(ValidationError);
    await expect(
      submitVerification(
        "seller_1",
        validInput({ linkEvidence: [{ kind: "social_link", textValue: "ok", note: "x".repeat(501) }] })
      )
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an over-length shop address", async () => {
    await expect(
      submitVerification(
        "seller_1",
        validInput({ hasPhysicalStore: true, shopAddress: "x".repeat(2001) })
      )
    ).rejects.toThrow(/shop address.*under 2000/i);
  });

  it("rejects an over-length social link value", async () => {
    await expect(
      submitVerification("seller_1", validInput({ socialLinks: { instagram: "x".repeat(201) } }))
    ).rejects.toThrow(/social link.*under 200/i);
  });
});
