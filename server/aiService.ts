import OpenAI from "openai";
import { storage } from "./storage";
import type { Character, Quest, Item, Message, Enemy, GameState, StorySummary } from "@shared/schema";
import { captureError } from "./sentry";
import { generateStorySummary } from "./summaryService";

// Constants for rolling story summary
const SUMMARY_THRESHOLD = 10; // Trigger summarization when this many unsummarized messages exist
const RECENT_MESSAGE_WINDOW = 5; // Always keep this many recent messages verbatim

  const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY || "sk-placeholder",
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://storymode.onrender.com",
      "X-Title": "Story Mode",
    }
  });

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIResponse {
  content: string;
  sender: 'dm' | 'npc';
  senderName: string | null;
  storyTitle?: string; // AI-generated title for new stories (2-5 words)
  error?: 'parse_failure' | 'api_error' | 'network_error'; // Error flag for tracking
  tokenUsage?: TokenUsage;
  actions?: {
    updateQuest?: { id: string; updates: Partial<Quest> };
    createQuest?: Omit<Quest, 'id'>;
    updateCharacter?: { updates: Partial<Character> };
    updateGameState?: Partial<GameState>;
    giveItem?: Omit<Item, 'id'>;
    updateEnemy?: { id: string; updates: Partial<Enemy> };
    createEnemies?: Array<Omit<Enemy, 'id'>>;
    startCombat?: { enemies: Array<Omit<Enemy, 'id'>>; scene: string };
    endCombat?: { victory: boolean; rewards?: string };
  };
}

export class TTRPGAIService {

  /**
   * Get pacing guidance based on where we are in the story.
   * This tells the AI how to shape the narrative arc.
   */
  private getPacingGuidance(currentPage: number, totalPages: number): string {
    if (!totalPages || totalPages === 0) return '';

    const progress = currentPage / totalPages;
    const pagesLeft = totalPages - currentPage;

    // Final page
    if (pagesLeft <= 1) {
      return `\n\nSTORY PACING — FINAL PAGE:
This is the LAST page of the story. You MUST bring everything to a satisfying conclusion.
- Resolve the central conflict
- Show the consequences of the player's choices throughout the story
- End with a memorable closing image or moment
- Do NOT present choices — instead, write a definitive ending
- The ending should feel earned based on everything that came before`;
    }

    // Last 3 pages — resolution
    if (pagesLeft <= 3) {
      return `\n\nSTORY PACING — RESOLUTION (pages ${currentPage}/${totalPages}, ${pagesLeft} pages remaining):
The story is ending very soon. Begin wrapping up:
- Start resolving major plot threads
- Present only 2 choices, each leading toward a distinct ending
- Raise emotional stakes — consequences should feel weighty
- No new major plot threads or characters`;
    }

    if (progress < 0.2) {
      return `\n\nSTORY PACING — SETUP (page ${currentPage} of ${totalPages}):
You are in the opening act. Focus on:
- Establishing the world and atmosphere
- Introducing the player's character in this setting
- Planting seeds for the central conflict
- Present 3-4 choices that establish the player's personality and approach`;
    }

    if (progress < 0.5) {
      return `\n\nSTORY PACING — RISING ACTION (page ${currentPage} of ${totalPages}):
The story is building. Focus on:
- Deepening the central conflict — complications and twists
- Developing relationships with key characters
- Raising the stakes with each page
- Present 3-4 choices with increasingly meaningful consequences`;
    }

    if (progress < 0.75) {
      return `\n\nSTORY PACING — ESCALATION (page ${currentPage} of ${totalPages}):
Approaching the climax. Focus on:
- Major revelations or turning points
- Forces converging — the player's choices start having visible consequences
- Tension should be at its highest
- Present 2-3 choices, each with clear and significant tradeoffs`;
    }

    // 75-90% — climax
    return `\n\nSTORY PACING — CLIMAX (page ${currentPage} of ${totalPages}, ${pagesLeft} pages remaining):
This is the peak of the story. Focus on:
- The central confrontation or crisis
- The player must make their most important choice
- Everything built up should pay off here
- Present 2-3 choices that will determine how the story ends`;
  }

