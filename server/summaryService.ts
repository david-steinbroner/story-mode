import OpenAI from "openai";
import type { Message } from "@shared/schema";
import { captureError } from "./sentry";
import { spendTracker } from "./spendTracker";

// Same OpenRouter setup as aiService.ts
const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || "sk-placeholder",
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "https://storymode.onrender.com",
    "X-Title": "Story Mode",
  },
});

export interface SummaryTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface SummaryResult {
  summaryText: string;
  tokenUsage?: SummaryTokenUsage;
  error?: string;
}

// Constants for summary generation
const SUMMARY_TARGET_WORDS = 400; // Target 300-500 words

/**
 * Generate a rolling story summary from a batch of messages.
 *
 * This function condenses older conversation history into a concise narrative
 * summary that the AI can use to maintain context without seeing every message.
 *
 * @param sessionId - The session ID (for cost tracking)
 * @param messages - Array of messages to summarize
 * @param previousSummary - Optional existing summary to build upon
 * @returns Summary text and token usage for cost tracking
 */
export async function generateStorySummary(
  sessionId: string,
  messages: Message[],
  previousSummary?: string
): Promise<SummaryResult> {
  const startTime = Date.now();

  console.log("[SummaryService] Starting summary generation", {
    sessionId,
    messageCount: messages.length,
    hasPreviousSummary: !!previousSummary,
    timestamp: new Date().toISOString(),
  });

  try {
    // Validate API key
    if (!process.env.OPENROUTER_API_KEY) {
      const error = new Error("OPENROUTER_API_KEY environment variable is not set");
      console.error("[SummaryService] API key missing");
      captureError(error, { context: "Summary service - missing API key" });
      throw error;
    }

    // Format messages for the prompt
    const formattedMessages = messages.map((msg) => {
      const speaker =
        msg.sender === "dm"
          ? "Guide"
          : msg.sender === "npc"
            ? msg.senderName || "NPC"
            : "Player";
      return `${speaker}: ${msg.content}`;
    });

    const conversationText = formattedMessages.join("\n\n");

    // Build the summarization prompt
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(conversationText, previousSummary);

    console.log("[SummaryService] Calling OpenRouter API", {
      model: "anthropic/claude-3.5-haiku",
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
    });

    const response = await openai.chat.completions.create({
      model: "anthropic/claude-3.5-haiku",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const apiDuration = Date.now() - startTime;

    // Extract token usage
    const tokenUsage: SummaryTokenUsage | undefined = response.usage
      ? {
          promptTokens: response.usage.prompt_tokens || 0,
          completionTokens: response.usage.completion_tokens || 0,
          totalTokens: response.usage.total_tokens || 0,
        }
      : undefined;

    console.log("[SummaryService] API response received", {
      durationMs: apiDuration,
      tokenUsage,
    });

    // Track the request cost (spendTracker uses internal fallback if tokenUsage is undefined)
    spendTracker.trackRequest(sessionId, tokenUsage);

    // Validate response
    if (!response.choices || response.choices.length === 0) {
      throw new Error("OpenRouter API returned no choices");
    }

    const summaryText = response.choices[0].message.content?.trim();
    if (!summaryText) {
      throw new Error("OpenRouter API returned empty summary");
    }

    console.log("[SummaryService] Summary generated successfully", {
      summaryLength: summaryText.length,
      wordCount: summaryText.split(/\s+/).length,
      totalDurationMs: Date.now() - startTime,
    });

    return {
      summaryText,
      tokenUsage,
    };
  } catch (error: any) {
    const totalDuration = Date.now() - startTime;

    console.error("[SummaryService] Error generating summary", {
      error: error.message,
      errorType: error.constructor.name,
      durationMs: totalDuration,
    });

    captureError(error as Error, {
      context: "Story summary generation",
      sessionId,
      messageCount: messages.length,
      hasPreviousSummary: !!previousSummary,
    });

    return {
      summaryText: "",
      error: error.message || "Failed to generate summary",
    };
  }
}

/**
 * Build the system prompt for the summarization AI.
 */
function buildSystemPrompt(): string {
  return `You are a narrative summarizer for an interactive storytelling game. Your job is to condense conversation history into a concise rolling summary that preserves essential story context.

WHAT TO PRESERVE (these are critical for story continuity):
- Key plot points and major story beats
- NPC names, their roles, and their relationships with the player
- Quest progress: what has been accomplished and what remains
- Player decisions and their consequences
- Locations visited and important world details discovered
- Character development: how the player's character has grown or changed

WHAT TO EXCLUDE (this information is tracked elsewhere):
- Current character stats (HP, mana, level) - stored in character table
- Current quest status lists - stored in quests table
- Inventory details - stored in items table
- Exact dialogue - paraphrase instead
- Combat play-by-play - summarize outcomes only

STYLE GUIDELINES:
- Write in third person, past tense ("The player discovered..." not "You discovered...")
- Be concise but complete: target ${SUMMARY_TARGET_WORDS} words
- Focus on narrative flow, not mechanical game details
- Prioritize recent events while preserving earlier context that matters
- Use clear, descriptive prose

OUTPUT:
Return ONLY the summary text. No headers, no JSON, no additional commentary.`;
}

/**
 * Build the user prompt with conversation history and optional previous summary.
 */
function buildUserPrompt(conversationText: string, previousSummary?: string): string {
  let prompt = "";

  if (previousSummary) {
    prompt += `PREVIOUS SUMMARY (incorporate and update with new events):\n${previousSummary}\n\n---\n\n`;
  }

  prompt += `NEW CONVERSATION TO SUMMARIZE:\n\n${conversationText}\n\n---\n\n`;

  if (previousSummary) {
    prompt += `Create an updated summary that weaves together the previous summary with these new events. The result should be a single cohesive narrative, not a list of disconnected events. Target approximately ${SUMMARY_TARGET_WORDS} words.`;
  } else {
    prompt += `Create a narrative summary of these events. Focus on what matters for story continuity. Target approximately ${SUMMARY_TARGET_WORDS} words.`;
  }

  return prompt;
}
