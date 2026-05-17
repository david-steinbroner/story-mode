-- Migration 003: Add page-based story structure to game_state
-- Story Mode V2 — March 2026
--
-- Adds columns for tracking story length, current page, genre,
-- and story completion. All nullable to support legacy sessions.

ALTER TABLE game_state ADD COLUMN IF NOT EXISTS total_pages INTEGER;
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS current_page INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS story_length TEXT;
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS genre TEXT;
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS character_description TEXT;
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS story_complete BOOLEAN NOT NULL DEFAULT false;
