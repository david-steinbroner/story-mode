import { db } from "./db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { type IStorage } from "./storage";
import {
  type User,
  type InsertUser,
  type Character,
  type InsertCharacter,
  type Quest,
  type InsertQuest,
  type Item,
  type InsertItem,
  type Message,
  type InsertMessage,
  type Enemy,
  type InsertEnemy,
  type GameState,
  type InsertGameState,
  type Campaign,
  type InsertCampaign,
  type StorySummary,
  type InsertStorySummary,
  characters,
  quests,
  items,
  messages,
  gameState,
  storySummaries,
} from "@shared/schema";

/**
 * Database-backed storage implementation with session isolation.
 * All data is scoped to a sessionId to ensure each browser session has isolated game state.
 */
export class DbStorage implements IStorage {
  // ============================================================
  // USER MANAGEMENT (Legacy — scheduled for deletion)
  // ============================================================

  async getUser(id: string): Promise<User | undefined> {
    throw new Error("Not implemented — scheduled for deletion");
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    throw new Error("Not implemented — scheduled for deletion");
  }

  async createUser(user: InsertUser): Promise<User> {
    throw new Error("Not implemented — scheduled for deletion");
  }

  // ============================================================
  // CHARACTER MANAGEMENT
  // ============================================================

  async init(sessionId: string): Promise<void> {
    try {
      // Check if character exists for this session
      const existingCharacter = await this.getCharacter(sessionId);
      if (existingCharacter) {
        return; // Session already initialized
      }

      // No default initialization — user must create their own character
      // This differs from MemStorage which created a default character
    } catch (error) {
      throw new Error(`Failed to initialize session: ${error instanceof Error ? error.message : error}`);
    }
  }

  async getCharacter(sessionId: string, storyId?: string): Promise<Character | undefined> {
    try {
      const conditions = [eq(characters.sessionId, sessionId)];
      if (storyId) conditions.push(eq(characters.storyId, storyId));
      const result = await db
        .select()
        .from(characters)
        .where(and(...conditions))
        .limit(1);
      return result[0] || undefined;
    } catch (error) {
      throw new Error(`Failed to get character: ${error instanceof Error ? error.message : error}`);
    }
  }

  async createCharacter(character: InsertCharacter): Promise<Character> {
    try {
      const result = await db
        .insert(characters)
        .values(character)
        .returning();
      return result[0];
    } catch (error) {
      throw new Error(`Failed to create character: ${error instanceof Error ? error.message : error}`);
    }
  }