  private getSystemPrompt(gameState?: GameState): string {
    // Use custom world if generated from character, otherwise use default fantasy
    const worldSetting = gameState?.worldSetting || "a classic dark fantasy realm";
    const worldTheme = gameState?.worldTheme || "Dark fantasy with mystery and adventure";
    const worldDescription = gameState?.worldDescription || "A medieval fantasy world with magic, monsters, and intrigue where heroes forge their own legends";

    // V2: Page-aware pacing
    const currentPage = gameState?.currentPage || 0;
    const totalPages = gameState?.totalPages || 0;
    const pacingGuidance = this.getPacingGuidance(currentPage, totalPages);
    const isPageBased = totalPages > 0;

    return `You are the Guide — a warm, witty, and imaginative storyteller who leads readers through interactive stories where their choices shape what happens next.

YOUR PERSONALITY:
- Warm and encouraging, like a favorite bookshop owner who loves stories
- Slightly playful — you enjoy surprising the reader
- You speak directly to the reader in second person ("You step into the market...")
- You never break character as the Guide unless the story itself is meta
- You are NOT a game master or dungeon master — you are a storyteller

THE WORLD:
${worldDescription}

GENRE/TONE: ${worldTheme}
SETTING: ${worldSetting}

STAY TRUE to this world's unique vibe. Every character, location, and event should feel authentic to this setting.

NARRATIVE GUIDELINES:
- Write in vivid, literary prose — this should feel like reading a book, not a game
- Use sensory details: what does the reader see, hear, smell, feel?
- Characters should have distinct voices, personalities, and motivations
- Keep each response to 150-250 words of narrative (concise but immersive)

STORY PROGRESSION — CRITICAL:
- EVERY page must move the story FORWARD. Something new must happen — a revelation, a shift in power, a consequence, a new character, a change of scene, an escalation.
- NEVER repeat or rehash what already happened. If a scene has been building tension, the next page must break through to something new — don't keep circling the same moment.
- Read the STORY SO FAR summary carefully. If a scene or dynamic has already played out, ADVANCE PAST IT. Don't restart or replay it.
- Vary the pacing: not every page should end on the same kind of beat. Mix tension, surprise, quiet moments, humor, action, and intimacy.
- Introduce complications, new characters, unexpected turns, and consequences. A good story surprises the reader.

CONTENT FREEDOM:
- This is an open creative platform. Mature themes — including romance, sexuality, violence, horror, dark humor, trauma, and morally complex situations — are fully welcome when they serve the story.
- Match the tone and intensity the reader establishes through their character description and choices. If they steer toward explicit, dark, or provocative territory, follow without hesitation.
- Never sanitize, deflect, fade to black, or redirect the narrative away from what the reader is clearly asking for. The reader controls the experience.
- Treat every genre and theme with the same craft and literary quality — a horror scene or a sex scene deserves the same vivid, well-written prose as any other moment.
${isPageBased ? `\nThis is a ${totalPages}-page story. Each of your responses is one page.` : ''}
${pacingGuidance}

RESPONSE STRUCTURE:
Every response MUST include BOTH of these parts:

1. **Narrative** (150-250 words): Rich, atmospheric prose advancing the story. Write like a novelist.

2. **Choices** — THIS IS MANDATORY. You MUST end EVERY response with exactly this format (unless this is the very final page):

**What do you do?**
• [Short, evocative action the reader might take]
• [A meaningfully different direction]
• [Something unexpected or bold]

CRITICAL: If your response does not end with "What do you do?" followed by 2-4 bullet point choices using the • character, it is WRONG. The reader CANNOT continue without choices. Never skip them.

QUEST TRACKING:
- Check player actions against active quests
- If an action advances a quest, update progress
- Be generous — interpret player intent
- Generate follow-up quests when story arcs complete

CHARACTER PROGRESSION:
- Award experience for meaningful story moments
- Give items as narrative rewards (discoveries, gifts, trades)
- Keep progression feeling natural, not game-like`;
  }

  private async getGameContext(sessionId: string, storyId?: string): Promise<{
    character: Character | undefined;
    quests: Quest[];
    items: Item[];
    recentMessages: Message[];
    gameState: GameState | undefined;
    storySummary: StorySummary | null;
  }> {
    const [character, quests, items, recentMessages, gameState, storySummary] = await Promise.all([
      storage.getCharacter(sessionId, storyId),
      storage.getQuests(sessionId, storyId),
      storage.getItems(sessionId, storyId),
      storage.getRecentMessages(sessionId, 10, storyId),
      storage.getGameState(sessionId, storyId),
      storage.getActiveSummary(sessionId, storyId),
    ]);

    return { character, quests, items, recentMessages, gameState, storySummary };
  }

  private createContextPrompt(
    context: {
      character: Character | undefined;
      quests: Quest[];
      items: Item[];
      recentMessages: Message[];
      gameState: GameState | undefined;
      storySummary: StorySummary | null;
    }
  ): string {
    const { character, quests, items, recentMessages, gameState, storySummary } = context;

    let prompt = "CURRENT GAME STATE:\\n\\n";

    // World context
    if (gameState?.worldSetting) {
      prompt += `WORLD: ${gameState.worldSetting}\\n`;
      prompt += `THEME: ${gameState.worldTheme}\\n\\n`;
    }

    // Character info with narrative context
    if (character) {
      prompt += `CHARACTER: ${character.name}, Level ${character.level} ${character.class}\\n`;
      if (character.appearance) {
        prompt += `Description: ${character.appearance}\\n`;
      }
      if (character.backstory) {
        prompt += `Backstory: ${character.backstory}\\n`;
      }
      prompt += `HP: ${character.currentHealth}/${character.maxHealth}, Mana: ${character.currentMana}/${character.maxMana}\\n`;
      prompt += `Stats: STR ${character.strength}, DEX ${character.dexterity}, CON ${character.constitution}, INT ${character.intelligence}, WIS ${character.wisdom}, CHA ${character.charisma}\\n\\n`;
    }

    // Active quests with advancement hints
    const activeQuests = quests.filter(q => q.status === 'active');
    if (activeQuests.length > 0) {
      prompt += "ACTIVE QUESTS (CHECK EVERY ACTION AGAINST THESE):\\n";
      activeQuests.forEach(quest => {
        prompt += `- ${quest.title}: ${quest.description} (${quest.progress}/${quest.maxProgress})\\n`;

        // Add advancement hints
        if (quest.progress === 0) {
          prompt += `  ⚠️ WARNING: Quest stuck at 0 progress - be EXTRA generous with advancement\\n`;
        }

        // Provide contextual hints based on quest type and progress
        if (quest.isMainStory) {
          prompt += `  📌 MAIN QUEST: Prioritize progress - any story action likely advances this\\n`;
        }

        // Suggest what kinds of actions might advance this quest
        if (quest.description.toLowerCase().includes('find') || quest.description.toLowerCase().includes('search')) {
          prompt += `  💡 HINT: Investigating, searching, talking to NPCs should advance this\\n`;
        } else if (quest.description.toLowerCase().includes('talk') || quest.description.toLowerCase().includes('speak')) {
          prompt += `  💡 HINT: Any conversation or dialogue should advance this\\n`;
        } else if (quest.description.toLowerCase().includes('defeat') || quest.description.toLowerCase().includes('kill')) {
          prompt += `  💡 HINT: Combat actions should advance this\\n`;
        } else {
          prompt += `  💡 HINT: Be creative - many player actions can reasonably advance this\\n`;
        }
      });
      prompt += "\\n";
    }

    // Equipped items
    const equippedItems = items.filter(item => item.equipped);
    if (equippedItems.length > 0) {
      prompt += "EQUIPPED: " + equippedItems.map(item => item.name).join(', ') + "\\n\\n";
    }

    // Game state
    if (gameState) {
      prompt += `SCENE: ${gameState.currentScene}\\n`;
      if (gameState.inCombat) {
        prompt += `IN COMBAT - Turn: ${gameState.currentTurn}\\n`;
      }
      // V2: Page tracking
      if (gameState.totalPages && gameState.totalPages > 0) {
        const nextPage = (gameState.currentPage || 0) + 1;
        prompt += `PAGE: ${nextPage} of ${gameState.totalPages}\\n`;
        if (gameState.genre) {
          prompt += `GENRE: ${gameState.genre}\\n`;
        }
      }
      prompt += "\\n";
    }

    // Story summary (rolling context from earlier in the adventure)
    if (storySummary) {
      prompt += "STORY SO FAR:\\n";
      prompt += `${storySummary.summaryText}\\n\\n`;
    }

    // Recent conversation for context
    if (recentMessages.length > 0) {
      prompt += "RECENT CONVERSATION:\\n";
      recentMessages.slice(-5).forEach(msg => {
        const speaker = msg.sender === 'dm' ? 'DM' : msg.sender === 'npc' ? (msg.senderName || 'NPC') : 'Player';
        prompt += `${speaker}: ${msg.content}\\n`;
      });
      prompt += "\\n";
    }

    // Quest relationship analysis
    if (activeQuests.length > 1) {
      prompt += "QUEST DYNAMICS: Consider how current quests might interconnect or influence each other.\\n\\n";
    }

    return prompt;
  }

