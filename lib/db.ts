import Database from "better-sqlite3";
import crypto from "crypto";
import path from "path";
import { buildProductRows } from "./catalogue";

const DB_PATH = process.env.FINDIT_DB_PATH || path.join(process.cwd(), "data", "findit.db");

let db: Database.Database | null = null;

// Admin accounts aren't self-service (there's no "I'm an admin" signup option),
// so seed one demo admin here. Documented in the README - change it for anything
// beyond local/demo use.
const SEED_ADMIN_PHONE = "08000000000";
const SEED_ADMIN_PASSWORD = "admin1234";

const SEED_SELLERS = [
  { id: "s1", name: "Bakassi Auto Parts", city: "Jos", docs: "Govt ID + shop photo", status: "pending" },
  { id: "s2", name: "NightOwl Electronics", city: "Jos", docs: "Govt ID only", status: "pending" },
];

const SEED_ORDERS = [
  { id: "ORD-4821", item: "Router Backup Mini-UPS", seller: "PowerPoint Electricals", price: 24000, status: "Delivered", date: "12 Aug", canReview: 1, reviewed: 0, myRating: null, reviewComment: null },
  { id: "ORD-4790", item: "Mini Endoscope Camera", seller: "TechBase Plateau", price: 15500, status: "Out for delivery", date: "18 Aug", canReview: 0, reviewed: 0, myRating: null, reviewComment: null },
  { id: "ORD-4712", item: "Book-Insert Reading Light", seller: "Terra Gadgets", price: 6500, status: "Delivered", date: "2 Aug", canReview: 1, reviewed: 1, myRating: 5, reviewComment: null },
];

const SEED_NOTIFICATIONS = [
  { id: "n1", type: "offer", title: "3 sellers responded to your request", body: "Mini UPS for router — compare offers now" },
  { id: "n2", type: "delivery", title: "Order out for delivery", body: "ORD-4790 · Mini Endoscope Camera" },
  { id: "n3", type: "payment", title: "Payment held securely", body: "ORD-4821 · Funds released only after you confirm delivery" },
  { id: "n4", type: "review", title: "How was your order?", body: "Rate PowerPoint Electricals for ORD-4821" },
  { id: "n5", type: "seller", title: "Seller verified", body: "Bakassi Auto Parts is now a verified seller near you" },
];

// Seed "other customer" requests so the seller dashboard and admin queue
// aren't empty on first load. Left with zero offers until a seller responds.
const SEED_REQUESTS = [
  { id: "REQ-1001", title: "Generator carburettor for Elemax SV6500", description: null, budgetMin: 8000, budgetMax: 12000, qty: 1, location: "Jos", condition: "New", customer: "Amaka O." },
  { id: "REQ-1002", title: "Replacement charger for HP EliteBook 840", description: null, budgetMin: 10000, budgetMax: 15000, qty: 1, location: "Jos", condition: "New", customer: "Danladi P." },
  { id: "REQ-1003", title: "100 branded cups for a wedding", description: null, budgetMin: 45000, budgetMax: 45000, qty: 100, location: "Jos", condition: "New", customer: "Chiamaka N." },
  { id: "REQ-1004", title: "Vintage Peugeot 504 door handle", description: null, budgetMin: null, budgetMax: null, qty: 1, location: "Jos", condition: "Used", customer: null },
  { id: "REQ-1005", title: "Industrial sewing machine needle #16", description: null, budgetMin: null, budgetMax: null, qty: 1, location: "Jos", condition: "New", customer: null },
];

