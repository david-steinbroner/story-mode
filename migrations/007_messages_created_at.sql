-- Migration 007: messages.created_at
-- The existing `timestamp` column is a text "HH:MM AM/PM" string used purely
-- for display. Ordering by it ties whenever two messages land in the same
-- minute, and Postgres returns ties in non-deterministic order — which lets
-- a player message and its AI response render out of sequence in the UI.
-- This column gives us a real monotonic sort key.
--
-- Existing rows all get NOW() at column creation, so they tie too — but no
-- *new* ties will form going forward. Backfilling existing stories from
-- timestamp + insertion sequence is intentionally not done here; it'd need a
-- separate one-shot script and was descoped from this PR.

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Single-column index helps an ORDER BY created_at scan; the composite is the
-- one the hot getMessages(session, story) query path actually uses.
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_session_story_created
  ON messages(session_id, story_id, created_at);