  async updateCharacter(id: string, sessionId: string, updates: Partial<Character>): Promise<Character | null> {
    try {
      // Get current character state
      const currentResult = await db
        .select()
        .from(characters)
        .where(and(eq(characters.id, id), eq(characters.sessionId, sessionId)))
        .limit(1);

      const oldCharacter = currentResult[0];
      if (!oldCharacter) {
        return null;
      }

      // Apply updates with validation
      const updatedCharacter = { ...oldCharacter, ...updates };

      // Check for level up if experience increased
      if (updates.experience !== undefined && updates.experience > oldCharacter.experience) {
        const newLevel = Math.floor(updatedCharacter.experience / 100) + 1; // Level up every 100 exp

        if (newLevel > oldCharacter.level) {
          // Level up! Increase stats and health/mana
          const levelDiff = newLevel - oldCharacter.level;

          updatedCharacter.level = newLevel;
          updatedCharacter.maxHealth += levelDiff * 5; // +5 HP per level
          updatedCharacter.maxMana += levelDiff * 3; // +3 Mana per level
          updatedCharacter.currentHealth = updatedCharacter.maxHealth; // Full heal on level up
          updatedCharacter.currentMana = updatedCharacter.maxMana;

          // Increase primary stats
          updatedCharacter.strength += levelDiff;
          updatedCharacter.constitution += levelDiff;

          // Legacy class-based bonuses (no longer relevant but harmless)
          if (updatedCharacter.class === "Fighter") {
            updatedCharacter.strength += levelDiff;
            updatedCharacter.dexterity += Math.floor(levelDiff / 2);
          } else if (updatedCharacter.class === "Wizard") {
            updatedCharacter.intelligence += levelDiff;
            updatedCharacter.wisdom += Math.floor(levelDiff / 2);
          } else if (updatedCharacter.class === "Rogue") {
            updatedCharacter.dexterity += levelDiff;
            updatedCharacter.charisma += Math.floor(levelDiff / 2);
          }
        }
      }

      // Ensure health doesn't exceed max and isn't negative
      if (updatedCharacter.currentHealth > updatedCharacter.maxHealth) {
        updatedCharacter.currentHealth = updatedCharacter.maxHealth;
      }
      if (updatedCharacter.currentHealth < 0) {
        updatedCharacter.currentHealth = 0;
      }

      // Ensure mana doesn't exceed max and isn't negative
      if (updatedCharacter.currentMana > updatedCharacter.maxMana) {
        updatedCharacter.currentMana = updatedCharacter.maxMana;
      }
      if (updatedCharacter.currentMana < 0) {
        updatedCharacter.currentMana = 0;
      }

      // Remove id and sessionId from updates to avoid overwriting
      const { id: _id, sessionId: _sessionId, ...safeUpdates } = updatedCharacter;

      const result = await db
        .update(characters)
        .set(safeUpdates)
        .where(and(eq(characters.id, id), eq(characters.sessionId, sessionId)))
        .returning();

      return result[0] || null;
    } catch (error) {
      throw new Error(`Failed to update character: ${error instanceof Error ? error.message : error}`);
    }
  }

  // ============================================================
  // QUEST MANAGEMENT
  // ============================================================

