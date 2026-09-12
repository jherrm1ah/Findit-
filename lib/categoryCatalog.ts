import { getDb, assertNoError } from "./db";
import { ValidationError } from "./errors";

type Row = Record<string, unknown>;

// The real, admin-editable category taxonomy — DB-backed so an admin can
// add/rename/deactivate/reorder a category without a deploy, the same
// "price/limits as data, not code" pattern already used for
// subscription_plans (lib/subscriptions.ts). components/findit-app/data.js
// still ships the SAME 15 categories as a static default (seeded here too,
// see supabase/migrations/017_categories.sql) purely so the client has
// something to render before its one fetch of GET /api/categories resolves
// — never a second source of truth for validity, only a fallback snapshot.

export type Category = {
  id: string;
  label: string;
  iconKey: string;
  sortOrder: number;
  active: boolean;
};

function rowToCategory(row: Row): Category {
  return {
    id: row.id as string,
    label: row.label as string,
    iconKey: row.icon_key as string,
    sortOrder: row.sort_order as number,
    active: Boolean(row.active),
  };
}

// Public/seller-facing — active categories only, in display order.
export async function listCategories(): Promise<Category[]> {
  const db = getDb();
  const result = await db.from("categories").select("*").eq("active", true).order("sort_order", { ascending: true });
  const rows = assertNoError(result, "listing categories") as Row[];
  return rows.map(rowToCategory);
}

// Admin-only — includes inactive categories, for the plan-editor-style
// management screen.
export async function listAllCategoriesForAdmin(): Promise<Category[]> {
  const db = getDb();
  const result = await db.from("categories").select("*").order("sort_order", { ascending: true });
  const rows = assertNoError(result, "listing all categories") as Row[];
  return rows.map(rowToCategory);
}

// The real server-side gate behind every category a listing or request can
// be tagged with (see lib/repo.ts#createProduct/updateProduct/createRequest)
// — a category has to exist and be active right now, not just look
// plausible client-side. Deliberately DB-backed rather than a hardcoded
// list, which is exactly what makes an admin's edit here actually count.
export async function isValidCategoryKey(key: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("id", key)
    .eq("active", true);
  if (result.error) throw new Error(`checking category validity: ${result.error.message}`);
  return (result.count ?? 0) > 0;
}

// Pure — unit-testable without a database. Exported so createCategory's
// "what id would this label produce" rule can be verified directly.
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Admin-only. A new category's id is derived from its label (never
// admin-typed directly) so it's always a clean key — the same key a
// product's `category` column stores and every validity check above
// compares against.
export async function createCategory(input: { label: string; iconKey: string; sortOrder?: number }): Promise<Category> {
  const label = input.label.trim();
  if (!label) throw new ValidationError("A category name is required.");
  const id = slugify(label);
  if (!id) throw new ValidationError("That name doesn't produce a usable category id — try including a letter or number.");

  const db = getDb();
  const insertResult = await db
    .from("categories")
    .insert({
      id,
      label,
      icon_key: input.iconKey || "Package",
      sort_order: input.sortOrder ?? 0,
    })
    .select()
    .single();
  if (insertResult.error) {
    if (insertResult.error.code === "23505") {
      throw new ValidationError(`A category with the id "${id}" already exists.`);
    }
    throw new Error(`creating category: ${insertResult.error.message}`);
  }
  return rowToCategory(insertResult.data as Row);
}

const CATEGORY_PATCH_COLUMNS: Record<string, string> = {
  label: "label",
  iconKey: "icon_key",
  sortOrder: "sort_order",
  active: "active",
};

// Admin-only. Never lets `id` itself change — a category's id is baked into
// every existing product/request row's `category` column, so renaming the
// id out from under them would silently orphan real listings. Change the
// label instead; the id can stay a plain internal key forever.
export async function updateCategory(id: string, patch: Partial<Omit<Category, "id">>): Promise<Category> {
  const columns: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = CATEGORY_PATCH_COLUMNS[key];
    if (column) columns[column] = value;
  }
  if (Object.keys(columns).length === 0) {
    throw new ValidationError("No editable fields provided.");
  }
  columns.updated_at = new Date().toISOString();

  const db = getDb();
  const result = await db.from("categories").update(columns).eq("id", id).select().maybeSingle();
  const row = assertNoError(result, "updating category") as Row | null;
  if (!row) throw new ValidationError("That category doesn't exist.");
  return rowToCategory(row);
}
