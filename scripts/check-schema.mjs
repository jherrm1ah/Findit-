#!/usr/bin/env node
// Compares the columns supabase/schema.sql declares against the columns the
// live database actually has, and names every difference.
//
// WHY THIS EXISTS. Migrations here are applied by hand, by pasting SQL into
// the Supabase editor. That works right up until one file is skipped, and
// then nothing announces it: the app keeps serving every page that doesn't
// touch the missing column and fails only on the ones that do, as a generic
// 500. That is exactly what happened with migration 009 — products, orders
// and offers never got their seller_id column, so creating a listing and
// loading the seller dashboard failed in production while signup, browsing
// and checkout all looked perfectly healthy.
//
// Run it after applying migrations, and before trusting a deploy:
//
//   node --env-file=.env.local scripts/check-schema.mjs
//
// Exits 0 when the database matches, 1 when anything is missing, so it can
// gate a deploy. It only ever READS: it selects zero rows and inspects the
// error, and never writes, alters or drops anything.

import { readdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, "..", "supabase", "schema.sql");
const MIGRATIONS_DIR = join(HERE, "..", "supabase", "migrations");

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or run with --env-file=.env.local).");
  process.exit(1);
}

const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

// Parses `create table if not exists <name> ( ... );` blocks out of
// schema.sql. Deliberately simple: this file is the one authoritative
// schema definition in the repo and is written in a consistent style, so a
// full SQL parser would be a lot of machinery for no extra safety. Anything
// it can't parse shows up as a table with no columns, which is visible in
// the output rather than silently skipped.
function parseSchema(sql) {
  const tables = new Map();
  const tableRe = /create table if not exists (\w+)\s*\(([\s\S]*?)\n\);/g;
  let match;
  while ((match = tableRe.exec(sql))) {
    const [, table, body] = match;
    const columns = [];
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      // Skip comments, blank lines, and table-level constraint clauses —
      // none of them declare a column name.
      if (!line || line.startsWith("--")) continue;
      if (/^(unique|primary key|foreign key|check|constraint)\b/i.test(line)) continue;
      const col = line.match(/^([a-z_][a-z0-9_]*)\s+/i);
      if (col) columns.push(col[1]);
    }
    tables.set(table, columns);
  }
  return tables;
}

// Best-effort attribution: which migration file first mentions this column,
// so the report says what to run rather than just what is wrong.
function migrationsMentioning(column) {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => new RegExp(`\\b${column}\\b`).test(readFileSync(join(MIGRATIONS_DIR, f), "utf8")))
    .sort();
}

// Selecting a column that doesn't exist makes PostgREST fail the whole
// request, so one query per table tells us whether that table is complete,
// and only an incomplete table pays for a per-column pass.
async function missingColumns(table, columns) {
  const whole = await db.from(table).select(columns.join(", ")).limit(0);
  if (!whole.error) return [];

  // 42P01 = undefined_table. The table itself is absent, not just a column.
  if (whole.error.code === "42P01") return ["<entire table missing>"];

  const missing = [];
  for (const column of columns) {
    const one = await db.from(table).select(column).limit(0);
    if (one.error) missing.push(column);
  }
  // A table-level failure with no column pinned down is worth surfacing
  // rather than reporting as healthy.
  return missing.length ? missing : [`<select failed: ${whole.error.message}>`];
}

const expected = parseSchema(readFileSync(SCHEMA_PATH, "utf8"));
console.log(`Checking ${expected.size} tables from supabase/schema.sql against ${url}\n`);

let problems = 0;
const culprits = new Set();

for (const [table, columns] of expected) {
  if (columns.length === 0) {
    console.log(`  ?  ${table} — could not parse any columns from schema.sql`);
    continue;
  }
  const missing = await missingColumns(table, columns);
  if (missing.length === 0) {
    console.log(`  ok ${table} (${columns.length} columns)`);
  } else {
    problems += missing.length;
    console.log(`  MISSING ${table}: ${missing.join(", ")}`);
    for (const column of missing) {
      for (const file of migrationsMentioning(column)) culprits.add(file);
    }
  }
}

if (problems === 0) {
  console.log("\nSchema matches. Every column schema.sql declares exists in the database.");
  process.exit(0);
}

console.log(`\n${problems} missing column(s).`);
if (culprits.size) {
  console.log("Run these migration files, in order, in the Supabase SQL editor:");
  for (const file of [...culprits].sort()) console.log(`  supabase/migrations/${file}`);
}
process.exit(1);
