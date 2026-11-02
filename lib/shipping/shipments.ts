import { getDb, assertNoError } from "../db";
import { ValidationError } from "../errors";

// Shipments and their tracking history (docs/SHIPPING.md). Driven by the
// order's own statuses, so tracking always agrees with the order: the seller
// dispatching creates the shipment (with the carrier and tracking reference
// when they have one), "Out for delivery" and the buyer confirming add to it.
// A connected carrier would add events through its webhook (source "carrier").

type Row = Record<string, unknown>;
const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export type ShipmentStatus = "pending" | "in_transit" | "out_for_delivery" | "delivered" | "failed" | "returned" | "cancelled";
export type ShipmentEvent = { status: ShipmentStatus | string; description: string | null; location: string | null; source: "seller" | "carrier" | "system"; occurredAt: string };
export type ShipmentView = {
  id: string;
  carrier: string;
  service: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: ShipmentStatus;
  shippedAt: string | null;
  deliveredAt: string | null;
  events: ShipmentEvent[];
};
export type TrackingInput = { carrier?: unknown; trackingNumber?: unknown; trackingUrl?: unknown };

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Carrier and tracking details as the seller typed them, checked.
export function normalizeTracking(input: TrackingInput | null | undefined): { carrier: string | null; trackingNumber: string | null; trackingUrl: string | null } {
  const carrier = clean(input?.carrier, 60) || null;
  const trackingNumber = clean(input?.trackingNumber, 80) || null;
  const trackingUrl = clean(input?.trackingUrl, 500) || null;
  if (trackingUrl && !/^https:\/\/[^\s]+$/i.test(trackingUrl)) throw new ValidationError("The tracking link must start with https://");
  return { carrier, trackingNumber, trackingUrl };
}

// Adds a step to the order's shipment, creating it on first dispatch.
export async function recordShipmentEvent(
  order: { id: string; sellerId: string | null },
  status: ShipmentStatus,
  description: string,
  opts: { tracking?: TrackingInput | null; source?: ShipmentEvent["source"] } = {}
): Promise<void> {
  const db = getDb();
  const tracking = normalizeTracking(opts.tracking);
  const now = new Date().toISOString();
  const existing = assertNoError(
    await db.from("shipments").select("*").eq("order_id", order.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    "loading shipment"
  ) as Row | null;
  let shipmentId = existing?.id as string | undefined;
  const timing = {
    ...(status === "delivered" ? { delivered_at: now } : {}),
    ...(status === "in_transit" && !existing?.shipped_at ? { shipped_at: now } : {}),
  };
  if (!shipmentId) {
    shipmentId = newId("shpm_");
    assertNoError(
      await db.from("shipments").insert({
        id: shipmentId,
        order_id: order.id,
        seller_id: order.sellerId,
        carrier: tracking.carrier ?? "Seller's own delivery",
        tracking_number: tracking.trackingNumber,
        tracking_url: tracking.trackingUrl,
        status,
        shipped_at: now,
        ...timing,
      }),
      "creating shipment"
    );
  } else {
    assertNoError(
      await db
        .from("shipments")
        .update({
          status,
          updated_at: now,
          ...timing,
          ...(tracking.carrier ? { carrier: tracking.carrier } : {}),
          ...(tracking.trackingNumber ? { tracking_number: tracking.trackingNumber } : {}),
          ...(tracking.trackingUrl ? { tracking_url: tracking.trackingUrl } : {}),
        })
        .eq("id", shipmentId),
      "updating shipment"
    );
  }
  assertNoError(
    await db.from("shipment_events").insert({ id: newId("shev_"), shipment_id: shipmentId, status, description, source: opts.source ?? "seller", occurred_at: now }),
    "recording tracking event"
  );
}

// The latest shipment (with its history) for each order.
export async function shipmentsForOrders(orderIds: string[]): Promise<Map<string, ShipmentView>> {
  if (orderIds.length === 0) return new Map();
  const db = getDb();
  const ships = assertNoError(await db.from("shipments").select("*").in("order_id", orderIds), "loading shipments") as Row[];
  if (ships.length === 0) return new Map();
  const events = assertNoError(await db.from("shipment_events").select("*").in("shipment_id", ships.map((s) => s.id as string)), "loading tracking") as Row[];
  const out = new Map<string, ShipmentView>();
  for (const s of [...ships].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    out.set(s.order_id as string, {
      id: s.id as string,
      carrier: s.carrier as string,
      service: (s.service as string | null) ?? null,
      trackingNumber: (s.tracking_number as string | null) ?? null,
      trackingUrl: (s.tracking_url as string | null) ?? null,
      status: s.status as ShipmentStatus,
      shippedAt: (s.shipped_at as string | null) ?? null,
      deliveredAt: (s.delivered_at as string | null) ?? null,
      events: events
        .filter((e) => e.shipment_id === s.id)
        .sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)))
        .map((e) => ({
          status: e.status as string,
          description: (e.description as string | null) ?? null,
          location: (e.location as string | null) ?? null,
          source: e.source as ShipmentEvent["source"],
          occurredAt: e.occurred_at as string,
        })),
    });
  }
  return out;
}
