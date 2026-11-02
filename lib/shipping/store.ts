import { getDb, assertNoError } from "../db";
import { ValidationError } from "../errors";
import { NIGERIAN_STATES, type DeliveryPricing, type DeliveryRates } from "../deliveryShared";
import { parseDeliveryFee } from "../delivery";
import {
  inlineProfile,
  profileSummary,
  quoteShipping,
  type Destination,
  type QuoteLine,
  type RateMethod,
  type ShippingProfile,
  type ShippingQuote,
  type ShippingRate,
  type ShippingZone,
} from "./engine";

// Shipping configuration in the database: a seller's profiles (zones and
// rates) and locations (fulfilment and pickup), and quoting an order with
// them. Server-only; every write is scoped to the seller who owns it. See
// docs/SHIPPING.md.

type Row = Record<string, unknown>;
const id = (prefix: string) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export type SellerLocation = {
  id: string;
  name: string;
  address: string;
  area: string;
  state: string;
  phone: string | null;
  shipsFrom: boolean;
  pickupEnabled: boolean;
  pickupHours: string | null;
  pickupInstructions: string | null;
  isDefault: boolean;
  active: boolean;
};

export type SellerProfile = ShippingProfile & { isDefault: boolean; locationId: string | null; productCount?: number };

const rowToLocation = (r: Row): SellerLocation => ({
  id: r.id as string,
  name: r.name as string,
  address: r.address as string,
  area: r.area as string,
  state: r.state as string,
  phone: (r.phone as string | null) ?? null,
  shipsFrom: Boolean(r.ships_from),
  pickupEnabled: Boolean(r.pickup_enabled),
  pickupHours: (r.pickup_hours as string | null) ?? null,
  pickupInstructions: (r.pickup_instructions as string | null) ?? null,
  isDefault: Boolean(r.is_default),
  active: r.active !== false,
});

const rowToRate = (r: Row): ShippingRate => ({
  id: r.id as string,
  name: r.name as string,
  method: r.method as RateMethod,
  amount: (r.amount as number) ?? 0,
  minOrder: (r.min_order as number | null) ?? null,
  maxOrder: (r.max_order as number | null) ?? null,
  minWeightG: (r.min_weight_g as number | null) ?? null,
  maxWeightG: (r.max_weight_g as number | null) ?? null,
  baseWeightG: (r.base_weight_g as number | null) ?? null,
  perExtraKg: (r.per_extra_kg as number | null) ?? null,
  etaMinDays: (r.eta_min_days as number | null) ?? null,
  etaMaxDays: (r.eta_max_days as number | null) ?? null,
});

// Profiles with their zones and rates, in three queries for any number.
async function loadProfiles(rows: Row[]): Promise<SellerProfile[]> {
  if (rows.length === 0) return [];
  const db = getDb();
  const zoneRows = assertNoError(
    await db.from("shipping_zones").select("*").in("profile_id", rows.map((r) => r.id as string)),
    "loading shipping zones"
  ) as Row[];
  const rateRows = zoneRows.length
    ? (assertNoError(await db.from("shipping_rates").select("*").in("zone_id", zoneRows.map((z) => z.id as string)), "loading shipping rates") as Row[])
    : [];
  const bySort = (a: Row, b: Row) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0);
  return rows.map((p) => ({
    id: p.id as string,
    name: p.name as string,
    isDefault: Boolean(p.is_default),
    freeShippingOver: (p.free_shipping_over as number | null) ?? null,
    locationId: (p.location_id as string | null) ?? null,
    zones: zoneRows
      .filter((z) => z.profile_id === p.id)
      .sort(bySort)
      .map<ShippingZone>((z) => ({
        id: z.id as string,
        name: z.name as string,
        states: (z.states as string[]) ?? [],
        areas: (z.areas as string[]) ?? [],
        rates: rateRows.filter((r) => r.zone_id === z.id).sort(bySort).map(rowToRate),
      })),
  }));
}

