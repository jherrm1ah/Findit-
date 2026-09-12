-- ---------------------------------------------------------------------------
-- 022 — Move rate limiting into the database, because in-process counting
-- stopped working the moment this app was deployed.
--
-- THE PROBLEM. lib/rateLimit.ts counted attempts in a JavaScript Map held in
-- the server process. Its own comment said this was "good enough for this
-- single-process app" and that a multi-instance deployment would need a
-- shared store. FindIt now runs on Vercel, where every request may be served
-- by a different serverless instance, each with its own empty Map, and any
-- instance can be recycled at any time. So:
--
--   - "5 login attempts per 15 minutes" was really 5 attempts per instance,
--     and an attacker spreading requests across concurrent instances got a
--     multiple of the intended allowance.
--   - A cold start reset every counter to zero, so simply pausing until a
--     new instance spun up cleared the limit.
--   - This affected the user-keyed limits too, not only the IP-keyed ones:
--     ordering, listing, messaging and checkout caps all counted per
--     instance.
--
-- THE FIX. One row per key in Postgres, incremented atomically. Every
-- instance reads and writes the same counter, and it survives cold starts.
-- A fixed window is used rather than the old sliding one: it is a single
-- atomic statement instead of a read-modify-write, which is what makes it
-- correct under concurrency, and the practical difference to an attacker is
-- negligible.
--
-- The app keeps the in-memory limiter as a FALLBACK for when this table
-- cannot be reached, so a database blip degrades protection rather than
-- locking every user out of logging in.
-- ---------------------------------------------------------------------------

create table if not exists rate_limits (
  -- The caller-supplied bucket, e.g. 'login:<ip>:<phone>' or 'order:<user id>'.
  key text primary key,
  -- Start of the current window. Rolled forward, not appended to, so this
  -- table stays one row per key rather than one row per attempt.
  window_start timestamptz not null default now(),
  hits integer not null default 0
);

-- Enabled with no policies, exactly like every other table here: nothing in
-- this app uses the anon key, and the service role bypasses RLS. See the
-- authorization note at the top of schema.sql.
alter table rate_limits enable row level security;

-- Supports the opportunistic cleanup below without scanning the whole table.
create index if not exists rate_limits_window_start_idx on rate_limits(window_start);

-- Atomic check-and-increment. One round trip, one statement, so two
-- concurrent requests can never both read the same count and both decide
-- they are under the limit.
--
-- Returns whether the caller is allowed, and how long until the window
-- resets, so the route can send a truthful Retry-After.
create or replace function check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_cutoff timestamptz := v_now - make_interval(secs => p_window_seconds);
  v_hits integer;
  v_window_start timestamptz;
begin
  insert into rate_limits as rl (key, window_start, hits)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set
      -- Still inside the window: count up. Window expired: start a new one
      -- at 1, which is this very request.
      hits = case when rl.window_start > v_cutoff then rl.hits + 1 else 1 end,
      window_start = case when rl.window_start > v_cutoff then rl.window_start else v_now end
  returning rl.hits, rl.window_start into v_hits, v_window_start;

  -- Opportunistic garbage collection. Keys are unbounded (every distinct IP
  -- and phone combination makes one), so something has to remove stale rows;
  -- doing it on roughly one call in two hundred keeps it free in the common
  -- case and avoids needing a scheduled job. A day is far longer than any
  -- window this app uses.
  if random() < 0.005 then
    delete from rate_limits where window_start < v_now - interval '1 day';
  end if;

  if v_hits > p_max then
    return query
      select
        false,
        greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer);
  else
    return query select true, 0;
  end if;
end;
$$;
