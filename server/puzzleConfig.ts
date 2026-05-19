/**
 * Per-story-length puzzle budgets (v1.14.0). Mirrors aiModel.ts admin-override
 * pattern: module-level cache + one-shot DB load at boot + synchronous setter.
 * No TTL — instant propagation when admin edits the config.
 *
 * Stored in app_config under key 'puzzle_budgets' as a JSON string keyed by
 * story length (25/50/100/250), each value `{ target, cap }`. `target` is the
 * narration prompt's soft goal; `cap` is the hard ceiling enforced server-side.
 */

import type { IStorage } from "./storage";

export interface PuzzleBudget {
  target: number;
  cap: number;
}

export type PuzzleBudgets = Record<string, PuzzleBudget>;

export const DEFAULT_BUDGETS: PuzzleBudgets = {
  "25":  { target: 2, cap: 2 },
  "50":  { target: 2, cap: 3 },
  "100": { target: 4, cap: 5 },
  "250": { target: 7, cap: 10 },
};

let _budgets: PuzzleBudgets | null = null;

export function getBudgets(): PuzzleBudgets | null {
  return _budgets;
}

export function setBudgets(next: PuzzleBudgets | null): void {
  _budgets = next;
}

/**
 * One-shot DB load. Called once at server boot. Failures fall back to
 * DEFAULT_BUDGETS so a flaky DB at startup doesn't break narration.
 */
export async function loadBudgets(storage: IStorage): Promise<void> {
  try {
    const row = await storage.getConfig('puzzle_budgets');
    if (!row?.value) {
      _budgets = DEFAULT_BUDGETS;
      return;
    }
    try {
      const parsed = JSON.parse(row.value);
      // Light shape check — every length key present with target+cap.
      const lengths = ["25", "50", "100", "250"];
      const valid = lengths.every(l =>
        parsed[l] && typeof parsed[l].target === 'number' && typeof parsed[l].cap === 'number'
      );
      _budgets = valid ? parsed : DEFAULT_BUDGETS;
    } catch {
      _budgets = DEFAULT_BUDGETS;
    }
  } catch {
    _budgets = DEFAULT_BUDGETS;
  }
}

/**
 * Helper: given a story length, the puzzles already emitted, and the current
 * progress, return the budget state the narration prompt needs.
 */
export function getBudgetContext(
  storyLength: number,
  puzzleCountSoFar: number,
): { target: number; cap: number; canEmit: boolean } {
  const budgets = _budgets ?? DEFAULT_BUDGETS;
  const key = String(storyLength);
  const slot = budgets[key] ?? DEFAULT_BUDGETS["25"];
  return { target: slot.target, cap: slot.cap, canEmit: puzzleCountSoFar < slot.cap };
}
