import { getDb } from "./db";
import { SELLERS } from "./catalogue";

type Row = Record<string, unknown>;

export type Product = {
  id: string;
  category: string;
  name: string;
  price: number;
  seller: string;
  rating: number;
  verified: boolean;
  testBatch: boolean;
  marketingCat: string | null;
  loc: string;
  art: number;
};

export type Order = {
  id: string;
  item: string;
  seller: string;
  price: number;
  status: string;
  date: string;
  canReview: boolean;
  reviewed: boolean;
  myRating: number | null;
  reviewComment: string | null;
  requestId: string | null;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  unread: boolean;
  time: string;
};

export type Seller = {
  id: string;
  name: string;
  city: string;
  docs: string;
  status: "pending" | "approved" | "rejected";
};

export type Offer = {
  id: string;
  requestId: string;
  seller: string;
  verified: boolean;
  rating: number;
  orders: number;
  price: number;
  delivery: string;
  eta: string;
  condition: string;
  warranty: string;
  note: string;
  accepted: boolean;
};

export type RequestRow = {
  id: string;
  title: string;
  description: string | null;
  customer: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  qty: number;
  location: string;
  condition: string;
  status: string;
  createdAt: string;
  posted: string;
  offerCount: number;
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function rowToProduct(row: Row): Product {
  return {
    id: row.id as string,
    category: row.category as string,
    name: row.name as string,
    price: row.price as number,
    seller: row.seller as string,
    rating: row.rating as number,
    verified: Boolean(row.verified),
    testBatch: Boolean(row.test_batch),
    marketingCat: (row.marketing_cat as string | null) ?? null,
    loc: row.loc as string,
    art: row.art as number,
  };
}

export function listProducts(): Product[] {
  const rows = getDb().prepare("SELECT * FROM products").all() as Row[];
  return rows.map(rowToProduct);
}

function rowToOrder(row: Row): Order {
  return {
    id: row.id as string,
    item: row.item as string,
    seller: row.seller as string,
    price: row.price as number,
    status: row.status as string,
    date: row.date as string,
    canReview: Boolean(row.can_review),
    reviewed: Boolean(row.reviewed),
    myRating: (row.my_rating as number | null) ?? null,
    reviewComment: (row.review_comment as string | null) ?? null,
    requestId: (row.request_id as string | null) ?? null,
  };
}

export function listOrders(): Order[] {
  const rows = getDb()
    .prepare("SELECT * FROM orders ORDER BY created_at DESC")
    .all() as Row[];
  return rows.map(rowToOrder);
}

export function createOrder(input: {
  item: string;
  seller: string;
  price: number;
  status: string;
  requestId?: string | null;
}): Order {
  const db = getDb();
  const id = "ORD-" + Math.floor(1000 + Math.random() * 9000);
  const now = new Date();
  db.prepare(
    `INSERT INTO orders (id, item, seller, price, status, date, can_review, reviewed, my_rating, review_comment, request_id, created_at)
     VALUES (@id, @item, @seller, @price, @status, @date, 0, 0, NULL, NULL, @requestId, @createdAt)`
  ).run({
    id,
    item: input.item,
    seller: input.seller,
    price: input.price,
    status: input.status,
    date: "Today",
    requestId: input.requestId ?? null,
    createdAt: now.toISOString(),
  });
  return listOrders().find((o) => o.id === id)!;
}

export function submitOrderReview(
  id: string,
  review: { rating: number; comment: string | null }
): Order | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  if (!existing) return null;
  db.prepare(
    "UPDATE orders SET reviewed = 1, my_rating = @rating, review_comment = @comment WHERE id = @id"
  ).run({ id, rating: review.rating, comment: review.comment });
  return rowToOrder(db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as Row);
}

function rowToNotification(row: Row): Notification {
  return {
    id: row.id as string,
    type: row.type as string,
    title: row.title as string,
    body: row.body as string,
    unread: Boolean(row.unread),
    time: timeAgo(row.created_at as string),
  };
}

export function listNotifications(): Notification[] {
  const rows = getDb()
    .prepare("SELECT * FROM notifications ORDER BY created_at DESC")
    .all() as Row[];
  return rows.map(rowToNotification);
}

export function markNotificationRead(id: string): Notification | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM notifications WHERE id = ?").get(id);
  if (!existing) return null;
  db.prepare("UPDATE notifications SET unread = 0 WHERE id = ?").run(id);
  return rowToNotification(
    db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as Row
  );
}

export function markAllNotificationsRead(): void {
  getDb().prepare("UPDATE notifications SET unread = 0").run();
}

function rowToSeller(row: Row): Seller {
  return {
    id: row.id as string,
    name: row.name as string,
    city: row.city as string,
    docs: row.docs as string,
    status: row.status as Seller["status"],
  };
}

export function listSellers(): Seller[] {
  const rows = getDb().prepare("SELECT * FROM sellers").all() as Row[];
  return rows.map(rowToSeller);
}

export function setSellerStatus(
  id: string,
  status: Seller["status"]
): Seller | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM sellers WHERE id = ?").get(id);
  if (!existing) return null;
  db.prepare("UPDATE sellers SET status = ? WHERE id = ?").run(status, id);
  return rowToSeller(db.prepare("SELECT * FROM sellers WHERE id = ?").get(id) as Row);
}

function rowToOffer(row: Row): Offer {
  return {
    id: row.id as string,
    requestId: row.request_id as string,
    seller: row.seller as string,
    verified: Boolean(row.verified),
    rating: row.rating as number,
    orders: row.orders_count as number,
    price: row.price as number,
    delivery: row.delivery as string,
    eta: row.eta as string,
    condition: row.condition as string,
    warranty: row.warranty as string,
    note: row.note as string,
    accepted: Boolean(row.accepted),
  };
}

