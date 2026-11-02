import { describe, it, expect } from "vitest";
import { customersFromOrders, isLowStock, isBoosted } from "./sellerCustomers";

const order = (id: string, userId: string, day: number, extra: Record<string, unknown> = {}) => ({
  id, userId, item: `Item ${id}`, price: 1000, createdAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`, paymentStatus: "paid", deliveryAddress: null, ...extra,
});

describe("customersFromOrders", () => {
  it("groups paid orders by buyer, most recent customer first, with totals", () => {
    const customers = customersFromOrders([
      order("a", "u1", 1, { deliveryAddress: { fullName: "Ada Obi", phone: "0803" } }),
      order("b", "u2", 5),
      order("c", "u1", 3, { price: 2500 }),
    ]);
    expect(customers.map((c) => c.userId)).toEqual(["u2", "u1"]);
    expect(customers[1]).toMatchObject({ name: "Ada Obi", phone: "0803", orderCount: 2, totalSpent: 3500, items: ["Item c", "Item a"] });
    expect(customers[1].latestOrder.id).toBe("c");
    expect(customers[0]).toMatchObject({ name: null, phone: null, orderCount: 1 });
  });

  it("leaves out unpaid and cancelled orders", () => {
    expect(customersFromOrders([order("a", "u1", 1, { paymentStatus: "pending" })])).toEqual([]);
  });
});

describe("listing filters", () => {
  it("low stock is 3 or fewer, sold out included", () => {
    expect([0, 1, 3, 4, 50].map((qty) => isLowStock({ qty }))).toEqual([true, true, true, false, false]);
  });
  it("boosted means a boost that hasn't ended", () => {
    const now = Date.parse("2026-11-02T12:00:00Z");
    expect(isBoosted({ boostedUntil: "2026-11-03T00:00:00Z" }, now)).toBe(true);
    expect(isBoosted({ boostedUntil: "2026-11-01T00:00:00Z" }, now)).toBe(false);
    expect(isBoosted({ boostedUntil: null }, now)).toBe(false);
  });
});
