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
  type InsertStorySummary
} from "@shared/schema";
import { randomUUID } from "crypto";
import { DbStorage } from "./dbStorage";

// AI TTRPG Game Storage Interface
export interface IStorage {
  // User management (legacy)
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

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

  // Enemy management
  getEnemies(combatId?: string): Promise<Enemy[]>;
  getEnemy(id: string): Promise<Enemy | undefined>;
  createEnemy(enemy: InsertEnemy): Promise<Enemy>;
  updateEnemy(id: string, updates: Partial<Enemy>): Promise<Enemy | null>;
  deleteEnemy(id: string): Promise<boolean>;

  // Message history for AI conversations
  getMessages(sessionId: string, storyId?: string): Promise<Message[]>;
  getRecentMessages(sessionId: string, limit: number, storyId?: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  clearMessages(sessionId: string): Promise<void>;

  // Clear all adventure data
  clearAllAdventureData(sessionId: string, storyId?: string): Promise<void>;

  // Campaign management
  getCampaigns(): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  getActiveCampaign(): Promise<Campaign | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: string, updates: Partial<Campaign>): Promise<Campaign | null>;
  deleteCampaign(id: string): Promise<boolean>;
  setActiveCampaign(id: string): Promise<Campaign | null>;

  // Game state management
  getGameState(sessionId: string, storyId?: string): Promise<GameState | undefined>;
  getStories(sessionId: string): Promise<GameState[]>;
  createGameState(state: InsertGameState): Promise<GameState>;
  updateGameState(sessionId: string, updates: Partial<GameState>, storyId?: string): Promise<GameState>;

