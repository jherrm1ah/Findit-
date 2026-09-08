-- Migration: profile management (photo + notification preference). Run
-- this once against your EXISTING Supabase project if you already applied
-- supabase/schema.sql before this change — a fresh project can just run
-- schema.sql, which already includes these columns.
--
-- Safe to re-run: uses IF NOT EXISTS. No existing data is modified.

alter table users add column if not exists avatar_url text;
alter table users add column if not exists notifications_enabled boolean not null default true;
