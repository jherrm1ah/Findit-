import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "./testing/fakeSupabase";

// A "Verified Transaction" is a claim FindIt makes to strangers, so the tests
// that matter most are the ones proving it cannot be made falsely: no record
// for an unpaid or unreleased order, exactly one for a completed one however
// many times completion runs, and nothing about the buyer in what gets
// published.

const fakeDb: FakeSupabase = createFakeSupabase();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeDb,
}));

process.env.SUPABASE_URL = "http://fake.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";

const {
  recordCompletedTransaction,
  getPublicVerification,
  getOwnTransactionRecord,
  listOwnTransactionRecords,
  getTransactionRecordForAdmin,
  addAdminCorrection,
  markTransactionRefunded,
  markTransactionDisputed,
  generateTransactionCode,
  normalizeTransactionCode,
} = await import("./transactionRecord");

type AnyOrder = Parameters<typeof recordCompletedTransaction>[0];

function completedOrder(overrides: Partial<AnyOrder> = {}): AnyOrder {
  return {
    id: "ORD-1",
    userId: "buyer_1",
    item: "iPhone 15 Pro 256GB",
    seller: "ABC Electronics",
    sellerId: "seller_1",
    price: 850000,
    status: "Delivered",
    canReview: true,
    reviewed: false,
    myRating: null,
    reviewComment: null,
    requestId: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    buyerConfirmedAt: "2026-03-12T10:00:00.000Z",
    escrowStatus: "released",
    issueReportedAt: null,
    issueNote: null,
    paymentStatus: "paid",
    paidAt: "2026-03-02T00:00:00.000Z",
    platformFeeBps: 200,
    platformFeeAmount: 17000,
    sellerPayoutAmount: 833000,
    ...overrides,
  } as AnyOrder;
}

function seedWorld() {
  fakeDb.reset({
    sellers: [
      {
        id: "seller_1",
        name: "ABC Electronics",
        status: "approved",
        verification_status: "approved",
        bank_account_number: "0123456789",
      },
    ],
    orders: [],
    transaction_records: [],
    transaction_record_events: [],
  });
}

beforeEach(() => {
  fakeDb.reset();
});

describe("when a record may exist at all", () => {
  it("creates exactly one record for a completed, paid order", async () => {
    seedWorld();

    const record = await recordCompletedTransaction(completedOrder());

    expect(record).not.toBeNull();
    expect(record!.code).toMatch(/^FI-[0-9A-Z]{8}$/);
    expect(record!.status).toBe("completed");
    expect(record!.itemName).toBe("iPhone 15 Pro 256GB");
    expect(fakeDb.dump("transaction_records")).toHaveLength(1);
  });

  it("creates none for an order that was never paid", async () => {
    seedWorld();

    const record = await recordCompletedTransaction(
      completedOrder({ paymentStatus: "pending", escrowStatus: "released" })
    );

    expect(record).toBeNull();
    expect(fakeDb.dump("transaction_records")).toHaveLength(0);
  });

  it("creates none for an order whose escrow was never released", async () => {
    seedWorld();

    for (const escrowStatus of ["unpaid", "held", "disputed", "refunded"] as const) {
      expect(await recordCompletedTransaction(completedOrder({ escrowStatus }))).toBeNull();
    }
    expect(fakeDb.dump("transaction_records")).toHaveLength(0);
  });

  it("records the seller's trust level as it stood at completion", async () => {
    seedWorld();

    const record = await recordCompletedTransaction(completedOrder());

    // An approved seller with no completed orders yet is "verified", not
    // "trusted" — the badge is never inflated by the record.
    expect(record!.sellerVerificationLevel).toBe("verified");
  });
});

describe("idempotency — completion may run more than once", () => {
  it("a repeated completion returns the same record, not a second one", async () => {
    seedWorld();

    const first = await recordCompletedTransaction(completedOrder());
    const second = await recordCompletedTransaction(completedOrder());
    const third = await recordCompletedTransaction(completedOrder());

    expect(second!.code).toBe(first!.code);
    expect(third!.code).toBe(first!.code);
    expect(fakeDb.dump("transaction_records")).toHaveLength(1);
  });

  it("concurrent completions still produce one record", async () => {
    seedWorld();

    const results = await Promise.all([
      recordCompletedTransaction(completedOrder()),
      recordCompletedTransaction(completedOrder()),
      recordCompletedTransaction(completedOrder()),
    ]);

    expect(fakeDb.dump("transaction_records")).toHaveLength(1);
    const codes = new Set(results.map((r) => r?.code));
    expect(codes.size).toBe(1);
  });

  it("two different orders get two different records", async () => {
    seedWorld();

    const a = await recordCompletedTransaction(completedOrder());
    const b = await recordCompletedTransaction(completedOrder({ id: "ORD-2" }));

    expect(a!.code).not.toBe(b!.code);
    expect(fakeDb.dump("transaction_records")).toHaveLength(2);
  });
});

