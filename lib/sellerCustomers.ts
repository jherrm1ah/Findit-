// The seller dashboard's Customers view and listing filters
// (components/findit-app/SellerCustomers.jsx, SellerMenu.jsx). Pure.

type OrderLike = {
  id: string;
  userId: string;
  item: string;
  price: number;
  createdAt: string;
  paymentStatus: string;
  status?: string;
  deliveryAddress?: { fullName?: string; phone?: string } | null;
  buyerName?: string | null;
};

export type Customer = {
  userId: string;
  // From the delivery address they gave; null for pickup-only customers,
  // who never gave one.
  name: string | null;
  phone: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string;
  items: string[];
  latestOrder: OrderLike;
};

// Everyone who has PAID for an order from this seller, most recent first.
// Unpaid and cancelled orders aren't customers yet.
export function customersFromOrders(orders: OrderLike[]): Customer[] {
  const byBuyer = new Map<string, OrderLike[]>();
  for (const o of orders) {
    if (o.paymentStatus !== "paid" || o.status === "Cancelled") continue;
    byBuyer.set(o.userId, [...(byBuyer.get(o.userId) ?? []), o]);
  }
  return [...byBuyer.entries()]
    .map(([userId, list]) => {
      const sorted = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const withAddress = sorted.find((o) => o.deliveryAddress?.fullName);
      return {
        userId,
        // Their delivery name, else their account name (pickup customers).
        name: withAddress?.deliveryAddress?.fullName ?? sorted.find((o) => o.buyerName)?.buyerName ?? null,
        phone: withAddress?.deliveryAddress?.phone ?? null,
        orderCount: sorted.length,
        totalSpent: sorted.reduce((sum, o) => sum + o.price, 0),
        lastOrderAt: sorted[0].createdAt,
        items: [...new Set(sorted.map((o) => o.item))],
        latestOrder: sorted[0],
      };
    })
    .sort((a, b) => new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime());
}

export const LOW_STOCK_AT = 3;

// Low stock: 3 or fewer left, sold out included.
export const isLowStock = (p: { qty?: number | null }) => typeof p.qty === "number" && p.qty <= LOW_STOCK_AT;

export const isBoosted = (p: { boostedUntil?: string | null }, now = Date.now()) =>
  Boolean(p.boostedUntil && new Date(p.boostedUntil).getTime() > now);
