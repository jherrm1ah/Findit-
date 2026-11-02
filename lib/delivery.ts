import { ValidationError } from "./errors";
import { NIGERIAN_STATES, type DeliveryAddress, type DeliveryMethod } from "./deliveryShared";

export * from "./deliveryShared";

// Delivery at checkout: how an order reaches the buyer (delivered to an address, or picked up from
// the seller) and what delivery costs. Pure rules, unit-tested in lib/delivery.test.ts; the
// database side is in lib/repo.ts (createOrderFromProduct, acceptOffer, setOrderDelivery).
//
// Money: an order's price is what the buyer pays, item_price + delivery_fee. The platform fee is
// charged on the item only; the whole delivery fee goes to the seller, who pays for the delivery
// (see lib/payments.ts#computeFeeSplit).

const MAX_FEE = 1_000_000; // ₦1m: anything above is a typo, not a delivery fee

// A delivery fee as entered by a seller: a whole number of naira, 0 or more. Blank means free.
export function parseDeliveryFee(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[₦,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new ValidationError("Delivery fee must be a whole number of naira, 0 or more.");
  }
  if (n > MAX_FEE) throw new ValidationError("That delivery fee looks too high. Check the amount.");
  return n;
}

// The order's price once the buyer has chosen: the item, plus the delivery fee if delivered.
export function orderPriceFor(itemPrice: number, method: DeliveryMethod, feeQuote: number): { deliveryFee: number; price: number } {
  const deliveryFee = method === "delivery" ? Math.max(0, Math.round(feeQuote || 0)) : 0;
  return { deliveryFee, price: itemPrice + deliveryFee };
}

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max + 1);

// A delivery address from the checkout form, tidied and checked. Throws ValidationError with a
// message the buyer can act on.
export function normalizeAddress(input: unknown): DeliveryAddress {
  const a = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const fullName = clean(a.fullName, 80);
  const phone = clean(a.phone, 20);
  const address = clean(a.address, 200);
  const area = clean(a.area, 80);
  const state = clean(a.state, 40);
  const landmark = clean(a.landmark, 120);

  if (fullName.length < 2) throw new ValidationError("Add the name of the person receiving the order.");
  if (fullName.length > 80) throw new ValidationError("That name is too long.");
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 14) throw new ValidationError("Add a phone number the rider can call.");
  if (address.length < 5) throw new ValidationError("Add the house number and street.");
  if (address.length > 200) throw new ValidationError("That address is too long.");
  if (area.length < 2) throw new ValidationError("Add the area or city.");
  if (area.length > 80) throw new ValidationError("That area is too long.");
  if (!(NIGERIAN_STATES as readonly string[]).includes(state)) throw new ValidationError("Choose a state.");
  if (landmark.length > 120) throw new ValidationError("That landmark is too long.");

  return { fullName, phone, address, area, state, landmark: landmark || null };
}
