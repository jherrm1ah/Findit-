-- Migration: supports removing admin access (demoting back to the role a
-- promoted account actually had before) — see lib/auth.ts#promoteToAdmin /
-- #demoteFromAdmin. Run this once against your EXISTING Supabase project;
-- a fresh project can just run schema.sql, which already includes this.
--
-- Safe to re-run: uses IF NOT EXISTS. Null for every existing row (nobody
-- has been promoted yet) — demoteFromAdmin falls back to "buyer" for any
-- admin account that has no previous_role on file (e.g. one created
-- directly via scripts/create-admin.mjs, which never set it).

alter table users add column if not exists previous_role text;
