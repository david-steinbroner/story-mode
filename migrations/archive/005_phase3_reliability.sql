-- Migration 005: Phase 3 reliability tables
-- Adds three tables to move state out of process memory so it survives Render
-- restarts and so admin/analytics views reflect ground truth.

-- Daily AI spend tally. One row per UTC date. Server upserts on every AI call
-- so the $10/day cap and admin dashboard share a single source of truth.
CREATE TABLE IF NOT EXISTS daily_spend (
  date DATE PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  total_cost_micro_dollars INTEGER NOT NULL DEFAULT 0,
  total_prompt_tokens INTEGER NOT NULL DEFAULT 0,
  total_completion_tokens INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Distributed lock for POST /api/story/new. Replaces an in-memory Map that
-- was lost on every Render restart. One row per session; expired rows are
-- overwritten via ON CONFLICT.
CREATE TABLE IF NOT EXISTS story_creation_locks (
  session_id VARCHAR PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_story_creation_locks_expires ON story_creation_locks(expires_at);

-- Append-only behavioral event stream. Server-side ground truth for funnel
-- metrics — PostHog can be blocked by ad-blockers, this can't.
CREATE TABLE IF NOT EXISTS event_log (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id VARCHAR NOT NULL,
  story_id VARCHAR,
  event_type TEXT NOT NULL,
  properties JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_session ON event_log(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type, created_at DESC);

-- RLS posture (matches the 6 live tables from the 2026-05-09 cleanup): enable
-- but create no policies, so anon/authenticated roles are denied. The Express
-- server uses the postgres role and bypasses RLS.
ALTER TABLE daily_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_creation_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