  /**
   * Check if summarization is needed and trigger it if so.
   * This is non-blocking - if summarization fails, we log the error but don't stop the response.
   */
  private async checkAndTriggerSummarization(sessionId: string, storyId?: string): Promise<void> {
    try {
      // Get all messages and current summary for this specific story
      const [allMessages, currentSummary] = await Promise.all([
        storage.getMessages(sessionId, storyId),
        storage.getActiveSummary(sessionId, storyId),
      ]);

      const totalMessages = allMessages.length;

      // Calculate how many messages are unsummarized
      let unsummarizedCount: number;
      if (!currentSummary) {
        // No summary yet - all messages except the recent window are unsummarized
        unsummarizedCount = totalMessages - RECENT_MESSAGE_WINDOW;
      } else {
        // Summary exists - count messages after the summary's end index
        unsummarizedCount = totalMessages - currentSummary.messageEndIndex - RECENT_MESSAGE_WINDOW;
      }

      // Only summarize if we have enough unsummarized messages
      if (unsummarizedCount < SUMMARY_THRESHOLD) {
        console.log('[AI Service] Summarization not needed', {
          totalMessages,
          unsummarizedCount,
          threshold: SUMMARY_THRESHOLD,
        });
        return;
      }

      console.log('[AI Service] Triggering summarization', {
        totalMessages,
        unsummarizedCount,
        threshold: SUMMARY_THRESHOLD,
        hasPreviousSummary: !!currentSummary,
      });

      // Get messages to summarize (everything from start through totalMessages - RECENT_WINDOW)
      const messagesToSummarizeEnd = totalMessages - RECENT_MESSAGE_WINDOW;
      const messagesToSummarize = allMessages.slice(0, messagesToSummarizeEnd);

      if (messagesToSummarize.length === 0) {
        console.log('[AI Service] No messages to summarize after calculation');
        return;
      }

      // Get previous summary text if it exists
      const previousSummaryText = currentSummary?.summaryText;

      // Generate the new summary
      const summaryResult = await generateStorySummary(
        sessionId,
        messagesToSummarize,
        previousSummaryText
      );

      if (summaryResult.error || !summaryResult.summaryText) {
        console.error('[AI Service] Summarization failed', { error: summaryResult.error });
        // Don't throw - just log and continue without summary
        return;
      }

      // Deactivate old summaries and save the new one
      await storage.deactivateSummaries(sessionId, storyId);
      await storage.createSummary(sessionId, {
        sessionId,
        storyId: storyId || null,
        summaryText: summaryResult.summaryText,
        messageStartIndex: 0,
        messageEndIndex: messagesToSummarizeEnd,
        messageCount: messagesToSummarize.length,
        summaryTokenCount: summaryResult.tokenUsage?.totalTokens || null,
        createdAt: new Date().toISOString(),
        isActive: true,
      });

      console.log('[AI Service] Summary created successfully', {
        messagesCovered: messagesToSummarize.length,
        summaryLength: summaryResult.summaryText.length,
        tokenCount: summaryResult.tokenUsage?.totalTokens,
      });

    } catch (error: any) {
      // Non-blocking - log but don't throw
      console.error('[AI Service] Summarization check failed (non-blocking)', {
        error: error.message,
        sessionId,
      });
      captureError(error as Error, {
        context: "Summarization trigger - non-blocking failure",
        sessionId,
      });
    }
  }

