-- Migration 009: game_state.deleted_at
-- Soft-delete for stories. `DELETE /api/stories/:storyId` now sets deleted_at
-- instead of cascading wipes. Bookshelf queries filter on `deleted_at IS NULL`.
-- A lazy purge in getStories hard-deletes rows where deleted_at is older than
-- 30 days, calling the existing clearAllAdventureData cascade as the real
-- delete. Gives support a 30-day window to recover a story a reader regrets
-- deleting; gives users themselves the popup-warned "30 days then gone" model.

ALTER TABLE game_state
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial index on the soft-deleted rows so the 30-day purge sweep is cheap
-- (it only scans deleted rows, not the whole table).
CREATE INDEX IF NOT EXISTS idx_game_state_deleted_at
  ON game_state(deleted_at)
  WHERE deleted_at IS NOT NULL;