export function listOffersForRequest(requestId: string): Offer[] {
  const rows = getDb()
    .prepare("SELECT * FROM offers WHERE request_id = ?")
    .all(requestId) as Row[];
  return rows.map(rowToOffer);
}

export function listOpenRequests(): RequestRow[] {
  const rows = getDb()
    .prepare(
      `SELECT r.*, (SELECT COUNT(*) FROM offers o WHERE o.request_id = r.id) AS offer_count
       FROM requests r WHERE r.status = 'open' ORDER BY r.created_at DESC`
    )
    .all() as Row[];
  return rows.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    customer: (row.customer as string | null) ?? null,
    budgetMin: (row.budget_min as number | null) ?? null,
    budgetMax: (row.budget_max as number | null) ?? null,
    qty: row.qty as number,
    location: row.location as string,
    condition: row.condition as string,
    status: row.status as string,
    createdAt: row.created_at as string,
    posted: timeAgo(row.created_at as string),
    offerCount: row.offer_count as number,
  }));
}

function randomOfferFor(requestBudgetMin: number | null, requestBudgetMax: number | null) {
  const base =
    requestBudgetMax ?? requestBudgetMin ?? 15000 + Math.floor(Math.random() * 15000);
  const price = Math.round((base * (0.85 + Math.random() * 0.3)) / 50) * 50;
  return price;
}

const OFFER_NOTES = [
  "Original, tested before dispatch.",
  "Slightly different spec but covers the same need.",
  "Buyer inspects before payment release.",
  "In stock now, ready to ship today.",
];

export function createRequestWithAutoOffers(input: {
  title: string;
  description: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  qty: number;
  location: string;
  condition: string;
}): { request: RequestRow; offers: Offer[] } {
  const db = getDb();
  const id = "REQ-" + Math.floor(1000 + Math.random() * 9000);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO requests (id, title, description, customer, budget_min, budget_max, qty, location, condition, deadline, status, created_at)
     VALUES (@id, @title, @description, NULL, @budgetMin, @budgetMax, @qty, @location, @condition, NULL, 'open', @createdAt)`
  ).run({ id, createdAt: now, ...input });

  const sellerPool = [...SELLERS].sort(() => Math.random() - 0.5).slice(0, 3);
  const insertOffer = db.prepare(`
    INSERT INTO offers (id, request_id, seller, verified, rating, orders_count, price, delivery, eta, condition, warranty, note, accepted, created_at)
    VALUES (@id, @requestId, @seller, @verified, @rating, @orders, @price, @delivery, @eta, @condition, @warranty, @note, 0, @createdAt)
  `);
  sellerPool.forEach((seller, i) => {
    insertOffer.run({
      id: "OFR-" + Math.floor(1000 + Math.random() * 9000) + i,
      requestId: id,
      seller,
      verified: i === 0 ? 1 : Math.random() > 0.4 ? 1 : 0,
      rating: Number((3.9 + Math.random() * 1.0).toFixed(1)),
      orders: 10 + Math.floor(Math.random() * 300),
      price: randomOfferFor(input.budgetMin, input.budgetMax),
      delivery: Math.random() > 0.2 ? String(500 + Math.floor(Math.random() * 2500)) : "Pickup only",
      eta: ["Same day", "1–2 days", "2–3 days"][i % 3],
      condition: input.condition,
      warranty: ["6 months", "3 months", "No warranty"][i % 3],
      note: OFFER_NOTES[i % OFFER_NOTES.length],
      createdAt: now,
    });
  });

  const request = listOpenRequests().find((r) => r.id === id)!;
  return { request, offers: listOffersForRequest(id) };
}

export function addSellerOfferToRequest(requestId: string): Offer | null {
  const db = getDb();
  const request = db.prepare("SELECT * FROM requests WHERE id = ?").get(requestId) as
    | Row
    | undefined;
  if (!request) return null;

  const id = "OFR-" + Math.floor(1000 + Math.random() * 9000);
  const price = randomOfferFor(
    request.budget_min as number | null,
    request.budget_max as number | null
  );
  db.prepare(`
    INSERT INTO offers (id, request_id, seller, verified, rating, orders_count, price, delivery, eta, condition, warranty, note, accepted, created_at)
    VALUES (@id, @requestId, 'PowerPoint Electricals', 1, 4.9, 212, @price, '2,000', '1–2 days', @condition, '6 months', 'Sent from the seller dashboard.', 0, @createdAt)
  `).run({
    id,
    requestId,
    price,
    condition: (request.condition as string) || "New",
    createdAt: new Date().toISOString(),
  });

  return listOffersForRequest(requestId).find((o) => o.id === id) ?? null;
}

export function acceptOffer(
  requestId: string,
  offerId: string
): { order: Order } | null {
  const db = getDb();
  const offer = db
    .prepare("SELECT * FROM offers WHERE id = ? AND request_id = ?")
    .get(offerId, requestId) as Row | undefined;
  const request = db.prepare("SELECT * FROM requests WHERE id = ?").get(requestId) as
    | Row
    | undefined;
  if (!offer || !request) return null;

  db.prepare("UPDATE offers SET accepted = 1 WHERE id = ?").run(offerId);
  db.prepare("UPDATE requests SET status = 'matched' WHERE id = ?").run(requestId);

  const order = createOrder({
    item: request.title as string,
    seller: offer.seller as string,
    price: offer.price as number,
    status: "Seller preparing",
    requestId,
  });

  return { order };
}
