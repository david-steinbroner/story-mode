import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import {
  insertCharacterSchema,
  insertQuestSchema,
  insertItemSchema,
  insertMessageSchema,
  insertEnemySchema,
  insertGameStateSchema,
  insertCampaignSchema,
  updateEnemySchema,
  type Character,
  type Quest,
  type Item,
  type Enemy,
  type Campaign,
  type Message
} from "@shared/schema";
import { z } from "zod";
import { aiLimiter, generalLimiter, strictLimiter } from "./rateLimit";
import { spendTracker } from "./spendTracker";
import { aiService, type AIResponse } from "./aiService";
import OpenAI from "openai";

// Validation schemas for updates
const updateCharacterSchema = insertCharacterSchema.partial().refine(
  (data) => {
    if (data.currentHealth !== undefined && data.maxHealth !== undefined) {
      return data.currentHealth <= data.maxHealth && data.currentHealth >= 0;
    }
    if (data.currentHealth !== undefined) {
      return data.currentHealth >= 0;
    }
    if (data.currentMana !== undefined && data.maxMana !== undefined) {
      return data.currentMana <= data.maxMana && data.currentMana >= 0;
    }
    if (data.currentMana !== undefined) {
      return data.currentMana >= 0;
    }
    return true;
  },
  { message: "Health and mana values must be valid" }
);

const updateQuestSchema = insertQuestSchema.partial().refine(
  (data) => {
    if (data.progress !== undefined && data.maxProgress !== undefined) {
      return data.progress <= data.maxProgress && data.progress >= 0;
    }
    if (data.progress !== undefined) {
      return data.progress >= 0;
    }
    return true;
  },
  { message: "Quest progress must be valid" }
);

const updateItemSchema = insertItemSchema.partial().refine(
  (data) => {
    if (data.quantity !== undefined) {
      return data.quantity >= 0;
    }
    return true;
  },
  { message: "Item quantity must be non-negative" }
);

const updateQuestSchemaForAI = insertQuestSchema.partial().refine(
  (data) => {
    if (data.progress !== undefined && data.maxProgress !== undefined) {
      return data.progress <= data.maxProgress && data.progress >= 0;
    }
    if (data.progress !== undefined) {
      return data.progress >= 0;
    }
    return true;
  },
  { message: "Quest progress must be valid" }
);

/**
 * Shared helper to apply AI response actions to game state.
 * Used by both /api/ai/chat and /api/ai/quick-action endpoints.
 */
async function applyAIResponse(
  sessionId: string,
  playerMessage: string,
  aiResponseData: AIResponse,
  storyId?: string
): Promise<Message> {
  // Store the player message
  await storage.createMessage({
    sessionId,
    storyId: storyId ?? null,
    content: playerMessage,
    sender: 'player',
    senderName: null,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });

  // Store the AI response
  const aiMessage = await storage.createMessage({
    sessionId,
    storyId: storyId ?? null,
    content: aiResponseData.content,
    sender: aiResponseData.sender,
    senderName: aiResponseData.senderName,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });

  // Apply any game actions from the AI response with validation
  if (aiResponseData.actions) {
    const actions = aiResponseData.actions;

    // Update quest if specified
    if (actions.updateQuest) {
      const questValidation = updateQuestSchemaForAI.safeParse(actions.updateQuest.updates);
      if (questValidation.success) {
        const updatedQuest = await storage.updateQuest(actions.updateQuest.id, sessionId, questValidation.data);

        // Generate follow-up quest if main story quest was just completed
        if (updatedQuest && (updatedQuest as any).wasJustCompleted && updatedQuest.isMainStory) {
          try {
            const character = await storage.getCharacter(sessionId);
            const gameState = await storage.getGameState(sessionId);
            const followUpQuest = await aiService.generateFollowUpQuest(updatedQuest, { character, gameState });

            if (followUpQuest) {
              // Ensure the completed quest has a chainId for consistency
              if (!updatedQuest.chainId) {
                await storage.updateQuest(updatedQuest.id, sessionId, { chainId: updatedQuest.id });
              }

              // Validate and create follow-up quest
              const followUpValidation = insertQuestSchema.safeParse({
                ...followUpQuest,
                sessionId,
                parentQuestId: updatedQuest.id,
                chainId: updatedQuest.chainId || updatedQuest.id,
                isMainStory: true
              });

              if (followUpValidation.success) {
                await storage.createQuest(followUpValidation.data);
              } else {
                console.warn('Invalid follow-up quest data:', followUpValidation.error.errors);
              }
            }
          } catch (error) {
            console.warn('Error generating follow-up quest:', error);
          }
        }
      } else {
        console.warn('Invalid AI quest update:', questValidation.error.errors);
      }
    }

    // Create new quest if specified
    if (actions.createQuest) {
      const questValidation = insertQuestSchema.safeParse({ ...actions.createQuest, sessionId });
      if (questValidation.success) {
        await storage.createQuest(questValidation.data);
      } else {
        console.warn('Invalid AI quest creation:', questValidation.error.errors);
      }
    }

    // Update character if specified
    if (actions.updateCharacter) {
      const character = await storage.getCharacter(sessionId);
      if (character) {
        const charValidation = insertCharacterSchema.partial().safeParse(actions.updateCharacter.updates);
        if (charValidation.success) {
          await storage.updateCharacter(character.id, sessionId, charValidation.data);
        } else {
          console.warn('Invalid AI character update:', charValidation.error.errors);
        }
      }
    }

    // Update game state if specified
    if (actions.updateGameState) {
      const gameStateValidation = insertGameStateSchema.partial().safeParse(actions.updateGameState);
      if (gameStateValidation.success) {
        await storage.updateGameState(sessionId, gameStateValidation.data);
      } else {
        console.warn('Invalid AI game state update:', gameStateValidation.error.errors);
      }
    }

    // Give item if specified
    if (actions.giveItem) {
      const itemValidation = insertItemSchema.safeParse({ ...actions.giveItem, sessionId });
      if (itemValidation.success) {
        await storage.createItem(itemValidation.data);
      } else {
        console.warn('Invalid AI item creation:', itemValidation.error.errors);
      }
    }
  }

  // Detect side quest opportunities
  try {
    const character = await storage.getCharacter(sessionId);
    const quests = await storage.getQuests(sessionId);
    const recentMessages = await storage.getRecentMessages(sessionId, 10);
    const gameState = await storage.getGameState(sessionId);

    const shouldGenerateSideQuest = await aiService.detectSideQuestOpportunity(playerMessage, {
      character,
      quests,
      recentMessages,
      gameState
    });

    if (shouldGenerateSideQuest) {
      console.log('[Routes] Side quest opportunity detected, generating side quest');

      const sideQuest = await aiService.generateSideQuest(sessionId, playerMessage, {
        character,
        gameState,
        recentMessages
      });

      if (sideQuest) {
        const questValidation = insertQuestSchema.safeParse(sideQuest);
        if (questValidation.success) {
          await storage.createQuest(questValidation.data);
          console.log('[Routes] Side quest created:', sideQuest.title);
        } else {
          console.warn('[Routes] Invalid side quest data:', questValidation.error.errors);
        }
      }
    }
  } catch (sideQuestError) {
    // Don't fail the entire request if side quest generation fails
    console.warn('[Routes] Side quest generation failed (non-critical):', sideQuestError);
  }

  return aiMessage;
}