function minutesAgoIso(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function getDb(): Database.Database {
  if (db) return db;

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      seller TEXT NOT NULL,
      rating REAL NOT NULL,
      verified INTEGER NOT NULL,
      test_batch INTEGER NOT NULL,
      marketing_cat TEXT,
      loc TEXT NOT NULL,
      art INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sellers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      docs TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      customer TEXT,
      budget_min INTEGER,
      budget_max INTEGER,
      qty INTEGER NOT NULL DEFAULT 1,
      location TEXT NOT NULL,
      condition TEXT NOT NULL,
      deadline TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES requests(id),
      seller TEXT NOT NULL,
      verified INTEGER NOT NULL,
      rating REAL NOT NULL,
      orders_count INTEGER NOT NULL,
      price INTEGER NOT NULL,
      delivery TEXT NOT NULL,
      eta TEXT NOT NULL,
      condition TEXT NOT NULL,
      warranty TEXT NOT NULL,
      note TEXT NOT NULL,
      accepted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      item TEXT NOT NULL,
      seller TEXT NOT NULL,
      price INTEGER NOT NULL,
      status TEXT NOT NULL,
      date TEXT NOT NULL,
      can_review INTEGER NOT NULL DEFAULT 0,
      reviewed INTEGER NOT NULL DEFAULT 0,
      my_rating INTEGER,
      review_comment TEXT,
      request_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      unread INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      business_name TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL REFERENCES users(id),
      seller_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      UNIQUE(buyer_id, seller_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      sender_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0
    );
  `);

  migrate(db);
  seedIfEmpty(db);
  seedAdminIfMissing(db);

  return db;
}

function seedAdminIfMissing(database: Database.Database) {
  const existing = database.prepare("SELECT id FROM users WHERE role = 'admin'").get();
  if (existing) return;

  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto.scryptSync(SEED_ADMIN_PASSWORD, salt, 64).toString("hex");
  database
    .prepare(
      `INSERT INTO users (id, phone, password_hash, password_salt, name, role, business_name, created_at)
       VALUES ('admin_seed', @phone, @passwordHash, @salt, 'FindIt Admin', 'admin', NULL, @createdAt)`
    )
    .run({
      phone: SEED_ADMIN_PHONE,
      passwordHash,
      salt,
      createdAt: new Date().toISOString(),
    });
}

// Adds columns to tables that existed before auth was introduced. SQLite has
// no "ADD COLUMN IF NOT EXISTS", so probe pragma table_info and add what's
// missing — safe to run on every startup, including a brand-new database.
function migrate(database: Database.Database) {
  const addColumnIfMissing = (table: string, column: string, definition: string) => {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    if (!columns.some((c) => c.name === column)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  addColumnIfMissing("orders", "user_id", "TEXT");
  addColumnIfMissing("notifications", "user_id", "TEXT");
}

function seedIfEmpty(database: Database.Database) {
  const productCount = (
    database.prepare("SELECT COUNT(*) AS count FROM products").get() as { count: number }
  ).count;
  if (productCount === 0) {
    const insert = database.prepare(`
      INSERT INTO products (id, category, name, price, seller, rating, verified, test_batch, marketing_cat, loc, art)
      VALUES (@id, @category, @name, @price, @seller, @rating, @verified, @testBatch, @marketingCat, @loc, @art)
    `);
    const insertMany = database.transaction((rows: ReturnType<typeof buildProductRows>) => {
      for (const row of rows) {
        insert.run({
          ...row,
          verified: row.verified ? 1 : 0,
          testBatch: row.testBatch ? 1 : 0,
        });
      }
    });
    insertMany(buildProductRows());
  }

  const sellerCount = (
    database.prepare("SELECT COUNT(*) AS count FROM sellers").get() as { count: number }
  ).count;
  if (sellerCount === 0) {
    const insert = database.prepare(
      "INSERT INTO sellers (id, name, city, docs, status) VALUES (@id, @name, @city, @docs, @status)"
    );
    for (const s of SEED_SELLERS) insert.run(s);
  }

  const orderCount = (
    database.prepare("SELECT COUNT(*) AS count FROM orders").get() as { count: number }
  ).count;
  if (orderCount === 0) {
    const insert = database.prepare(`
      INSERT INTO orders (id, item, seller, price, status, date, can_review, reviewed, my_rating, review_comment, request_id, created_at)
      VALUES (@id, @item, @seller, @price, @status, @date, @canReview, @reviewed, @myRating, @reviewComment, NULL, @createdAt)
    `);
    SEED_ORDERS.forEach((o, i) => {
      insert.run({ ...o, createdAt: minutesAgoIso(60 * 24 * (SEED_ORDERS.length - i)) });
    });
  }

  const notifCount = (
    database.prepare("SELECT COUNT(*) AS count FROM notifications").get() as { count: number }
  ).count;
  if (notifCount === 0) {
    const insert = database.prepare(`
      INSERT INTO notifications (id, type, title, body, unread, created_at)
      VALUES (@id, @type, @title, @body, @unread, @createdAt)
    `);
    SEED_NOTIFICATIONS.forEach((n, i) => {
      insert.run({
        ...n,
        unread: i < 2 ? 1 : 0,
        createdAt: minutesAgoIso(i === 0 ? 12 : i === 1 ? 60 : 60 * 24 * i),
      });
    });
  }

  const requestCount = (
    database.prepare("SELECT COUNT(*) AS count FROM requests").get() as { count: number }
  ).count;
  if (requestCount === 0) {
    const insert = database.prepare(`
      INSERT INTO requests (id, title, description, customer, budget_min, budget_max, qty, location, condition, deadline, status, created_at)
      VALUES (@id, @title, @description, @customer, @budgetMin, @budgetMax, @qty, @location, @condition, NULL, 'open', @createdAt)
    `);
    SEED_REQUESTS.forEach((r, i) => {
      insert.run({ ...r, createdAt: minutesAgoIso(14 + i * 45) });
    });
  }
}
