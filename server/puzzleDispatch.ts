/**
 * Puzzle dispatch helpers (v1.14.0). Keeps the puzzle integration plumbing
 * out of the 1.2K-line aiService.ts AND out of the puzzle subsystem itself
 * (which doesn't know about messages / storage). Sits at the seam: callable
 * from aiService (for prompt context building) and from routes.ts
 * (for puzzle creation + message insert + consumed-signal marking).
 *
 * Architectural note: dispatch must happen AFTER the narration message is
 * persisted so the type='puzzle' message row has a strictly later createdAt
 * (the chat orders by createdAt — see shared/schema.ts:71). aiService gives
 * us the AI's puzzle_request; routes.ts calls dispatchPuzzleFromResponse
 * after createMessage for the narration row succeeds.
 */

import type { GameState } from "@shared/schema";
import { puzzles } from "@shared/schema";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { storage } from "./storage";
import { generatePuzzle } from "./puzzleService";
import { getBudgetContext } from "./puzzleConfig";
import { captureError } from "./sentry";
import { logEvent } from "./eventLog";
import type { PuzzleType, PuzzleDifficulty } from "../shared/types/puzzles";

// v1.14.1: how many of the story's recent puzzle answers we feed back to the
// generator as "AVOID these" to prevent answer repetition (STONE×4 problem).
const RECENT_ANSWER_LOOKBACK = 5;

export interface UnconsumedSignal {
  puzzleId: string;
  storyId: string;
  type: string;
  correct: boolean;
  skipped: boolean;
}

export interface PuzzleContext {
  /** Text to prepend to the narration user prompt. Empty string when puzzles are disabled or no context applies. */
  contextText: string;
  /** Signals included in `contextText`. Pass these back to `markConsumedSignals` after narration persists. */
  signalsToMark: UnconsumedSignal[];
}

/**
 * Build the puzzle portion of the narration user prompt: budget numbers
 * + recent resolution signals (one per resolved-and-not-yet-consumed puzzle).
 * Safe to call when puzzles are disabled — returns an empty context.
 */
export async function buildPuzzleContextForPrompt(
  storyId: string | undefined,
  gameState: GameState | undefined,
  puzzlesEnabled: boolean,
): Promise<PuzzleContext> {
  if (!puzzlesEnabled || !storyId || !gameState) {
    return { contextText: '', signalsToMark: [] };
  }

  const total = gameState.totalPages ?? 25;
  const cur = gameState.currentPage ?? 0;
  const soFar = await storage.countPuzzlesForStory(storyId);
  const { target, cap } = getBudgetContext(total, soFar);
  const progress = total > 0 ? cur / total : 0;

  const unconsumed = await storage.getUnconsumedResolutionsForStory(storyId);
  // XML structure matches the <puzzle_state> reference in the system prompt's
  // <when_to_emit> block — so the narration AI can read the named block back
  // by tag rather than us re-stating rules every turn.
  const signalsBlock = unconsumed.length === 0
    ? ''
    : '\n  <recent_resolutions note="fold into narration naturally; do not announce explicitly">\n' +
      unconsumed.map(u => `    <resolution outcome="${u.correct ? 'solved' : 'skipped'}" type="${u.type}" />`).join('\n') +
      '\n  </recent_resolutions>';

  const contextText = `\n\n<puzzle_state>
  <budget puzzle_count_so_far="${soFar}" puzzle_target="${target}" puzzle_cap="${cap}" current_progress="${progress.toFixed(2)}" />${signalsBlock}
</puzzle_state>\n`;

  return {
    contextText,
    signalsToMark: unconsumed.map(u => ({ ...u, storyId })),
  };
}

/**
 * Mark every signal as consumed. Called by routes.ts AFTER the narration
 * message persists. `markResolutionConsumed` uses `onConflictDoNothing` so
 * accidental double-marks are safe.
 */
export async function markConsumedSignals(signals: UnconsumedSignal[]): Promise<void> {
  for (const s of signals) {
    try {
      await storage.markResolutionConsumed(s.puzzleId, s.storyId);
    } catch (err) {
      // Idempotent insert; ignore failures. Log via Sentry for visibility.
      captureError(err as Error, { context: 'markConsumedSignals', puzzleId: s.puzzleId });
    }
  }
}

/**
 * Validate the shape of an AI-emitted puzzle_request. Returns the typed
 * request if valid, null otherwise.
 */
