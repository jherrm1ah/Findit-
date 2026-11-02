// The shipping calculator: which delivery options a seller-order has to a
// destination, and what each costs. Pure (no database), so every rule here is
// unit-tested in engine.test.ts. See docs/SHIPPING.md.

export type RateMethod = "free" | "flat" | "price" | "weight" | "local";

export type ShippingRate = {
  id: string;
  name: string;
  method: RateMethod;
  amount: number;
  minOrder?: number | null;
  maxOrder?: number | null;
  minWeightG?: number | null;
  maxWeightG?: number | null;
  baseWeightG?: number | null;
  perExtraKg?: number | null;
  etaMinDays?: number | null;
  etaMaxDays?: number | null;
};

export type ShippingZone = {
  id: string;
  name: string;
  states: string[]; // "*" = everywhere else in Nigeria
  areas: string[]; // cities/neighbourhoods; empty = the whole state
  rates: ShippingRate[];
};

export type ShippingProfile = {
  id: string;
  name: string;
  freeShippingOver?: number | null;
  zones: ShippingZone[];
  // True for the stand-in built from a listing's own simple pricing when the
  // seller never chose any (an older listing): ₦0, and checkout says so.
  unset?: boolean;
};

export type Destination = { state: string; area?: string | null };

export type QuoteLine = {
  productId: string;
  qty: number;
  unitPrice: number;
  weightG: number | null;
  profile: ShippingProfile;
};

export type ShippingOption = {
  id: string;
  name: string;
  method: RateMethod | "combined";
  fee: number;
  etaMinDays: number | null;
  etaMaxDays: number | null;
  // Why it's free when the rate itself isn't: the profile's threshold.
  freeOver: number | null;
  source: "manual"; // "carrier" once a provider is connected (lib/shipping/carriers.ts)
  zone: string;
  unset?: boolean;
};

export type ShippingQuote =
  | { ok: true; options: ShippingOption[]; subtotal: number; weightG: number | null }
  | { ok: false; reason: "no_zone" | "no_rate" | "needs_weight"; message: string; subtotal: number; weightG: number | null };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// "Yaba" matches an area of "Yaba, Lagos" or "yaba"; a zone's area must
// appear as a whole word in what the buyer typed.
function areaMatches(zoneArea: string, buyerArea: string): boolean {
  const z = norm(zoneArea);
  const b = norm(buyerArea);
  if (!z || !b) return false;
  return (` ${b.replace(/[^a-z0-9 ]/g, " ")} `).includes(` ${z.replace(/[^a-z0-9 ]/g, " ")} `);
}

// The zone that delivers to this destination: an area match first, then a
// whole-state match, then "everywhere else". Null = no delivery there.
export function matchZone(profile: ShippingProfile, dest: Destination): ShippingZone | null {
  const inState = profile.zones.filter((z) => z.states.includes(dest.state));
  const byArea = inState.find((z) => z.areas.length > 0 && dest.area && z.areas.some((a) => areaMatches(a, dest.area as string)));
  if (byArea) return byArea;
  const wholeState = inState.find((z) => z.areas.length === 0);
  if (wholeState) return wholeState;
  return profile.zones.find((z) => z.states.includes("*") && z.areas.length === 0) ?? null;
}

// Whether a rate's conditions hold for this order value and package weight.
export function rateApplies(rate: ShippingRate, subtotal: number, weightG: number | null): boolean {
  if (rate.method === "price") {
    if (rate.minOrder != null && subtotal < rate.minOrder) return false;
    if (rate.maxOrder != null && subtotal >= rate.maxOrder) return false;
  }
  if (rate.method === "weight") {
    if (weightG == null) return false; // never guess a weight
    if (rate.minWeightG != null && weightG < rate.minWeightG) return false;
    if (rate.maxWeightG != null && weightG > rate.maxWeightG) return false;
  }
  return true;
}

// A rate's fee. Weight: the amount covers up to baseWeightG, then perExtraKg
// for each extra kilogram started.
export function rateFee(rate: ShippingRate, weightG: number | null): number {
  if (rate.method === "free") return 0;
  if (rate.method === "weight" && weightG != null && rate.perExtraKg) {
    const extraG = Math.max(0, weightG - (rate.baseWeightG ?? 0));
    return rate.amount + Math.ceil(extraG / 1000) * rate.perExtraKg;
  }
  return rate.amount;
}

function groupQuote(profile: ShippingProfile, lines: QuoteLine[], dest: Destination) {
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const weightG = lines.every((l) => l.weightG != null) ? lines.reduce((s, l) => s + (l.weightG as number) * l.qty, 0) : null;
  const zone = matchZone(profile, dest);
  if (!zone) return { subtotal, weightG, zone: null, options: [] as ShippingOption[], needsWeight: false };
  const free = profile.freeShippingOver != null && subtotal >= profile.freeShippingOver;
  const options = zone.rates
    .filter((r) => rateApplies(r, subtotal, weightG))
    .map<ShippingOption>((r) => {
      const fee = rateFee(r, weightG);
      return {
        id: r.id,
        name: r.name,
        method: r.method,
        fee: free ? 0 : fee,
        etaMinDays: r.etaMinDays ?? null,
        etaMaxDays: r.etaMaxDays ?? null,
        freeOver: free && fee > 0 ? (profile.freeShippingOver as number) : null,
        source: "manual",
        zone: zone.name,
        ...(profile.unset ? { unset: true } : {}),
      };
    })
    .sort((a, b) => a.fee - b.fee || (a.etaMaxDays ?? 99) - (b.etaMaxDays ?? 99));
  const needsWeight = options.length === 0 && weightG == null && zone.rates.some((r) => r.method === "weight");
  return { subtotal, weightG, zone, options, needsWeight };
}

