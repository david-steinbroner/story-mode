/**
 * Integration tests for the puzzle resolution-signal threading flow
 * (v1.14.0). Exercises the IStorage methods that the narration call chain
 * depends on:
 *
 *   getUnconsumedResolutionsForStory  ← buildPuzzleContextForPrompt
 *   markResolutionConsumed            ← markConsumedSignals (after narration)
 *   isPuzzleResolved                  ← /api/puzzle/attempt (Chunk 4)
 *
 * Requires DATABASE_URL pointing at a writable Postgres. Skips cleanly
 * (zero failures) when DATABASE_URL is absent so CI without DB infra is
 * still green. The describe.skipIf alone isn't enough — `./storage` and
 * `./db` throw at module-load when DATABASE_URL is missing, so we lazy-load
 * them inside the suite via dynamic import.
 */

import { describe, expect, test, afterAll, beforeAll } from 'vitest';
import { sql } from 'drizzle-orm';

const SKIP = !process.env.DATABASE_URL;

// Lazy refs populated in beforeAll only when DATABASE_URL is set, so the
// suite file loads cleanly in DATABASE_URL-less environments (CI without
// the secret, contributor's first checkout).
let storage: typeof import('./storage').storage;
let _testDb: typeof import('./db')._testDb;

describe.skipIf(SKIP)('puzzle resolution-signal threading', () => {
  const storyId = `test-story-${Date.now()}`;
  const sessionId = `test-session-${Date.now()}`;

  beforeAll(async () => {
    ({ storage } = await import('./storage'));
    ({ _testDb } = await import('./db'));
  });

  afterAll(async () => {
    if (!_testDb) return;
    // Clean up: delete attempts → signals_consumed → puzzles for this storyId.
    await _testDb.execute(sql`DELETE FROM puzzle_attempts WHERE session_id = ${sessionId}`);
    await _testDb.execute(sql`DELETE FROM puzzle_signals_consumed WHERE story_id = ${storyId}`);
    await _testDb.execute(sql`DELETE FROM puzzles WHERE story_id = ${storyId}`);
  });

  test('happy path: solved puzzle returns one unconsumed resolution, then zero after mark', async () => {
    const puzzle = await storage.createPuzzle({
      storyId, sessionId, type: 'scramble', theme: 'test', difficulty: 'easy',
      payload: { letters: 'AETRESUR' } as any, answer: 'TREASURE',
      hints: ['x', 'y', 'z'] as any, isFallback: false,
    });
    await storage.recordPuzzleAttempt({
      puzzleId: puzzle.id, sessionId, submission: 'TREASURE', correct: true, skipped: false, hintsUsed: 0,
    });

    const before = await storage.getUnconsumedResolutionsForStory(storyId);
    expect(before).toEqual([
      expect.objectContaining({ puzzleId: puzzle.id, type: 'scramble', correct: true, skipped: false }),
    ]);

    await storage.markResolutionConsumed(puzzle.id, storyId);

    const after = await storage.getUnconsumedResolutionsForStory(storyId);
    expect(after).toEqual([]);
  });

  test('skipped puzzle threads as resolution too', async () => {
    const puzzle = await storage.createPuzzle({
      storyId, sessionId, type: 'cryptogram', theme: 'test', difficulty: 'easy',
      payload: { ciphertext: 'X', mapping: { X: 'A' }, revealed: ['X'] } as any,
      answer: 'A', hints: ['x', 'y', 'z'] as any, isFallback: false,
    });
    await storage.recordPuzzleAttempt({
      puzzleId: puzzle.id, sessionId, submission: null, correct: false, skipped: true, hintsUsed: 3,
    });

    const res = await storage.getUnconsumedResolutionsForStory(storyId);
    const match = res.find(r => r.puzzleId === puzzle.id);
    expect(match).toEqual(expect.objectContaining({ skipped: true, correct: false }));

    await storage.markResolutionConsumed(puzzle.id, storyId);
  });

  test('markResolutionConsumed is idempotent (onConflictDoNothing)', async () => {
    const puzzle = await storage.createPuzzle({
      storyId, sessionId, type: 'scramble', theme: 'test', difficulty: 'easy',
      payload: { letters: 'X' } as any, answer: 'X', hints: ['x', 'y', 'z'] as any, isFallback: false,
    });
    await storage.recordPuzzleAttempt({
      puzzleId: puzzle.id, sessionId, submission: 'X', correct: true, skipped: false, hintsUsed: 0,
    });

    // Mark twice — second call must not throw and must not duplicate-row error.
    await storage.markResolutionConsumed(puzzle.id, storyId);
    await expect(storage.markResolutionConsumed(puzzle.id, storyId)).resolves.toBeUndefined();
  });

  test('isPuzzleResolved returns null pre-attempt, then state after', async () => {
    const puzzle = await storage.createPuzzle({
      storyId, sessionId, type: 'scramble', theme: 'test', difficulty: 'easy',
      payload: { letters: 'X' } as any, answer: 'X', hints: ['x', 'y', 'z'] as any, isFallback: false,
    });
    expect(await storage.isPuzzleResolved(puzzle.id)).toBeNull();

    await storage.recordPuzzleAttempt({
      puzzleId: puzzle.id, sessionId, submission: 'NOPE', correct: false, skipped: false, hintsUsed: 0,
    });
    // Still null — no attempt has correct/skipped true yet.
    expect(await storage.isPuzzleResolved(puzzle.id)).toBeNull();

    await storage.recordPuzzleAttempt({
      puzzleId: puzzle.id, sessionId, submission: 'X', correct: true, skipped: false, hintsUsed: 0,
    });
    expect(await storage.isPuzzleResolved(puzzle.id)).toEqual({ correct: true, skipped: false });
  });
});