export async function getShippingConfig(sellerId: string): Promise<{ profiles: SellerProfile[]; locations: SellerLocation[] }> {
  const db = getDb();
  const [profileRows, locationRows, productRows] = await Promise.all([
    db.from("shipping_profiles").select("*").eq("seller_id", sellerId).order("created_at", { ascending: true }),
    db.from("seller_locations").select("*").eq("seller_id", sellerId).order("created_at", { ascending: true }),
    db.from("products").select("shipping_profile_id").eq("seller_id", sellerId),
  ]);
  const profiles = await loadProfiles(assertNoError(profileRows, "loading shipping profiles") as Row[]);
  const counts = new Map<string, number>();
  for (const r of assertNoError(productRows, "counting listings per profile") as Row[]) {
    const pid = r.shipping_profile_id as string | null;
    if (pid) counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  return {
    profiles: profiles.map((p) => ({ ...p, productCount: counts.get(p.id) ?? 0 })),
    locations: (assertNoError(locationRows, "loading locations") as Row[]).map(rowToLocation),
  };
}

/* --------------------------------- validation --------------------------------- */

const STATES = NIGERIAN_STATES as readonly string[];
const METHODS: RateMethod[] = ["free", "flat", "price", "weight", "local"];
const text = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const optInt = (v: unknown, label: string, { min = 0, max = 100_000_000 } = {}): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/[₦,\s]/g, ""));
  if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError(`${label} must be a whole number${min > 0 ? ` from ${min}` : ""}.`);
  return n;
};

export type ProfileInput = {
  id?: string;
  name: string;
  isDefault?: boolean;
  freeShippingOver?: number | string | null;
  locationId?: string | null;
  zones: { name: string; states: string[]; areas?: string[]; rates: Partial<Record<keyof ShippingRate, unknown>>[] }[];
};

function normalizeRate(r: Partial<Record<keyof ShippingRate, unknown>>, where: string): Omit<ShippingRate, "id"> {
  const name = text(r.name, 40);
  if (!name) throw new ValidationError(`Name each delivery rate in ${where} (e.g. "Standard").`);
  const method = r.method as RateMethod;
  if (!METHODS.includes(method)) throw new ValidationError(`Choose how "${name}" is priced.`);
  const amount = method === "free" ? 0 : parseDeliveryFee(r.amount);
  const rate: Omit<ShippingRate, "id"> = {
    name,
    method,
    amount,
    minOrder: method === "price" ? optInt(r.minOrder, "Minimum order value") : null,
    maxOrder: method === "price" ? optInt(r.maxOrder, "Maximum order value", { min: 1 }) : null,
    minWeightG: method === "weight" ? optInt(r.minWeightG, "Minimum weight") : null,
    maxWeightG: method === "weight" ? optInt(r.maxWeightG, "Maximum weight", { min: 1 }) : null,
    baseWeightG: method === "weight" ? optInt(r.baseWeightG, "Weight included") : null,
    perExtraKg: method === "weight" ? optInt(r.perExtraKg, "Fee per extra kg") : null,
    etaMinDays: optInt(r.etaMinDays, "Delivery estimate", { max: 60 }),
    etaMaxDays: optInt(r.etaMaxDays, "Delivery estimate", { max: 60 }),
  };
  if (rate.minOrder != null && rate.maxOrder != null && rate.minOrder >= rate.maxOrder) {
    throw new ValidationError(`In "${name}", the order value "from" must be less than "up to".`);
  }
  if (rate.minWeightG != null && rate.maxWeightG != null && rate.minWeightG > rate.maxWeightG) {
    throw new ValidationError(`In "${name}", the weight "from" must be less than "up to".`);
  }
  if (rate.etaMinDays != null && rate.etaMaxDays != null && rate.etaMinDays > rate.etaMaxDays) {
    throw new ValidationError(`In "${name}", the fastest delivery estimate can't be longer than the slowest.`);
  }
  if (method === "price" && rate.minOrder == null && rate.maxOrder == null) {
    throw new ValidationError(`"${name}" is priced by order value: add the order values it applies to.`);
  }
  return rate;
}

