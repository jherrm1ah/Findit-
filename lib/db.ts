import { createClient, SupabaseClient } from "@supabase/supabase-js";

// The app's real database (Postgres, on Supabase) — replaces the old local
// SQLite file. Schema lives in supabase/schema.sql; run that once against a
// fresh project before this app can do anything. No data is seeded here —
// unlike the old SQLite version, a brand-new database is genuinely empty.
//
// This client uses the service role key and is server-only (never import
// this file from a "use client" component). It bypasses Row Level Security —
// see the note at the top of supabase/schema.sql for why that's fine here.

let client: SupabaseClient | null = null;

export function getDb(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase isn't configured (missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY). " +
        "Copy .env.example to .env.local and fill in your project's values, then run " +
        "supabase/schema.sql against that project before starting the app."
    );
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

// Throws a readable error instead of returning silently-wrong data when a
// Supabase call fails — every repo function funnels its errors through this.
export function assertNoError<T>(
  result: { data: T; error: { message: string } | null },
  context: string
): T {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
  return result.data;
}
