-- Migration 004: Add story_id to support multiple stories per session
-- Each story gets a unique ID; all related data (messages, characters, etc.) links to it

ALTER TABLE game_state ADD COLUMN IF NOT EXISTS story_id VARCHAR DEFAULT NULL;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS story_id VARCHAR DEFAULT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS story_id VARCHAR DEFAULT NULL;
ALTER TABLE quests ADD COLUMN IF NOT EXISTS story_id VARCHAR DEFAULT NULL;
ALTER TABLE items ADD COLUMN IF NOT EXISTS story_id VARCHAR DEFAULT NULL;
ALTER TABLE story_summaries ADD COLUMN IF NOT EXISTS story_id VARCHAR DEFAULT NULL;

-- Index for fast story lookups
CREATE INDEX IF NOT EXISTS idx_game_state_session_story ON game_state(session_id, story_id);
CREATE INDEX IF NOT EXISTS idx_messages_story ON messages(story_id);
CREATE INDEX IF NOT EXISTS idx_characters_story ON characters(story_id);
CREATE INDEX IF NOT EXISTS idx_quests_story ON quests(story_id);
CREATE INDEX IF NOT EXISTS idx_items_story ON items(story_id);
CREATE INDEX IF NOT EXISTS idx_story_summaries_story ON story_summaries(story_id);