  async getQuests(sessionId: string, storyId?: string): Promise<Quest[]> {
    try {
      const conditions = [eq(quests.sessionId, sessionId)];
      if (storyId) conditions.push(eq(quests.storyId, storyId));
      const result = await db
        .select()
        .from(quests)
        .where(and(...conditions));

      // Sort by priority (urgent > high > normal > low), then by status (active first)
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      const statusOrder: Record<string, number> = { active: 0, completed: 1, failed: 2 };

      return result.sort((a, b) => {
        const priorityDiff = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
        if (priorityDiff !== 0) return priorityDiff;
        return (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
      });
    } catch (error) {
      throw new Error(`Failed to get quests: ${error instanceof Error ? error.message : error}`);
    }
  }

  async getQuest(id: string, sessionId: string): Promise<Quest | undefined> {
    try {
      const result = await db
        .select()
        .from(quests)
        .where(and(eq(quests.id, id), eq(quests.sessionId, sessionId)))
        .limit(1);
      return result[0] || undefined;
    } catch (error) {
      throw new Error(`Failed to get quest: ${error instanceof Error ? error.message : error}`);
    }
  }

  async createQuest(quest: InsertQuest): Promise<Quest> {
    try {
      // Check if a quest with the same title already exists (prevent duplicates)
      const existingQuests = await db
        .select()
        .from(quests)
        .where(
          and(
            eq(quests.sessionId, quest.sessionId),
            eq(quests.title, quest.title),
            eq(quests.status, "active")
          )
        )
        .limit(1);

      // If duplicate found, return the existing quest instead of creating a new one
      if (existingQuests.length > 0) {
        console.log(`Prevented duplicate quest creation: "${quest.title}"`);
        return existingQuests[0];
      }

      const result = await db
        .insert(quests)
        .values(quest)
        .returning();
      return result[0];
    } catch (error) {
      throw new Error(`Failed to create quest: ${error instanceof Error ? error.message : error}`);
    }
  }

  async updateQuest(id: string, sessionId: string, updates: Partial<Quest>): Promise<Quest | null> {
    try {
      // Get current quest state
      const currentResult = await db
        .select()
        .from(quests)
        .where(and(eq(quests.id, id), eq(quests.sessionId, sessionId)))
        .limit(1);

      const quest = currentResult[0];
      if (!quest) {
        return null;
      }

      const updatedQuest = { ...quest, ...updates };

      // Ensure progress doesn't exceed max and isn't negative
      if (updatedQuest.progress > updatedQuest.maxProgress) {
        updatedQuest.progress = updatedQuest.maxProgress;
      }
      if (updatedQuest.progress < 0) {
        updatedQuest.progress = 0;
      }

      // Detect quest completion - either status changed to completed OR progress reached max
      const wasJustCompleted =
        (quest.status !== "completed" && updatedQuest.status === "completed") ||
        (quest.progress < quest.maxProgress && updatedQuest.progress >= updatedQuest.maxProgress);

      // Auto-complete quest when progress reaches max
      if (updatedQuest.progress >= updatedQuest.maxProgress && updatedQuest.status === "active") {
        updatedQuest.status = "completed";
      }

      // Remove id and sessionId from updates to avoid overwriting
      const { id: _id, sessionId: _sessionId, ...safeUpdates } = updatedQuest;

      const result = await db
        .update(quests)
        .set(safeUpdates)
        .where(and(eq(quests.id, id), eq(quests.sessionId, sessionId)))
        .returning();

      // Award experience if quest was just completed
      if (wasJustCompleted) {
        const character = await db
          .select()
          .from(characters)
          .where(eq(characters.sessionId, quest.sessionId))
          .limit(1);

        if (character[0]) {
          let expReward = 30; // Base experience

          // Bonus experience based on priority
          if (updatedQuest.priority === "urgent") expReward += 40;
          else if (updatedQuest.priority === "high") expReward += 25;
          else if (updatedQuest.priority === "normal") expReward += 15;

          // Main story quests give extra experience
          if (updatedQuest.isMainStory) expReward += 30;

          const newExp = character[0].experience + expReward;

          // Apply level up logic through updateCharacter
          await this.updateCharacter(character[0].id, sessionId, { experience: newExp });
        }
      }

      // Return updated quest with completion flag for follow-up generation
      return { ...result[0], wasJustCompleted } as Quest & { wasJustCompleted?: boolean };
    } catch (error) {
      throw new Error(`Failed to update quest: ${error instanceof Error ? error.message : error}`);
    }
  }

  async deleteQuest(id: string, sessionId: string): Promise<boolean> {
    try {
      const result = await db
        .delete(quests)
        .where(and(eq(quests.id, id), eq(quests.sessionId, sessionId)))
        .returning();
      return result.length > 0;
    } catch (error) {
      throw new Error(`Failed to delete quest: ${error instanceof Error ? error.message : error}`);
    }
  }

  async clearQuests(sessionId: string): Promise<void> {
    try {
      await db
        .delete(quests)
        .where(eq(quests.sessionId, sessionId));
    } catch (error) {
      throw new Error(`Failed to clear quests: ${error instanceof Error ? error.message : error}`);
    }
  }

  // ============================================================
  // INVENTORY MANAGEMENT
  // ============================================================

  async getItems(sessionId: string, storyId?: string): Promise<Item[]> {
    try {
      const conditions = [eq(items.sessionId, sessionId)];
      if (storyId) conditions.push(eq(items.storyId, storyId));
      const result = await db
        .select()
        .from(items)
        .where(and(...conditions));

      // Sort by equipped status first, then by rarity, then by type
      const rarityOrder: Record<string, number> = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
      const typeOrder: Record<string, number> = { weapon: 0, armor: 1, consumable: 2, misc: 3 };

      return result.sort((a, b) => {
        if (a.equipped !== b.equipped) return a.equipped ? -1 : 1;
        const rarityDiff = (rarityOrder[a.rarity] ?? 4) - (rarityOrder[b.rarity] ?? 4);
        if (rarityDiff !== 0) return rarityDiff;
        return (typeOrder[a.type] ?? 3) - (typeOrder[b.type] ?? 3);
      });
    } catch (error) {
      throw new Error(`Failed to get items: ${error instanceof Error ? error.message : error}`);
    }
  }

  async getItem(id: string, sessionId: string): Promise<Item | undefined> {
    try {
      const result = await db
        .select()
        .from(items)
        .where(and(eq(items.id, id), eq(items.sessionId, sessionId)))
        .limit(1);
      return result[0] || undefined;
    } catch (error) {
      throw new Error(`Failed to get item: ${error instanceof Error ? error.message : error}`);
    }
  }

  async createItem(item: InsertItem): Promise<Item> {
    try {
      const result = await db
        .insert(items)
        .values(item)
        .returning();
      return result[0];
    } catch (error) {
      throw new Error(`Failed to create item: ${error instanceof Error ? error.message : error}`);
    }
  }

  async updateItem(id: string, sessionId: string, updates: Partial<Item>): Promise<Item | null> {
    try {
      // Get current item state
      const currentResult = await db
        .select()
        .from(items)
        .where(and(eq(items.id, id), eq(items.sessionId, sessionId)))
        .limit(1);

      const item = currentResult[0];
      if (!item) {
        return null;
      }

      const updatedItem = { ...item, ...updates };

      // Ensure quantity isn't negative
      if (updatedItem.quantity < 0) {
        updatedItem.quantity = 0;
      }

      // If equipped, ensure quantity is at least 1
      if (updatedItem.equipped && updatedItem.quantity === 0) {
        updatedItem.equipped = false;
      }

      // Remove id and sessionId from updates to avoid overwriting
      const { id: _id, sessionId: _sessionId, ...safeUpdates } = updatedItem;

      const result = await db
        .update(items)
        .set(safeUpdates)
        .where(and(eq(items.id, id), eq(items.sessionId, sessionId)))
        .returning();

      return result[0] || null;
    } catch (error) {
      throw new Error(`Failed to update item: ${error instanceof Error ? error.message : error}`);
    }
  }

  async deleteItem(id: string, sessionId: string): Promise<boolean> {
    try {
      const result = await db
        .delete(items)
        .where(and(eq(items.id, id), eq(items.sessionId, sessionId)))
        .returning();
      return result.length > 0;
    } catch (error) {
      throw new Error(`Failed to delete item: ${error instanceof Error ? error.message : error}`);
    }
  }

  // ============================================================
  // MESSAGE HISTORY
  // ============================================================

  async getMessages(sessionId: string, storyId?: string): Promise<Message[]> {
    try {
      const conditions = [eq(messages.sessionId, sessionId)];
      if (storyId) conditions.push(eq(messages.storyId, storyId));
      const result = await db
        .select()
        .from(messages)
        .where(and(...conditions))
        .orderBy(asc(messages.timestamp));
      return result;
    } catch (error) {
      throw new Error(`Failed to get messages: ${error instanceof Error ? error.message : error}`);
    }
  }

  async getRecentMessages(sessionId: string, limit: number, storyId?: string): Promise<Message[]> {
    try {
      const conditions = [eq(messages.sessionId, sessionId)];
      if (storyId) conditions.push(eq(messages.storyId, storyId));
      const result = await db
        .select()
        .from(messages)
        .where(and(...conditions))
        .orderBy(desc(messages.id))
        .limit(limit);
      return result.reverse();
    } catch (error) {
      throw new Error(`Failed to get recent messages: ${error instanceof Error ? error.message : error}`);
    }
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    try {
      const result = await db
        .insert(messages)
        .values(message)
        .returning();
      return result[0];
    } catch (error) {
      throw new Error(`Failed to create message: ${error instanceof Error ? error.message : error}`);
    }
  }

  async clearMessages(sessionId: string): Promise<void> {
    try {
      await db
        .delete(messages)
        .where(eq(messages.sessionId, sessionId));
    } catch (error) {
      throw new Error(`Failed to clear messages: ${error instanceof Error ? error.message : error}`);
    }
  }

  // ============================================================
  // GAME STATE MANAGEMENT
  // ============================================================

  async getGameState(sessionId: string, storyId?: string): Promise<GameState | undefined> {
    try {
      const conditions = [eq(gameState.sessionId, sessionId)];
      if (storyId) conditions.push(eq(gameState.storyId, storyId));
      const result = await db
        .select()
        .from(gameState)
        .where(and(...conditions))
        .limit(1);
      return result[0] || undefined;
    } catch (error) {
      throw new Error(`Failed to get game state: ${error instanceof Error ? error.message : error}`);
    }
  }

  async getStories(sessionId: string): Promise<GameState[]> {
    try {
      const result = await db
        .select()
        .from(gameState)
        .where(and(
          eq(gameState.sessionId, sessionId),
          // Only return V2 stories (those with a storyId and totalPages)
          sql`${gameState.storyId} IS NOT NULL`
        ))
        .orderBy(desc(gameState.id));
      return result;
    } catch (error) {
      throw new Error(`Failed to get stories: ${error instanceof Error ? error.message : error}`);
    }
  }

  async createGameState(state: InsertGameState): Promise<GameState> {
    try {
      const result = await db
        .insert(gameState)
        .values(state)
        .returning();
      return result[0];
    } catch (error) {
      throw new Error(`Failed to create game state: ${error instanceof Error ? error.message : error}`);
    }
  }

  async updateGameState(sessionId: string, updates: Partial<GameState>, storyId?: string): Promise<GameState> {
    try {
      // Remove id and sessionId from updates to avoid overwriting
      const { id: _id, sessionId: _sessionId, storyId: _storyId, ...safeUpdates } = updates;

      const conditions = [eq(gameState.sessionId, sessionId)];
      if (storyId) conditions.push(eq(gameState.storyId, storyId));

      const result = await db
        .update(gameState)
        .set(safeUpdates)
        .where(and(...conditions))
        .returning();

      if (!result[0]) {
        throw new Error("Game state not found");
      }

      return result[0];
    } catch (error) {
      throw new Error(`Failed to update game state: ${error instanceof Error ? error.message : error}`);
    }
  }

  // ============================================================
  // STORY SUMMARY MANAGEMENT (AI Memory)
  // ============================================================

  async getActiveSummary(sessionId: string, storyId?: string): Promise<StorySummary | null> {
    try {
      const conditions = [
        eq(storySummaries.sessionId, sessionId),
        eq(storySummaries.isActive, true)
      ];
      if (storyId) conditions.push(eq(storySummaries.storyId, storyId));
      const result = await db
        .select()
        .from(storySummaries)
        .where(and(...conditions))
        .orderBy(desc(storySummaries.createdAt))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      throw new Error(`Failed to get active summary: ${error instanceof Error ? error.message : error}`);
    }
  }

  async createSummary(sessionId: string, summary: InsertStorySummary): Promise<StorySummary> {
    try {
      const result = await db
        .insert(storySummaries)
        .values({
          ...summary,
          sessionId,
          isActive: true,
        })
        .returning();
      return result[0];
    } catch (error) {
      throw new Error(`Failed to create summary: ${error instanceof Error ? error.message : error}`);
    }
  }

  async deactivateSummaries(sessionId: string, storyId?: string): Promise<void> {
    try {
      const conditions = [eq(storySummaries.sessionId, sessionId)];
      if (storyId) conditions.push(eq(storySummaries.storyId, storyId));
      await db
        .update(storySummaries)
        .set({ isActive: false })
        .where(and(...conditions));
    } catch (error) {
      throw new Error(`Failed to deactivate summaries: ${error instanceof Error ? error.message : error}`);
    }
  }

  // ============================================================
  // UTILITY
  // ============================================================

  async clearAllAdventureData(sessionId: string, storyId?: string): Promise<void> {
    try {
      if (storyId) {
        // Clear data for a specific story only
        await db.delete(messages).where(and(eq(messages.sessionId, sessionId), eq(messages.storyId, storyId)));
        await db.delete(quests).where(and(eq(quests.sessionId, sessionId), eq(quests.storyId, storyId)));
        await db.delete(items).where(and(eq(items.sessionId, sessionId), eq(items.storyId, storyId)));
        await db.delete(characters).where(and(eq(characters.sessionId, sessionId), eq(characters.storyId, storyId)));
        await db.delete(storySummaries).where(and(eq(storySummaries.sessionId, sessionId), eq(storySummaries.storyId, storyId)));
        await db.delete(gameState).where(and(eq(gameState.sessionId, sessionId), eq(gameState.storyId, storyId)));
      } else {
        // Legacy: clear all data for the session
        await db.delete(messages).where(eq(messages.sessionId, sessionId));
        await db.delete(quests).where(eq(quests.sessionId, sessionId));
        await db.delete(items).where(eq(items.sessionId, sessionId));
        await db.delete(characters).where(eq(characters.sessionId, sessionId));
        await db.delete(storySummaries).where(eq(storySummaries.sessionId, sessionId));

        // Reset game state
        const existingState = await this.getGameState(sessionId);
        if (existingState) {
          await this.updateGameState(sessionId, {
            currentScene: "A new adventure awaits...",
            inCombat: false,
            currentTurn: null,
            turnCount: 0,
            combatId: null,
            worldSetting: null,
            worldTheme: null,
            worldDescription: null,
            generatedFromCharacter: false,
            totalPages: null,
            currentPage: 0,
            storyLength: null,
            genre: null,
            characterDescription: null,
            storyComplete: false,
          });
        }
      }
    } catch (error) {
      throw new Error(`Failed to clear adventure data: ${error instanceof Error ? error.message : error}`);
    }
  }

  // ============================================================
  // ENEMY MANAGEMENT (Legacy — scheduled for deletion)
  // ============================================================

  async getEnemies(combatId?: string): Promise<Enemy[]> {
    throw new Error("Not implemented — scheduled for deletion");
  }

  async getEnemy(id: string): Promise<Enemy | undefined> {
    throw new Error("Not implemented — scheduled for deletion");
  }

  async createEnemy(enemy: InsertEnemy): Promise<Enemy> {
    throw new Error("Not implemented — scheduled for deletion");
  }

  async updateEnemy(id: string, updates: Partial<Enemy>): Promise<Enemy | null> {
    throw new Error("Not implemented — scheduled for deletion");
  }

  async deleteEnemy(id: string): Promise<boolean> {
    throw new Error("Not implemented — scheduled for deletion");
  }

  // ============================================================
  // CAMPAIGN MANAGEMENT (Legacy — scheduled for deletion)
  // ============================================================

  async getCampaigns(): Promise<Campaign[]> {
    throw new Error("Not implemented — scheduled for deletion");
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    throw new Error("Not implemented — scheduled for deletion");
  }

  async getActiveCampaign(): Promise<Campaign | undefined> {
    throw new Error("Not implemented — scheduled for deletion");
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    throw new Error("Not implemented — scheduled for deletion");
  }

  async updateCampaign(id: string, updates: Partial<Campaign>): Promise<Campaign | null> {
    throw new Error("Not implemented — scheduled for deletion");
  }

  async deleteCampaign(id: string): Promise<boolean> {
    throw new Error("Not implemented — scheduled for deletion");
  }

  async setActiveCampaign(id: string): Promise<Campaign | null> {
    throw new Error("Not implemented — scheduled for deletion");
  }
}

// Export singleton instance
export const dbStorage = new DbStorage();
