-- Migration 011: cache_token columns on daily_spend
-- Adds two integer counters so we can attribute Anthropic prompt-cache
-- savings on the admin dashboard:
--   total_cached_tokens       — tokens served from the cache (cache hits)
--   total_cache_write_tokens  — tokens written into the cache on this call
-- Both default to 0 so existing rows interpret as "no cache activity",
-- which is true historically (caching wasn't enabled before v1.10.0).
--
-- These counters are subsets of total_prompt_tokens. The cost math in
-- server/spendTracker.ts uses them to break input cost into uncached,
-- cached-read (0.10× base), and cache-write (1.25× base) buckets.

ALTER TABLE daily_spend
  ADD COLUMN IF NOT EXISTS total_cached_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_cache_write_tokens integer NOT NULL DEFAULT 0;