  async generateResponse(sessionId: string, playerMessage: string, storyId?: string, retryAttempt: boolean = false): Promise<AIResponse> {
    const startTime = Date.now();
    console.log('[AI Service] Starting AI response generation', {
      sessionId,
      storyId,
      playerMessage: playerMessage.substring(0, 100),
      timestamp: new Date().toISOString(),
      retryAttempt
    });

    try {
      // Validate API key exists
      if (!process.env.OPENROUTER_API_KEY) {
        const error = new Error("OPENROUTER_API_KEY environment variable is not set");
        console.error('[AI Service] API key missing', { error: error.message });
        captureError(error, { context: "AI service initialization - missing API key" });
        throw error;
      }

      // Check if summarization is needed (fire-and-forget - runs in background)
      // The new summary won't be available for THIS response, but will be ready for the NEXT one
      this.checkAndTriggerSummarization(sessionId, storyId).catch((err) => {
        console.error('[AI Service] Background summarization error', { error: err.message });
      });

      // Get current game context for this specific story
      console.log('[AI Service] Fetching game context', { storyId });
      const context = await this.getGameContext(sessionId, storyId);
      console.log('[AI Service] Game context retrieved', {
        hasCharacter: !!context.character,
        questCount: context.quests.length,
        itemCount: context.items.length,
        messageCount: context.recentMessages.length,
        hasSummary: !!context.storySummary,
      });

      // Log recent message chain (truncated for privacy)
      console.log('[AI Service] Message history:', context.recentMessages.map((msg, idx) =>
        `${msg.sender}:${msg.content.substring(0, 50)}`
      ).join(' | '));

      const contextPrompt = this.createContextPrompt(context);

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: this.getSystemPrompt(context.gameState)
        },
        {
          role: "user",
          content: `${contextPrompt}

PLAYER ACTION: ${playerMessage}

RESPONSE REQUIREMENTS:

1. **Narrative**: Write 150-250 words of vivid literary prose that ADVANCES the story. Something new must happen — don't circle back to the same moment or dynamic.

2. **Choices**: You MUST end the "content" field with choices in this EXACT format:
   \\n\\n**What do you do?**\\n• [First choice]\\n• [Second choice]\\n• [Third choice]
   No "Option A/B/C" labels. Use the • bullet character. This is MANDATORY — without choices the reader is stuck.

3. **Quest Tracking**: Check if this action relates to active quests and update accordingly

4. **JSON Formatting**: You MUST return valid JSON. In the "content" field:
   - Use \\n for line breaks (not raw newlines)
   - Use \\t for tabs (not raw tab characters)
   - Escape all special characters properly
   - Do NOT include raw control characters

Format your response as JSON with this structure:
{
  "content": "Your narrative prose here...\\n\\n**What do you do?**\\n• Take a bold action\\n• Try something different\\n• Do something unexpected",
  "sender": "dm" or "npc",
  "senderName": null for DM, or NPC name if speaking as NPC,
  "actions": {
    // IMPORTANT: Include these when player actions complete quest objectives
    "updateQuest": { "id": "quest-id-from-active-quests", "updates": { "progress": 2, "status": "completed" } },
    "createQuest": { "title": "Quest Title", "description": "Clear objectives with specific steps", "status": "active", "priority": "high|normal|low", "progress": 0, "maxProgress": 3, "reward": "50 XP and Gold Pouch" },
    "updateCharacter": { "updates": { "experience": 50 } }, // Award XP for quest progress
    "updateGameState": { "currentScene": "Descriptive Location Name" },
    "giveItem": { "name": "Item Name", "type": "weapon|armor|consumable|misc", "description": "Item description", "quantity": 1, "rarity": "common|uncommon|rare|epic|legendary", "equipped": false }
  }
}

QUEST TRACKING - CRITICAL:
- Check EVERY player action against active quests
- If action completes a quest objective, increment "progress"
- If progress === maxProgress, set status to "completed"
- Award experience when quests complete
- Create new quests when story events warrant them
- Update quest descriptions if new information is learned

QUEST DESCRIPTION GUIDELINES (IMPORTANT):
When creating new quests:
- START VAGUE: "Investigate the disappearances" NOT "Talk to elder, search forest, find clues"
- Let player DISCOVER how to progress through experimentation
- Update description as quest advances to reflect new information
- Don't pre-reveal all steps - maintain mystery and discovery
- Focus on WHAT needs doing, not HOW to do it

Example Quest Actions:
- Player talks to NPC about quest → update progress +1
- Player finds quest item → update progress +1, giveItem
- Player completes all objectives → progress = maxProgress, status = "completed", award XP
- NPC gives new quest → createQuest with vague, discovery-focused description`
        }
      ];

      console.log('[AI Service] Calling OpenRouter API', {
        model: "deepseek/deepseek-chat",
        systemPromptLength: this.getSystemPrompt(context.gameState).length,
        userPromptLength: messages[1].content?.toString().length || 0
      });

      // Prompt lengths logged (content omitted for privacy)

      const response = await openai.chat.completions.create({
        model: "deepseek/deepseek-chat",
        messages,
        // response_format removed — relying on prompt-level JSON instructions for model compatibility
      });

      const apiDuration = Date.now() - startTime;

      // Log raw usage data from OpenRouter
      console.log('[AI Service] Raw response.usage from OpenRouter:', JSON.stringify(response.usage));

      // Capture token usage from API response
      const tokenUsage: TokenUsage | undefined = response.usage ? {
        promptTokens: response.usage.prompt_tokens || 0,
        completionTokens: response.usage.completion_tokens || 0,
        totalTokens: response.usage.total_tokens || 0,
      } : undefined;

