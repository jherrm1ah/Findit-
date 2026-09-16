-- ---------------------------------------------------------------------------
-- 028 — Pin check_rate_limit's search_path.
--
-- Supabase's security linter (mcp__Supabase__get_advisors) flags
-- check_rate_limit (migration 022) for a mutable search_path: a function
-- with no search_path pinned resolves unqualified names (rate_limits) using
-- whatever search_path is in effect when it runs, which is not guaranteed
-- to be the same one it was written against. Pinning it to 'public' is
-- the standard fix — it keeps every existing unqualified reference in the
-- function body working exactly as before, it's just no longer resolvable
-- to anything other than the public schema.
-- ---------------------------------------------------------------------------

alter function public.check_rate_limit(text, integer, integer) set search_path = public;
