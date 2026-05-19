import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { verifyAdminCredentials } from "./adminAuth";
import { storage } from "./storage";
import {
  insertCharacterSchema,
  insertQuestSchema,
  insertMessageSchema,
  insertGameStateSchema,
  storyCreationLocks as storyCreationLocksTable,
  chatLocks as chatLocksTable,
  type Character,
  type Quest,
  type Message
} from "@shared/schema";
import { z } from "zod";
import { aiLimiter, generalLimiter, strictLimiter, puzzleAttemptLimiter } from "./rateLimit";
import { spendTracker } from "./spendTracker";
import { aiService, type AIResponse, extractTokenUsage } from "./aiService";
import {
  dispatchPuzzleFromResponse,
  parsePuzzleRequest,
  markConsumedSignals,
} from "./puzzleDispatch";
import { logEvent } from "./eventLog";
import { sendIssueReportEmail } from "./emailService";
import { resolveModel, getAdminModelOverride, setAdminModelOverride, MODEL_ALIASES } from "./aiModel";
import { eventLog as eventLogTable } from "@shared/schema";
import { db } from "./db";
import { eq, and, lt, gte, sql as drizzleSql } from "drizzle-orm";
import OpenAI from "openai";

// How long a single in-flight story creation can hold the per-session lock.
// Long enough to span a slow first-page AI call on Render's cold start.
const STORY_CREATION_LOCK_MS = 30_000;

// Per-(session, story) lock for /api/ai/chat. Backed by Postgres (chat_locks)
// so the lock survives Render restarts and stays coherent across instances
// when we scale horizontally. Mirrors the storyCreationLocks pattern below.
const CHAT_LOCK_MS = 60_000;
const chatLockKey = (sessionId: string, storyId?: string) => `${sessionId}:${storyId ?? "_"}`;

// Hard caps on free-text user input. Prevents accidental cost spikes from a runaway client
// (e.g. paste of a whole novel) and shrinks the surface for prompt-injection payloads.
const MAX_CHAT_MESSAGE_LENGTH = 2000;
const MAX_QUICK_ACTION_LENGTH = 100;

const chatMessageSchema = z.object({
  message: z.string().min(1).max(MAX_CHAT_MESSAGE_LENGTH),
});

