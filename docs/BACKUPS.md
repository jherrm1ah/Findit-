# Backups

FindIt's Supabase project is on the Free tier, which has **no automatic backups**. Until it's
upgraded to Pro, the `Nightly backup` GitHub workflow (`.github/workflows/backup.yml`) is the
safety net.

## What it does

| | |
|---|---|
| **Database** | Every night at 01:17 UTC: a full dump of all tables and data in the `public` schema (users, sellers, products, orders, payments, messages, everything). Kept **90 days**. |
| **Uploaded files** | Every Sunday: every file in every Storage bucket (product photos, avatars, seller verification evidence). Kept **30 days**. |
| **Encryption** | Each backup is encrypted with AES-256 using a passphrase only you know, before it leaves the GitHub machine. Without the passphrase the file is useless, even to someone who can see the repo. |
| **Where** | GitHub → the repo → **Actions** → **Nightly backup** → pick a run → **Artifacts** at the bottom. |

It fails loudly (GitHub emails you) if the database can't be reached or the dump is missing
core tables.

## One-time setup (about 5 minutes)

Add four secrets in GitHub: the repo → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**.

1. **`BACKUP_PASSPHRASE`** — make up a long passphrase (e.g. five random words). **Save it in
   your password manager first.** If you lose it, every backup is unreadable and nobody can
   recover it.
2. **`SUPABASE_DB_URL`** — in the Supabase dashboard, click **Connect** (top of the project
   page) → **Session pooler** → copy the URI. It looks like
   `postgresql://postgres.lhbekblecppamgmvmumo:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`.
   Replace `[YOUR-PASSWORD]` with the database password (reset it under Project Settings →
   Database if you don't have it). Use the **Session pooler**, not "Direct connection": GitHub's
   machines can't reach the direct address.
3. **`SUPABASE_URL`** — same value as in Vercel (`https://lhbekblecppamgmvmumo.supabase.co`).
4. **`SUPABASE_SERVICE_ROLE_KEY`** — same value as in Vercel. Only needed for the weekly file
   backup; the database backup works without it.

Then test it: **Actions** → **Nightly backup** → **Run workflow**. In about 3 minutes you
should have a green run with an artifact. Download it and try the restore below once, so you
know it works before you ever need it.

## Restoring

You need `gpg` and the Postgres 17 tools (`pg_restore`) on your computer.

```bash
# 1. Unzip what GitHub gave you, then decrypt (asks for the passphrase)
unzip findit-backup-*.zip
gpg --decrypt findit-backup-*.tar.gpg | tar -x
# You now have backup/findit-db.dump (and backup/storage/ for a Sunday backup)

# 2. Restore the database into an EMPTY Supabase project (new project, or a fresh one).
#    Use that project's Session pooler URI.
pg_restore --list backup/findit-db.dump | grep -v ' SCHEMA - public ' > restore-list.txt
pg_restore --no-owner --no-privileges --exit-on-error \
  --use-list=restore-list.txt \
  --dbname="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  backup/findit-db.dump
```

Restoring one table only (e.g. someone deleted orders by mistake): restore the whole dump into
a **new, separate** Supabase project as above, then copy the rows you need across. Never restore
over the live database directly.

**Files:** `backup/storage/<bucket>/<path>` mirrors Storage exactly. Upload each bucket's
folder back into a bucket with the same name (Supabase dashboard → Storage, or the Supabase
CLI). The `product-images` bucket must be **public**; `seller-verification` must stay
**private**.

After a restore into a new project, point Vercel's `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` at it and redeploy.

## Limits to know about

- Up to one day of data can be lost (backups are nightly, not continuous). Supabase Pro adds
  point-in-time recovery, which narrows that to seconds.
- GitHub's free artifact storage is limited (500 MB for private repos). Database dumps are
  small; if weekly file backups grow large, shorten their `retention-days` in the workflow.
- GitHub pauses scheduled workflows in repos with no activity for 60 days. Any commit
  restarts them.

When the Supabase project moves to Pro, keep this running anyway for a while: a second,
independent copy outside Supabase is still worth having.
