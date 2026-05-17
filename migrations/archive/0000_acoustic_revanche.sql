CREATE TABLE "campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_played" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
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
CREATE TABLE "enemies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"current_health" integer NOT NULL,
	"max_health" integer NOT NULL,
	"attack" integer DEFAULT 10 NOT NULL,
	"defense" integer DEFAULT 10 NOT NULL,
	"speed" integer DEFAULT 10 NOT NULL,
	"combat_id" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"abilities" text[]
);
--> statement-breakpoint
CREATE TABLE "game_state" (
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
	"story_complete" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
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
CREATE TABLE "messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"story_id" varchar,
	"content" text NOT NULL,
	"sender" text NOT NULL,
	"sender_name" text,
	"timestamp" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests" (
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
CREATE TABLE "story_summaries" (
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
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