export function normalizeProfileInput(input: ProfileInput) {
  const name = text(input?.name, 60);
  if (!name) throw new ValidationError("Give the shipping profile a name, e.g. \"Small parcels\".");
  const zones = Array.isArray(input.zones) ? input.zones : [];
  if (zones.length === 0) throw new ValidationError("Add at least one delivery zone.");
  if (zones.length > 40) throw new ValidationError("A profile can have up to 40 zones.");
  const seen = new Set<string>();
  const cleanZones = zones.map((z, i) => {
    const zName = text(z?.name, 60) || `Zone ${i + 1}`;
    const states = [...new Set((Array.isArray(z.states) ? z.states : []).map((s) => String(s)))];
    if (states.length === 0) throw new ValidationError(`Choose the states "${zName}" covers.`);
    for (const s of states) if (s !== "*" && !STATES.includes(s)) throw new ValidationError(`"${s}" isn't a Nigerian state.`);
    const areas = [...new Set((Array.isArray(z.areas) ? z.areas : []).map((a) => text(a, 60)).filter(Boolean))].slice(0, 100);
    const key = `${[...states].sort().join(",")}|${[...areas].map((a) => a.toLowerCase()).sort().join(",")}`;
    if (seen.has(key)) throw new ValidationError(`Two zones cover exactly the same place ("${zName}"). Merge them.`);
    seen.add(key);
    const rates = Array.isArray(z.rates) ? z.rates : [];
    if (rates.length === 0) throw new ValidationError(`Add at least one delivery rate to "${zName}".`);
    if (rates.length > 20) throw new ValidationError(`"${zName}" can have up to 20 rates.`);
    return { name: zName, states, areas, rates: rates.map((r) => normalizeRate(r, `"${zName}"`)) };
  });
  return {
    name,
    isDefault: Boolean(input.isDefault),
    freeShippingOver: optInt(input.freeShippingOver, "Free shipping threshold", { min: 1 }),
    locationId: input.locationId ? String(input.locationId) : null,
    zones: cleanZones,
  };
}

/* ----------------------------------- writes ----------------------------------- */

async function assertOwned(table: string, rowId: string, sellerId: string, what: string): Promise<void> {
  const row = assertNoError(await getDb().from(table).select("seller_id").eq("id", rowId).maybeSingle(), `checking ${what}`) as Row | null;
  if (!row || row.seller_id !== sellerId) throw new ValidationError(`That ${what} isn't yours.`);
}

