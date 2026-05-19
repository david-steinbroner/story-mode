import {
  type Character,
  type InsertCharacter,
  type Quest,
  type InsertQuest,
  type Message,
  type InsertMessage,
  type GameState,
  type InsertGameState,
  type StorySummary,
  type InsertStorySummary,
  type IssueReport,
  type InsertIssueReport,
  // v1.14.0 puzzles
  type Puzzle,
  type InsertPuzzle,
  type PuzzleAttempt,
  type InsertPuzzleAttempt,
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

  // Message history for AI conversations
  getMessages(sessionId: string, storyId?: string): Promise<Message[]>;
  getRecentMessages(sessionId: string, limit: number, storyId?: string): Promise<Message[]>;
  getMessagesBefore(sessionId: string, beforeCreatedAt: Date, limit: number, storyId?: string): Promise<Message[]>;
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

  // Issue reports (v1.13.0) — in-app bug reporting.
  createIssueReport(report: InsertIssueReport): Promise<IssueReport>;
  getIssueReports(opts: { resolved?: boolean; limit?: number }): Promise<IssueReport[]>;
  markIssueReportResolved(id: string): Promise<IssueReport | null>;

  // Puzzle CRUD (v1.14.0). See docs/specs/puzzles.md §Data model.
  createPuzzle(puzzle: InsertPuzzle): Promise<Puzzle>;
  getPuzzle(id: string): Promise<Puzzle | undefined>;
  countPuzzlesForStory(storyId: string): Promise<number>;
  recordPuzzleAttempt(attempt: InsertPuzzleAttempt): Promise<PuzzleAttempt>;
  /** Returns puzzles resolved (correct OR skipped) since the last narration call.
   *  Each puzzle appears at most once. Caller MUST follow with markResolutionConsumed. */
  getUnconsumedResolutionsForStory(storyId: string): Promise<Array<{ puzzleId: string; type: string; correct: boolean; skipped: boolean }>>;
  markResolutionConsumed(puzzleId: string, storyId: string): Promise<void>;
  /** Returns whether this puzzle is already resolved (any attempt with correct=true OR skipped=true). */
  isPuzzleResolved(puzzleId: string): Promise<{ correct: boolean; skipped: boolean } | null>;

  // Observability (Approach 7c). Both windowed to `daysBack`.
  getPuzzleFallbackRate(daysBack: number): Promise<{ total: number; fallback: number; rate: number }>;
  getStuckPuzzles(daysBack: number, minAttempts: number): Promise<Array<{ puzzleId: string; type: string; attemptCount: number; firstSeen: Date }>>;

  // Issue-report extension (Approach 7a): the existing createIssueReport already
  // accepts InsertIssueReport which (after Chunk 1 schema add) includes optional
  // puzzleId. No new method needed — flagged here for resolver review.
}

export const storage: IStorage = new DbStorage();
