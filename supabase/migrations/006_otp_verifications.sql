-- Migration: self-managed OTP verification records, replacing the
-- Termii-hosted OTP product (lib/otpStore.ts's in-memory pinId ticket) with
-- FindIt's own hashed, expiring, attempt-limited codes — see lib/otp.ts.
-- Run this once against your EXISTING Supabase project if you already
-- applied supabase/schema.sql before this change — a fresh project can
-- just run schema.sql, which already includes this table.
--
-- Safe to re-run: uses IF NOT EXISTS throughout.

create table if not exists otp_verifications (
  id text primary key,
  -- Always E.164 (see lib/phone.ts) so the same real phone number in any
  -- input format resolves to the same OTP cycle.
  phone text not null,
  -- What this code is allowed to authorize — an OTP issued for one purpose
  -- can never be used to complete a different one (see lib/otp.ts).
  purpose text not null check (purpose in ('signup', 'reset')),
  -- The OTP itself is never stored — only a salted hash of it. The salt is
  -- per-record so two identical 6-digit codes never produce the same hash.
  otp_hash text not null,
  otp_salt text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  -- How many times this cycle's code has been resent (a fresh code each
  -- time, invalidating the previous one) — capped separately from attempts.
  resend_count integer not null default 0,
  last_sent_at timestamptz not null default now(),
  used boolean not null default false,
  request_ip text
);
create index if not exists otp_verifications_phone_purpose_idx on otp_verifications(phone, purpose);
create index if not exists otp_verifications_expires_at_idx on otp_verifications(expires_at);
create index if not exists otp_verifications_created_at_idx on otp_verifications(created_at);
alter table otp_verifications enable row level security;