      if (!response.usage) {
        console.warn('[AI Service] WARNING: OpenRouter did not return usage data - cost tracking will use fallback estimate');
      }

      console.log('[AI Service] API response received', {
        durationMs: apiDuration,
        hasChoices: !!response.choices,
        choicesLength: response.choices?.length || 0,
        finishReason: response.choices?.[0]?.finish_reason,
        tokenUsage
      });

      // Validate response structure
      if (!response.choices || response.choices.length === 0) {
        const error = new Error('OpenRouter API returned no choices');
        console.error('[AI Service] Invalid API response structure', {
          response: JSON.stringify(response).substring(0, 500)
        });
        captureError(error, {
          context: "AI API response validation",
          responseStructure: {
            hasChoices: !!response.choices,
            choicesLength: response.choices?.length || 0
          }
        });
        throw error;
      }

      if (!response.choices[0].message) {
        const error = new Error('OpenRouter API choice has no message');
        console.error('[AI Service] Invalid API choice structure', {
          choice: JSON.stringify(response.choices[0]).substring(0, 500)
        });
        captureError(error, {
          context: "AI API choice validation",
          finishReason: response.choices[0]?.finish_reason
        });
        throw error;
      }

      let aiResponse;
      try {
        let rawContent = response.choices[0].message.content || '{}';
        console.log('[AI Service] Parsing JSON response', {
          contentLength: rawContent.length,
          contentPreview: rawContent.substring(0, 50)
        });

        // Strip markdown code fences if present (e.g. ```json ... ```)
        // Some models (DeepSeek, Mistral) wrap JSON in markdown code blocks
        rawContent = rawContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

        // Try to parse the JSON, which may contain control characters
        aiResponse = JSON.parse(rawContent);
        console.log('[AI Service] JSON parsed successfully', {
          hasSender: !!aiResponse.sender,
          hasContent: !!aiResponse.content,
          contentLength: aiResponse.content?.length || 0,
          hasActions: !!aiResponse.actions
        });
      } catch (parseError: any) {
        // If JSON parsing fails due to control characters, try to fix it
        console.error('[AI Service] JSON parse error, attempting to sanitize', {
          error: parseError.message,
          position: parseError.message.match(/position (\d+)/)?.[1]
        });
        let rawContent = response.choices[0].message.content || '{}';

        // Strip markdown code fences if present
        rawContent = rawContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

        // Sanitize JSON by properly escaping string content
        // Strategy: Find string values and escape special characters within them
        let sanitized = rawContent;

        // First, remove any truly invalid control characters (not \n, \r, \t)
        sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

        // Fix unescaped newlines, carriage returns, and tabs within JSON strings
        // This regex finds strings and escapes special chars within them
        sanitized = sanitized.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
          return match
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
        });

        try {
          aiResponse = JSON.parse(sanitized);
          console.log('[AI Service] JSON parsed successfully after sanitization');
        } catch (secondError: any) {
          // If still failing, log the problematic content and return a fallback response
          console.error('[AI Service] Failed to parse AI response even after sanitization', {
            originalError: parseError.message,
            sanitizationError: secondError.message,
            rawContentPreview: rawContent.substring(0, 500),
            sanitizedContentPreview: sanitized.substring(0, 500)
          });

          const parseFailureError = new Error(`JSON parse failed: ${parseError.message}`);
          captureError(parseFailureError, {
            context: "AI response parsing - sanitization failed",
            rawContent: rawContent.substring(0, 500),
            sanitizedContent: sanitized.substring(0, 500),
            originalError: parseError.message,
            secondError: secondError.message
          });

          // Before giving up, retry the AI call once with fresh context
          // This fixes an intermittent issue where the first AI call on a new story
          // gets stale/incomplete context from the database, producing malformed JSON.
          // By the time we retry, the DB writes have settled.
          if (!retryAttempt) {
            console.log('[AI Service] Parse failure on first attempt — retrying with fresh context after 150ms delay');
            await new Promise(resolve => setTimeout(resolve, 150));
            return this.generateResponse(sessionId, playerMessage, storyId, true);
          }

          console.error('[AI Service] ⚠️ RETURNING FALLBACK RESPONSE DUE TO PARSE FAILURE (after retry)');

          return {
            content: "Your Guide pauses, gathering their thoughts... (There was an issue processing the response. Please try again.)",
            sender: 'dm',
            senderName: null,
            actions: undefined,
            error: 'parse_failure' // Flag for frontend to detect this is an error
          };
        }
      }

      // Validate and sanitize the response
      const finalResponse: AIResponse = {
        content: aiResponse.content || "The Guide pauses, considering your words...",
        sender: aiResponse.sender === 'npc' ? 'npc' as const : 'dm' as const,
        senderName: aiResponse.sender === 'npc' ? aiResponse.senderName : null,
        storyTitle: aiResponse.storyTitle || undefined,
        tokenUsage,
        actions: aiResponse.actions || undefined
      };

      // V2: Increment page count if this is a page-based story
      if (context.gameState?.totalPages && context.gameState.totalPages > 0) {
        const newPage = (context.gameState.currentPage || 0) + 1;
        const isComplete = newPage >= context.gameState.totalPages;

        console.log('[AI Service] Page increment', {
          currentPage: newPage,
          totalPages: context.gameState.totalPages,
          isComplete,
        });

        // Update game state with new page count
        await storage.updateGameState(sessionId, {
          currentPage: newPage,
          storyComplete: isComplete,
        }, storyId);

        // Inject page info into actions so the frontend knows
        if (!finalResponse.actions) {
          finalResponse.actions = {};
        }
        finalResponse.actions.updateGameState = {
          ...finalResponse.actions.updateGameState,
          currentPage: newPage,
          storyComplete: isComplete,
        };
      }

      const totalDuration = Date.now() - startTime;
      console.log('[AI Service] Response generation complete', {
        totalDurationMs: totalDuration,
        responseLength: finalResponse.content.length,
        sender: finalResponse.sender,
        hasActions: !!finalResponse.actions
      });

      return finalResponse;

    } catch (error: any) {
      const totalDuration = Date.now() - startTime;
      console.error('[AI Service] Error generating AI response', {
        error: error.message,
        errorType: error.constructor.name,
        status: error.status,
        code: error.code,
        durationMs: totalDuration,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')
      });

      captureError(error as Error, {
        context: "AI response generation - outer catch",
        errorDetails: {
          message: error.message,
          type: error.constructor.name,
          status: error.status,
          code: error.code,
          durationMs: totalDuration
        }
      });
      
      // Enhanced error handling based on error type
      let fallbackContent = "";
      let errorType: 'api_error' | 'network_error' = 'api_error';

      if (error?.status === 429) {
        // Rate limit exceeded
        fallbackContent = "Your Guide is taking a moment to gather their thoughts. Please try again shortly...";
        errorType = 'api_error';
      } else if (error?.status === 401) {
        // API key issue
        fallbackContent = "Your Guide is having trouble connecting. The story will continue shortly...";
        errorType = 'api_error';
      } else if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
        // Network issues
        fallbackContent = "Your Guide lost the thread for a moment. Let's try that again...";
        errorType = 'network_error';
      } else {
        // Generic error
        fallbackContent = "Your Guide pauses, considering what comes next...";
        errorType = 'api_error';
      }

      console.error('[AI Service] ⚠️ RETURNING FALLBACK RESPONSE DUE TO ERROR:', errorType);

      // Provide contextual fallback based on player message
      const contextualResponse = this.generateFallbackResponse(playerMessage, fallbackContent, errorType);

      return contextualResponse;
    }
  }

  private generateFallbackResponse(playerMessage: string, errorMessage: string, errorType: 'api_error' | 'network_error' | 'parse_failure'): AIResponse {
    const lowerMessage = playerMessage.toLowerCase();

    // Analyze the player's message to provide contextual responses
    if (lowerMessage.includes('attack') || lowerMessage.includes('fight') || lowerMessage.includes('combat')) {
      return {
        content: `${errorMessage} The tension in your story builds...`,
        sender: 'dm',
        senderName: null,
        error: errorType
      };
    } else if (lowerMessage.includes('explore') || lowerMessage.includes('look') || lowerMessage.includes('search')) {
      return {
        content: `${errorMessage} You take in your surroundings, noticing new details...`,
        sender: 'dm',
        senderName: null,
        error: errorType
      };
    } else if (lowerMessage.includes('talk') || lowerMessage.includes('speak') || lowerMessage.includes('conversation')) {
      return {
        content: `${errorMessage} The characters around you have more to say...`,
        sender: 'dm',
        senderName: null,
        error: errorType
      };
    } else if (lowerMessage.includes('quest') || lowerMessage.includes('mission') || lowerMessage.includes('task')) {
      return {
        content: `${errorMessage} You reflect on what you need to do next...`,
        sender: 'dm',
        senderName: null,
        error: errorType
      };
    } else if (lowerMessage.includes('rest') || lowerMessage.includes('sleep') || lowerMessage.includes('heal')) {
      return {
        content: `${errorMessage} You take a moment to catch your breath...`,
        sender: 'dm',
        senderName: null,
        error: errorType
      };
    } else {
      return {
        content: `${errorMessage} The story continues. What would you like to do next?`,
        sender: 'dm',
        senderName: null,
        error: errorType
      };
    }
  }

  async generateFollowUpQuest(completedQuest: Quest, context: {
    character: Character | undefined;
    gameState: GameState | undefined;
  }): Promise<Quest | null> {
    try {
      const response = await openai.chat.completions.create({
        model: "deepseek/deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are a storytelling Guide creating follow-up goals that continue story arcs."
          },
          {
            role: "user",
            content: `The player just completed: "${completedQuest.title}"
            Description: ${completedQuest.description}

            Player Level: ${context.character?.level || 1}
            Current Scene: ${context.gameState?.currentScene || "Unknown"}

            Create a natural follow-up quest that continues this storyline. Format as JSON:
            {
              "title": "Quest Title",
              "description": "Engaging description that builds on the completed quest",
              "status": "active",
              "priority": "normal",
              "progress": 0,
              "maxProgress": 3,
              "reward": "Appropriate reward"
            }`
          }
        ],
        // response_format removed — relying on prompt-level JSON instructions for model compatibility
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.title ? result : null;

    } catch (error) {
      captureError(error as Error, { context: "Follow-up quest generation" }); console.error('Error generating follow-up quest:', error);
      return null;
    }
  }

  async detectSideQuestOpportunity(
    playerMessage: string,
    context: {
      character: Character | undefined;
      quests: Quest[];
      recentMessages: Message[];
      gameState: GameState | undefined;
    }
  ): Promise<boolean> {
    try {
      // Quick heuristic checks before making AI call to save costs
      const lowerMessage = playerMessage.toLowerCase();

      // Check for NPC interaction keywords
      const npcInteractionKeywords = ['talk', 'speak', 'ask', 'tell', 'greet', 'conversation', 'chat'];
      const hasNPCInteraction = npcInteractionKeywords.some(keyword => lowerMessage.includes(keyword));

      // Check for discovery/investigation keywords
      const discoveryKeywords = ['search', 'investigate', 'examine', 'look', 'find', 'discover', 'explore'];
      const hasDiscovery = discoveryKeywords.some(keyword => lowerMessage.includes(keyword));

      // Check for interesting story hooks
      const storyHookKeywords = ['help', 'problem', 'trouble', 'mission', 'task', 'favor', 'need'];
      const hasStoryHook = storyHookKeywords.some(keyword => lowerMessage.includes(keyword));

      // Check recent messages for NPC dialogue
      const recentNPCMessages = context.recentMessages.slice(-5).filter(m => m.sender === 'npc' || m.sender === 'dm');
      const hasRecentNPCDialogue = recentNPCMessages.length > 0;

      // Don't create side quests if too many active quests already (max 5 active total)
      const activeQuestCount = context.quests.filter(q => q.status === 'active').length;
      if (activeQuestCount >= 5) {
        console.log('[AI Service] Side quest opportunity rejected: too many active quests', { activeQuestCount });
        return false;
      }

      // Heuristic decision: if strong signals present, return true
      if ((hasNPCInteraction || hasDiscovery) && (hasStoryHook || hasRecentNPCDialogue)) {
        console.log('[AI Service] Side quest opportunity detected via heuristics', {
          hasNPCInteraction,
          hasDiscovery,
          hasStoryHook,
          hasRecentNPCDialogue
        });
        return true;
      }

      // No clear opportunity
      return false;

    } catch (error) {
      console.error('[AI Service] Error detecting side quest opportunity:', error);
      captureError(error as Error, { context: "Side quest opportunity detection" });
      return false;
    }
  }

  async generateSideQuest(
    sessionId: string,
    playerMessage: string,
    context: {
      character: Character | undefined;
      gameState: GameState | undefined;
      recentMessages: Message[];
    }
  ): Promise<Omit<Quest, 'id'> | null> {
    try {
      // Get conversation context
      const conversationContext = context.recentMessages.slice(-5).map(m => {
        const speaker = m.sender === 'dm' ? 'DM' : m.sender === 'npc' ? (m.senderName || 'NPC') : 'Player';
        return `${speaker}: ${m.content}`;
      }).join('\\n');

      const response = await openai.chat.completions.create({
        model: "deepseek/deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are a D&D Dungeon Master creating engaging side quests from player interactions and discoveries."
          },
          {
            role: "user",
            content: `Recent conversation:
${conversationContext}

Player's latest action: "${playerMessage}"

Player Level: ${context.character?.level || 1}
Current Scene: ${context.gameState?.currentScene || "Unknown"}

Based on this interaction, create a SHORT side quest (2-3 objectives) that:
- Stems naturally from the conversation or discovery
- Can be completed independently of main story
- Is appropriate for the player's level
- Has a clear but vague objective

Format as JSON:
{
  "title": "Short, punchy quest title",
  "description": "Vague objective (what to do, not how)",
  "status": "active",
  "priority": "normal",
  "progress": 0,
  "maxProgress": 2,
  "reward": "Appropriate reward",
  "isMainStory": false
}`
          }
        ],
        // response_format removed — relying on prompt-level JSON instructions for model compatibility
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      if (result.title) {
        console.log('[AI Service] Side quest generated', {
          title: result.title,
          description: result.description.substring(0, 100)
        });

        return {
          sessionId,
          storyId: null,
          title: result.title,
          description: result.description,
          status: 'active',
          priority: result.priority || 'normal',
          progress: 0,
          maxProgress: result.maxProgress || 2,
          reward: result.reward,
          isMainStory: false,
          parentQuestId: null,
          chainId: null
        };
      }

      return null;

    } catch (error) {
      console.error('[AI Service] Error generating side quest:', error);
      captureError(error as Error, { context: "Side quest generation" });
      return null;
    }
  }

  async generateQuestIdeas(sessionId: string, playerLevel: number, currentScene: string, storyId?: string): Promise<Quest[]> {
    try {
      const context = await this.getGameContext(sessionId, storyId);
      
      const response = await openai.chat.completions.create({
        model: "deepseek/deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are a D&D Dungeon Master creating engaging quests for a player."
          },
          {
            role: "user",
            content: `Create 2-3 quest ideas for a level ${playerLevel} character in ${currentScene}. 
            
Format as JSON array:
[
  {
    "title": "Quest Title",
    "description": "Engaging quest description with clear objectives",
    "status": "active",
    "priority": "normal",
    "progress": 0,
    "maxProgress": 3,
    "reward": "Appropriate reward for level"
  }
]

Make quests appropriate for the character level and current location.`
          }
        ],
        // response_format removed — relying on prompt-level JSON instructions for model compatibility
      });

      const result = JSON.parse(response.choices[0].message.content || '[]');
      return Array.isArray(result.quests) ? result.quests : [];
      
    } catch (error) {
      captureError(error as Error, { context: "Quest ideas generation" }); console.error('Error generating quest ideas:', error);
      return [];
    }
  }

  async generateNPCDialogue(npcName: string, context: string, playerMessage: string): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "deepseek/deepseek-chat",
        messages: [
          {
            role: "system",
            content: `You are ${npcName}, an NPC in a D&D fantasy world. Stay in character and respond naturally to the player.`
          },
          {
            role: "user",
            content: `Context: ${context}

Player says: "${playerMessage}"

Respond as ${npcName} would, staying true to their character and the situation.`
          }
        ]
      });

      return response.choices[0].message.content || "...";
      
    } catch (error) {
      captureError(error as Error, { context: "NPC dialogue generation" }); console.error('Error generating NPC dialogue:', error);
      return "The NPC seems distracted and doesn't respond.";
    }
  }

  async generateWorldFromCharacter(character: {
    name: string;
    appearance?: string | null;
    backstory?: string | null;
    class?: string;
  }): Promise<{
    worldSetting: string;
    worldTheme: string;
    worldDescription: string;
    initialScene: string;
    initialQuest: { title: string; description: string };
    startingItems: Array<{ name: string; type: string; description: string }>;
  }> {
    try {
      const characterDesc = character.appearance || "a mysterious adventurer";
      const characterStory = character.backstory || "seeking their destiny";

      const prompt = `Based on this character, create a unique and coherent game world that matches their vibe and story:

CHARACTER:
- Name: ${character.name}
- Description: ${characterDesc}
- Backstory: ${characterStory}
- Class: ${character.class || "Adventurer"}

TASK: Generate a complete world setting that feels authentic to this character. If they're a "ball of lint trying to find their lint family," create a whimsical lint universe with fabric creatures and dryer vent dungeons. If they're a dark knight, create a grim gothic world. Match the tone perfectly.

Respond in this EXACT JSON format (no other text):
{
  "worldSetting": "short name for this world (e.g., 'The Lint Universe', 'Kingdom of Shadows')",
  "worldTheme": "1-2 sentence tone/genre description",
  "worldDescription": "3-4 sentences describing the world, its inhabitants, magic system, and atmosphere - make it vivid and specific to the character's vibe",
  "initialScene": "where the character starts their journey (specific location name and brief description)",
  "initialQuest": {
    "title": "engaging quest title",
    "description": "2-3 sentences describing the first quest, tied to their backstory"
  },
  "startingItems": [
    {"name": "item name", "type": "weapon|armor|consumable|misc", "description": "what it does"},
    {"name": "item name", "type": "weapon|armor|consumable|misc", "description": "what it does"},
    {"name": "item name", "type": "weapon|armor|consumable|misc", "description": "what it does"}
  ]
}`;

      const response = await openai.chat.completions.create({
        model: "deepseek/deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are a creative world-building expert. Generate immersive, coherent game worlds that perfectly match character concepts. Always respond with valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.9, // Higher creativity for world generation
      });

      const content = response.choices[0].message.content || "";

      // Parse the JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in AI response");
      }

      const worldData = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!worldData.worldSetting || !worldData.worldTheme || !worldData.worldDescription ||
          !worldData.initialScene || !worldData.initialQuest || !worldData.startingItems) {
        throw new Error("Missing required fields in world generation response");
      }

      console.log('[AI Service] Generated world from character:', {
        character: character.name,
        worldSetting: worldData.worldSetting,
      });

      return worldData;

    } catch (error: any) {
      captureError(error as Error, { context: "World generation from character" });
      console.error('[AI Service] Error generating world from character:', error);

      // Return a fallback generic fantasy world
      return {
        worldSetting: "The Realm of Adventures",
        worldTheme: "Classic fantasy with mystery and adventure",
        worldDescription: "A vast realm where magic and steel clash, ancient ruins hold forgotten secrets, and heroes rise to face the darkness. The land is dotted with medieval towns, dark forests, and mysterious dungeons waiting to be explored.",
        initialScene: "A bustling medieval village at the crossroads of adventure",
        initialQuest: {
          title: "Begin Your Journey",
          description: "Explore this new world and discover your destiny. The village elder has mentioned strange occurrences in the nearby forest that need investigation."
        },
        startingItems: [
          { name: "Sturdy Weapon", type: "weapon", description: "A reliable weapon for your adventures" },
          { name: "Leather Armor", type: "armor", description: "Basic protection from harm" },
          { name: "Health Potion", type: "consumable", description: "Restores vitality when needed" }
        ]
      };
    }
  }

  async generateCharacterPortrait(name: string, appearance: string): Promise<string> {
    try {
      if (!process.env.OPENROUTER_API_KEY) {
        throw new Error('Image generation not available');
      }

      // Sanitize input to prevent prompt injection
      const sanitizedName = name.replace(/[^\w\s-]/g, '').trim();
      const sanitizedAppearance = appearance.replace(/[^\w\s.,'-]/g, '').trim();

      if (!sanitizedName || !sanitizedAppearance) {
        throw new Error('Invalid name or appearance description');
      }

      // Create a detailed prompt for character portrait generation
      const prompt = `A high-quality fantasy character portrait of ${sanitizedName}. ${sanitizedAppearance}. Digital art style, detailed fantasy character portrait, professional artwork, dramatic lighting, fantasy RPG character art style.`;

      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
      });

      if (!response.data || response.data.length === 0 || !response.data[0].url) {
        throw new Error('No image generated or invalid response');
      }

      return response.data[0].url;
    } catch (error: any) {
      captureError(error as Error, { context: "Character portrait generation" }); console.error('Error generating character portrait:', error);
      
      // Handle specific error types
      if (error?.status === 429) {
        throw new Error('Image generation rate limit exceeded. Please try again in a few moments.');
      } else if (error?.status === 401) {
        throw new Error('AI service configuration error. Please contact support.');
      } else if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
        throw new Error('Unable to connect to image generation service. Please check your internet connection.');
      } else if (error.message?.includes('content policy')) {
        throw new Error('Character description violates content policy. Please try a different description.');
      } else {
        throw new Error('Failed to generate character portrait. Please try again.');
      }
    }
  }
}

export const aiService = new TTRPGAIService();