describe("the public verification page", () => {
  it("verifies a real transaction", async () => {
    seedWorld();
    const record = await recordCompletedTransaction(completedOrder());

    const verification = await getPublicVerification(record!.code);

    expect(verification).not.toBeNull();
    expect(verification!.itemName).toBe("iPhone 15 Pro 256GB");
    expect(verification!.sellerName).toBe("ABC Electronics");
    expect(verification!.status).toBe("completed");
  });

  it("publishes nothing about the buyer, the amount, or any internal id", async () => {
    seedWorld();
    const record = await recordCompletedTransaction(completedOrder());

    const verification = await getPublicVerification(record!.code);
    const serialised = JSON.stringify(verification);

    expect(serialised).not.toContain("buyer_1");
    expect(serialised).not.toContain("850000");
    expect(serialised).not.toContain("ORD-1");
    expect(serialised).not.toContain(record!.id);
    expect(serialised).not.toContain("0123456789");
    expect(Object.keys(verification!)).not.toContain("buyerUserId");
    expect(Object.keys(verification!)).not.toContain("amount");
    expect(Object.keys(verification!)).not.toContain("orderId");
  });

  it("returns nothing for an unknown or malformed code, identically", async () => {
    seedWorld();
    await recordCompletedTransaction(completedOrder());

    for (const bad of ["FI-00000000", "nonsense", "FI-ILOU1234", "", "../../etc", "FI-123"]) {
      expect(await getPublicVerification(bad)).toBeNull();
    }
  });

  it("accepts a code as a person would actually type it", async () => {
    seedWorld();
    const record = await recordCompletedTransaction(completedOrder());
    const bare = record!.code.replace("FI-", "");

    expect((await getPublicVerification(bare.toLowerCase()))?.code).toBe(record!.code);
    expect((await getPublicVerification(`  ${record!.code}  `))?.code).toBe(record!.code);
  });
});

describe("later events are added, never overwritten", () => {
  it("shows a refunded transaction as refunded, not as a clean sale", async () => {
    seedWorld();
    const record = await recordCompletedTransaction(completedOrder());

    await markTransactionRefunded("ORD-1", "admin_1", "Item not as described.");

    const verification = await getPublicVerification(record!.code);
    expect(verification!.status).toBe("refunded");
    // The original completion is still in the history — the refund is added
    // to it, not substituted for it.
    expect(verification!.timeline.map((e) => e.eventType)).toEqual(["completed", "refunded"]);
  });

  it("keeps the snapshot intact through a status change", async () => {
    seedWorld();
    const record = await recordCompletedTransaction(completedOrder());

    await markTransactionRefunded("ORD-1", "admin_1", "Item not as described.");

    const after = fakeDb.dump("transaction_records")[0];
    expect(after.item_name).toBe("iPhone 15 Pro 256GB");
    expect(after.amount).toBe(850000);
    expect(after.completed_at).toBe("2026-03-12T10:00:00.000Z");
    expect(after.code).toBe(record!.code);
  });

  it("reflects a dispute", async () => {
    seedWorld();
    const record = await recordCompletedTransaction(completedOrder());

    await markTransactionDisputed("ORD-1", "buyer_1", "Screen is cracked.");

    expect((await getPublicVerification(record!.code))!.status).toBe("disputed");
  });

  it("does nothing when the order never produced a record", async () => {
    seedWorld();

    await markTransactionRefunded("ORD-NONE", "admin_1", "n/a");

    expect(fakeDb.dump("transaction_record_events")).toHaveLength(0);
  });

  it("hides who did what from the public timeline", async () => {
    seedWorld();
    const record = await recordCompletedTransaction(completedOrder());
    await markTransactionRefunded("ORD-1", "admin_1", "A private internal reason.");

    const serialised = JSON.stringify(await getPublicVerification(record!.code));
    expect(serialised).not.toContain("admin_1");
    expect(serialised).not.toContain("A private internal reason");
  });
});

