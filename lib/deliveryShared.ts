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