export async function saveShippingProfile(sellerId: string, input: ProfileInput): Promise<SellerProfile> {
  const clean = normalizeProfileInput(input);
  const db = getDb();
  if (clean.locationId) await assertOwned("seller_locations", clean.locationId, sellerId, "location");
  const existingDefault = assertNoError(
    await db.from("shipping_profiles").select("id").eq("seller_id", sellerId).eq("is_default", true),
    "checking default profile"
  ) as Row[];

  let profileId = input.id;
  if (profileId) {
    await assertOwned("shipping_profiles", profileId, sellerId, "shipping profile");
  } else {
    profileId = id("shp_");
  }
  // The seller's first profile is their default; making one default unsets the other.
  const makeDefault = clean.isDefault || existingDefault.length === 0 || (existingDefault.length === 1 && existingDefault[0].id === profileId && clean.isDefault !== false && input.isDefault !== false);
  if (makeDefault) {
    assertNoError(await db.from("shipping_profiles").update({ is_default: false }).eq("seller_id", sellerId).neq("id", profileId), "clearing default profile");
  }
  const fields = {
    name: clean.name,
    is_default: makeDefault,
    free_shipping_over: clean.freeShippingOver,
    location_id: clean.locationId,
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    assertNoError(await db.from("shipping_profiles").update(fields).eq("id", profileId).eq("seller_id", sellerId), "saving shipping profile");
    assertNoError(await db.from("shipping_zones").delete().eq("profile_id", profileId), "replacing zones");
  } else {
    assertNoError(await db.from("shipping_profiles").insert({ id: profileId, seller_id: sellerId, ...fields }), "creating shipping profile");
  }
  // Zones and rates are replaced as a whole: what the seller sees is what's saved.
  for (const [zi, z] of clean.zones.entries()) {
    const zoneId = id("shz_");
    assertNoError(
      await db.from("shipping_zones").insert({ id: zoneId, profile_id: profileId, name: z.name, states: z.states, areas: z.areas, sort_order: zi }),
      "saving zone"
    );
    if (z.rates.length) {
      assertNoError(
        await db.from("shipping_rates").insert(
          z.rates.map((r, ri) => ({
            id: id("shr_"),
            zone_id: zoneId,
            name: r.name,
            method: r.method,
            amount: r.amount,
            min_order: r.minOrder,
            max_order: r.maxOrder,
            min_weight_g: r.minWeightG,
            max_weight_g: r.maxWeightG,
            base_weight_g: r.baseWeightG,
            per_extra_kg: r.perExtraKg,
            eta_min_days: r.etaMinDays,
            eta_max_days: r.etaMaxDays,
            sort_order: ri,
          }))
        ),
        "saving rates"
      );
    }
  }
  const [saved] = await loadProfiles(assertNoError(await db.from("shipping_profiles").select("*").eq("id", profileId), "reloading profile") as Row[]);
  return saved;
}