describe("private access is restricted to the two parties", () => {
  const buyer = { userId: "buyer_1", sellerId: null, sellerName: null };
  const seller = { userId: "seller_user", sellerId: "seller_1", sellerName: "ABC Electronics" };
  const stranger = { userId: "someone_else", sellerId: "seller_9", sellerName: "Other Shop" };

  it("lets the buyer see their own record, with the amount", async () => {
    seedWorld();
    const record = await recordCompletedTransaction(completedOrder());

    const seen = await getOwnTransactionRecord(record!.code, buyer);
    expect(seen?.amount).toBe(850000);
    expect(seen?.orderId).toBe("ORD-1");
  });

  it("lets the seller see it too", async () => {
    seedWorld();
    const record = await recordCompletedTransaction(completedOrder());

    expect((await getOwnTransactionRecord(record!.code, seller))?.code).toBe(record!.code);
  });

  it("refuses an unrelated account, with the same answer as a bad code", async () => {
    seedWorld();
    const record = await recordCompletedTransaction(completedOrder());

    expect(await getOwnTransactionRecord(record!.code, stranger)).toBeNull();
    expect(await getOwnTransactionRecord("FI-00000000", buyer)).toBeNull();
  });

  it("never lets a same-named seller reach another seller's record", async () => {
    seedWorld();
    const record = await recordCompletedTransaction(completedOrder());

    // Same business name, different account. seller_id is what decides.
    const impostor = { userId: "u_x", sellerId: "seller_2", sellerName: "ABC Electronics" };
    expect(await getOwnTransactionRecord(record!.code, impostor)).toBeNull();
  });

  it("lists only the viewer's own records", async () => {
    seedWorld();
    await recordCompletedTransaction(completedOrder());
    await recordCompletedTransaction(
      completedOrder({ id: "ORD-2", userId: "buyer_2", seller: "Other Shop", sellerId: "seller_2" })
    );

    const mine = await listOwnTransactionRecords(buyer);
    expect(mine.map((r) => r.orderId)).toEqual(["ORD-1"]);
  });
});

describe("admin investigation", () => {
  it("can read a record and its history", async () => {
    seedWorld();
    const record = await recordCompletedTransaction(completedOrder());

    const seen = await getTransactionRecordForAdmin(record!.code);
    expect(seen?.orderId).toBe("ORD-1");
    expect(seen?.events.map((e) => e.eventType)).toEqual(["completed"]);
  });

  it("records a correction as an appended event, leaving the snapshot alone", async () => {
    seedWorld();
    const record = await recordCompletedTransaction(completedOrder());
    const before = { ...fakeDb.dump("transaction_records")[0] };

    const ok = await addAdminCorrection(record!.code, "admin_1", "Buyer contacted support about the invoice.");

    expect(ok).toBe(true);
    const after = fakeDb.dump("transaction_records")[0];
    // Not one snapshot field moved.
    expect(after).toEqual(before);

    const seen = await getTransactionRecordForAdmin(record!.code);
    expect(seen?.events.map((e) => e.eventType)).toEqual(["completed", "admin_correction"]);
    expect(seen?.events[1].reason).toMatch(/invoice/);
    expect(seen?.events[1].actorType).toBe("admin");
  });

  it("refuses a correction against a code that doesn't exist", async () => {
    seedWorld();
    expect(await addAdminCorrection("FI-00000000", "admin_1", "some reason")).toBe(false);
  });
});

describe("the transaction code itself", () => {
  it("uses an alphabet with no ambiguous characters", async () => {
    for (let i = 0; i < 200; i++) {
      const code = generateTransactionCode();
      expect(code).toMatch(/^FI-[0-9A-Z]{8}$/);
      // I, L, O and U are excluded so a code read aloud or off a label
      // cannot be mistyped into a different valid one.
      expect(code.slice(3)).not.toMatch(/[ILOU]/);
    }
  });

  it("does not repeat across a large sample", async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 5000; i++) codes.add(generateTransactionCode());
    expect(codes.size).toBe(5000);
  });

  it("rejects anything that isn't a well-formed code", () => {
    expect(normalizeTransactionCode("FI-ABCDEFGH")).toBe("FI-ABCDEFGH");
    expect(normalizeTransactionCode("abcdefgh")).toBe("FI-ABCDEFGH");
    expect(normalizeTransactionCode("FI-ABCDEFG")).toBeNull(); // too short
    expect(normalizeTransactionCode("FI-ABCDEFGHI")).toBeNull(); // too long
    expect(normalizeTransactionCode("FI-ABCDEFGI")).toBeNull(); // excluded letter
    expect(normalizeTransactionCode("../../etc/passwd")).toBeNull();
    expect(normalizeTransactionCode(undefined as never)).toBeNull();
  });
});