const quickActionSchema = z.object({
  action: z.string().min(1).max(MAX_QUICK_ACTION_LENGTH),
});

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
  storyId?: string,
  modelOverride?: string
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

  // v1.14.0 — puzzle dispatch. Must run AFTER the AI message persists so the
  // type='puzzle' message row has a strictly later createdAt (the chat orders
  // by createdAt). Silent failure: a puzzle gen error means the reader just
  // doesn't see a puzzle this turn; narration is already saved.
  if (storyId && aiResponseData.puzzle_request) {
    const validReq = parsePuzzleRequest(aiResponseData.puzzle_request);
    if (validReq) {
      const gameState = await storage.getGameState(sessionId, storyId);
      const puzzleId = await dispatchPuzzleFromResponse(validReq, storyId, sessionId, gameState);
      if (puzzleId) {
        await storage.createMessage({
          sessionId,
          storyId,
          content: '',
          sender: 'system',
          senderName: null,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'puzzle',
          puzzleId,
        });
      }
    }
  }

  // Mark resolution signals consumed AFTER narration persists. If routes.ts
  // bails earlier (parse failure return path), signals stay unconsumed and
  // get included again in the next narration call's context. Correct behavior.
  if (aiResponseData.consumedSignals && aiResponseData.consumedSignals.length > 0) {
    await markConsumedSignals(
      aiResponseData.consumedSignals.map(s => ({ ...s, type: '', correct: false, skipped: false }))
    );
  }

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
            const followUpQuest = await aiService.generateFollowUpQuest(sessionId, updatedQuest, { character, gameState }, modelOverride);

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
      const sideQuest = await aiService.generateSideQuest(sessionId, playerMessage, {
        character,
        gameState,
        recentMessages
      }, modelOverride);

      if (sideQuest) {
        const questValidation = insertQuestSchema.safeParse(sideQuest);
        if (questValidation.success) {
          await storage.createQuest(questValidation.data);
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

// Dev-only model override. The frontend sets this header when a tab has
// a sessionStorage `testmodel` value (set via `?testmodel=sonnet`). Server
// reads it; `resolveModel()` in server/aiModel.ts enforces the
// NODE_ENV !== 'production' safety gate so this is harmless in prod.
function getTestModel(req: Request): string | undefined {
  return req.headers['x-test-model'] as string | undefined;
}

// Strip Zod's internal issue shape (code/expected/received) down to a
// client-safe { field, message } pair. The full ZodError includes
// implementation details that shouldn't leak across the API boundary.
function sanitizeZodIssues(issues: Array<{ path: Array<string | number>; message: string }>) {
  return issues.map((i) => ({
    field: i.path.join('.'),
    message: i.message,
  }));
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Character routes
  app.get("/api/character", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const storyId = getStoryId(req);
      // No storyId means no story context — return null instead of falling
      // through to a cross-story session lookup (v1.8.7 defensive fix).
      if (!storyId) return res.json(null);
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
        return res.status(400).json({ error: "Invalid character data", details: sanitizeZodIssues(result.error.errors) });
      }

      const character = await storage.createCharacter(result.data);

      // Auto-generate world from character if appearance and backstory are provided
      if (character.appearance || character.backstory) {
        try {
          const worldData = await aiService.generateWorldFromCharacter(sessionId, {
            name: character.name,
            appearance: character.appearance,
            backstory: character.backstory,
            class: character.class,
          }, getTestModel(req));

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

          // Clear messages and add welcome message
          await storage.clearMessages(sessionId);
          await storage.createMessage({
            sessionId,
            content: `Welcome to ${worldData.worldSetting}! ${worldData.worldDescription}\n\nYou find yourself in ${worldData.initialScene}.\n\n${worldData.initialQuest.description}\n\n**What do you do?**`,
            sender: 'dm',
            senderName: null,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          });

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
        return res.status(400).json({ error: "Invalid character data", details: sanitizeZodIssues(result.error.errors) });
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
      // Soft delete: marks deletedAt = NOW(). A lazy purge in getStories
      // performs the real cascade wipe after 30 days. Gives support a
      // recovery window for readers who delete by accident or regret it.
      const ok = await storage.softDeleteStory(sessionId, storyId);
      if (!ok) {
        return res.status(404).json({ error: "Story not found" });
      }
      await logEvent(sessionId, "story_deleted", {}, storyId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting story:', error);
      res.status(500).json({ error: "Failed to delete story" });
    }
  });

  app.post("/api/story/new", aiLimiter, async (req, res) => {
    const sessionId = getSessionId(req);
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Story New] REQUEST RECEIVED session=${sessionId} timestamp=${Date.now()}`);
    }

    // Atomic deduplication via Postgres. The unique-on-conflict insert claims
    // the lock for this session if no live lock exists, or if the existing one
    // has already expired. Replaces an earlier in-memory Map that was lost on
    // every Render restart.
    const expiresAt = new Date(Date.now() + STORY_CREATION_LOCK_MS);
    const claimed = await db
      .insert(storyCreationLocksTable)
      .values({ sessionId, expiresAt })
      .onConflictDoUpdate({
        target: storyCreationLocksTable.sessionId,
        set: { expiresAt },
        setWhere: lt(storyCreationLocksTable.expiresAt, new Date()),
      })
      .returning({ sessionId: storyCreationLocksTable.sessionId });

    if (claimed.length === 0) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`[Story New] BLOCKED — creation already in progress for session=${sessionId}`);
      }
      return res.status(429).json({ error: "Story creation already in progress" });
    }

    try {
      const result = newStorySchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid story data", details: sanitizeZodIssues(result.error.errors) });
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

      const firstPagePrompt = `Begin a new ${totalPages}-page story. ${genreInstruction} The reader describes themselves as: <reader_input>${characterDescription}</reader_input>

Your job: Create the opening page. Establish the world, introduce the reader's character within it, and end with the first set of choices. This is page 1 of ${totalPages} — focus on setup and atmosphere. Make the reader want to turn the page.

Do NOT re-state the character description back to the reader. Instead, SHOW who they are through the opening scene.

IMPORTANT: Include a "storyTitle" field in your JSON response. Title rules:
- 1 to 3 words. Short. Plain.
- Concrete noun phrase. Name the central object, character, place, or event.
- Examples of the right shape: "The Glass Suitcase", "Talking Cat", "The Vault Door", "Last Train Home", "The Wrong Coffee".
- AVOID: "Whispers of...", "Echoes of...", "Shadows of...", "The Last Awakening", "Beneath the X", or any other poetic / atmospheric phrasing. Direct beats evocative every time.`;

      const testModel = getTestModel(req);
      let aiResponse = await aiService.generateResponse(sessionId, firstPagePrompt, storyId, 0, '', testModel);

      // If the first AI call failed with any error, retry once at the route
      // level after a short delay — handles cases where the DB write for the
      // new story hadn't yet settled before generateResponse read context.
      if (aiResponse.error) {
        await new Promise(resolve => setTimeout(resolve, 200));
        aiResponse = await aiService.generateResponse(sessionId, firstPagePrompt, storyId, 0, '', testModel);
      }

      // Track token spend
      if (aiResponse.tokenUsage) {
        await spendTracker.trackRequest(sessionId, aiResponse.tokenUsage, aiResponse.modelUsed ?? resolveModel(testModel));
      }

      // Save the AI's first page and apply any actions (quests, items, etc.).
      // The player message is just the character description, no debug prefix.
      const firstMessage = await applyAIResponse(sessionId, characterDescription, aiResponse, storyId, testModel);

      // Save AI-generated story title if provided
      if (aiResponse.storyTitle) {
        await storage.updateGameState(sessionId, { storyTitle: aiResponse.storyTitle }, storyId);
      }

      await logEvent(sessionId, "story_started", {
        genre,
        storyLength,
        totalPages,
        characterDescriptionLength: characterDescription.length,
        aiHadFallback: !!aiResponse.error,
      }, storyId);

      if (aiResponse.error) {
        await logEvent(sessionId, "ai_fallback", { phase: "story_start", errorType: aiResponse.error }, storyId);
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
    } finally {
      // Release the lock no matter how this request ended.
      await db.delete(storyCreationLocksTable).where(eq(storyCreationLocksTable.sessionId, sessionId));
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

      // count: how many descriptions to return. Defaults to 1 for backwards
      // compatibility with the old single-result shape. Capped at 5 so a
      // malicious client can't ask for hundreds in one call.
      const requestedCount = parseInt(String(req.query.count ?? "1"), 10);
      const count = Math.max(1, Math.min(5, Number.isNaN(requestedCount) ? 1 : requestedCount));

      // Check spend limits
      const spendCheck = await spendTracker.canMakeRequest();
      if (!spendCheck.allowed) {
        return res.status(429).json({ error: spendCheck.reason });
      }

      const openai = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY || "sk-placeholder",
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://storymode.onrender.com",
          "X-Title": "Story Mode",
        },
      });

      const singlePrompt = `Generate a character description for an interactive story. 1 to 2 short sentences. Plain language. No em dashes. No abstract words like "destiny," "ethical implications," "fabric of reality," "wrestling with." Write in second person.

Formula: a specific job or role, plus one weird thing that just happened or is happening. Lean toward the mundane meeting the surprising. Quirky and accessible, like an 80s choose-your-own-adventure book, not literary fiction.

Examples of the vibe:
- You run a small bakery. Yesterday a customer paid in coins minted by countries that don't exist.
- You're a substitute teacher. The kid in seat 4B has been ten years old for thirty years.
- You're a forest ranger in a quiet park. Last week the elk started leaving notes.
- You're a vole on the village mail route. A humming parcel just arrived addressed to "The Last One Awake."
- You're a hotel night clerk. Room 207 has been booked for forty years by a guest who never checks out.

Return ONLY the character description. No preamble, no quotes.`;

      const multiPrompt = `Generate ${count} DIFFERENT character descriptions for an interactive story. Each must be 1 to 2 short sentences. Plain language. No em dashes. No abstract words like "destiny," "ethical implications," "fabric of reality," "wrestling with." Write in second person.

Formula for each: a specific job or role, plus one weird thing that just happened or is happening. Lean toward the mundane meeting the surprising. Quirky and accessible, like an 80s choose-your-own-adventure book, not literary fiction.

The ${count} descriptions must span DIFFERENT vibes — don't return three variants of the same archetype. Mix tone (cozy / eerie / playful), setting (small business / wilderness / hotel / school / animal POV), and stakes.

Examples of the vibe:
- You run a small bakery. Yesterday a customer paid in coins minted by countries that don't exist.
- You're a substitute teacher. The kid in seat 4B has been ten years old for thirty years.
- You're a forest ranger in a quiet park. Last week the elk started leaving notes.
- You're a vole on the village mail route. A humming parcel just arrived addressed to "The Last One Awake."
- You're a hotel night clerk. Room 207 has been booked for forty years by a guest who never checks out.

Respond with ONLY valid JSON in this exact shape, no preamble:
{ "descriptions": ["...", "...", "..."] }`;

      const response = await openai.chat.completions.create({
        model: "anthropic/claude-3.5-haiku",
        // Budget per description. Each description is ~30–50 tokens of
        // actual output; the rest is JSON wrapping when count > 1.
        max_tokens: count === 1 ? 90 : 90 * count + 60,
        messages: [
          {
            role: "user",
            content: count === 1 ? singlePrompt : multiPrompt,
          },
        ],
        ...(count > 1 ? { response_format: { type: "json_object" as const } } : {}),
      });

      const raw = response.choices?.[0]?.message?.content?.trim() || "";

      // Track token usage. Surprise-me always runs on Haiku 3.5 (hardcoded
      // in the openai.chat.completions.create call above), so we attribute
      // cost to that model regardless of any admin override. extractTokenUsage
      // also surfaces any cache stats if the provider returned them.
      if (response.usage) {
        await spendTracker.trackRequest(sessionId, extractTokenUsage(response.usage), "anthropic/claude-3.5-haiku");
      }

      if (count === 1) {
        // Legacy shape — single string.
        return res.json({ success: true, description: raw });
      }

      // count > 1 — parse the JSON object and return an array. If the AI
      // returned malformed JSON, fall back to splitting on newlines so the
      // user still gets something useful instead of an error.
      let descriptions: string[] = [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.descriptions)) {
          descriptions = parsed.descriptions
            .map((d: unknown) => (typeof d === "string" ? d.trim() : ""))
            .filter((d: string) => d.length > 0)
            .slice(0, count);
        }
      } catch {
        descriptions = raw
          .split(/\n+/)
          .map((s) => s.replace(/^[-*•\d.)\s]+/, "").trim())
          .filter((s) => s.length > 10)
          .slice(0, count);
      }

      if (descriptions.length === 0) {
        return res.status(502).json({ error: "Couldn't parse suggestions. Try again." });
      }

      res.json({ success: true, descriptions });
    } catch (error) {
      console.error("Error generating surprise character:", error);
      res.status(500).json({ error: "Failed to generate character description" });
    }
  });

  // Quest routes
  app.get("/api/quests", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const storyId = getStoryId(req);
      if (!storyId) return res.json([]);
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
      if (!getStoryId(req)) return res.status(400).json({ error: "Missing x-story-id header" });
      const result = insertQuestSchema.safeParse({ ...req.body, sessionId });
      if (!result.success) {
        return res.status(400).json({ error: "Invalid quest data", details: sanitizeZodIssues(result.error.errors) });
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
        return res.status(400).json({ error: "Invalid quest data", details: sanitizeZodIssues(result.error.errors) });
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

  // Message routes for AI conversation
  app.get("/api/messages", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const storyId = getStoryId(req);
      if (!storyId) return res.json([]);
      let limit: number | undefined;
      if (req.query.limit) {
        const parsed = parseInt(req.query.limit as string);
        if (isNaN(parsed) || parsed < 1) {
          return res.status(400).json({ error: "Invalid limit parameter" });
        }
        limit = Math.min(parsed, 100);
      }
      // Cursor pagination (v1.11.5) — `?before=<ISO timestamp>` returns
      // the `limit` messages immediately older than the cursor. Used by
      // the client's "Load older messages" affordance to walk backward
      // from the initial 50-message window without loading the whole
      // story at once on long epics.
      let before: Date | undefined;
      if (req.query.before) {
        const parsed = new Date(req.query.before as string);
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({ error: "Invalid before parameter" });
        }
        before = parsed;
      }

      const messages = before
        ? await storage.getMessagesBefore(sessionId, before, limit ?? 50, storyId)
        : limit
          ? await storage.getRecentMessages(sessionId, limit, storyId)
          : await storage.getMessages(sessionId, storyId);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      if (!getStoryId(req)) return res.status(400).json({ error: "Missing x-story-id header" });
      // Set server-side timestamp
      const messageData = {
        ...req.body,
        sessionId,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const result = insertMessageSchema.safeParse(messageData);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid message data", details: sanitizeZodIssues(result.error.errors) });
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
      // Defensive guard: no client today calls this without a storyId, but the
      // underlying clearMessages(sessionId) is session-wide — requiring the
      // header makes accidental session-wipes harder. A future PR-B revisit
      // should either scope the wipe to storyId or remove this endpoint.
      if (!getStoryId(req)) return res.status(400).json({ error: "Missing x-story-id header" });
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
      if (!storyId) return res.json(null);
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
        return res.status(400).json({ error: "Invalid game state data", details: sanitizeZodIssues(result.error.errors) });
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
      // Writes without a storyId would update every gameState row in the
      // session — refuse explicitly (v1.8.7) rather than silently mutating
      // the wrong story.
      if (!storyId) return res.status(400).json({ error: "Missing x-story-id header" });
      const gameState = await storage.updateGameState(sessionId, req.body, storyId);
      if (req.body?.storyComplete === true) {
        await logEvent(sessionId, "story_completed", {
          currentPage: gameState?.currentPage,
          totalPages: gameState?.totalPages,
        }, storyId);
      }
      res.json(gameState);
    } catch (error) {
      console.error('Error updating game state:', error);
      res.status(500).json({ error: "Failed to update game state" });
    }
  });

  // Archive/unarchive a story
  app.patch("/api/stories/:storyId/archive", async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      const { storyId } = req.params;
      const { archived } = req.body;
      if (typeof archived !== 'boolean') {
        return res.status(400).json({ error: "archived must be a boolean" });
      }
      await storage.updateGameState(sessionId, { storyArchived: archived }, storyId);
      await logEvent(sessionId, archived ? "story_archived" : "story_unarchived", {}, storyId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error archiving story:', error);
      res.status(500).json({ error: "Failed to archive story" });
    }
  });

  // AI Conversation endpoints
  app.post("/api/ai/chat", aiLimiter, async (req, res) => {
    const sessionId = getSessionId(req);
    const storyId = getStoryId(req);
    // AI chat writes messages tied to a story; refuse without one (v1.8.7)
    // so an orphan request can't write an unscoped message.
    if (!storyId) return res.status(400).json({ error: "Missing x-story-id header" });
    const lockKey = chatLockKey(sessionId, storyId);

    // Per-(session, story) lock: blocks the duplicate AI call a user produces
    // by opening two tabs of the same story and tapping a choice in each.
    // Atomic Postgres UPSERT — claims the lock if none exists or the existing
    // one has already expired, otherwise returns nothing and we 429.
    const expiresAt = new Date(Date.now() + CHAT_LOCK_MS);
    const claimed = await db
      .insert(chatLocksTable)
      .values({ key: lockKey, expiresAt })
      .onConflictDoUpdate({
        target: chatLocksTable.key,
        set: { expiresAt },
        setWhere: lt(chatLocksTable.expiresAt, new Date()),
      })
      .returning({ key: chatLocksTable.key });

    if (claimed.length === 0) {
      return res.status(429).json({ error: "A response is already being generated. Please wait." });
    }

    try {
      const parsed = chatMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Message is required and must be 1–2000 characters" });
      }
      const { message } = parsed.data;

      // Check daily spend limit
      const spendCheck = await spendTracker.canMakeRequest();
      if (!spendCheck.allowed) {
        return res.status(429).json({ error: spendCheck.reason });
      }

      // Generate AI response scoped to current story
      const testModel = getTestModel(req);
      const aiResponse = await aiService.generateResponse(sessionId, message, storyId, 0, '', testModel);

      // Track request with actual token usage
      await spendTracker.trackRequest(sessionId, aiResponse.tokenUsage, aiResponse.modelUsed ?? resolveModel(testModel));

      // Per-call model attribution (v1.9.0) — admin can later aggregate
      // event_log to see Haiku vs Sonnet split over a date range.
      logEvent(sessionId, "ai_call", {
        model: resolveModel(testModel),
        endpoint: "/api/ai/chat",
        promptTokens: aiResponse.tokenUsage?.promptTokens,
        completionTokens: aiResponse.tokenUsage?.completionTokens,
      }, storyId).catch(() => { /* logging never fails the request */ });

      // Apply AI response (store messages, apply actions, detect side quests)
      const aiMessage = await applyAIResponse(sessionId, message, aiResponse, storyId, testModel);

      await logEvent(sessionId, "page_turned", {
        messageLength: message.length,
        aiHadFallback: !!aiResponse.error,
      }, storyId);

      if (aiResponse.error) {
        await logEvent(sessionId, "ai_fallback", { phase: "page_turn", errorType: aiResponse.error }, storyId);
      }

      res.json({
        message: aiMessage,
        actions: aiResponse.actions
      });

    } catch (error) {
      console.error('Error in AI chat:', error);
      await logEvent(sessionId, "ai_request_failed", {
        phase: "page_turn",
        errorMessage: error instanceof Error ? error.message : String(error),
      }, storyId);
      res.status(500).json({ error: "Failed to process AI conversation" });
    } finally {
      // Release the lock no matter how this request ended.
      await db.delete(chatLocksTable).where(eq(chatLocksTable.key, lockKey));
    }
  });

  // Quick action endpoint for predefined actions
  app.post("/api/ai/quick-action", aiLimiter, async (req, res) => {
    try {
      const sessionId = getSessionId(req);
      // Quick-action writes a player message + AI response; refuse without
      // a storyId so we don't write unscoped messages (v1.8.7).
      if (!getStoryId(req)) return res.status(400).json({ error: "Missing x-story-id header" });
      const parsed = quickActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Action is required and must be 1–100 characters" });
      }
      const { action } = parsed.data;

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
      const spendCheck = await spendTracker.canMakeRequest();
      if (!spendCheck.allowed) {
        return res.status(429).json({ error: spendCheck.reason });
      }

      // Process the quick action as a regular chat message
      const storyId = getStoryId(req);
      const testModel = getTestModel(req);
      const aiResponse = await aiService.generateResponse(sessionId, actionMessage, storyId, 0, '', testModel);

      // Track request with actual token usage
      await spendTracker.trackRequest(sessionId, aiResponse.tokenUsage, aiResponse.modelUsed ?? resolveModel(testModel));

      logEvent(sessionId, "ai_call", {
        model: resolveModel(testModel),
        endpoint: "/api/ai/quick-action",
        promptTokens: aiResponse.tokenUsage?.promptTokens,
        completionTokens: aiResponse.tokenUsage?.completionTokens,
      }, storyId).catch(() => { /* logging never fails the request */ });

      // Apply AI response (store messages, apply actions, detect side quests)
      const aiMessage = await applyAIResponse(sessionId, actionMessage, aiResponse, storyId, testModel);

      res.json({
        message: aiMessage,
        actions: aiResponse.actions
      });

    } catch (error) {
      console.error('Error in quick action:', error);
      res.status(500).json({ error: "Failed to process quick action" });
    }
  });

  // ============================================
  // Issue reports (v1.13.0)
  // ============================================

  // Public submit endpoint. Strict-limited (5/hour per session) to prevent
  // spam. session_id + story_id are attached only when the user opted in via
  // the "Include this story" toggle in the IssueReportSheet. Email is
  // fire-and-forget so a Resend outage doesn't break submit UX.
  // In-story categories: guide_reply / choices / stuck. Bookshelf categories:
  // story_load / story_missing / story_manage. 'other' is shared on both.
  const issueReportCategory = z.enum([
    "guide_reply",
    "choices",
    "stuck",
    "story_load",
    "story_missing",
    "story_manage",
    "puzzle",       // v1.14.0
    "other",
  ]);
  const issueReportBodySchema = z.object({
    category: issueReportCategory,
    description: z.string().min(10).max(5000),
    includeContext: z.boolean(),
    currentPage: z.number().int().nullable().optional(),
    lastMessageIds: z.array(z.string()).max(3).optional(),
    appVersion: z.string().max(32).nullable().optional(),
    // v1.14.0: when the report is filed from a puzzle screen, the client
    // optionally attaches the active puzzleId. Resolver-side, this links
    // directly to the puzzles row + every puzzle_attempts row for diagnosis.
    puzzleId: z.string().min(1).nullable().optional(),
  });

  app.post("/api/issue-report", strictLimiter, async (req, res) => {
    const parsed = issueReportBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid issue report body" });
    }
    const body = parsed.data;
    const sessionId = body.includeContext ? getSessionId(req) : null;
    const storyId = body.includeContext ? getStoryId(req) ?? null : null;
    const userAgent = req.get("user-agent") ?? null;
    try {
      const report = await storage.createIssueReport({
        sessionId,
        storyId,
        category: body.category,
        description: body.description,
        currentPage: body.includeContext ? body.currentPage ?? null : null,
        lastMessageIds: body.includeContext ? body.lastMessageIds ?? [] : [],
        appVersion: body.appVersion ?? null,
        userAgent,
        // v1.14.0 — only persist when context is opted in AND a puzzleId was sent.
        puzzleId: body.includeContext ? body.puzzleId ?? null : null,
      });
      res.json({ id: report.id });
      // Fire-and-forget. Errors are logged inside emailService; DB save is the
      // source of truth, so a Resend outage doesn't break the user's submit.
      sendIssueReportEmail({
        id: report.id,
        category: report.category,
        description: report.description,
        sessionId: report.sessionId,
        storyId: report.storyId,
        currentPage: report.currentPage,
        lastMessageIds: report.lastMessageIds ?? [],
        appVersion: report.appVersion,
        userAgent: report.userAgent,
        puzzleId: report.puzzleId,
      }).catch((err) => console.error("[issue-report] email send failed", err));
    } catch (err) {
      console.error("[issue-report] DB insert failed", err);
      res.status(500).json({ error: "Failed to save issue report" });
    }
  });

  // ============================================
  // Puzzle attempts (v1.14.0)
  // ============================================

  // Either submission OR skip — never both. hintsUsed tracked client-side for analytics.
  const puzzleAttemptBodySchema = z.object({
    // Loose string with a length cap. Defends against absurd puzzleIds bloating
    // the rate_limit_buckets table (the limiter reads body.puzzleId BEFORE Zod runs).
    puzzleId: z.string().min(1).max(64),
    submission: z.string().min(1).max(200).optional(),
    skip: z.boolean().optional(),
    hintsUsed: z.number().int().min(0).max(3).default(0),
  }).refine(b => !(b.submission && b.skip), {
    message: "submission and skip are mutually exclusive",
  }).refine(b => b.submission !== undefined || b.skip === true, {
    message: "must include either submission or skip=true",
  });

  app.post("/api/puzzle/attempt", puzzleAttemptLimiter, async (req, res) => {
    const parsed = puzzleAttemptBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid puzzle attempt body" });
    }
    const body = parsed.data;
    const sessionId = getSessionId(req);
    const storyId = getStoryId(req);
    if (!storyId) {
      return res.status(400).json({ error: "Missing x-story-id header" });
    }

    try {
      // Cross-session safety: the puzzle must belong to this session + story.
      const puzzle = await storage.getPuzzle(body.puzzleId);
      if (!puzzle) {
        return res.status(404).json({ error: "Puzzle not found" });
      }
      if (puzzle.sessionId !== sessionId || puzzle.storyId !== storyId) {
        // Don't leak existence vs. ownership — return 404 either way.
        return res.status(404).json({ error: "Puzzle not found" });
      }

      // Idempotency: if already resolved, return prior resolution state
      // WITHOUT inserting a new attempt row. (Approach 6 §Edge: re-attempt
      // after already resolved.)
      const prior = await storage.isPuzzleResolved(body.puzzleId);
      if (prior) {
        return res.json({ correct: prior.correct, skipped: prior.skipped });
      }

      // Skip path
      if (body.skip) {
        await storage.recordPuzzleAttempt({
          puzzleId: body.puzzleId,
          sessionId,
          submission: null,
          correct: false,
          skipped: true,
          hintsUsed: body.hintsUsed,
        });
        return res.json({ correct: false, skipped: true });
      }

      // Submission path — case-insensitive, whitespace-trimmed compare.
      // Stored answer is uppercase; normalize submission the same way.
      const submitted = (body.submission ?? '').trim().toUpperCase();
      const expected = puzzle.answer.trim().toUpperCase();
      const correct = submitted === expected;

      await storage.recordPuzzleAttempt({
        puzzleId: body.puzzleId,
        sessionId,
        submission: body.submission ?? null,
        correct,
        skipped: false,
        hintsUsed: body.hintsUsed,
      });

      return res.json({ correct, skipped: false });
    } catch (err) {
      console.error("[puzzle-attempt] DB failure", err);
      return res.status(500).json({ error: "Failed to record puzzle attempt" });
    }
  });

  // GET /api/puzzle/:id — client-safe puzzle view (no answer field).
  // Scoped to session+story like /api/puzzle/attempt. Defined AFTER the
  // /attempt route so Express's first-match route order doesn't shadow the
  // literal /attempt path with /:id.
  app.get("/api/puzzle/:id", async (req, res) => {
    const sessionId = getSessionId(req);
    const storyId = getStoryId(req);
    if (!storyId) return res.status(400).json({ error: "Missing x-story-id header" });

    const puzzle = await storage.getPuzzle(req.params.id);
    if (!puzzle || puzzle.sessionId !== sessionId || puzzle.storyId !== storyId) {
      return res.status(404).json({ error: "Puzzle not found" });
    }

    // Surface resolution state so the client can render an already-solved
    // puzzle correctly on page reload. Without this, a fresh client mount
    // shows an active input even though the server treats any submission
    // as idempotent-resolved (Approach 6 — first submit set the terminal
    // state; subsequent submits return the prior result).
    const resolved = await storage.isPuzzleResolved(req.params.id);

    // Strip server-only fields (answer + isFallback) before returning.
    // Client gets the PuzzleClientView shape plus the resolved state.
    const { answer: _answer, isFallback: _isFallback, ...clientView } = puzzle;
    return res.json({ ...clientView, resolved });
  });

  // ============================================
  // Admin API endpoints (protected by ADMIN_KEY)
  // ============================================

  // Thin pass-through to the verification service in `server/adminAuth.ts`.
  // All credential logic — env-var reads, timing-safe compare, TOTP verify —
  // lives there, so the future multi-admin DB migration is a one-file change.
  const adminAuth = (req: Request, res: any, next: any) => {
    const key = req.headers['x-admin-key'];
    const totp = req.headers['x-admin-totp'];
    const result = verifyAdminCredentials(
      typeof key === 'string' ? key : undefined,
      typeof totp === 'string' ? totp : undefined,
    );

    if (result.ok) {
      return next();
    }

    if (result.reason === 'not-configured') {
      console.warn('[Admin] ADMIN_KEY or ADMIN_TOTP_SECRET not configured in environment');
      return res.status(503).json({ error: 'Admin auth not configured on server' });
    }

    // Collapsed message so the response doesn't leak which factor failed.
    return res.status(401).json({ error: 'Invalid credentials' });
  };

  // GET /api/admin/spend - Return spend metrics
  app.get("/api/admin/spend", adminAuth, async (_req, res) => {
    try {
      const stats = await spendTracker.getAdminStats();
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
          cached: stats.today.totalCachedTokens,
          cacheWrite: stats.today.totalCacheWriteTokens,
        },
        allTimeTokens: {
          prompt: stats.allTime.totalPromptTokens,
          completion: stats.allTime.totalCompletionTokens,
          cached: stats.allTime.totalCachedTokens,
          cacheWrite: stats.allTime.totalCacheWriteTokens,
        },
        cacheSavingsToday: stats.cacheSavingsToday,
        cacheSavingsAllTime: stats.cacheSavingsAllTime,
      });
    } catch (error) {
      console.error('Error fetching admin spend stats:', error);
      res.status(500).json({ error: 'Failed to fetch spend stats' });
    }
  });

  // GET /api/admin/puzzle-health (v1.14.0). Two soft alarms:
  //   - fallback: % of puzzles generated as fallbacks in the last N days
  //   - stuck: puzzles with >= 5 unresolved attempts in the last N days
  app.get("/api/admin/puzzle-health", adminAuth, async (req, res) => {
    const daysBack = Number(req.query.daysBack ?? 7);
    try {
      const [fallback, stuck] = await Promise.all([
        storage.getPuzzleFallbackRate(daysBack),
        storage.getStuckPuzzles(daysBack, 5),
      ]);
      res.json({ daysBack, fallback, stuck });
    } catch (err) {
      console.error("[admin/puzzle-health] DB failure", err);
      res.status(500).json({ error: "Failed to fetch puzzle health" });
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

  // GET /api/admin/recent-activity - Last 20 event_log rows with full
  // session_id + story_id so support can look up a user's story by ID and
  // search Supabase directly. Returns event_type and properties too so the
  // log gives quick context for what happened.
  app.get("/api/admin/recent-activity", adminAuth, async (_req, res) => {
    try {
      const rows = await db
        .select({
          id: eventLogTable.id,
          sessionId: eventLogTable.sessionId,
          storyId: eventLogTable.storyId,
          eventType: eventLogTable.eventType,
          properties: eventLogTable.properties,
          createdAt: eventLogTable.createdAt,
        })
        .from(eventLogTable)
        .orderBy(drizzleSql`${eventLogTable.createdAt} DESC`)
        .limit(20);

      res.json({ events: rows });
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      res.status(500).json({ error: 'Failed to fetch recent activity' });
    }
  });

  // GET /api/admin/ai-quality - Rolling AI quality metrics (Chunk B).
  // Reads from event_log: counts page_turned events as the denominator and
  // ai_quality_violation events as the numerators. Window defaults to 24h.
  app.get("/api/admin/ai-quality", adminAuth, async (_req, res) => {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [violationsRows, pageTurnsRows] = await Promise.all([
        db
          .select({ properties: eventLogTable.properties })
          .from(eventLogTable)
          .where(and(
            eq(eventLogTable.eventType, "ai_quality_violation"),
            gte(eventLogTable.createdAt, since),
          )),
        db
          .select({ count: drizzleSql<number>`COUNT(*)::integer` })
          .from(eventLogTable)
          .where(and(
            eq(eventLogTable.eventType, "page_turned"),
            gte(eventLogTable.createdAt, since),
          )),
      ]);

      const totalPagesGenerated = Number(pageTurnsRows[0]?.count ?? 0);
      // Count each violation kind. A single response can fire multiple, so
      // these counts can sum higher than the row count.
      const counts = { stall: 0, fakeChoices: 0, finalPageBroken: 0, momentumFired: 0 };
      let totalViolationRows = 0;
      for (const row of violationsRows) {
        totalViolationRows += 1;
        const p = (row.properties as Record<string, unknown>) ?? {};
        if (p.stall) counts.stall += 1;
        if (p.fakeChoices) counts.fakeChoices += 1;
        if (p.finalPageBroken) counts.finalPageBroken += 1;
        if (p.momentumFired) counts.momentumFired += 1;
      }

      res.json({
        windowHours: 24,
        totalPagesGenerated,
        totalViolationRows,
        counts,
        rates: {
          stall: totalPagesGenerated > 0 ? counts.stall / totalPagesGenerated : 0,
          fakeChoices: totalPagesGenerated > 0 ? counts.fakeChoices / totalPagesGenerated : 0,
          finalPageBroken: totalPagesGenerated > 0 ? counts.finalPageBroken / totalPagesGenerated : 0,
          momentumFired: totalPagesGenerated > 0 ? counts.momentumFired / totalPagesGenerated : 0,
        },
      });
    } catch (error) {
      console.error('Error fetching AI quality stats:', error);
      res.status(500).json({ error: 'Failed to fetch AI quality stats' });
    }
  });

  // GET /api/admin/model-override (v1.9.0) — current admin AI-model toggle.
  // Returns the alias stored in app_config plus the full resolved model ID
  // so the admin UI can display both.
  app.get("/api/admin/model-override", adminAuth, async (_req, res) => {
    try {
      const stored = getAdminModelOverride();
      const resolved = resolveModel(undefined); // pass undefined header → uses admin/env/default
      res.json({
        stored,                       // 'haiku' | 'sonnet' | full ID | null
        resolved,                     // always a full OpenRouter model ID
        aliases: Object.keys(MODEL_ALIASES),
      });
    } catch (error) {
      console.error('Error fetching model override:', error);
      res.status(500).json({ error: 'Failed to fetch model override' });
    }
  });

  // POST /api/admin/model-override (v1.9.0) — flip the toggle. Body shape:
  // { model: 'haiku' | 'sonnet' }. Persists to app_config AND updates the
  // in-memory cache synchronously so the very next AI call uses the new
  // model. Logged to event_log as admin_model_override_set so we have an
  // audit trail of when each flip happened.
  app.post("/api/admin/model-override", adminAuth, async (req, res) => {
    try {
      const requested = typeof req.body?.model === "string" ? req.body.model.trim() : "";
      // Restrict to known aliases for now. If we want to expose full IDs
      // later, drop this check (resolveModel already accepts pass-through
      // full IDs from the alias map).
      if (!requested || !(requested in MODEL_ALIASES)) {
        return res.status(400).json({
          error: `model must be one of: ${Object.keys(MODEL_ALIASES).join(", ")}`,
        });
      }

      const previous = getAdminModelOverride();
      await storage.setConfig("active_model", requested, "admin");
      setAdminModelOverride(requested);

      logEvent("admin", "admin_model_override_set", {
        from: previous,
        to: requested,
      }).catch(() => { /* logging never fails the request */ });

      res.json({
        stored: requested,
        resolved: resolveModel(undefined),
      });
    } catch (error) {
      console.error('Error setting model override:', error);
      res.status(500).json({ error: 'Failed to set model override' });
    }
  });

  // GET /api/admin/issue-reports (v1.13.0). Newest first. ?resolved=true|false
  // filters; ?limit caps the page size (default 100, max 500).
  app.get("/api/admin/issue-reports", adminAuth, async (req, res) => {
    try {
      const resolvedParam = req.query.resolved;
      const resolved =
        resolvedParam === "true" ? true : resolvedParam === "false" ? false : undefined;
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string, 10) || 100, 500) : 100;
      const reports = await storage.getIssueReports({ resolved, limit });
      res.json({ reports });
    } catch (err) {
      console.error('[admin] failed to list issue reports', err);
      res.status(500).json({ error: 'Failed to list issue reports' });
    }
  });

  // POST /api/admin/issue-reports/:id/resolve — set resolved_at = NOW().
  app.post("/api/admin/issue-reports/:id/resolve", adminAuth, async (req, res) => {
    try {
      const updated = await storage.markIssueReportResolved(req.params.id);
      if (!updated) return res.status(404).json({ error: 'Report not found' });
      res.json({ report: updated });
    } catch (err) {
      console.error('[admin] failed to resolve issue report', err);
      res.status(500).json({ error: 'Failed to resolve issue report' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