// The delivery options for one seller-order to one destination.
export function quoteShipping(lines: QuoteLine[], dest: Destination): ShippingQuote {
  const groups = new Map<string, { profile: ShippingProfile; lines: QuoteLine[] }>();
  for (const l of lines) {
    const g = groups.get(l.profile.id) ?? { profile: l.profile, lines: [] };
    g.lines.push(l);
    groups.set(l.profile.id, g);
  }
  const quotes = [...groups.values()].map((g) => groupQuote(g.profile, g.lines, dest));
  const subtotal = quotes.reduce((s, q) => s + q.subtotal, 0);
  const weightG = quotes.every((q) => q.weightG != null) ? quotes.reduce((s, q) => s + (q.weightG as number), 0) : null;
  const where = dest.area ? `${dest.area}, ${dest.state}` : dest.state;

  const missing = quotes.find((q) => q.options.length === 0);
  if (missing) {
    if (!missing.zone) return { ok: false, reason: "no_zone", message: `This seller doesn't deliver to ${where}.`, subtotal, weightG };
    if (missing.needsWeight) {
      return { ok: false, reason: "needs_weight", message: "The seller hasn't added this item's weight, so delivery can't be priced yet.", subtotal, weightG };
    }
    return { ok: false, reason: "no_rate", message: `This seller has no delivery option for this order to ${where}.`, subtotal, weightG };
  }
  if (quotes.length === 1) return { ok: true, options: quotes[0].options, subtotal, weightG };

  // Items priced by different profiles: one combined option, the cheapest
  // rate of each, delivered when the slowest arrives.
  const cheapest = quotes.map((q) => q.options[0]);
  const etaMin = cheapest.some((o) => o.etaMinDays == null) ? null : Math.max(...cheapest.map((o) => o.etaMinDays as number));
  const etaMax = cheapest.some((o) => o.etaMaxDays == null) ? null : Math.max(...cheapest.map((o) => o.etaMaxDays as number));
  return {
    ok: true,
    subtotal,
    weightG,
    options: [
      {
        id: "combined:" + cheapest.map((o) => o.id).join("+"),
        name: "Standard delivery",
        method: "combined",
        fee: cheapest.reduce((s, o) => s + o.fee, 0),
        etaMinDays: etaMin,
        etaMaxDays: etaMax,
        freeOver: null,
        source: "manual",
        zone: [...new Set(cheapest.map((o) => o.zone))].join(" + "),
        ...(cheapest.some((o) => o.unset) ? { unset: true } : {}),
      },
    ],
  };
}

// A listing's own simple pricing (migration 046) as a profile, for listings
// that don't use a shipping profile.
export function inlineProfile(p: {
  id: string;
  deliveryPricing: "free" | "fixed" | "location" | null;
  deliveryFee: number;
  deliveryRates: Record<string, number> | null;
}): ShippingProfile {
  const everywhere = (rate: ShippingRate): ShippingZone => ({ id: `inline:${p.id}:all`, name: "Nigeria", states: ["*"], areas: [], rates: [rate] });
  if (p.deliveryPricing === "free") {
    return { id: `inline:${p.id}`, name: "This listing", zones: [everywhere({ id: `inline:${p.id}:free`, name: "Free delivery", method: "free", amount: 0 })] };
  }
  if (p.deliveryPricing === "location") {
    const zones: ShippingZone[] = Object.entries(p.deliveryRates ?? {}).map(([state, fee]) => ({
      id: `inline:${p.id}:${state}`,
      name: state,
      states: [state],
      areas: [],
      rates: [{ id: `inline:${p.id}:${state}:rate`, name: "Delivery", method: "flat", amount: fee }],
    }));
    zones.push(everywhere({ id: `inline:${p.id}:other`, name: "Delivery", method: "flat", amount: p.deliveryFee }));
    return { id: `inline:${p.id}`, name: "This listing", zones };
  }
  return {
    id: `inline:${p.id}`,
    name: "This listing",
    unset: p.deliveryPricing == null && p.deliveryFee === 0,
    zones: [everywhere({ id: `inline:${p.id}:flat`, name: "Delivery", method: "flat", amount: p.deliveryFee })],
  };
}

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

// How a profile's delivery reads on a product page, without knowing where
// the buyer is: "Free delivery", "Free delivery over ₦50,000", "Delivery from
// ₦2,500", "Delivery priced by weight at checkout".
export function profileSummary(profile: ShippingProfile): string {
  if (profile.unset) return "Delivery fee: ask the seller";
  const rates = profile.zones.flatMap((z) => z.rates);
  if (rates.length === 0) return "Delivery: ask the seller";
  if (rates.every((r) => r.method === "free")) return "Free delivery";
  const priced = rates.filter((r) => r.method !== "weight");
  const lowest = priced.length ? Math.min(...priced.map((r) => (r.method === "free" ? 0 : r.amount))) : null;
  if (profile.freeShippingOver) return `Free delivery over ${naira(profile.freeShippingOver)}`;
  if (lowest === 0) return "Free delivery available";
  if (lowest != null) return `Delivery from ${naira(lowest)}`;
  return "Delivery priced by weight at checkout";
}

// "Arrives in 1–3 days", "Arrives tomorrow", or null without an estimate.
export function etaText(o: { etaMinDays: number | null; etaMaxDays: number | null }): string | null {
  const { etaMinDays: a, etaMaxDays: b } = o;
  if (a == null && b == null) return null;
  const lo = a ?? b ?? 0;
  const hi = b ?? a ?? 0;
  if (hi === 0) return "Arrives today";
  if (lo === hi) return hi === 1 ? "Arrives tomorrow" : `Arrives in ${hi} days`;
  return `Arrives in ${lo}–${hi} days`;
}
