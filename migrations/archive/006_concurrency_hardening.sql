-- Migration 006: Concurrency hardening
-- Moves the chat lock and the rate-limit buckets out of process memory so
-- both survive Render restarts and stay coherent if we scale to >1 instance.
-- Follows the same pattern Phase 3 established for story_creation_locks.

-- Per-(session, story) lock for /api/ai/chat. Key format is
-- `${sessionId}:${storyId ?? "_"}` — matches the in-memory chatLockKey()
-- shape so behavior is unchanged. Stale rows past expires_at are overwritten
-- on conflict.
CREATE TABLE IF NOT EXISTS chat_locks (
  key VARCHAR PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_locks_expires ON chat_locks(expires_at);

-- Rate-limit buckets shared by all express-rate-limit instances. Each
-- limiter (general, ai, strict) namespaces its keys via a prefix so rows
-- don't collide. Bucket resets are computed in SQL via CASE on reset_at.
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key VARCHAR PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset ON rate_limit_buckets(reset_at);

-- RLS posture (matches Phase 3 pattern): enable but create no policies, so
-- anon/authenticated roles are denied. The Express server uses the postgres
-- role and bypasses RLS.
ALTER TABLE chat_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