// Listings on a deleted profile fall back to their own pricing, or the
// seller's default profile (products.shipping_profile_id is set null).
export async function deleteShippingProfile(sellerId: string, profileId: string): Promise<void> {
  await assertOwned("shipping_profiles", profileId, sellerId, "shipping profile");
  const db = getDb();
  const wasDefault = assertNoError(await db.from("shipping_profiles").select("is_default").eq("id", profileId).maybeSingle(), "loading profile") as Row | null;
  assertNoError(await db.from("products").update({ shipping_profile_id: null }).eq("shipping_profile_id", profileId), "detaching listings");
  assertNoError(await db.from("shipping_profiles").delete().eq("id", profileId).eq("seller_id", sellerId), "deleting shipping profile");
  if (wasDefault?.is_default) {
    const next = assertNoError(
      await db.from("shipping_profiles").select("id").eq("seller_id", sellerId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
      "choosing a new default"
    ) as Row | null;
    if (next) assertNoError(await db.from("shipping_profiles").update({ is_default: true }).eq("id", next.id as string), "setting default");
  }
}

export type LocationInput = Partial<Omit<SellerLocation, "id">> & { id?: string };

export async function saveSellerLocation(sellerId: string, input: LocationInput): Promise<SellerLocation> {
  const name = text(input.name, 60);
  const address = text(input.address, 200);
  const area = text(input.area, 80);
  const state = String(input.state ?? "");
  if (!name) throw new ValidationError("Name this location, e.g. \"Ikeja shop\".");
  if (address.length < 5) throw new ValidationError("Add the street address.");
  if (area.length < 2) throw new ValidationError("Add the area or city.");
  if (!STATES.includes(state)) throw new ValidationError("Choose the state.");
  const pickupEnabled = Boolean(input.pickupEnabled);
  const fields = {
    name,
    address,
    area,
    state,
    phone: text(input.phone, 20) || null,
    ships_from: input.shipsFrom !== false,
    pickup_enabled: pickupEnabled,
    pickup_hours: pickupEnabled ? text(input.pickupHours, 120) || null : null,
    pickup_instructions: pickupEnabled ? text(input.pickupInstructions, 300) || null : null,
    active: input.active !== false,
    updated_at: new Date().toISOString(),
  };
  if (pickupEnabled && !fields.pickup_hours) throw new ValidationError("Add your pickup hours, e.g. \"Mon–Sat, 9am–6pm\".");
  const db = getDb();
  const existing = assertNoError(await db.from("seller_locations").select("id").eq("seller_id", sellerId), "loading locations") as Row[];
  let locationId = input.id;
  if (locationId) await assertOwned("seller_locations", locationId, sellerId, "location");
  else locationId = id("loc_");
  const isDefault = Boolean(input.isDefault) || existing.length === 0 || (existing.length === 1 && existing[0].id === locationId);
  if (isDefault) assertNoError(await db.from("seller_locations").update({ is_default: false }).eq("seller_id", sellerId).neq("id", locationId), "clearing default location");
  if (input.id) {
    assertNoError(await db.from("seller_locations").update({ ...fields, is_default: isDefault }).eq("id", locationId).eq("seller_id", sellerId), "saving location");
  } else {
    assertNoError(await db.from("seller_locations").insert({ id: locationId, seller_id: sellerId, ...fields, is_default: isDefault }), "adding location");
  }
  const row = assertNoError(await db.from("seller_locations").select("*").eq("id", locationId).maybeSingle(), "reloading location") as Row;
  return rowToLocation(row);
}

export async function deleteSellerLocation(sellerId: string, locationId: string): Promise<void> {
  await assertOwned("seller_locations", locationId, sellerId, "location");
  assertNoError(await getDb().from("seller_locations").delete().eq("id", locationId).eq("seller_id", sellerId), "deleting location");
}

export async function assertProfileBelongsTo(profileId: string, sellerId: string | null): Promise<void> {
  if (!sellerId) throw new ValidationError("Set up your store before using shipping profiles.");
  await assertOwned("shipping_profiles", profileId, sellerId, "shipping profile");
}

/* ----------------------------------- reads ----------------------------------- */

export async function pickupLocationsForSeller(sellerId: string | null): Promise<SellerLocation[]> {
  if (!sellerId) return [];
  const rows = assertNoError(
    await getDb().from("seller_locations").select("*").eq("seller_id", sellerId).eq("pickup_enabled", true).eq("active", true),
    "loading pickup locations"
  ) as Row[];
  return rows.map(rowToLocation);
}

type ProductShippingRow = {
  id: string;
  seller_id: string | null;
  weight_g: number | null;
  shipping_profile_id: string | null;
  delivery_pricing: DeliveryPricing | null;
  delivery_fee: number;
  delivery_rates: DeliveryRates | null;
};

// The profile that prices each listing: its own profile, else its own simple
// pricing, else the seller's default profile, else "not set".
async function profilesForProducts(rows: ProductShippingRow[]): Promise<Map<string, ShippingProfile>> {
  const db = getDb();
  const profileIds = [...new Set(rows.map((r) => r.shipping_profile_id).filter(Boolean) as string[])];
  const sellerIds = [...new Set(rows.filter((r) => !r.shipping_profile_id && !r.delivery_pricing && r.seller_id).map((r) => r.seller_id as string))];
  const [explicit, defaults] = await Promise.all([
    profileIds.length
      ? loadProfiles(assertNoError(await db.from("shipping_profiles").select("*").in("id", profileIds), "loading listing profiles") as Row[])
      : Promise.resolve([] as SellerProfile[]),
    sellerIds.length
      ? db.from("shipping_profiles").select("*").in("seller_id", sellerIds).eq("is_default", true).then((r) => loadProfiles(assertNoError(r, "loading default profiles") as Row[]))
      : Promise.resolve([] as SellerProfile[]),
  ]);
  const byId = new Map(explicit.map((p) => [p.id, p]));
  const defaultBySeller = new Map<string, ShippingProfile>();
  if (defaults.length) {
    const owners = assertNoError(await db.from("shipping_profiles").select("id, seller_id").in("id", defaults.map((d) => d.id)), "loading profile owners") as Row[];
    for (const o of owners) {
      const p = defaults.find((d) => d.id === o.id);
      if (p) defaultBySeller.set(o.seller_id as string, p);
    }
  }
  const out = new Map<string, ShippingProfile>();
  for (const r of rows) {
    const inline = () => inlineProfile({ id: r.id, deliveryPricing: r.delivery_pricing, deliveryFee: r.delivery_fee ?? 0, deliveryRates: r.delivery_rates });
    const p =
      (r.shipping_profile_id && byId.get(r.shipping_profile_id)) ||
      (r.delivery_pricing ? inline() : null) ||
      (r.seller_id && defaultBySeller.get(r.seller_id)) ||
      inline();
    out.set(r.id, p);
  }
  return out;
}

const PRODUCT_SHIPPING_COLUMNS = "id, seller_id, weight_g, shipping_profile_id, delivery_pricing, delivery_fee, delivery_rates";

// "Free delivery" / "Delivery from ₦2,500" for each listing, for product pages.
export async function shippingSummaries(productIds: string[]): Promise<Map<string, string>> {
  if (productIds.length === 0) return new Map();
  const rows = assertNoError(
    await getDb().from("products").select(PRODUCT_SHIPPING_COLUMNS).in("id", productIds),
    "loading listing shipping"
  ) as ProductShippingRow[];
  const profiles = await profilesForProducts(rows);
  return new Map(rows.map((r) => [r.id, profileSummary(profiles.get(r.id) as ShippingProfile)]));
}

export type OrderForQuote = {
  lines: { productId: string; qty: number; unitPrice: number }[];
  itemPrice: number;
  deliveryFeeQuote: number;
  deliveryRates: DeliveryRates | null;
  deliveryFeeUnset: boolean;
};

// The delivery options for an order to a destination. Orders with listings
// use the listings' current shipping settings (until payment fixes the
// price); orders from an accepted offer, or from before itemised orders, use
// the fee agreed when the order was made.
export async function quoteOrderShipping(order: OrderForQuote, dest: Destination): Promise<ShippingQuote> {
  if (order.lines.length > 0) {
    const rows = assertNoError(
      await getDb().from("products").select(PRODUCT_SHIPPING_COLUMNS).in("id", order.lines.map((l) => l.productId)),
      "loading order listings"
    ) as ProductShippingRow[];
    if (rows.length === new Set(order.lines.map((l) => l.productId)).size) {
      const profiles = await profilesForProducts(rows);
      const weights = new Map(rows.map((r) => [r.id, r.weight_g]));
      const lines: QuoteLine[] = order.lines.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        unitPrice: l.unitPrice,
        weightG: weights.get(l.productId) ?? null,
        profile: profiles.get(l.productId) as ShippingProfile,
      }));
      return quoteShipping(lines, dest);
    }
    // A listing was deleted since: fall back to the fee recorded on the order.
  }
  const profile = inlineProfile({
    id: "order",
    deliveryPricing: order.deliveryRates && Object.keys(order.deliveryRates).length ? "location" : order.deliveryFeeUnset ? null : "fixed",
    deliveryFee: order.deliveryFeeQuote,
    deliveryRates: order.deliveryRates,
  });
  if (!order.deliveryFeeUnset && order.deliveryFeeQuote === 0 && !(order.deliveryRates && Object.keys(order.deliveryRates).length)) {
    return quoteShipping([{ productId: "order", qty: 1, unitPrice: order.itemPrice, weightG: null, profile: inlineProfile({ id: "order", deliveryPricing: "free", deliveryFee: 0, deliveryRates: null }) }], dest);
  }
  return quoteShipping([{ productId: "order", qty: 1, unitPrice: order.itemPrice, weightG: null, profile }], dest);
}
