import { getDb, assertNoError } from "./db";

type Row = Record<string, unknown>;

// Real platform analytics — every point here is a live GROUP BY over actual
// rows (orders, users, sellers), never a projected or simulated number. The
// bucketing itself is pure and unit-tested (see analytics.test.ts); the only
// non-pure part is fetching the raw timestamps/amounts from Postgres.

export type DailyCount = { date: string; count: number };
export type DailyAmount = { date: string; amount: number };

export type PlatformAnalytics = {
  windowDays: number;
  orderVolume: DailyCount[];
  revenue: DailyAmount[];
  newUsers: DailyCount[];
  newSellers: DailyCount[];
};

function dayKey(iso: string): string {
  return iso.slice(0, 10); // timestamptz always renders as an ISO string starting YYYY-MM-DD
}

// The last `days` calendar days (UTC), oldest first, including today —
// every day appears even with zero activity, so a chart never has to guess
// whether a gap means "no data fetched" or "genuinely zero that day."
function lastNDays(days: number, now: Date): string[] {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function bucketCountsByDay(timestamps: string[], days: number, now: Date = new Date()): DailyCount[] {
  const buckets = new Map<string, number>(lastNDays(days, now).map((d) => [d, 0]));
  for (const ts of timestamps) {
    const key = dayKey(ts);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

export function bucketAmountsByDay(
  entries: Array<{ timestamp: string; amount: number }>,
  days: number,
  now: Date = new Date()
): DailyAmount[] {
  const buckets = new Map<string, number>(lastNDays(days, now).map((d) => [d, 0]));
  for (const { timestamp, amount } of entries) {
    const key = dayKey(timestamp);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + amount);
  }
  return [...buckets.entries()].map(([date, amount]) => ({ date, amount }));
}

function windowStartIso(days: number, now: Date): string {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start.toISOString();
}

export async function getPlatformAnalytics(days = 30): Promise<PlatformAnalytics> {
  const db = getDb();
  const now = new Date();
  const start = windowStartIso(days, now);

  const [ordersResult, paidResult, usersResult, sellersResult] = await Promise.all([
    db.from("orders").select("created_at").gte("created_at", start),
    db.from("orders").select("price, paid_at").eq("payment_status", "paid").gte("paid_at", start),
    db.from("users").select("created_at").gte("created_at", start),
    db.from("sellers").select("created_at").gte("created_at", start),
  ]);

  const orderRows = assertNoError(ordersResult, "loading orders for analytics") as Row[];
  const paidRows = assertNoError(paidResult, "loading paid orders for analytics") as Row[];
  const userRows = assertNoError(usersResult, "loading users for analytics") as Row[];
  const sellerRows = assertNoError(sellersResult, "loading sellers for analytics") as Row[];

  return {
    windowDays: days,
    orderVolume: bucketCountsByDay(orderRows.map((r) => r.created_at as string), days, now),
    revenue: bucketAmountsByDay(
      paidRows.map((r) => ({ timestamp: r.paid_at as string, amount: r.price as number })),
      days,
      now
    ),
    newUsers: bucketCountsByDay(userRows.map((r) => r.created_at as string), days, now),
    newSellers: bucketCountsByDay(sellerRows.map((r) => r.created_at as string), days, now),
  };
}
