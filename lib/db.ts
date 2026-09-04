import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { SCORE_FIELDS, ScoreField } from "./types";

const DB_PATH = path.join(process.cwd(), "data", "findit.db");
const SEED_PATH = path.join(process.cwd(), "data", "products.json");

// camelCase ScoreField key -> snake_case DB column
function toColumn(key: ScoreField): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  const scoreColumns = SCORE_FIELDS.map(
    (f) => `${toColumn(f.key)} INTEGER`
  ).join(",\n      ");

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      num INTEGER NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      test_batch INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'idea',
      supplier_url TEXT,
      notes TEXT,
      ${scoreColumns}
    )
  `);

  const row = db.prepare("SELECT COUNT(*) AS count FROM products").get() as {
    count: number;
  };

  if (row.count === 0 && fs.existsSync(SEED_PATH)) {
    seedFromJson(db);
  }

  return db;
}

function seedFromJson(database: Database.Database) {
  const raw = fs.readFileSync(SEED_PATH, "utf-8");
  const products: Array<{
    num: number;
    category: string;
    name: string;
    testBatch: boolean;
    notes: string | null;
  }> = JSON.parse(raw);

  const insert = database.prepare(`
    INSERT INTO products (num, category, name, test_batch, status, notes)
    VALUES (@num, @category, @name, @testBatch, 'idea', @notes)
  `);

  const insertMany = database.transaction((items: typeof products) => {
    for (const item of items) {
      insert.run({
        num: item.num,
        category: item.category,
        name: item.name,
        testBatch: item.testBatch ? 1 : 0,
        notes: item.notes ?? null,
      });
    }
  });

  insertMany(products);
}

export { toColumn };
