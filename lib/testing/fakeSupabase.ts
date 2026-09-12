// A minimal in-memory stand-in for the Supabase JS client — just enough of
// the chainable query-builder surface (.from/.select/.insert/.update/
// .delete/.eq/.neq/.gte/.lte/.in/.is/.order/.limit/.single/.maybeSingle,
// plus being awaitable directly) for the actual lib/repo.ts and lib/payments.ts
// functions to run against it unmodified. Used by lib/**/*.integration.test.ts
// to exercise real multi-step flows (not reimplemented test-only logic)
// without a live Supabase project — see those files for how it's wired in
// via `vi.mock("@supabase/supabase-js", ...)`.
//
// Deliberately NOT a full PostgREST emulation: no joins, no `select("*,
// sellers(name)")` embedding, no RLS. Extend it (another filter method, a
// smarter .select() that honors embedded-resource syntax) only when an
// actual integration test needs it — resist building out speculative
// coverage this suite doesn't use yet.

type Row = Record<string, unknown>;

// Columns that carry a UNIQUE index in supabase/schema.sql. The fake enforces
// them because several guarantees in this codebase are the constraint, not
// the code around it: transaction records are idempotent because order_id is
// unique, and a store slug is contested-safe because store_slug is. A fake
// that accepts a duplicate would let those tests pass while the real database
// rejected the same write.
//
// Add a table here when a test depends on its uniqueness, not speculatively.
const UNIQUE_COLUMNS: Record<string, string[]> = {
  transaction_records: ["id", "code", "order_id"],
  transaction_record_events: ["id"],
  sellers: ["id", "store_slug"],
  store_slug_aliases: ["slug"],
  payouts: ["id", "order_id"],
  payments: ["id", "provider_reference"],
  users: ["id", "phone"],
  orders: ["id"],
  products: ["id"],
};

// Mirrors Postgres: a null never conflicts with another null.
function uniqueViolation(table: string, rows: Row[], candidate: Row): string | null {
  for (const column of UNIQUE_COLUMNS[table] ?? []) {
    const value = candidate[column];
    if (value === undefined || value === null) continue;
    if (rows.some((existing) => existing[column] === value)) return column;
  }
  return null;
}
type QueryResult = { data: unknown; error: { message: string; code?: string } | null; count?: number };

class FakeQueryBuilder implements PromiseLike<QueryResult> {
  private filters: Array<(row: Row) => boolean> = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private orderSpec: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private wantCount = false;

  constructor(private table: string, private getRows: (table: string) => Row[], private setRows: (table: string, rows: Row[]) => void) {}

  select(_cols?: string, opts?: { count?: string }) {
    if (opts?.count) this.wantCount = true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push((r) => (r[col] as any) >= (val as any));
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push((r) => (r[col] as any) <= (val as any));
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }
  is(col: string, val: null | boolean) {
    this.filters.push((r) => (r[col] ?? null) === val);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderSpec = { col, ascending: opts?.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private matched(rows: Row[]): Row[] {
    return rows.filter((r) => this.filters.every((f) => f(r)));
  }

  private execute(): QueryResult {
    const rows = this.getRows(this.table);

    if (this.op === "insert") {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({ ...r }));
      const accepted: Row[] = [...rows];
      for (const item of items) {
        const conflict = uniqueViolation(this.table, accepted, item);
        if (conflict) {
          return {
            data: null,
            // 23505 is what Postgres returns, and lib/transactionRecord.ts
            // and lib/store.ts both branch on exactly this code.
            error: {
              message: `duplicate key value violates unique constraint on "${this.table}"."${conflict}"`,
              code: "23505",
            },
          };
        }
        accepted.push(item);
      }
      this.setRows(this.table, accepted);
      return { data: items.map((r) => ({ ...r })), error: null };
    }
    if (this.op === "update") {
      const hit = this.matched(rows);
      hit.forEach((r) => Object.assign(r, this.payload));
      return { data: hit.map((r) => ({ ...r })), error: null };
    }
    if (this.op === "delete") {
      const hit = this.matched(rows);
      this.setRows(this.table, rows.filter((r) => !hit.includes(r)));
      return { data: hit.map((r) => ({ ...r })), error: null };
    }

    let result = this.matched(rows);
    if (this.orderSpec) {
      const { col, ascending } = this.orderSpec;
      result = [...result].sort((a, b) => {
        if (a[col] === b[col]) return 0;
        return ((a[col] as any) > (b[col] as any) ? 1 : -1) * (ascending ? 1 : -1);
      });
    }
    if (this.limitN != null) result = result.slice(0, this.limitN);
    const out: QueryResult = { data: result.map((r) => ({ ...r })), error: null };
    if (this.wantCount) out.count = result.length;
    return out;
  }

  single(): Promise<QueryResult> {
    const { data, error } = this.execute();
    if (error) return Promise.resolve({ data: null, error });
    const rows = data as Row[];
    if (rows.length !== 1) {
      return Promise.resolve({ data: null, error: { message: `Expected exactly one row in "${this.table}", got ${rows.length}` } });
    }
    return Promise.resolve({ data: rows[0], error: null });
  }

  maybeSingle(): Promise<QueryResult> {
    const { data, error } = this.execute();
    if (error) return Promise.resolve({ data: null, error });
    const rows = data as Row[];
    if (rows.length === 0) return Promise.resolve({ data: null, error: null });
    if (rows.length > 1) {
      return Promise.resolve({ data: null, error: { message: `More than one row matched in "${this.table}"` } });
    }
    return Promise.resolve({ data: rows[0], error: null });
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export type FakeSupabaseSeed = Record<string, Row[]>;

export function createFakeSupabase(seed: FakeSupabaseSeed = {}) {
  let tables = new Map<string, Row[]>();

  function seedFrom(data: FakeSupabaseSeed) {
    tables = new Map(Object.entries(data).map(([table, rows]) => [table, rows.map((r) => ({ ...r }))]));
  }
  seedFrom(seed);

  const getRows = (table: string) => tables.get(table) ?? [];
  const setRows = (table: string, rows: Row[]) => tables.set(table, rows);

  return {
    // The one method every real lib/repo.ts / lib/payments.ts call site
    // actually uses on the Supabase client.
    from(table: string) {
      return new FakeQueryBuilder(table, getRows, setRows);
    },
    // Test-only helpers — never called by app code, only by test setup/
    // assertions.
    reset(newSeed: FakeSupabaseSeed = {}) {
      seedFrom(newSeed);
    },
    dump(table: string): Row[] {
      return getRows(table).map((r) => ({ ...r }));
    },
  };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;
