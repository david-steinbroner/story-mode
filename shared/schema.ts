import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// D&D Character Schema
export const characters = pgTable("characters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  storyId: varchar("story_id"),
  name: text("name").notNull(),
  class: text("class").notNull(),
  level: integer("level").default(1).notNull(),
  experience: integer("experience").default(0).notNull(),

  // Character Narrative (for world generation)
  appearance: text("appearance"),
  backstory: text("backstory"),
  race: text("race").default("Unknown"),

  // Core D&D Stats
  strength: integer("strength").default(10).notNull(),
  dexterity: integer("dexterity").default(10).notNull(),
  constitution: integer("constitution").default(10).notNull(),
  intelligence: integer("intelligence").default(10).notNull(),
  wisdom: integer("wisdom").default(10).notNull(),
  charisma: integer("charisma").default(10).notNull(),

  // Health and Resources
  currentHealth: integer("current_health").notNull(),
  maxHealth: integer("max_health").notNull(),
  currentMana: integer("current_mana").default(0).notNull(),
  maxMana: integer("max_mana").default(0).notNull(),
});

// Quest Schema
export const quests = pgTable("quests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  storyId: varchar("story_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull(), // active, completed, failed
  priority: text("priority").default("normal").notNull(), // low, normal, high, urgent
  progress: integer("progress").default(0).notNull(),
  maxProgress: integer("max_progress").default(1).notNull(),
  reward: text("reward"),
  parentQuestId: varchar("parent_quest_id"), // For quest chains
  chainId: varchar("chain_id"), // Groups related quests
  isMainStory: boolean("is_main_story").default(false).notNull(), // Main story vs side quest
});

// Inventory Item Schema
export const items = pgTable("items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  storyId: varchar("story_id"),
  name: text("name").notNull(),
  type: text("type").notNull(), // weapon, armor, consumable, misc
  description: text("description"),
  quantity: integer("quantity").default(1).notNull(),
  rarity: text("rarity").default("common").notNull(), // common, uncommon, rare, epic, legendary
  equipped: boolean("equipped").default(false).notNull(),
});

// Chat Message Schema for AI DM
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  storyId: varchar("story_id"),
  content: text("content").notNull(),
  sender: text("sender").notNull(), // player, dm, npc
  senderName: text("sender_name"),
  timestamp: text("timestamp").notNull(),
});

// Enemy Schema for Combat
export const enemies = pgTable("enemies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  level: integer("level").default(1).notNull(),
  currentHealth: integer("current_health").notNull(),
  maxHealth: integer("max_health").notNull(),
  attack: integer("attack").default(10).notNull(),
  defense: integer("defense").default(10).notNull(),
  speed: integer("speed").default(10).notNull(),
  combatId: varchar("combat_id"), // Groups enemies in same encounter
  isActive: boolean("is_active").default(true).notNull(), // Can be targeted
  abilities: text("abilities").array(), // Special abilities
});

// Campaign Schema
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastPlayed: text("last_played").default(sql`CURRENT_TIMESTAMP`).notNull(),
  isActive: boolean("is_active").default(false).notNull(),
});

// Story Summary Schema (for AI memory / rolling context)
export const storySummaries = pgTable("story_summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  storyId: varchar("story_id"),

  // The actual summary content
  summaryText: text("summary_text").notNull(),

  // What messages this summary covers (by index, not ID)
  messageStartIndex: integer("message_start_index").notNull(),
  messageEndIndex: integer("message_end_index").notNull(),
  messageCount: integer("message_count").notNull(),

  // Token tracking (for cost monitoring)
  summaryTokenCount: integer("summary_token_count"),

  // Timestamps
  createdAt: text("created_at").notNull(),

  // Status - old summaries kept with isActive=false for debugging
  isActive: boolean("is_active").default(true).notNull(),
});

// Game State Schema (now linked to campaigns)
export const gameState = pgTable("game_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  storyId: varchar("story_id"),
  campaignId: varchar("campaign_id"),
  currentScene: text("current_scene").notNull(),
  inCombat: boolean("in_combat").default(false).notNull(),
  currentTurn: text("current_turn"),
  combatId: varchar("combat_id"), // Current combat encounter
  turnCount: integer("turn_count").default(0).notNull(),

  // World Context (generated from character)
  worldSetting: text("world_setting"), // "Lint Universe", "Dark Fantasy", etc.
  worldTheme: text("world_theme"), // Tone/genre description
  worldDescription: text("world_description"), // AI-generated world summary
  generatedFromCharacter: boolean("generated_from_character").default(false).notNull(),

  // V2: Page-based story structure
  totalPages: integer("total_pages"), // null = legacy unlimited story
  currentPage: integer("current_page").default(0).notNull(),
  storyLength: text("story_length"), // 'short' (25), 'novella' (50), 'novel' (100), 'epic' (250)
  genre: text("genre"), // 'fantasy', 'mystery', 'scifi', 'romance', 'horror'
  characterDescription: text("character_description"), // Plain-text character description (V2 style)
  storyComplete: boolean("story_complete").default(false).notNull(),
});

// Create schemas
export const insertCharacterSchema = createInsertSchema(characters);
export const insertQuestSchema = createInsertSchema(quests);
export const insertItemSchema = createInsertSchema(items);
export const insertMessageSchema = createInsertSchema(messages);
export const insertEnemySchema = createInsertSchema(enemies);
export const insertGameStateSchema = createInsertSchema(gameState);
export const insertCampaignSchema = createInsertSchema(campaigns);
export const insertStorySummarySchema = createInsertSchema(storySummaries);

// Update schemas for partial updates
export const updateCharacterSchema = insertCharacterSchema.omit({ name: true, class: true }).partial();
export const updateQuestSchema = insertQuestSchema.partial();
export const updateItemSchema = insertItemSchema.partial();
export const updateEnemySchema = insertEnemySchema.partial();
export const updateGameStateSchema = insertGameStateSchema.partial();
export const updateCampaignSchema = insertCampaignSchema.partial();

// Types
export type Character = typeof characters.$inferSelect;
export type Quest = typeof quests.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Enemy = typeof enemies.$inferSelect;
export type GameState = typeof gameState.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type StorySummary = typeof storySummaries.$inferSelect;

export type InsertCharacter = z.infer<typeof insertCharacterSchema>;
export type InsertQuest = z.infer<typeof insertQuestSchema>;
export type InsertItem = z.infer<typeof insertItemSchema>;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type InsertEnemy = z.infer<typeof insertEnemySchema>;
export type InsertGameState = z.infer<typeof insertGameStateSchema>;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type InsertStorySummary = z.infer<typeof insertStorySummarySchema>;

// Legacy user schema for compatibility
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
