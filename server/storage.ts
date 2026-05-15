import {
  type Character,
  type InsertCharacter,
  type Quest,
  type InsertQuest,
  type Item,
  type InsertItem,
  type Message,
  type InsertMessage,
  type GameState,
  type InsertGameState,
  type StorySummary,
  type InsertStorySummary
} from "@shared/schema";
import { DbStorage } from "./dbStorage";

export interface IStorage {
  // Character management
  init(sessionId: string): Promise<void>;
  getCharacter(sessionId: string, storyId?: string): Promise<Character | undefined>;
  createCharacter(character: InsertCharacter): Promise<Character>;
  updateCharacter(id: string, sessionId: string, updates: Partial<Character>): Promise<Character | null>;

  // Quest management
  getQuests(sessionId: string, storyId?: string): Promise<Quest[]>;
  getQuest(id: string, sessionId: string): Promise<Quest | undefined>;
  createQuest(quest: InsertQuest): Promise<Quest>;
  updateQuest(id: string, sessionId: string, updates: Partial<Quest>): Promise<Quest | null>;
  deleteQuest(id: string, sessionId: string): Promise<boolean>;
  clearQuests(sessionId: string): Promise<void>;

  // Inventory management
  getItems(sessionId: string, storyId?: string): Promise<Item[]>;
  getItem(id: string, sessionId: string): Promise<Item | undefined>;
  createItem(item: InsertItem): Promise<Item>;
  updateItem(id: string, sessionId: string, updates: Partial<Item>): Promise<Item | null>;
  deleteItem(id: string, sessionId: string): Promise<boolean>;

  // Message history for AI conversations
  getMessages(sessionId: string, storyId?: string): Promise<Message[]>;
  getRecentMessages(sessionId: string, limit: number, storyId?: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  clearMessages(sessionId: string): Promise<void>;

  // Clear all data scoped to a session/story (used when ending or deleting a story)
  clearAllAdventureData(sessionId: string, storyId?: string): Promise<void>;

  // Game state management
  getGameState(sessionId: string, storyId?: string): Promise<GameState | undefined>;
  getStories(sessionId: string): Promise<GameState[]>;
  createGameState(state: InsertGameState): Promise<GameState>;
  updateGameState(sessionId: string, updates: Partial<GameState>, storyId?: string): Promise<GameState>;
  softDeleteStory(sessionId: string, storyId: string): Promise<boolean>;

  // Story summary management — rolling AI memory beyond the recent-messages window
  getActiveSummary(sessionId: string, storyId?: string): Promise<StorySummary | null>;
  createSummary(sessionId: string, summary: InsertStorySummary): Promise<StorySummary>;
  deactivateSummaries(sessionId: string, storyId?: string): Promise<void>;

  // Runtime app config (v1.9.0) — generic key/value store, currently only
  // used for the AI model override toggle on /admin.
  getConfig(key: string): Promise<{ value: string } | null>;
  setConfig(key: string, value: string, updatedBy?: string): Promise<void>;
}

export const storage: IStorage = new DbStorage();
