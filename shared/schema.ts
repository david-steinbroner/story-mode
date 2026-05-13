import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const characters = pgTable("characters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  storyId: varchar("story_id"),
  name: text("name").notNull(),
  class: text("class").notNull(),
  level: integer("level").default(1).notNull(),
  experience: integer("experience").default(0).notNull(),

  appearance: text("appearance"),
  backstory: text("backstory"),
  race: text("race").default("Unknown"),

  strength: integer("strength").default(10).notNull(),
  dexterity: integer("dexterity").default(10).notNull(),
  constitution: integer("constitution").default(10).notNull(),
  intelligence: integer("intelligence").default(10).notNull(),
  wisdom: integer("wisdom").default(10).notNull(),
  charisma: integer("charisma").default(10).notNull(),

  currentHealth: integer("current_health").notNull(),
  maxHealth: integer("max_health").notNull(),
  currentMana: integer("current_mana").default(0).notNull(),
  maxMana: integer("max_mana").default(0).notNull(),
});

export const quests = pgTable("quests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  storyId: varchar("story_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull(),
  priority: text("priority").default("normal").notNull(),
  progress: integer("progress").default(0).notNull(),
  maxProgress: integer("max_progress").default(1).notNull(),
  reward: text("reward"),
  parentQuestId: varchar("parent_quest_id"),
  chainId: varchar("chain_id"),
  isMainStory: boolean("is_main_story").default(false).notNull(),
});

export const items = pgTable("items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  storyId: varchar("story_id"),
  name: text("name").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  quantity: integer("quantity").default(1).notNull(),
  rarity: text("rarity").default("common").notNull(),
  equipped: boolean("equipped").default(false).notNull(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  storyId: varchar("story_id"),
  content: text("content").notNull(),
  sender: text("sender").notNull(),
  senderName: text("sender_name"),
  // `timestamp` is the human-friendly "HH:MM AM/PM" display string and is
  // *not* reliable for ordering — multiple messages in the same minute tie.
  // `createdAt` is the monotonic sort key the UI orders by.
  timestamp: text("timestamp").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Rolling summaries condense older message history so the AI can keep narrative
// continuity without resending every prior message — see summaryService.ts.
export const storySummaries = pgTable("story_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  storyId: varchar("story_id"),

  summaryText: text("summary_text").notNull(),

  messageStartIndex: integer("message_start_index").notNull(),
  messageEndIndex: integer("message_end_index").notNull(),
  messageCount: integer("message_count").notNull(),

  summaryTokenCount: integer("summary_token_count"),

  createdAt: text("created_at").notNull(),

  // Old summaries kept with isActive=false instead of deleted, so we can audit
  // how earlier narrative was condensed if a story goes off the rails.
  isActive: boolean("is_active").default(true).notNull(),
});

export const gameState = pgTable("game_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  storyId: varchar("story_id"),
  campaignId: varchar("campaign_id"),
  currentScene: text("current_scene").notNull(),
  inCombat: boolean("in_combat").default(false).notNull(),
  currentTurn: text("current_turn"),
  combatId: varchar("combat_id"),
  turnCount: integer("turn_count").default(0).notNull(),

  worldSetting: text("world_setting"),
  worldTheme: text("world_theme"),
  worldDescription: text("world_description"),
  generatedFromCharacter: boolean("generated_from_character").default(false).notNull(),

  // Page-based story metadata. totalPages is null for pre-V2 unlimited stories
  // (kept readable for legacy state, but new stories always set it).
  totalPages: integer("total_pages"),
  currentPage: integer("current_page").default(0).notNull(),
  storyLength: text("story_length"),
  genre: text("genre"),
  characterDescription: text("character_description"),
  storyTitle: text("story_title"),
  storyArchived: boolean("story_archived").default(false).notNull(),
  storyComplete: boolean("story_complete").default(false).notNull(),
  // Reader's sentiment about the finished story. Captured once — either inline
  // in the End Story confirmation popup or in the THE END footer when
  // revisiting a finished story from the bookshelf. Persisted so we don't
  // ask twice across the two surfaces. "up" | "down" | null.
  sentiment: text("sentiment"),
});

// Daily AI spend tally. Persisted (rather than in-memory) so the $10/day cap
// survives Render restarts and so the admin dashboard reflects real lifetime
// cost. Keyed by UTC date string; one row per day.
export const dailySpend = pgTable("daily_spend", {
  date: date("date").primaryKey(),
  requestCount: integer("request_count").default(0).notNull(),
  totalCostMicroDollars: integer("total_cost_micro_dollars").default(0).notNull(),
  totalPromptTokens: integer("total_prompt_tokens").default(0).notNull(),
  totalCompletionTokens: integer("total_completion_tokens").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Distributed lock for /api/story/new. Replaces the in-memory Map that lost
// its state on every Render restart. Each session can hold at most one lock;
// stale locks past expiresAt are ignored and overwritten.
export const storyCreationLocks = pgTable("story_creation_locks", {
  sessionId: varchar("session_id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Per-(session, story) lock for /api/ai/chat. Replaces the in-memory Map so
// the lock survives across Render instances when we scale horizontally.
// Key format: `${sessionId}:${storyId ?? "_"}` to match prior behavior.
export const chatLocks = pgTable("chat_locks", {
  key: varchar("key").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Rate-limit buckets used by the express-rate-limit Postgres store. One row
// per (limiter, session-or-ip) tuple. Key format: `${limiterPrefix}:${sessionId or ip}`.
// Replaces the default in-memory MemoryStore so buckets survive restarts and
// stay coherent across multiple instances.
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: varchar("key").primaryKey(),
  count: integer("count").default(0).notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

// Append-only behavioral event stream. Used to derive funnel and survival
// metrics that PostHog can't reconstruct (server-only events like AI fallback
// rate, plus a server-side ground truth for client-fired events that may be
// lost to ad-blockers).
export const eventLog = pgTable("event_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  storyId: varchar("story_id"),
  eventType: text("event_type").notNull(),
  properties: jsonb("properties"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertCharacterSchema = createInsertSchema(characters);
export const insertQuestSchema = createInsertSchema(quests);
export const insertItemSchema = createInsertSchema(items);
export const insertMessageSchema = createInsertSchema(messages);
export const insertGameStateSchema = createInsertSchema(gameState);
export const insertStorySummarySchema = createInsertSchema(storySummaries);

export const updateCharacterSchema = insertCharacterSchema.omit({ name: true, class: true }).partial();
export const updateQuestSchema = insertQuestSchema.partial();
export const updateItemSchema = insertItemSchema.partial();
export const updateGameStateSchema = insertGameStateSchema.partial();

export type DailySpend = typeof dailySpend.$inferSelect;
export type StoryCreationLock = typeof storyCreationLocks.$inferSelect;
export type ChatLock = typeof chatLocks.$inferSelect;
export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;
export type EventLog = typeof eventLog.$inferSelect;

export type Character = typeof characters.$inferSelect;
export type Quest = typeof quests.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type GameState = typeof gameState.$inferSelect;
export type StorySummary = typeof storySummaries.$inferSelect;

export type InsertCharacter = z.infer<typeof insertCharacterSchema>;
export type InsertQuest = z.infer<typeof insertQuestSchema>;
export type InsertItem = z.infer<typeof insertItemSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type InsertGameState = z.infer<typeof insertGameStateSchema>;
export type InsertStorySummary = z.infer<typeof insertStorySummarySchema>;
