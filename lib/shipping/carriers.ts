// Logistics providers, behind one interface, so a new one plugs in without
// touching the shipping calculator (lib/shipping/engine.ts). None is
// connected yet: FindIt never shows a carrier quote it didn't get from the
// carrier, so until an adapter is built against a provider's real API, with
// real credentials, carriers simply aren't offered. See docs/SHIPPING.md.

import type { Destination } from "./engine";

export type CarrierParcel = { weightG: number; lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null; valueNaira: number };
export type CarrierAddress = Destination & { name: string; phone: string; address: string };

export type CarrierQuote = {
  provider: string; // e.g. "shipbubble"
  courier: string; // the courier the provider quotes for
  service: string;
  fee: number; // naira, as quoted by the provider
  etaMinDays: number | null;
  etaMaxDays: number | null;
  quoteRef: string; // the provider's id for booking this quote
  expiresAt: string | null;
};

export type CarrierShipment = { trackingNumber: string; trackingUrl: string | null; labelUrl: string | null; providerRef: string };
export type CarrierTrackingEvent = { status: string; description: string; location: string | null; occurredAt: string };

export interface CarrierAdapter {
  key: string;
  name: string;
  // Live quotes for a parcel. Throws if the provider can't be reached;
  // returns [] if it has no service for the route.
  quote(from: CarrierAddress, to: CarrierAddress, parcel: CarrierParcel): Promise<CarrierQuote[]>;
  createShipment(quoteRef: string, from: CarrierAddress, to: CarrierAddress, parcel: CarrierParcel): Promise<CarrierShipment>;
  cancelShipment?(providerRef: string): Promise<void>;
  track(trackingNumber: string): Promise<CarrierTrackingEvent[]>;
  // Turns the provider's webhook body into tracking events (after verifying
  // its signature).
  parseWebhook?(rawBody: string, headers: Record<string, string>): CarrierTrackingEvent[] | null;
}

export type ProviderInfo = {
  key: string;
  name: string;
  website: string;
  // What could be verified about the provider's API, in plain words.
  verified: string;
  capabilities: { quotes: boolean; shipments: boolean; labels: boolean | null; tracking: boolean; cancellation: boolean | null; webhooks: boolean | null };
  // The environment settings an adapter would read.
  credentials: string[];
};

// Providers looked at (November 2026). "capabilities" is what their own
// material says they support; null = not confirmed.
export const PROVIDERS: ProviderInfo[] = [
  {
    key: "shipbubble",
    name: "Shipbubble",
    website: "https://shipbubble.com",
    verified:
      "Public REST API with test and live keys: rates (all or selected couriers), shipment create and cancel, tracking, webhooks. Endpoint details to be confirmed against docs.shipbubble.com before building.",
    capabilities: { quotes: true, shipments: true, labels: null, tracking: true, cancellation: true, webhooks: true },
    credentials: ["SHIPBUBBLE_API_KEY"],
  },
  {
    key: "sendbox",
    name: "Sendbox",
    website: "https://sendbox.co",
    verified: "API key from the Sendbox dashboard; quotes use items and weight; status webhooks (per its WooCommerce plugin). Official API reference not found.",
    capabilities: { quotes: true, shipments: true, labels: null, tracking: true, cancellation: null, webhooks: true },
    credentials: ["SENDBOX_API_KEY"],
  },
  {
    key: "gig",
    name: "GIG Logistics",
    website: "https://giglogistics.com",
    verified: "Partner API for merchants with GIG credentials: rates, shipment scheduling, waybill tracking (per its WooCommerce plugin). No self-serve sign-up found.",
    capabilities: { quotes: true, shipments: true, labels: null, tracking: true, cancellation: null, webhooks: null },
    credentials: ["GIG_API_USERNAME", "GIG_API_PASSWORD"],
  },
];

// Adapters that are built and verified. Empty on purpose until one is.
const ADAPTERS: CarrierAdapter[] = [];

export function connectedCarriers(): CarrierAdapter[] {
  return ADAPTERS.filter((a) => {
    const info = PROVIDERS.find((p) => p.key === a.key);
    return Boolean(info && info.credentials.every((c) => process.env[c]));
  });
}

export type ProviderStatus = ProviderInfo & { status: "connected" | "needs_credentials" | "not_built" };

export function providerStatuses(): ProviderStatus[] {
  return PROVIDERS.map((p) => {
    const adapter = ADAPTERS.find((a) => a.key === p.key);
    const hasCreds = p.credentials.every((c) => process.env[c]);
    return { ...p, status: adapter ? (hasCreds ? "connected" : "needs_credentials") : "not_built" };
  });
}
