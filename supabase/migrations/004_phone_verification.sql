-- Migration: adds users.phone_verified for the optional OTP phone
-- verification feature (see lib/sms.ts). Run this once against your
-- EXISTING Supabase project if you already applied supabase/schema.sql
-- before this change — a fresh project can just run schema.sql, which
-- already includes this column.
--
-- Safe to re-run: uses IF NOT EXISTS. Defaults to true so existing
-- accounts (which never went through OTP) aren't retroactively treated
-- as unverified — the flag only starts meaning anything once you set
-- TERMII_API_KEY and new signups start passing through it.

alter table users add column if not exists phone_verified boolean not null default true;
