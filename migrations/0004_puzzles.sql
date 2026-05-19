-- Migration 0004: generative puzzles (v1.14.0)
--
-- Lands the schema for AI-generated word puzzles (scramble, cryptogram,
-- fill-in-the-blank) as a new messages.type value, with their own tables
-- for the puzzle data, per-attempt log, and resolution-signal consumption
-- tracking. Also adds the optional issue_reports.puzzle_id link so
-- mid-puzzle issue reports point straight at the offending puzzle row.
--
-- Applied by hand in the Supabase SQL editor (see CLAUDE.md §9).
-- DO NOT run drizzle-kit migrate against prod — prod is hand-managed.
--
-- See docs/specs/puzzles.md §Data model + §Approach 7 (a).

-- messages: discriminator + optional FK to puzzles
ALTER TABLE messages ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'chat';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS puzzle_id VARCHAR;

-- puzzles: the server-side record. answer + hints are NEVER exposed to
-- the client; selected only by /api/puzzle/attempt for server-side compare.
CREATE TABLE IF NOT EXISTS puzzles (
  id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  story_id     VARCHAR NOT NULL,
  session_id   VARCHAR NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('scramble', 'cryptogram', 'fill-in-the-blank')),
  theme        TEXT NOT NULL,
  difficulty   TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  payload      JSONB NOT NULL,
  answer       TEXT NOT NULL,
  hints        JSONB NOT NULL,
  is_fallback  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_puzzles_story ON puzzles(story_id);
CREATE INDEX IF NOT EXISTS idx_puzzles_fallback_recent
  ON puzzles(created_at DESC)
  WHERE is_fallback = TRUE;
ALTER TABLE puzzles ENABLE ROW LEVEL SECURITY;

-- puzzle_attempts: one row per submission OR skip
CREATE TABLE IF NOT EXISTS puzzle_attempts (
  id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  puzzle_id     VARCHAR NOT NULL,
  session_id    VARCHAR NOT NULL,
  submission    TEXT,
  correct       BOOLEAN NOT NULL DEFAULT FALSE,
  skipped       BOOLEAN NOT NULL DEFAULT FALSE,
  hints_used    INTEGER NOT NULL DEFAULT 0,
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_puzzle  ON puzzle_attempts(puzzle_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_session ON puzzle_attempts(session_id);
ALTER TABLE puzzle_attempts ENABLE ROW LEVEL SECURITY;

-- puzzle_signals_consumed: tracks which puzzle resolutions have already
-- been folded into a narration call's context, so each fires exactly once.
CREATE TABLE IF NOT EXISTS puzzle_signals_consumed (
  puzzle_id    VARCHAR PRIMARY KEY,
  story_id     VARCHAR NOT NULL,
  consumed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_puzzle_signals_story ON puzzle_signals_consumed(story_id);
ALTER TABLE puzzle_signals_consumed ENABLE ROW LEVEL SECURITY;

-- FK from messages.puzzle_id → puzzles.id. ON DELETE SET NULL: a deleted
-- puzzle row leaves the chat message intact (puzzle_id becomes NULL).
ALTER TABLE messages
  ADD CONSTRAINT fk_messages_puzzle
  FOREIGN KEY (puzzle_id) REFERENCES puzzles(id) ON DELETE SET NULL;

-- issue_reports: optional puzzle attachment for mid-puzzle reports.
-- No FK constraint — link is informational; report survives puzzle cleanup.
ALTER TABLE issue_reports ADD COLUMN IF NOT EXISTS puzzle_id VARCHAR;

-- app_config seeds: budgets per story length + master feature gate.
-- Default budgets per docs/specs/puzzles.md §Approach 4. The flag starts
-- FALSE so this migration is inert until rollout (Chunk 6).
--
-- v1.14.1 + /ultrareview bug_004: split into two statements so the budgets
-- row UPSERTS (re-running the migration with an updated JSON actually lands
-- the new value in prod) while the flag row stays DO NOTHING (we never want
-- to clobber a flag flip by re-applying the migration).
INSERT INTO app_config (key, value, updated_at) VALUES
  ('puzzle_budgets',
   '{"25":{"target":2,"cap":2},"50":{"target":2,"cap":3},"100":{"target":4,"cap":5},"250":{"target":7,"cap":10}}',
   NOW())
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = NOW();

INSERT INTO app_config (key, value, updated_at) VALUES
  ('puzzles_enabled', 'false', NOW())
ON CONFLICT (key) DO NOTHING;
