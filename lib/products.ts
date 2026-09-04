import { getDb, toColumn } from "./db";
import {
  SCORE_FIELDS,
  STATUS_VALUES,
  Status,
  Product,
  CategorySummary,
  computePriorityScore,
} from "./types";

type Row = Record<string, unknown>;

function rowToProduct(row: Row): Product {
  const product: Record<string, unknown> = {
    id: row.id,
    num: row.num,
    category: row.category,
    name: row.name,
    testBatch: Boolean(row.test_batch),
    status: row.status as Status,
    supplierUrl: row.supplier_url ?? null,
    notes: row.notes ?? null,
  };
  for (const f of SCORE_FIELDS) {
    product[f.key] = row[toColumn(f.key)] ?? null;
  }
  return product as Product;
}

export function listProducts(filters?: {
  category?: string;
  testBatchOnly?: boolean;
  status?: Status;
  search?: string;
}): Product[] {
  const db = getDb();
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters?.category) {
    clauses.push("category = @category");
    params.category = filters.category;
  }
  if (filters?.testBatchOnly) {
    clauses.push("test_batch = 1");
  }
  if (filters?.status) {
    clauses.push("status = @status");
    params.status = filters.status;
  }
  if (filters?.search) {
    clauses.push("name LIKE @search");
    params.search = `%${filters.search}%`;
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM products ${where} ORDER BY num ASC`)
    .all(params) as Row[];

  return rows.map(rowToProduct);
}

export function getProduct(id: number): Product | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as
    | Row
    | undefined;
  return row ? rowToProduct(row) : null;
}

export type ProductPatch = Partial<{
  testBatch: boolean;
  status: Status;
  supplierUrl: string | null;
  notes: string | null;
}> &
  Partial<Record<(typeof SCORE_FIELDS)[number]["key"], number | null>>;

export function updateProduct(id: number, patch: ProductPatch): Product | null {
  const db = getDb();
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  if (patch.testBatch !== undefined) {
    sets.push("test_batch = @testBatch");
    params.testBatch = patch.testBatch ? 1 : 0;
  }
  if (patch.status !== undefined) {
    if (!STATUS_VALUES.includes(patch.status)) {
      throw new Error(`Invalid status: ${patch.status}`);
    }
    sets.push("status = @status");
    params.status = patch.status;
  }
  if (patch.supplierUrl !== undefined) {
    sets.push("supplier_url = @supplierUrl");
    params.supplierUrl = patch.supplierUrl;
  }
  if (patch.notes !== undefined) {
    sets.push("notes = @notes");
    params.notes = patch.notes;
  }
  for (const f of SCORE_FIELDS) {
    const value = patch[f.key];
    if (value !== undefined) {
      if (value !== null && (value < 1 || value > 5)) {
        throw new Error(`${f.key} must be between 1 and 5`);
      }
      const column = toColumn(f.key);
      sets.push(`${column} = @${f.key}`);
      params[f.key] = value;
    }
  }

  if (sets.length === 0) return getProduct(id);

  db.prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = @id`).run(
    params
  );

  return getProduct(id);
}

export function getCategorySummary(): CategorySummary[] {
  const products = listProducts();
  const byCategory = new Map<string, Product[]>();
  for (const p of products) {
    const list = byCategory.get(p.category) ?? [];
    list.push(p);
    byCategory.set(p.category, list);
  }

  const summaries: CategorySummary[] = [];
  for (const [category, items] of byCategory) {
    const scores = items
      .map((p) => computePriorityScore(p))
      .filter((s): s is number => s !== null);
    const avg =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : null;

    const statusCounts = Object.fromEntries(
      STATUS_VALUES.map((s) => [s, 0])
    ) as Record<Status, number>;
    for (const p of items) {
      statusCounts[p.status]++;
    }

    summaries.push({
      category,
      productCount: items.length,
      testBatchCount: items.filter((p) => p.testBatch).length,
      avgPriorityScore: avg,
      statusCounts,
    });
  }

  summaries.sort((a, b) => b.productCount - a.productCount);
  return summaries;
}
