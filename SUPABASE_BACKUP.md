# FindIt — Supabase Project Settings Backup

**Snapshot taken**: 2026-10-01, directly from the live Supabase project via the Supabase
Management API. This captures **configuration/settings**, not row data — see "What this is
NOT" below. No secret values are included.

---

## ⚠️ Most important finding first: this project has no native backup safety net right now

The organization (`virt-technologies`) is on the **Free tier** (`plan: "free"`,
`tier: "tier_free"`). Supabase's Free tier does **not** include:
- Automatic daily backups
- Point-in-time recovery (PITR)

It's also subject to **auto-pausing after a period of inactivity**. A paused free project's
data isn't deleted, but the project stops serving requests until someone manually restores it
from the dashboard.

**This means right now, the only real protection for this project's data is this repo's
migration history (schema) plus whatever you export yourself (data).** If you want an actual
safety net for the live data (not just the schema), the two real options are:
1. Upgrade the Supabase organization to a paid plan (Pro and above include PITR/backups), or
2. Periodically export the data yourself (e.g. `pg_dump` against the connection string, or
   table-by-table CSV exports from the Supabase dashboard's Table Editor).

This document captures **configuration**, which is the part Claude Code can meaningfully back
up on your behalf from here. It does not replace either option above for the actual data.

---

## Project identity

| Field | Value |
|---|---|
| Project name | `Findit-` |
| Project ref / ID | `lhbekblecppamgmvmumo` |
| Organization | `virt-technologies` (`kgrahwplijxbleynpeph`) |
| Organization plan | **Free** (`tier_free`) — see warning above |
| Region | `eu-central-1` |
| Status | `ACTIVE_HEALTHY` |
| Postgres version | 17.6.1.166 (engine 17, GA release channel) |
| Database host | `db.lhbekblecppamgmvmumo.supabase.co` |
| Project API URL | `https://lhbekblecppamgmvmumo.supabase.co` |
| Created | 2026-09-07T17:19:08Z |

## API keys

| Key | Value | Sensitivity |
|---|---|---|
| Legacy anon key (JWT) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoYmVrYmxlY3BwYW1nbXZtdW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MDE1NDgsImV4cCI6MjEwNDM3NzU0OH0.m3GrH44pnEXtrJ6wiFLival-f9VUJ2qugTpvmBBKKaU` | Safe to store/share in this doc — Supabase designs this key to be public-facing (protected by RLS). **Not currently used anywhere in the FindIt codebase** — the app always uses the service-role key server-side (see `PROJECT_STATUS.md` §7). |
| Modern publishable key | `sb_publishable_NSSum2Hpk4sI5F8AHhX-7Q_kT7fuj5D` | Same as above — public-safe by design, unused by this app today. |
| **Service role key** | **Not captured here** | This is a real secret (full DB access, bypasses RLS). It already lives in Vercel's production environment variables (`SUPABASE_SERVICE_ROLE_KEY`) and in your own `.env.local` if you have one. **Back this up yourself**, outside of any document or chat — a password manager, not a text file — by copying it from the Supabase dashboard: Settings → API → `service_role` key. If you ever suspect it's leaked, rotate it from that same screen; every deployment reading it from an env var will need the new value set. |

## Database extensions (installed only)

Supabase's Postgres image ships ~70 extensions available for enabling; this project has only
enabled what it actually uses:

| Extension | Schema | Version | Used for |
|---|---|---|---|
| `pgcrypto` | `extensions` | 1.3 | Cryptographic functions (available to Postgres itself; the app's own password/OTP hashing happens in Node via `lib/auth.ts`/`lib/otp.ts`, not in SQL) |
| `uuid-ossp` | `extensions` | 1.1 | UUID generation |
| `pg_stat_statements` | `extensions` | 1.11 | Query performance statistics (observability) |
| `supabase_vault` | `vault` | 0.3.1 | Supabase-internal, enabled by default on every project |
| `plpgsql` | `pg_catalog` | 1.0 | Postgres's procedural language — required for `check_rate_limit()` (see `DATABASE.md` §5) |

Nothing exotic — no PostGIS, no pgvector, no cron (`pg_cron`), no full-text search extension
enabled, despite all being available. Matches `PROJECT_STATUS.md`'s note that geo features
are pure application-level haversine math, not a Postgres extension, and that there's no
Postgres-level scheduled job (the cron sweep is a Vercel Cron hitting an API route, not
`pg_cron`).

## Storage buckets (live, as of this snapshot)

| Bucket | Public | File size limit | Allowed MIME types | Created |
|---|---|---|---|---|
| `product-images` | true | 5,000,000 bytes (5 MB) | *(none set — relies on the app's own magic-byte validation, see `PROJECT_STATUS.md` §7)* | 2026-09-11 |

**Note**: `seller-verification` (the private evidence bucket documented in `DATABASE.md` §4)
does **not** exist yet in this project — `lib/storage.ts` creates it lazily on first real
verification-evidence upload, and apparently no seller has triggered that yet. This is
expected, not a problem — the bucket will appear automatically the first time it's needed.

## Migration tracking (Supabase's own record)

Supabase's internal migration-tracking table only has entries starting from migration `009`
onward (15 entries, matching 009 and 020–033 — i.e. everything except 002–008 and 010–019,
which appear to have been applied before this project's migration tracking began, or applied
directly rather than through the tracked path):

```
20260912183807  seller_identity
20260912183815  admin_session_unlock
20260912183840  financial_integrity
20260912190410  rate_limits
20260912191449  store_slugs
20260912192747  transaction_records
20260914170440  reviews
20260914232613  product_details
20260916135618  product_moderation
20260916135809  pin_rate_limit_search_path
20260917074820  boost_payment_idempotency
20261001131627  boost_subscription_expiry_notifications
20261001162901  store_templates
20261001162911  store_accent_colors
20261001170244  priority_support
```

This doesn't mean migrations 002–008/010–019 weren't applied — `DATABASE.md`'s live
`list_tables` read confirms every column/table from all 33 migrations exists in the database
right now. It just means Supabase's own tracking table doesn't have a row for those earlier
ones. **The real, authoritative migration history is `supabase/migrations/002`–`033` in this
repo** — that's unaffected by this gap and is what you'd replay against a fresh project.

## Security advisories (live, at snapshot time)

One finding, expected and already documented as intentional in `PROJECT_STATUS.md`/
`DATABASE.md`: **all 34 tables** are flagged `rls_enabled_no_policy` — RLS is on, no policies
exist. This is by design (see `DATABASE.md` §3) — not a gap to fix.

## Performance advisories (live, at snapshot time)

Two informational findings, neither urgent:

1. **5 unindexed foreign keys** — a small addition to the 10 already fixed in migration 021
   (see `DATABASE.md` §6): `product_reports.reporter_id`, `product_reports.resolved_by`,
   `products.moderated_by`, `transaction_record_events.actor_id`,
   `transaction_records.product_id`. These are all from migrations 025–027, which landed
   after 021's indexing pass and were never covered by a follow-up. Low-impact at current
   data volume (these are admin/audit-path columns, not hot query paths), but worth folding
   into the same kind of indexing migration next time one's needed — not urgent enough to
   justify its own migration today.
2. **35 unused indexes** — expected and not a concern: this reflects a low-traffic/early-stage
   project where most indexes simply haven't been exercised by real query volume yet, not
   that they're poorly chosen. Re-check this after the app has meaningfully more usage.

---

## What this is NOT

- **Not a data backup.** No row data (users, orders, payments, etc.) is included — only
  schema/configuration. The actual data's only current protection is whatever Supabase's
  Free tier provides (see the warning at the top), which is minimal.
- **Not the service-role key.** That's a real secret and deliberately excluded — see the API
  keys table above for where to get it and how to store it safely yourself.
- **Not a substitute for `DATABASE.md`** for understanding the schema's structure/meaning —
  this file is a point-in-time settings snapshot; `DATABASE.md` is the maintained reference.

## If you want more than this before your subscription expires

Ask and I can also, right now, in this session:
- Export the actual table data (not just settings) as SQL/CSV for the tables that matter most
  (`users`, `sellers`, `products`, `orders`, `payments`, `payouts` — whatever you want), to
  give you a real data backup alongside this settings one.
- Walk through upgrading the Supabase org to a paid plan for real automatic backups/PITR
  (this requires your billing action — I can't do this part for you, but I can tell you
  exactly where to click).
