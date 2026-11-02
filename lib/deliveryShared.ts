// The parts of lib/delivery.ts the app's screens use too: no server-only
// imports here, so client components can import it directly.

export type DeliveryOptions = "Delivery" | "Pickup" | "Both";
export type DeliveryMethod = "delivery" | "pickup";

export type DeliveryAddress = {
  fullName: string;
  phone: string;
  address: string; // house number and street
  area: string; // area / city, e.g. "Yaba, Lagos"
  state: string;
  landmark: string | null; // optional: "Opposite Shoprite", "Blue gate"
};

export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta",
  "Ebonyi", "Edo", "Ekiti", "Enugu", "FCT (Abuja)", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina",
  "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers",
  "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;

// What the buyer may choose for an order. A listing or offer from before delivery options existed
// (null) lets the buyer choose either, with no fee.
export function deliveryChoices(options: string | null | undefined): { delivery: boolean; pickup: boolean } {
  if (options === "Delivery") return { delivery: true, pickup: false };
  if (options === "Pickup") return { delivery: false, pickup: true };
  return { delivery: true, pickup: true };
}

// How an offer's delivery terms read to the buyer, e.g. "Delivery ₦2,500 or pickup".
export function deliveryTermsText(option: DeliveryOptions, fee: number): string {
  const delivery = fee > 0 ? `Delivery ₦${fee.toLocaleString("en-NG")}` : "Free delivery";
  if (option === "Pickup") return "Pickup only";
  if (option === "Delivery") return delivery;
  return `${delivery} or pickup`;
}

// The address as lines, for the seller's order card and messages.
export function addressLines(a: DeliveryAddress | null | undefined): string[] {
  if (!a) return [];
  return [a.fullName, a.address, [a.area, a.state].filter(Boolean).join(", "), a.landmark ? `Landmark: ${a.landmark}` : "", a.phone].filter(Boolean);
}

// How a listing prices delivery (migration 046), like a shop's shipping
// settings:
// - "free": delivery is included in the price (no fee at checkout);
// - "fixed": one fee everywhere (deliveryFee);
// - "location": a fee per state (deliveryRates), and deliveryFee for every
//   state not listed;
// - null: an older listing whose seller hasn't chosen yet. It's charged
//   nothing at checkout and shown as "ask the seller", never as "free".
export type DeliveryPricing = "free" | "fixed" | "location";
export const DELIVERY_PRICING: readonly DeliveryPricing[] = ["free", "fixed", "location"];
export type DeliveryRates = Record<string, number>;

// What an order (or listing) charges to deliver: deliveryFeeQuote for any
// state not in deliveryRates.
export type FeeQuote = { deliveryFeeQuote: number; deliveryRates?: DeliveryRates | null };

export function hasStateFees(q: FeeQuote): boolean {
  return Object.keys(q.deliveryRates ?? {}).length > 0;
}

// The delivery fee to this state. With no state chosen yet: the fee for
// "every other state" (checkout lists the rates until an address is given).
export function feeForState(q: FeeQuote, state?: string | null): number {
  const rates = q.deliveryRates ?? {};
  if (state && Object.prototype.hasOwnProperty.call(rates, state)) return rates[state];
  return q.deliveryFeeQuote;
}

const nairaText = (n: number) => (n > 0 ? `₦${n.toLocaleString("en-NG")}` : "free");

// "Lagos ₦2,500 · Ogun ₦4,000 · other states ₦6,000", or "₦2,500" / "free".
export function feeSummary(q: FeeQuote): string {
  const rates = Object.entries(q.deliveryRates ?? {}).sort((a, b) => a[1] - b[1]);
  if (rates.length === 0) return nairaText(q.deliveryFeeQuote);
  return [...rates.map(([state, fee]) => `${state} ${nairaText(fee)}`), `other states ${nairaText(q.deliveryFeeQuote)}`].join(" · ");
}

// The cheapest delivery a listing offers, for "Delivery from ₦2,500".
export function lowestFee(q: FeeQuote): number {
  return Math.min(q.deliveryFeeQuote, ...Object.values(q.deliveryRates ?? {}));
}

// How a listing's delivery reads to a buyer on the product page.
export function productDeliveryText(p: {
  deliveryOption?: string | null;
  deliveryPricing?: DeliveryPricing | null;
  deliveryFee?: number;
  deliveryRates?: DeliveryRates | null;
}): string | null {
  if (p.deliveryOption === "Pickup") return null;
  if (p.deliveryPricing === "free") return "Free delivery";
  if (p.deliveryPricing === "fixed") return `${nairaText(p.deliveryFee ?? 0)} delivery`;
  if (p.deliveryPricing === "location") {
    const q = { deliveryFeeQuote: p.deliveryFee ?? 0, deliveryRates: p.deliveryRates };
    const low = lowestFee(q);
    return low > 0 ? `Delivery from ${nairaText(low)}` : "Delivery fee by location";
  }
  return "Delivery fee: ask the seller";
}
