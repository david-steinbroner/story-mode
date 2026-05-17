-- Migration 0002: Consolidated schema snapshot (PR-E, audit-2026-05-15)
--
-- Single source of truth for fresh-DB recovery. Created by:
--   1. `drizzle-kit generate` against current shared/schema.ts → 12 CREATE TABLE
--      statements
--   2. Manual augmentation with IF NOT EXISTS modifiers (drizzle doesn't emit
--      them natively)
--   3. Manual append of 15 indexes from hand-written migrations 004–009
--   4. Manual append of ENABLE ROW LEVEL SECURITY on all 12 tables to match
--      the established Phase 3 posture ("enable RLS, no policies; server
--      bypasses via the postgres role")
--
-- Idempotent against current prod (all CREATE statements use IF NOT EXISTS).
-- Replaces archived migrations 0000, 0001, 003–011 (see migrations/archive/).
-- Slot 002 was historically unused (file naming jumped 0001 → 003); reclaiming
-- it for this consolidation.

CREATE TABLE IF NOT EXISTS "app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "characters" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"story_id" varchar,
	"name" text NOT NULL,
	"class" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"experience" integer DEFAULT 0 NOT NULL,
	"appearance" text,
	"backstory" text,
	"race" text DEFAULT 'Unknown',
	"strength" integer DEFAULT 10 NOT NULL,
	"dexterity" integer DEFAULT 10 NOT NULL,
	"constitution" integer DEFAULT 10 NOT NULL,
	"intelligence" integer DEFAULT 10 NOT NULL,
	"wisdom" integer DEFAULT 10 NOT NULL,
	"charisma" integer DEFAULT 10 NOT NULL,
	"current_health" integer NOT NULL,
	"max_health" integer NOT NULL,
	"current_mana" integer DEFAULT 0 NOT NULL,
	"max_mana" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_locks" (
	"key" varchar PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_spend" (
	"date" date PRIMARY KEY NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"total_cost_micro_dollars" integer DEFAULT 0 NOT NULL,
	"total_prompt_tokens" integer DEFAULT 0 NOT NULL,
	"total_completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_cached_tokens" integer DEFAULT 0 NOT NULL,
	"total_cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"story_id" varchar,
	"event_type" text NOT NULL,
	"properties" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_state" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"story_id" varchar,
	"campaign_id" varchar,
	"current_scene" text NOT NULL,
	"in_combat" boolean DEFAULT false NOT NULL,
	"current_turn" text,
	"combat_id" varchar,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"world_setting" text,
	"world_theme" text,
	"world_description" text,
	"generated_from_character" boolean DEFAULT false NOT NULL,
	"total_pages" integer,
	"current_page" integer DEFAULT 0 NOT NULL,
	"story_length" text,
	"genre" text,
	"character_description" text,
	"story_title" text,
	"story_archived" boolean DEFAULT false NOT NULL,
	"story_complete" boolean DEFAULT false NOT NULL,
	"sentiment" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"story_id" varchar,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"rarity" text DEFAULT 'common' NOT NULL,
	"equipped" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"story_id" varchar,
	"content" text NOT NULL,
	"sender" text NOT NULL,
	"sender_name" text,
	"timestamp" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "quests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"story_id" varchar,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"max_progress" integer DEFAULT 1 NOT NULL,
	"reward" text,
	"parent_quest_id" varchar,
	"chain_id" varchar,
	"is_main_story" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit_buckets" (
	"key" varchar PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "story_creation_locks" (
	"session_id" varchar PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "story_summaries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"story_id" varchar,
	"summary_text" text NOT NULL,
	"message_start_index" integer NOT NULL,
	"message_end_index" integer NOT NULL,
	"message_count" integer NOT NULL,
	"summary_token_count" integer,
	"created_at" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint

-- Indexes (from hand-written migrations 004–009; not encoded in shared/schema.ts).
-- story_id fan-out (originally migration 004):
CREATE INDEX IF NOT EXISTS idx_game_state_session_story ON game_state(session_id, story_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_messages_story ON messages(story_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_characters_story ON characters(story_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_quests_story ON quests(story_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_items_story ON items(story_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_story_summaries_story ON story_summaries(story_id);
--> statement-breakpoint

-- Phase 3 reliability (originally migration 005):
CREATE INDEX IF NOT EXISTS idx_story_creation_locks_expires ON story_creation_locks(expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_event_log_session ON event_log(session_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type, created_at DESC);
--> statement-breakpoint

-- Concurrency hardening (originally migration 006):
CREATE INDEX IF NOT EXISTS idx_chat_locks_expires ON chat_locks(expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset ON rate_limit_buckets(reset_at);
--> statement-breakpoint

-- messages.created_at ordering (originally migration 007):
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_messages_session_story_created
  ON messages(session_id, story_id, created_at);
--> statement-breakpoint

-- Soft-delete partial index (originally migration 009):
CREATE INDEX IF NOT EXISTS idx_game_state_deleted_at
  ON game_state(deleted_at)
  WHERE deleted_at IS NOT NULL;
--> statement-breakpoint

-- Row-level security posture: enabled on every table, no policies attached.
-- The Express server uses the postgres role and bypasses RLS; anon/authenticated
-- roles (used by anyone hitting Supabase directly) are denied by default.
-- Established 2026-05-09 cleanup for the OG 6 tables, extended by Phase 3 (005)
-- and concurrency hardening (006). app_config (v1.9.0) inherits the same posture.
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE chat_locks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE daily_spend ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE game_state ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE story_creation_locks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE story_summaries ENABLE ROW LEVEL SECURITY;
