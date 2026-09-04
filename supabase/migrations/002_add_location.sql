-- Migration: adds real lat/lng location columns to users, products, and
-- requests. Run this once against your EXISTING Supabase project (SQL
-- Editor -> paste -> Run) if you already applied supabase/schema.sql before
-- this change — a fresh project can just run schema.sql, which now includes
-- these columns inline.
--
-- Safe to re-run: every statement uses IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS. Adds columns only — no data is modified or deleted.

alter table users add column if not exists lat double precision;
alter table users add column if not exists lng double precision;
alter table users add column if not exists location_updated_at timestamptz;

alter table products add column if not exists lat double precision;
alter table products add column if not exists lng double precision;

alter table requests add column if not exists lat double precision;
alter table requests add column if not exists lng double precision;
