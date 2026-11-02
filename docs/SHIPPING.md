# Shipping & delivery

How FindIt prices, quotes and tracks delivery. Built on what already existed:
one order per seller (the cart's fulfilment groups), the delivery address and
pickup choice at checkout, the price lock when payment starts, escrow, and
seller order statuses.

## Methods (a shipping rate's `method`)

| Method | How it works |
|---|---|
| `free` | The buyer pays nothing separately; the seller has priced delivery in. |
| `flat` | A fixed fee (per zone). |
| `price` | The fee depends on the seller-order's item value: brackets `[min_order, max_order)`. |
| `weight` | The fee depends on package weight: `amount` covers up to `base_weight_g`, then `per_extra_kg` for each extra kg started; brackets `[min_weight_g, max_weight_g]`. Never offered while any item has no weight. |
| `local` | The seller's own riders, within listed cities and neighbourhoods. |
| carrier | A live quote from a connected logistics provider. None is connected yet (see below), so none are offered; quotes would carry `source: "carrier"`. |
| pickup | The buyer collects from one of the seller's pickup locations. No fee, ever. |

A profile can also set `free_shipping_over`: from that order value up, every
rate in the profile costs ₦0 (shown as "Free over ₦X").

## Shipping profiles and zones

- **Profile** (`shipping_profiles`): a named set of zones and rates, e.g.
  "Small parcels" and "Furniture". One is the seller's default. A listing uses
  its own profile, else the seller's default profile, else its own simple
  pricing (Free / Fixed / By state, from migration 046).
- **Zone** (`shipping_zones`): where a profile delivers, as states (or `*`,
  everywhere else in Nigeria), and optionally cities or neighbourhoods
  (`areas`) for local delivery. The most specific match wins: an area match,
  then a state match, then `*`. No match means no delivery to that address.
- **Rate** (`shipping_rates`): one delivery option in a zone, with its method,
  amount, conditions and delivery estimate (`eta_min_days`, `eta_max_days`).

## Calculation (`lib/shipping/engine.ts`, pure and tested)

For one seller-order and a destination (state and area):
1. Group the order's lines by the profile that applies to each listing.
2. Per group: find the zone, keep the rates whose conditions hold (order
   value, weight), work out each fee, apply the free-shipping threshold.
3. One group: its rates are the buyer's options. Several groups (items with
   different profiles): one combined option, the sum of each group's
   cheapest rate, with the longest estimate.
4. A group with no deliverable rate: delivery isn't offered for this order
   to that address (pickup may be). A fee is never invented, and none is
   computed without a destination.

The server recomputes the quote when the buyer chooses (it never takes a fee
from the browser), stores a snapshot of the chosen option on the order
(`orders.shipping_option`), and the existing payment lock then fixes the
method and price. After the lock, an address change that would change the fee
is refused.

## Money

- `orders.item_price` (goods), `orders.delivery_fee` (delivery) and
  `orders.price` (= item_price + delivery_fee, what the buyer pays) stay
  separate, as before. `orders_price_includes_delivery` enforces it.
- FindIt's fee is charged on the goods only; the seller receives the whole
  delivery fee.
- Free delivery is recorded as such (`shipping_option.method = "free"`, or the
  threshold), so "₦0 delivery because it was free" and "₦0 because not set"
  are distinguishable (`delivery_fee_unset`).
- Refunds return what the buyer paid (`price`, including delivery).

## Multi-seller orders

A cart becomes one order per seller (and per compatible delivery choice).
Each order carries its own items, delivery choice, fee, address or pickup
location, shipment and tracking, independently.

## Shipments and tracking

`shipments` (one per order and dispatch) and `shipment_events` (its history):
the seller adds the carrier and tracking reference when dispatching, and
moves it along (in transit, out for delivery, delivered). A connected carrier
would add events through its webhook (`source: "carrier"`).

## Carriers (`lib/shipping/carriers.ts`)

A provider plugs in through one interface: `quote`, `createShipment`,
`cancelShipment`, `track`, `parseWebhook`. A provider is only offered when its
credentials are configured, and none is today.

What we could verify (2026-11):
- **Shipbubble:** public REST API (test keys `sb_sandbox…`, live keys
  `sb_prod…`, bearer auth) with rates (all or selected couriers), shipment
  create/cancel, tracking, and webhooks. This is the most promising first
  integration. Endpoint details still need checking against
  docs.shipbubble.com, which this build environment couldn't reach.
- **Sendbox:** an API key comes from the Sendbox dashboard; quotes take items
  and weight; it has status webhooks (per its WooCommerce plugin). We couldn't
  find official API reference docs.
- **GIG Logistics:** account-based partner API (third-party endpoints at
  `thirdpartynode.theagilitysystems.com`) with rates, shipment scheduling and
  waybill tracking, per its WooCommerce plugin. Access needs a GIG merchant
  account and credentials.

## Database

`supabase/migrations/047_shipping.sql`: `seller_locations` (fulfilment and
pickup, with hours and instructions), `shipping_profiles`, `shipping_zones`,
`shipping_rates`, `shipping_quotes` (carrier quotes), `shipments`,
`shipment_events`; products gain weight, dimensions and `shipping_profile_id`;
orders gain `shipping_option`, `pickup_location`, `pickup_status` and
`package_weight_g`. Like every table here: RLS on, no policies, server-only
access; every seller route checks the seller owns what it touches.