export function parsePuzzleRequest(raw: unknown): {
  type: PuzzleType;
  theme: string;
  difficulty: PuzzleDifficulty;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const pr = raw as Record<string, unknown>;
  const validTypes: PuzzleType[] = ['scramble', 'cryptogram', 'fill-in-the-blank'];
  const validDifficulty: PuzzleDifficulty[] = ['easy', 'medium', 'hard'];
  if (!validTypes.includes(pr.type as PuzzleType)) return null;
  if (!validDifficulty.includes(pr.difficulty as PuzzleDifficulty)) return null;
  if (typeof pr.theme !== 'string' || pr.theme.length === 0 || pr.theme.length > 200) return null;
  return {
    type: pr.type as PuzzleType,
    theme: pr.theme,
    difficulty: pr.difficulty as PuzzleDifficulty,
  };
}

/**
 * Generate + persist a puzzle for the given storyId/sessionId/gameState.
 * Enforces the budget cap server-side (defense in depth — the prompt also
 * tells the AI to respect it, but trust nothing the AI says about counts).
 * Returns the persisted puzzleId, or null if the budget cap was hit OR
 * generation + fallback both failed.
 *
 * Caller (routes.ts) is responsible for: inserting the type='puzzle' message
 * row pointing at the returned puzzleId, after THIS call's narration message
 * persists.
 */
export async function dispatchPuzzleFromResponse(
  req: { type: PuzzleType; theme: string; difficulty: PuzzleDifficulty },
  storyId: string,
  sessionId: string,
  gameState: GameState | undefined,
): Promise<string | null> {
  const total = gameState?.totalPages ?? 25;

  // v1.14.1 anti-repetition: pull the story's recent answers so the generator
  // can avoid duplicating them. Best-effort — failure to fetch is logged but
  // doesn't block generation.
  let recentAnswers: string[] = [];
  try {
    recentAnswers = await storage.getRecentPuzzleAnswers(storyId, RECENT_ANSWER_LOOKBACK);
  } catch (err) {
    captureError(err as Error, { context: 'getRecentPuzzleAnswers', storyId });
  }

  // Generate FIRST, outside any transaction. The puzzle-gen API call is slow
  // (1–3s) so we don't want to hold a row lock across it. The cap check +
  // insert runs in a short serializable transaction after.
  let gen;
  try {
    gen = await generatePuzzle({ ...req, recentAnswers });
  } catch (err) {
    captureError(err as Error, { context: 'dispatchPuzzleFromResponse:generate', storyId });
    await logEvent(sessionId, 'puzzle_dropped', {
      reason: 'gen_fail',
      requested_type: req.type,
      requested_theme: req.theme,
      requested_difficulty: req.difficulty,
    }, storyId);
    return null;
  }

  // Serializable transaction wraps the cap check + insert so two concurrent
  // dispatches can't both pass a cap=2 gate when soFar=2 (v1.14.0 audit:
  // Musical Teeth got 3 puzzles for a 25-page story). Drizzle auto-rolls
  // serialization failures back; the freshly-generated puzzle is dropped
  // on the floor in that case (telemetry logs it).
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(puzzles)
        .where(eq(puzzles.storyId, storyId));
      const soFar = row?.count ?? 0;
      const { canEmit, cap } = getBudgetContext(total, soFar);
      if (!canEmit) {
        // AI ignored its budget instructions OR a concurrent dispatch already
        // committed the last allowed puzzle. Either way, drop + log.
        await logEvent(sessionId, 'puzzle_dropped', {
          reason: 'cap',
          requested_type: req.type,
          requested_theme: req.theme,
          requested_difficulty: req.difficulty,
          current_count: soFar,
          cap,
        }, storyId);
        return null;
      }

      const [persisted] = await tx
        .insert(puzzles)
        .values({
          storyId,
          sessionId,
          type: gen.puzzle.type,
          theme: req.theme,
          difficulty: req.difficulty,
          // Payload as stored mirrors the discriminated union shape (with `type`).
          payload: { type: gen.puzzle.type, ...gen.puzzle.payload } as any,
          answer: gen.puzzle.answer,
          hints: gen.puzzle.hints as [string, string, string],
          isFallback: gen.isFallback,
        })
        .returning();
      return persisted.id;
    }, { isolationLevel: 'serializable' });
  } catch (err) {
    // Serializable transaction rolled back (concurrent dispatch hit the
    // same row → Postgres SQLSTATE 40001), or persist failed for another
    // reason. /ultrareview bug_006: the cap-drop inside the txn correctly
    // emits puzzle_dropped via the global db handle, but this path was
    // silent. logEvent uses the module-level `db`, not the rolled-back
    // tx, so it commits independently after rollback (same pattern as
    // the cap-drop path above).
    await logEvent(sessionId, 'puzzle_dropped', {
      reason: 'serialization_fail',
      requested_type: req.type,
      requested_theme: req.theme,
      requested_difficulty: req.difficulty,
    }, storyId);
    captureError(err as Error, { context: 'dispatchPuzzleFromResponse:persist', storyId });
    return null;
  }
}