  // Story summary management (AI memory)
  getActiveSummary(sessionId: string, storyId?: string): Promise<StorySummary | null>;
  createSummary(sessionId: string, summary: InsertStorySummary): Promise<StorySummary>;
  deactivateSummaries(sessionId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  // MemStorage uses a constant sessionId since it's single-session in-memory storage
  private readonly MEM_SESSION_ID = 'mem-session';
  private users: Map<string, User>;
  private character: Character | undefined;
  private quests: Map<string, Quest>;
  private items: Map<string, Item>;
  private enemies: Map<string, Enemy>;
  private messages: Message[];
  private gameState: GameState | undefined;
  private campaigns: Map<string, Campaign>;
  private activeCampaignId: string | null;

  constructor() {
    this.users = new Map();
    this.quests = new Map();
    this.items = new Map();
    this.enemies = new Map();
    this.messages = [];
    this.campaigns = new Map();
    this.activeCampaignId = null;
  }

  async init(sessionId: string): Promise<void> {
    await this.initializeDefaultData();
  }

  private async initializeDefaultData(): Promise<void> {
    // Create a default character if none exists
    if (!this.character) {
      await this.createCharacter({
        sessionId: this.MEM_SESSION_ID,
        name: 'Adventurer',
        class: 'Fighter',
        level: 1,
        experience: 0,
        strength: 15,
        dexterity: 14,
        constitution: 13,
        intelligence: 12,
        wisdom: 12,
        charisma: 11,
        currentHealth: 10,
        maxHealth: 10,
        currentMana: 0,
        maxMana: 0,
      });
    }

    // Initialize with some starter items
    if (this.items.size === 0) {
      await this.createItem({
        sessionId: this.MEM_SESSION_ID,
        name: 'Iron Sword',
        type: 'weapon',
        description: 'A sturdy iron blade.',
        quantity: 1,
        rarity: 'common',
        equipped: true,
      });

      await this.createItem({
        sessionId: this.MEM_SESSION_ID,
        name: 'Leather Armor',
        type: 'armor',
        description: 'Basic protection.',
        quantity: 1,
        rarity: 'common',
        equipped: true,
      });

      await this.createItem({
        sessionId: this.MEM_SESSION_ID,
        name: 'Health Potion',
        type: 'consumable',
        description: 'Restores 25 HP.',
        quantity: 2,
        rarity: 'common',
        equipped: false,
      });
    }

    // Initialize with a starter quest
    if (this.quests.size === 0) {
      await this.createQuest({
        sessionId: this.MEM_SESSION_ID,
        title: 'Begin Your Adventure',
        description: 'Welcome to your journey! Explore the world and discover your destiny.',
        status: 'active',
        priority: 'normal',
        progress: 0,
        maxProgress: 1,
        reward: 'Experience and glory',
      });
    }

    // Initialize game state
    if (!this.gameState) {
      this.gameState = {
        id: randomUUID(),
        sessionId: this.MEM_SESSION_ID,
        storyId: null,
        campaignId: null,
        currentScene: 'Starting Village',
        inCombat: false,
        currentTurn: null,
        combatId: null,
        turnCount: 0,
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
      };
    }

    // Initialize with welcome message from DM
    if (this.messages.length === 0) {
      this.messages.push({
        id: randomUUID(),
        sessionId: this.MEM_SESSION_ID,
        storyId: null,
        content: `The morning sun breaks through the mist as you arrive at Millhaven, a bustling village nestled between ancient forests and rolling hills. The scent of fresh bread wafts from the bakery, mingling with the metallic tang of the blacksmith's forge. Weathered stone buildings line cobblestone streets, their thatched roofs still damp from last night's rain. Villagers bustle about their morning routines—merchants setting up market stalls, children chasing chickens, farmers hauling carts of vegetables—but you notice something peculiar: worried glances cast toward the shadowy forest edge, and hushed conversations that fall silent when strangers pass.

You've traveled far to reach this place, drawn by rumors that have spread throughout the kingdom. Three villagers have vanished without a trace over the past fortnight, all last seen near the old forest road. Strange howls echo through the night—sounds unlike any natural wolf. The village elder, a weathered woman named Mirela with silver-streaked hair and knowing eyes, has posted notices seeking brave adventurers to investigate these dark omens. The local tavern, "The Sleeping Dragon," stands at the village square, its wooden sign creaking in the breeze. Smoke curls from the chimney, promising warmth, ale, and perhaps information from loose-tongued locals. The morning market sprawls nearby, where you might acquire supplies for the journey ahead. And there, at the far end of the main road, the forest looms—ancient, dark, and waiting.

**What do you do?**
• Introduce yourself: Tell me about who you are, where you come from, and what brings you to Millhaven
• Visit the village elder Mirela at her cottage to learn the full details about the disappearances and accept the investigation quest
• Head to The Sleeping Dragon tavern to gather rumors from locals and learn what the common folk know about the strange occurrences
• Explore the village market to purchase supplies, weapons, potions, and equipment for your adventure
• Investigate the forest edge immediately to search for clues about the missing villagers and strange creatures`,
        sender: "dm",
        senderName: null,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }
  }

  // User management (legacy)
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Character management
  async getCharacter(sessionId: string): Promise<Character | undefined> {
    return this.character;
  }

  async createCharacter(character: InsertCharacter): Promise<Character> {
    const id = randomUUID();
    const newCharacter: Character = {
      id,
      sessionId: character.sessionId,
      storyId: character.storyId ?? null,
      name: character.name,
      class: character.class,
      level: character.level ?? 1,
      experience: character.experience ?? 0,
      appearance: character.appearance ?? null,
      backstory: character.backstory ?? null,
      race: character.race ?? "Unknown",
      strength: character.strength ?? 10,
      dexterity: character.dexterity ?? 10,
      constitution: character.constitution ?? 10,
      intelligence: character.intelligence ?? 10,
      wisdom: character.wisdom ?? 10,
      charisma: character.charisma ?? 10,
      currentHealth: character.currentHealth,
      maxHealth: character.maxHealth,
      currentMana: character.currentMana ?? 0,
      maxMana: character.maxMana ?? 0,
    };
    this.character = newCharacter;
    return this.character;
  }

  async updateCharacter(id: string, sessionId: string, updates: Partial<Character>): Promise<Character | null> {
    if (!this.character || this.character.id !== id) {
      return null;
    }
    
    const oldCharacter = { ...this.character };
    // Apply updates with validation
    const updatedCharacter = { ...this.character, ...updates };
    
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
        
        // Bonus stats based on class
        if (updatedCharacter.class === 'Fighter') {
          updatedCharacter.strength += levelDiff;
          updatedCharacter.dexterity += Math.floor(levelDiff / 2);
        } else if (updatedCharacter.class === 'Wizard') {
          updatedCharacter.intelligence += levelDiff;
          updatedCharacter.wisdom += Math.floor(levelDiff / 2);
        } else if (updatedCharacter.class === 'Rogue') {
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
    
    this.character = updatedCharacter;
    return this.character;
  }

  // Quest management
  async getQuests(sessionId: string): Promise<Quest[]> {
    return Array.from(this.quests.values()).sort((a, b) => {
      // Sort by priority (urgent > high > normal > low), then by status (active first)
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      const statusOrder = { active: 0, completed: 1, failed: 2 };
      
      const priorityDiff = priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
      if (priorityDiff !== 0) return priorityDiff;
      
      return statusOrder[a.status as keyof typeof statusOrder] - statusOrder[b.status as keyof typeof statusOrder];
    });
  }

  async getQuest(id: string, sessionId: string): Promise<Quest | undefined> {
    return this.quests.get(id);
  }

  async createQuest(quest: InsertQuest): Promise<Quest> {
    // Check if a quest with the same title already exists (prevent duplicates)
    const existingQuest = Array.from(this.quests.values()).find(
      q => q.title === quest.title && q.status === 'active'
    );

    // If duplicate found, return the existing quest instead of creating a new one
    if (existingQuest) {
      console.log(`Prevented duplicate quest creation: "${quest.title}"`);
      return existingQuest;
    }

    const id = randomUUID();
    const newQuest: Quest = {
      id,
      sessionId: quest.sessionId,
      storyId: quest.storyId ?? null,
      title: quest.title,
      description: quest.description,
      status: quest.status,
      priority: quest.priority ?? 'normal',
      progress: quest.progress ?? 0,
      maxProgress: quest.maxProgress ?? 1,
      reward: quest.reward ?? null,
      parentQuestId: quest.parentQuestId ?? null,
      chainId: quest.chainId ?? null,
      isMainStory: quest.isMainStory ?? false,
    };
    this.quests.set(id, newQuest);
    return newQuest;
  }

  async updateQuest(id: string, sessionId: string, updates: Partial<Quest>): Promise<Quest | null> {
    const quest = this.quests.get(id);
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
    const wasJustCompleted = (quest.status !== 'completed' && updatedQuest.status === 'completed') ||
                            (quest.progress < quest.maxProgress && updatedQuest.progress >= updatedQuest.maxProgress);
    
    // Auto-complete quest when progress reaches max
    if (updatedQuest.progress >= updatedQuest.maxProgress && updatedQuest.status === 'active') {
      updatedQuest.status = 'completed';
    }
    
    this.quests.set(id, updatedQuest);
    
    // Award experience if quest was just completed
    if (wasJustCompleted && this.character) {
      let expReward = 30; // Base experience
      
      // Bonus experience based on priority
      if (updatedQuest.priority === 'urgent') expReward += 40;
      else if (updatedQuest.priority === 'high') expReward += 25;
      else if (updatedQuest.priority === 'normal') expReward += 15;
      
      // Main story quests give extra experience
      if (updatedQuest.isMainStory) expReward += 30;
      
      const newExp = this.character.experience + expReward;
      
      // Apply level up logic through updateCharacter
      await this.updateCharacter(this.character.id, this.MEM_SESSION_ID, { experience: newExp });
    }
    
    // Return updated quest with completion flag for follow-up generation
    return { ...updatedQuest, wasJustCompleted } as Quest & { wasJustCompleted?: boolean };
  }

  async deleteQuest(id: string, sessionId: string): Promise<boolean> {
    return this.quests.delete(id);
  }

  // Inventory management
  async getItems(sessionId: string): Promise<Item[]> {
    return Array.from(this.items.values()).sort((a, b) => {
      // Sort by equipped status first, then by rarity, then by type
      if (a.equipped !== b.equipped) return a.equipped ? -1 : 1;
      
      const rarityOrder = { legendary: 0, epic: 1, rare: 2, uncommon: 3, common: 4 };
      const rarityDiff = rarityOrder[a.rarity as keyof typeof rarityOrder] - rarityOrder[b.rarity as keyof typeof rarityOrder];
      if (rarityDiff !== 0) return rarityDiff;
      
      const typeOrder = { weapon: 0, armor: 1, consumable: 2, misc: 3 };
      return typeOrder[a.type as keyof typeof typeOrder] - typeOrder[b.type as keyof typeof typeOrder];
    });
  }

  async getItem(id: string, sessionId: string): Promise<Item | undefined> {
    return this.items.get(id);
  }

  async createItem(item: InsertItem): Promise<Item> {
    const id = randomUUID();
    const newItem: Item = {
      id,
      sessionId: item.sessionId,
      storyId: item.storyId ?? null,
      name: item.name,
      type: item.type,
      description: item.description ?? null,
      quantity: item.quantity ?? 1,
      rarity: item.rarity ?? 'common',
      equipped: item.equipped ?? false,
    };
    this.items.set(id, newItem);
    return newItem;
  }

  async updateItem(id: string, sessionId: string, updates: Partial<Item>): Promise<Item | null> {
    const item = this.items.get(id);
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
    
    this.items.set(id, updatedItem);
    return updatedItem;
  }

  async deleteItem(id: string, sessionId: string): Promise<boolean> {
    return this.items.delete(id);
  }

  // Message history for AI conversations
  async getMessages(sessionId: string): Promise<Message[]> {
    return [...this.messages];
  }

  async getRecentMessages(sessionId: string, limit: number): Promise<Message[]> {
    return this.messages.slice(-limit);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const newMessage: Message = {
      id,
      sessionId: message.sessionId,
      storyId: message.storyId ?? null,
      content: message.content,
      sender: message.sender,
      senderName: message.senderName ?? null,
      timestamp: message.timestamp,
    };
    this.messages.push(newMessage);
    
    // Keep only the last 100 messages to prevent memory issues
    if (this.messages.length > 100) {
      this.messages = this.messages.slice(-100);
    }
    
    return newMessage;
  }

  async clearMessages(sessionId: string): Promise<void> {
    this.messages = [];
  }

  async clearQuests(sessionId: string): Promise<void> {
    this.quests.clear();
  }

  async clearAllAdventureData(sessionId: string): Promise<void> {
    // Clear all game data for a fresh start
    this.character = undefined; // Clear character
    this.messages = [];
    this.quests.clear();
    this.items.clear();
    this.enemies.clear();

    // Reset game state
    if (this.gameState) {
      this.gameState = {
        ...this.gameState,
        currentScene: "A new adventure awaits...",
        inCombat: false,
        currentTurn: null,
        turnCount: 0,
        combatId: null
      };
    }
  }

  // Game state management
  async getGameState(sessionId: string): Promise<GameState | undefined> {
    return this.gameState;
  }

  async getStories(sessionId: string): Promise<GameState[]> {
    return this.gameState ? [this.gameState] : [];
  }

  async createGameState(state: InsertGameState): Promise<GameState> {
    const id = randomUUID();
    const newGameState: GameState = {
      id,
      sessionId: state.sessionId,
      storyId: state.storyId ?? null,
      campaignId: state.campaignId ?? null,
      currentScene: state.currentScene,
      inCombat: state.inCombat ?? false,
      currentTurn: state.currentTurn ?? null,
      combatId: state.combatId ?? null,
      turnCount: state.turnCount ?? 0,
      worldSetting: state.worldSetting ?? null,
      worldTheme: state.worldTheme ?? null,
      worldDescription: state.worldDescription ?? null,
      generatedFromCharacter: state.generatedFromCharacter ?? false,
      totalPages: state.totalPages ?? null,
      currentPage: state.currentPage ?? 0,
      storyLength: state.storyLength ?? null,
      genre: state.genre ?? null,
      characterDescription: state.characterDescription ?? null,
      storyComplete: state.storyComplete ?? false,
    };
    this.gameState = newGameState;
    return this.gameState;
  }

  async updateGameState(sessionId: string, updates: Partial<GameState>): Promise<GameState> {
    if (!this.gameState) {
      throw new Error('Game state not found');
    }
    this.gameState = { ...this.gameState, ...updates };
    return this.gameState;
  }

  // Enemy management
  async getEnemies(combatId?: string): Promise<Enemy[]> {
    const enemies = Array.from(this.enemies.values());
    if (combatId) {
      return enemies.filter(enemy => enemy.combatId === combatId && enemy.isActive);
    }
    return enemies.filter(enemy => enemy.isActive);
  }

  async getEnemy(id: string): Promise<Enemy | undefined> {
    return this.enemies.get(id);
  }

  async createEnemy(enemy: InsertEnemy): Promise<Enemy> {
    const id = randomUUID();
    const newEnemy: Enemy = {
      id,
      name: enemy.name,
      level: enemy.level ?? 1,
      currentHealth: enemy.currentHealth,
      maxHealth: enemy.maxHealth,
      attack: enemy.attack ?? 10,
      defense: enemy.defense ?? 10,
      speed: enemy.speed ?? 10,
      combatId: enemy.combatId ?? null,
      isActive: enemy.isActive ?? true,
      abilities: enemy.abilities ?? [],
    };
    this.enemies.set(id, newEnemy);
    return newEnemy;
  }

  async updateEnemy(id: string, updates: Partial<Enemy>): Promise<Enemy | null> {
    const enemy = this.enemies.get(id);
    if (!enemy) {
      return null;
    }
    
    const updatedEnemy = { ...enemy, ...updates };
    
    // Ensure health doesn't exceed max and isn't negative
    if (updatedEnemy.currentHealth > updatedEnemy.maxHealth) {
      updatedEnemy.currentHealth = updatedEnemy.maxHealth;
    }
    if (updatedEnemy.currentHealth < 0) {
      updatedEnemy.currentHealth = 0;
    }

    // Mark enemy as inactive if health reaches 0
    if (updatedEnemy.currentHealth <= 0 && updatedEnemy.isActive) {
      updatedEnemy.isActive = false;
    }
    
    this.enemies.set(id, updatedEnemy);
    return updatedEnemy;
  }

  async deleteEnemy(id: string): Promise<boolean> {
    return this.enemies.delete(id);
  }

  // Campaign management
  async getCampaigns(): Promise<Campaign[]> {
    return Array.from(this.campaigns.values());
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    return this.campaigns.get(id);
  }

  async getActiveCampaign(): Promise<Campaign | undefined> {
    if (!this.activeCampaignId) return undefined;
    return this.campaigns.get(this.activeCampaignId);
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const id = randomUUID();
    const newCampaign: Campaign = { 
      ...campaign,
      description: campaign.description || '',
      id,
      createdAt: new Date().toISOString(),
      lastPlayed: new Date().toISOString(),
      isActive: false
    };
    this.campaigns.set(id, newCampaign);
    return newCampaign;
  }

  async updateCampaign(id: string, updates: Partial<Campaign>): Promise<Campaign | null> {
    const campaign = this.campaigns.get(id);
    if (!campaign) return null;
    
    const updatedCampaign = { ...campaign, ...updates };
    this.campaigns.set(id, updatedCampaign);
    return updatedCampaign;
  }

  async deleteCampaign(id: string): Promise<boolean> {
    if (this.activeCampaignId === id) {
      this.activeCampaignId = null;
    }
    return this.campaigns.delete(id);
  }

  async setActiveCampaign(id: string): Promise<Campaign | null> {
    const campaign = this.campaigns.get(id);
    if (!campaign) return null;

    // Deactivate all campaigns
    Array.from(this.campaigns.entries()).forEach(([campaignId, camp]) => {
      this.campaigns.set(campaignId, { ...camp, isActive: false });
    });

    // Activate the selected campaign
    const updatedCampaign = {
      ...campaign,
      isActive: true,
      lastPlayed: new Date().toISOString()
    };
    this.campaigns.set(id, updatedCampaign);
    this.activeCampaignId = id;

    return updatedCampaign;
  }

  // Story summary management (stub - MemStorage is backup only)
  async getActiveSummary(sessionId: string): Promise<StorySummary | null> {
    return null; // MemStorage doesn't track summaries
  }

  async createSummary(sessionId: string, summary: InsertStorySummary): Promise<StorySummary> {
    throw new Error("MemStorage does not support story summaries — use DbStorage");
  }

  async deactivateSummaries(sessionId: string): Promise<void> {
    // No-op for MemStorage
  }
}

export const storage: IStorage = new DbStorage();