/**
 * Extract sessionId from request header. Throws if missing.
 */
function getSessionId(req: Request): string {
  const sessionId = req.headers['x-session-id'] as string;
  if (!sessionId) throw new Error('Missing x-session-id header');
  return sessionId;
}

function getStoryId(req: Request): string | undefined {
  return req.headers['x-story-id'] as string | undefined;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize storage with default data (system context, no user session)
  await storage.init('system');
  // Character routes
  app.get("/api/character", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const storyId = getStoryId(req);
      const character = await storage.getCharacter(sessionId, storyId);
      res.json(character || null);
    } catch (error) {
      console.error('Error fetching character:', error);
      res.status(500).json({ error: "Failed to fetch character" });
    }
  });

  app.post("/api/character", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const result = insertCharacterSchema.safeParse({ ...req.body, sessionId });
      if (!result.success) {
        return res.status(400).json({ error: "Invalid character data", details: result.error.errors });
      }

      const character = await storage.createCharacter(result.data);

      // Auto-generate world from character if appearance and backstory are provided
      if (character.appearance || character.backstory) {
        console.log('[Routes] Generating world from character:', character.name);

        try {
          const worldData = await aiService.generateWorldFromCharacter({
            name: character.name,
            appearance: character.appearance,
            backstory: character.backstory,
            class: character.class,
          });

          // Update game state with generated world
          const gameState = await storage.getGameState(sessionId);
          if (gameState) {
            await storage.updateGameState(sessionId, {
              worldSetting: worldData.worldSetting,
              worldTheme: worldData.worldTheme,
              worldDescription: worldData.worldDescription,
              currentScene: worldData.initialScene,
              generatedFromCharacter: true,
            });
          }

          // Clear existing quests and create the initial quest from world generation
          await storage.clearQuests(sessionId);
          await storage.createQuest({
            sessionId,
            title: worldData.initialQuest.title,
            description: worldData.initialQuest.description,
            status: 'active',
            priority: 'high',
            progress: 0,
            maxProgress: 3,
            isMainStory: true,
          });

          // Clear existing items and add world-specific starting items
          const currentItems = await storage.getItems(sessionId);
          for (const item of currentItems) {
            await storage.deleteItem(item.id, sessionId);
          }

          for (const item of worldData.startingItems) {
            await storage.createItem({
              sessionId,
              ...item,
              quantity: 1,
              rarity: 'common',
              equipped: item.type === 'weapon' || item.type === 'armor',
            });
          }

          // Clear messages and add welcome message
          await storage.clearMessages(sessionId);
          await storage.createMessage({
            sessionId,
            content: `Welcome to ${worldData.worldSetting}! ${worldData.worldDescription}\n\nYou find yourself in ${worldData.initialScene}.\n\n${worldData.initialQuest.description}\n\n**What do you do?**`,
            sender: 'dm',
            senderName: null,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          });

          console.log('[Routes] World generation complete:', worldData.worldSetting);

        } catch (worldGenError) {
          console.error('[Routes] Error generating world, using defaults:', worldGenError);
          // Continue with character creation even if world generation fails
        }
      }

      res.json(character);
    } catch (error) {
      console.error('Error creating character:', error);
      res.status(500).json({ error: "Failed to create character" });
    }
  });

  app.patch("/api/character/:id", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const result = updateCharacterSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid character data", details: result.error.errors });
      }

      const character = await storage.updateCharacter(req.params.id, sessionId, result.data);
      if (!character) {
        return res.status(404).json({ error: "Character not found" });
      }
      res.json(character);
    } catch (error) {
      console.error('Error updating character:', error);
      res.status(500).json({ error: "Failed to update character" });
    }
  });

  // Adventure management
  const adventureTemplateSchema = z.object({
    id: z.string(),
    name: z.string(),
    setting: z.string(),
    initialScene: z.string(),
    initialQuest: z.object({
      title: z.string(),
      description: z.string(),
      priority: z.enum(["high", "normal", "low"]),
      maxProgress: z.number()
    }),
    introMessage: z.string().optional() // Rich descriptive intro message
  });

  app.post("/api/adventure/reset", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      // Clear all adventure data (character, messages, quests, items, enemies, game state)
      await storage.clearAllAdventureData(sessionId);

      // DO NOT re-initialize - user should start fresh with no character
      // They can create a new character or select an adventure template

      res.json({ success: true });
    } catch (error) {
      console.error('Error resetting adventure:', error);
      res.status(500).json({ error: 'Failed to reset adventure' });
    }
  });

  // ============================================================
  // V2: NEW STORY (page-based)
  // ============================================================

  const newStorySchema = z.object({
    genre: z.enum(['fantasy', 'mystery', 'scifi', 'romance', 'horror', 'auto']),
    storyLength: z.enum(['short', 'novella', 'novel', 'epic']),
    characterDescription: z.string().min(5).max(1000),
  });

  const STORY_LENGTH_PAGES: Record<string, number> = {
    short: 25,
    novella: 50,
    novel: 100,
    epic: 250,
  };

  // List all stories for this session
  app.get("/api/stories", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const stories = await storage.getStories(sessionId);
      res.json(stories);
    } catch (error) {
      console.error('Error fetching stories:', error);
      res.status(500).json({ error: "Failed to fetch stories" });
    }
  });

  // Delete a specific story
  app.delete("/api/stories/:storyId", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const { storyId } = req.params;
      await storage.clearAllAdventureData(sessionId, storyId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting story:', error);
      res.status(500).json({ error: "Failed to delete story" });
    }
  });

  app.post("/api/story/new", aiLimiter, async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const result = newStorySchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid story data", details: result.error.errors });
      }

      const { genre, storyLength, characterDescription } = result.data;
      const totalPages = STORY_LENGTH_PAGES[storyLength];

      // Generate a unique storyId for this new story
      const storyId = randomUUID();

      // For "auto" genre, let the AI decide — use a generic label for storage
      const genreLabel = genre === "auto" ? "auto" : genre;

      // Create a lightweight character from the description
      const character = await storage.createCharacter({
        sessionId,
        storyId,
        name: 'Protagonist',
        class: genreLabel,
        level: 1,
        experience: 0,
        appearance: characterDescription,
        backstory: characterDescription,
        strength: 10, dexterity: 10, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 10,
        currentHealth: 100, maxHealth: 100,
        currentMana: 0, maxMana: 0,
      });

      // Create game state with page tracking
      const state = await storage.createGameState({
        sessionId,
        storyId,
        currentScene: genre === "auto" ? "Opening — a new story begins" : `Opening — a new ${genre} story begins`,
        inCombat: false,
        currentTurn: null,
        turnCount: 0,
        totalPages,
        currentPage: 0,
        storyLength,
        genre,
        characterDescription,
        storyComplete: false,
        generatedFromCharacter: true,
      });

      // Generate the first page via AI
      const genreInstruction = genre === "auto"
        ? "Based on the character description, determine the most fitting genre and tone for this story and write accordingly."
        : `This is a ${genre} story.`;

      const firstPagePrompt = `Begin a new ${totalPages}-page story. ${genreInstruction} The reader describes themselves as: "${characterDescription}"

Your job: Create the opening page. Establish the world, introduce the reader's character within it, and end with the first set of choices. This is page 1 of ${totalPages} — focus on setup and atmosphere. Make the reader want to turn the page.

Do NOT re-state the character description back to the reader. Instead, SHOW who they are through the opening scene.

IMPORTANT: Include a "storyTitle" field in your JSON response — a short, evocative title for this story (2-5 words). Make it atmospheric and unique, not generic.`;

      let aiResponse = await aiService.generateResponse(sessionId, firstPagePrompt, storyId);

      console.log('[Story New] AI response received', {
        hasError: !!aiResponse.error,
        errorType: aiResponse.error,
        contentPreview: aiResponse.content?.substring(0, 100),
        hasStoryTitle: !!aiResponse.storyTitle,
        storyTitle: aiResponse.storyTitle,
      });

      // If the first AI call failed with any error, retry once
      if (aiResponse.error) {
        console.log(`[Story New] AI response had ${aiResponse.error}, retrying at route level`);
        await new Promise(resolve => setTimeout(resolve, 200));
        aiResponse = await aiService.generateResponse(sessionId, firstPagePrompt, storyId);
        console.log('[Story New] Retry response', {
          hasError: !!aiResponse.error,
          errorType: aiResponse.error,
          contentPreview: aiResponse.content?.substring(0, 100),
          hasStoryTitle: !!aiResponse.storyTitle,
        });
      }

      // Track token spend
      if (aiResponse.tokenUsage) {
        spendTracker.trackRequest(sessionId, aiResponse.tokenUsage);
      }

      // Save the AI's first page and apply any actions (quests, items, etc.)
      const firstMessage = await applyAIResponse(sessionId, `[New story: ${genreLabel}, ${storyLength}] ${characterDescription}`, aiResponse, storyId);

      // Save AI-generated story title if provided
      if (aiResponse.storyTitle) {
        await storage.updateGameState(sessionId, { storyTitle: aiResponse.storyTitle }, storyId);
      }

      res.json({
        success: true,
        storyId,
        story: {
          genre,
          storyLength,
          totalPages,
          currentPage: 1,
          characterDescription,
        },
        firstPage: aiResponse.content,
        message: firstMessage,
        gameState: await storage.getGameState(sessionId, storyId),
      });
    } catch (error) {
      console.error('Error creating new story:', error);
      res.status(500).json({ error: 'Failed to create story' });
    }
  });

  // V2: Get current story status
  app.get("/api/story/status", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const state = await storage.getGameState(sessionId);

      if (!state || !state.totalPages) {
        return res.json({ success: true, hasStory: false });
      }

      res.json({
        success: true,
        hasStory: true,
        genre: state.genre,
        storyLength: state.storyLength,
        totalPages: state.totalPages,
        currentPage: state.currentPage,
        storyComplete: state.storyComplete,
        characterDescription: state.characterDescription,
      });
    } catch (error) {
      console.error('Error getting story status:', error);
      res.status(500).json({ error: 'Failed to get story status' });
    }
  });

  // V2: Generate a random character description for "Surprise me"
  app.post("/api/story/surprise-me", aiLimiter, async (req, res) => {
    try {
      const sessionId = getSessionId(req);

      // Check spend limits
      const spendCheck = spendTracker.canMakeRequest();
      if (!spendCheck.allowed) {
        return res.status(429).json({ success: false, error: spendCheck.reason });
      }

      const openai = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY || "sk-placeholder",
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://storymode.onrender.com",
          "X-Title": "Story Mode",
        },
      });

      const response = await openai.chat.completions.create({
        model: "anthropic/claude-3.5-haiku",
        max_tokens: 90,
        messages: [
          {
            role: "user",
            content: `Generate a punchy character description (1-2 sentences max) for an interactive story. Pick any genre. Be specific and vivid — unique personality, situation, or secret. No generic tropes. Write in second person ("You are...").`,
          },
        ],
      });

      const description = response.choices?.[0]?.message?.content?.trim() || "";

      // Track token usage
      if (response.usage) {
        spendTracker.trackRequest(sessionId, {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        });
      }

      res.json({ success: true, description });
    } catch (error) {
      console.error("Error generating surprise character:", error);
      res.status(500).json({ success: false, error: "Failed to generate character description" });
    }
  });

  // ============================================================
  // LEGACY: Adventure template initialization
  // ============================================================

  app.post("/api/adventure/initialize", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const result = adventureTemplateSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid adventure template data", details: result.error.errors });
      }

      const template = result.data;

      // Create a default character if none exists
      const existingCharacter = await storage.getCharacter(sessionId);
      if (!existingCharacter) {
        await storage.createCharacter({
          sessionId,
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

      // Update game state with the new adventure
      await storage.updateGameState(sessionId, {
        currentScene: template.initialScene,
        inCombat: false,
        currentTurn: null,
        turnCount: 0
      });

      // Clear existing quests and messages for fresh adventure start
      await storage.clearQuests(sessionId);
      await storage.clearMessages(sessionId);

      // Create the initial quest
      const quest = await storage.createQuest({
        sessionId,
        title: template.initialQuest.title,
        description: template.initialQuest.description,
        status: 'active',
        priority: template.initialQuest.priority,
        progress: 0,
        maxProgress: template.initialQuest.maxProgress,
        reward: "Experience and story progression",
        isMainStory: true,
        parentQuestId: null,
        chainId: null
      });

      const welcomeMessage = await storage.createMessage({
        sessionId,
        content: template.introMessage || `Welcome to ${template.name}! You find yourself in ${template.initialScene}. ${template.initialQuest.description}`,
        sender: 'dm',
        senderName: null,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

      res.json({
        success: true,
        quest,
        message: welcomeMessage,
        gameState: await storage.getGameState(sessionId)
      });
    } catch (error) {
      console.error('Error initializing adventure template:', error);
      res.status(500).json({ error: 'Failed to initialize adventure template' });
    }
  });

  // Character portrait generation
  const portraitGenerationSchema = z.object({
    appearance: z.string().min(1).max(500),
    name: z.string().min(1).max(100)
  });
  
  app.post("/api/character/generate-portrait", strictLimiter, async (req, res) => {
    try {
      const result = portraitGenerationSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid portrait generation data", details: result.error.errors });
      }

      const { appearance, name } = result.data;
      const portraitUrl = await aiService.generateCharacterPortrait(name, appearance);
      
      res.json({ url: portraitUrl });
    } catch (error) {
      console.error('Error generating character portrait:', error);
      res.status(500).json({ error: 'Failed to generate character portrait' });
    }
  });

  // Enemy routes
  app.get("/api/enemies", async (req, res) => {
    try {
      const combatId = req.query.combatId as string | undefined;
      const enemies = await storage.getEnemies(combatId);
      res.json(enemies);
    } catch (error) {
      console.error('Error fetching enemies:', error);
      res.status(500).json({ error: "Failed to fetch enemies" });
    }
  });

  app.post("/api/enemies", async (req, res) => {
    try {
      const result = insertEnemySchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid enemy data", details: result.error.errors });
      }
      
      const enemy = await storage.createEnemy(result.data);
      res.json(enemy);
    } catch (error) {
      console.error('Error creating enemy:', error);
      res.status(500).json({ error: "Failed to create enemy" });
    }
  });

  app.patch("/api/enemies/:id", async (req, res) => {
    try {
      const result = updateEnemySchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid enemy data", details: result.error.errors });
      }
      
      const enemy = await storage.updateEnemy(req.params.id, result.data);
      if (!enemy) {
        return res.status(404).json({ error: "Enemy not found" });
      }
      res.json(enemy);
    } catch (error) {
      console.error('Error updating enemy:', error);
      res.status(500).json({ error: "Failed to update enemy" });
    }
  });

  // Combat action endpoint (scheduled for deletion)
  app.post("/api/combat/action", aiLimiter, async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const { action, targetId, spellId, itemId } = req.body;

      if (!action || typeof action !== 'string') {
        return res.status(400).json({ error: "Action is required" });
      }

      // Process combat action through AI
      let actionMessage = '';
      switch (action) {
        case 'attack':
          actionMessage = targetId ? `I attack the enemy with ID ${targetId}!` : 'I launch an attack!';
          break;
        case 'defend':
          actionMessage = 'I take a defensive stance, ready to block incoming attacks.';
          break;
        case 'cast':
          actionMessage = spellId ? `I cast spell ${spellId}!` : 'I prepare to cast a spell.';
          break;
        case 'use-item':
          actionMessage = itemId ? `I use item ${itemId}!` : 'I use an item from my inventory.';
          break;
        case 'flee':
          actionMessage = 'I attempt to flee from combat!';
          break;
        case 'enemy-turn':
          // Handle enemy turn automatically without AI (faster, more reliable)
          const currentGameState = await storage.getGameState(sessionId);
          if (currentGameState?.inCombat && currentGameState.combatId) {
            // Just advance the turn back to player
            await storage.updateGameState(sessionId, {
              currentTurn: 'player',
              turnCount: (currentGameState.turnCount ?? 0) + 1
            });

            // Store the enemy turn message for consistency
            const message = await storage.createMessage({
              sessionId,
              content: "Enemy completes their turn. It's your turn now!",
              sender: 'dm',
              senderName: null,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });

            return res.json({ message });
          }
          return res.status(400).json({ error: "Not in combat" });
        default:
          actionMessage = `I perform the ${action} action.`;
      }

      // Generate AI response for combat action

      // Check daily spend limit
      const spendCheck = spendTracker.canMakeRequest();
      if (!spendCheck.allowed) {
        return res.status(429).json({ error: spendCheck.reason });
      }

      // Generate AI response
      const storyId = getStoryId(req);
      const aiResponse = await aiService.generateResponse(sessionId, actionMessage, storyId);

      // Track request with actual token usage
      spendTracker.trackRequest(sessionId, aiResponse.tokenUsage);

      // Store messages
      await storage.createMessage({
        sessionId,
        storyId: storyId ?? null,
        content: actionMessage,
        sender: 'player',
        senderName: null,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

      const aiMessage = await storage.createMessage({
        sessionId,
        content: aiResponse.content,
        sender: aiResponse.sender,
        senderName: aiResponse.senderName,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });

      // Apply AI actions (enemy updates, character changes, etc.)
      if (aiResponse.actions) {
        const actions = aiResponse.actions;
        
        // Start combat if specified
        if ((actions as any).startCombat) {
          const combatData = (actions as any).startCombat;
          const combatId = randomUUID();
          
          // Create enemies for this combat encounter
          if (combatData.enemies && Array.isArray(combatData.enemies)) {
            for (const enemyData of combatData.enemies) {
              const enemyValidation = insertEnemySchema.safeParse({ ...enemyData, combatId });
              if (enemyValidation.success) {
                await storage.createEnemy(enemyValidation.data);
              }
            }
          }
          
          // Update game state to start combat
          await storage.updateGameState(sessionId, {
            inCombat: true,
            combatId,
            currentTurn: 'player',
            turnCount: 1
          });
        }

        // Update enemy if specified
        if ((actions as any).updateEnemy) {
          const enemyUpdate = (actions as any).updateEnemy;
          const enemyValidation = updateEnemySchema.safeParse(enemyUpdate.updates);
          if (enemyValidation.success) {
            await storage.updateEnemy(enemyUpdate.id, enemyValidation.data);
          }
        }
        
        // End combat if specified
        if ((actions as any).endCombat) {
          const endCombatData = (actions as any).endCombat;

          // Award victory rewards before ending combat
          if (endCombatData.victory) {
            const character = await storage.getCharacter(sessionId);
            if (character) {
              let expGain = 75; // Default experience

              // Check if rewards is an object with experience property
              if (endCombatData.rewards && typeof endCombatData.rewards === 'object' && endCombatData.rewards.experience) {
                expGain = endCombatData.rewards.experience;
              }

              const rewardValidation = updateCharacterSchema.safeParse({ experience: character.experience + expGain });
              if (rewardValidation.success) {
                await storage.updateCharacter(character.id, sessionId, rewardValidation.data);
              }
            }
          }

          await storage.updateGameState(sessionId, {
            inCombat: false,
            combatId: null,
            currentTurn: null,
            turnCount: 0
          });
        }
        
        if (actions.updateCharacter) {
          const character = await storage.getCharacter(sessionId);
          if (character) {
            const charValidation = updateCharacterSchema.safeParse(actions.updateCharacter.updates);
            if (charValidation.success) {
              await storage.updateCharacter(character.id, sessionId, charValidation.data);
            }
          }
        }

        if (actions.updateGameState) {
          const gameStateValidation = insertGameStateSchema.partial().safeParse(actions.updateGameState);
          if (gameStateValidation.success) {
            await storage.updateGameState(sessionId, gameStateValidation.data);
          }
        }
      }

      // Check for combat end conditions and turn management
      const combatGameState = await storage.getGameState(sessionId);
      if (combatGameState?.inCombat && combatGameState.combatId) {
        const combatEnemies = await storage.getEnemies(combatGameState.combatId);
        const aliveEnemies = combatEnemies.filter(e => e.isActive && e.currentHealth > 0);

        // End combat if no enemies left alive
        if (aliveEnemies.length === 0) {
          // Award victory rewards - base 50 exp + 10 per enemy defeated
          const character = await storage.getCharacter(sessionId);
          if (character) {
            const baseExp = 50;
            const enemyExp = combatEnemies.length * 10;
            const totalExp = baseExp + enemyExp;
            await storage.updateCharacter(character.id, sessionId, { experience: character.experience + totalExp });
          }

          await storage.updateGameState(sessionId, {
            inCombat: false,
            combatId: null,
            currentTurn: null,
            turnCount: 0
          });
        } else {
          // Toggle turn after player action
          const newTurn = combatGameState.currentTurn === 'player' ? 'enemy' : 'player';
          const newTurnCount = newTurn === 'player' ? combatGameState.turnCount + 1 : combatGameState.turnCount;

          await storage.updateGameState(sessionId, {
            currentTurn: newTurn,
            turnCount: newTurnCount
          });
        }
      }

      res.json({
        message: aiMessage,
        actions: aiResponse.actions
      });

    } catch (error) {
      console.error('Error processing combat action:', error);
      res.status(500).json({ error: "Failed to process combat action" });
    }
  });

  // Quest routes
  app.get("/api/quests", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const storyId = getStoryId(req);
      const quests = await storage.getQuests(sessionId, storyId);
      res.json(quests);
    } catch (error) {
      console.error('Error fetching quests:', error);
      res.status(500).json({ error: "Failed to fetch quests" });
    }
  });

  app.get("/api/quests/:id", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const quest = await storage.getQuest(req.params.id, sessionId);
      if (!quest) {
        return res.status(404).json({ error: "Quest not found" });
      }
      res.json(quest);
    } catch (error) {
      console.error('Error fetching quest:', error);
      res.status(500).json({ error: "Failed to fetch quest" });
    }
  });

  app.post("/api/quests", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const result = insertQuestSchema.safeParse({ ...req.body, sessionId });
      if (!result.success) {
        return res.status(400).json({ error: "Invalid quest data", details: result.error.errors });
      }

      const quest = await storage.createQuest(result.data);
      res.json(quest);
    } catch (error) {
      console.error('Error creating quest:', error);
      res.status(500).json({ error: "Failed to create quest" });
    }
  });

  app.patch("/api/quests/:id", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const result = updateQuestSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid quest data", details: result.error.errors });
      }

      const quest = await storage.updateQuest(req.params.id, sessionId, result.data);
      if (!quest) {
        return res.status(404).json({ error: "Quest not found" });
      }
      res.json(quest);
    } catch (error) {
      console.error('Error updating quest:', error);
      res.status(500).json({ error: "Failed to update quest" });
    }
  });

  app.delete("/api/quests/:id", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const deleted = await storage.deleteQuest(req.params.id, sessionId);
      if (!deleted) {
        return res.status(404).json({ error: "Quest not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting quest:', error);
      res.status(500).json({ error: "Failed to delete quest" });
    }
  });

  // Inventory routes
  app.get("/api/items", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const storyId = getStoryId(req);
      const items = await storage.getItems(sessionId, storyId);
      res.json(items);
    } catch (error) {
      console.error('Error fetching items:', error);
      res.status(500).json({ error: "Failed to fetch items" });
    }
  });

  app.get("/api/items/:id", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const item = await storage.getItem(req.params.id, sessionId);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error('Error fetching item:', error);
      res.status(500).json({ error: "Failed to fetch item" });
    }
  });

  app.post("/api/items", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const result = insertItemSchema.safeParse({ ...req.body, sessionId });
      if (!result.success) {
        return res.status(400).json({ error: "Invalid item data", details: result.error.errors });
      }

      const item = await storage.createItem(result.data);
      res.json(item);
    } catch (error) {
      console.error('Error creating item:', error);
      res.status(500).json({ error: "Failed to create item" });
    }
  });

  app.patch("/api/items/:id", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const result = updateItemSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid item data", details: result.error.errors });
      }

      const item = await storage.updateItem(req.params.id, sessionId, result.data);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error('Error updating item:', error);
      res.status(500).json({ error: "Failed to update item" });
    }
  });

  app.delete("/api/items/:id", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const deleted = await storage.deleteItem(req.params.id, sessionId);
      if (!deleted) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting item:', error);
      res.status(500).json({ error: "Failed to delete item" });
    }
  });

  // Message routes for AI conversation
  app.get("/api/messages", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const storyId = getStoryId(req);
      let limit: number | undefined;
      if (req.query.limit) {
        const parsed = parseInt(req.query.limit as string);
        if (isNaN(parsed) || parsed < 1) {
          return res.status(400).json({ error: "Invalid limit parameter" });
        }
        limit = Math.min(parsed, 100);
      }

      const messages = limit ?
        await storage.getRecentMessages(sessionId, limit, storyId) :
        await storage.getMessages(sessionId, storyId);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      // Set server-side timestamp
      const messageData = {
        ...req.body,
        sessionId,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const result = insertMessageSchema.safeParse(messageData);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid message data", details: result.error.errors });
      }

      const message = await storage.createMessage(result.data);
      res.json(message);
    } catch (error) {
      console.error('Error creating message:', error);
      res.status(500).json({ error: "Failed to create message" });
    }
  });

  app.delete("/api/messages", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      await storage.clearMessages(sessionId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error clearing messages:', error);
      res.status(500).json({ error: "Failed to clear messages" });
    }
  });

  // Game state routes
  app.get("/api/game-state", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const storyId = getStoryId(req);
      const gameState = await storage.getGameState(sessionId, storyId);
      res.json(gameState);
    } catch (error) {
      console.error('Error fetching game state:', error);
      res.status(500).json({ error: "Failed to fetch game state" });
    }
  });

  app.post("/api/game-state", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const result = insertGameStateSchema.safeParse({ ...req.body, sessionId });
      if (!result.success) {
        return res.status(400).json({ error: "Invalid game state data", details: result.error.errors });
      }

      const gameState = await storage.createGameState(result.data);
      res.json(gameState);
    } catch (error) {
      console.error('Error creating game state:', error);
      res.status(500).json({ error: "Failed to create game state" });
    }
  });

  app.patch("/api/game-state", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const storyId = getStoryId(req);
      const gameState = await storage.updateGameState(sessionId, req.body, storyId);
      res.json(gameState);
    } catch (error) {
      console.error('Error updating game state:', error);
      res.status(500).json({ error: "Failed to update game state" });
    }
  });

  // AI Conversation endpoints
  app.post("/api/ai/chat", aiLimiter, async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const storyId = getStoryId(req);
      const { message } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Message is required" });
      }

      // Check daily spend limit
      const spendCheck = spendTracker.canMakeRequest();
      if (!spendCheck.allowed) {
        return res.status(429).json({ error: spendCheck.reason });
      }

      // Generate AI response scoped to current story
      const aiResponse = await aiService.generateResponse(sessionId, message, storyId);

      // Track request with actual token usage
      spendTracker.trackRequest(sessionId, aiResponse.tokenUsage);

      // Apply AI response (store messages, apply actions, detect side quests)
      const aiMessage = await applyAIResponse(sessionId, message, aiResponse, storyId);

      res.json({
        message: aiMessage,
        actions: aiResponse.actions
      });

    } catch (error) {
      console.error('Error in AI chat:', error);
      res.status(500).json({ error: "Failed to process AI conversation" });
    }
  });

  // Quick action endpoint for predefined actions
  app.post("/api/ai/quick-action", aiLimiter, async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const { action } = req.body;
      if (!action || typeof action !== 'string') {
        return res.status(400).json({ error: "Action is required" });
      }

      let actionMessage = '';
      switch (action) {
        case 'attack':
          actionMessage = 'I ready my weapon and prepare to attack!';
          break;
        case 'investigate':
          actionMessage = 'I carefully examine my surroundings for clues and details.';
          break;
        case 'talk':
          actionMessage = 'I attempt to communicate and engage in dialogue.';
          break;
        case 'defend':
          actionMessage = 'I take a defensive stance and prepare to protect myself.';
          break;
        case 'cast':
          actionMessage = 'I prepare to cast a spell or use magic.';
          break;
        case 'use-item':
          actionMessage = 'I look through my items to find something useful.';
          break;
        default:
          actionMessage = `I perform the ${action} action.`;
      }

      // Check daily spend limit
      const spendCheck = spendTracker.canMakeRequest();
      if (!spendCheck.allowed) {
        return res.status(429).json({ error: spendCheck.reason });
      }

      // Process the quick action as a regular chat message
      const storyId = getStoryId(req);
      const aiResponse = await aiService.generateResponse(sessionId, actionMessage, storyId);

      // Track request with actual token usage
      spendTracker.trackRequest(sessionId, aiResponse.tokenUsage);

      // Apply AI response (store messages, apply actions, detect side quests)
      const aiMessage = await applyAIResponse(sessionId, actionMessage, aiResponse, storyId);

      res.json({
        message: aiMessage,
        actions: aiResponse.actions
      });

    } catch (error) {
      console.error('Error in quick action:', error);
      res.status(500).json({ error: "Failed to process quick action" });
    }
  });

  // Campaign routes
  app.get("/api/campaigns", async (_req, res) => {
    try {
      const campaigns = await storage.getCampaigns();
      res.json(campaigns);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/active", async (_req, res) => {
    try {
      const campaign = await storage.getActiveCampaign();
      if (!campaign) {
        return res.status(404).json({ error: "No active campaign" });
      }
      res.json(campaign);
    } catch (error) {
      console.error('Error fetching active campaign:', error);
      res.status(500).json({ error: "Failed to fetch active campaign" });
    }
  });

  app.post("/api/campaigns", async (req, res) => {
    try {
      const result = insertCampaignSchema.omit({ id: true, createdAt: true, lastPlayed: true, isActive: true }).safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid campaign data", details: result.error.errors });
      }
      
      const campaign = await storage.createCampaign(result.data);
      res.json(campaign);
    } catch (error) {
      console.error('Error creating campaign:', error);
      res.status(500).json({ error: "Failed to create campaign" });
    }
  });

  app.patch("/api/campaigns/:id/activate", async (req, res) => {
    try {
      const campaign = await storage.setActiveCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error) {
      console.error('Error activating campaign:', error);
      res.status(500).json({ error: "Failed to activate campaign" });
    }
  });

  app.delete("/api/campaigns/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCampaign(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting campaign:', error);
      res.status(500).json({ error: "Failed to delete campaign" });
    }
  });

  // Campaign reset rounds (scheduled for deletion)
  app.post("/api/campaigns/:id/reset-rounds", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }

      const gameState = await storage.getGameState(sessionId);
      if (gameState) {
        await storage.updateGameState(sessionId, {
          turnCount: 0,
          currentTurn: null,
          combatId: null,
          inCombat: false
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error resetting rounds:', error);
      res.status(500).json({ error: "Failed to reset rounds" });
    }
  });

  // ============================================
  // Admin API endpoints (protected by ADMIN_KEY)
  // ============================================

  const adminAuth = (req: Request, res: any, next: any) => {
    const adminKey = req.headers['x-admin-key'] as string;
    const expectedKey = process.env.ADMIN_KEY;

    if (!expectedKey) {
      console.warn('[Admin] ADMIN_KEY not configured in environment');
      return res.status(503).json({ error: 'Admin API not configured' });
    }

    if (!adminKey || adminKey !== expectedKey) {
      return res.status(401).json({ error: 'Invalid admin key' });
    }

    next();
  };

  // GET /api/admin/spend - Return spend metrics
  app.get("/api/admin/spend", adminAuth, async (_req, res) => {
    try {
      const stats = spendTracker.getAdminStats();
      res.json({
        todaysCost: stats.today.totalCost,
        allTimeCost: stats.allTime.totalCost,
        requestsToday: stats.today.requestCount,
        requestsAllTime: stats.allTime.requestCount,
        averageCostPerRequest: stats.averageCostPerRequest,
        dailyBudgetRemaining: stats.remainingBudget,
        dailyLimit: stats.dailyLimit,
        todaysTokens: {
          prompt: stats.today.totalPromptTokens,
          completion: stats.today.totalCompletionTokens,
        },
        allTimeTokens: {
          prompt: stats.allTime.totalPromptTokens,
          completion: stats.allTime.totalCompletionTokens,
        },
      });
    } catch (error) {
      console.error('Error fetching admin spend stats:', error);
      res.status(500).json({ error: 'Failed to fetch spend stats' });
    }
  });

  // GET /api/admin/sessions - Return session usage data
  app.get("/api/admin/sessions", adminAuth, async (_req, res) => {
    try {
      const sessions = spendTracker.getSessionStats();
      res.json({
        sessions: sessions.sort((a, b) => b.totalCost - a.totalCost), // Sort by cost descending
        totalSessions: sessions.length,
      });
    } catch (error) {
      console.error('Error fetching admin session stats:', error);
      res.status(500).json({ error: 'Failed to fetch session stats' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
