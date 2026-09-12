import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

// Route handlers serialize whatever they return straight to the client, so
// a raw `select("*")` there is a standing risk: the next column added to
// any table (even one nobody meant to expose, like password_hash or
// admin_role) silently becomes part of an API response. Every table read
// that a route can reach must name its columns explicitly, either right in
// the route or — as every route does today — through a lib/*.ts function
// that selects only what it needs and maps it to a safe shape before
// returning. This test is the guardrail that keeps that true: it fails the
// moment any app/api file selects every column directly.
const APP_API_DIR = join(__dirname, "..", "app", "api");
const SELECT_STAR = /\.select\(\s*["'`]\*["'`]\s*\)/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("select(*) allowlist guardrail", () => {
  it("no API route handler selects every column directly from the database", () => {
    const repoRoot = join(__dirname, "..");
    const offenders = walk(APP_API_DIR)
      .filter((file) => SELECT_STAR.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(repoRoot.length + 1));
    expect(offenders).toEqual([]);
  });
});
