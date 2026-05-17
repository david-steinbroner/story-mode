-- Migration 008: game_state.sentiment
-- Persists the reader's once-per-story sentiment so the End Story popup and
-- the THE END footer can share the same captured value instead of asking
-- twice. Nullable — most stories will not have a sentiment recorded.

ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS sentiment TEXT;
