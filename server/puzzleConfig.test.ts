import { describe, expect, test, beforeEach } from 'vitest';
import { loadBudgets, getBudgets, setBudgets, DEFAULT_BUDGETS } from './puzzleConfig';
import type { IStorage } from './storage';

function makeStubStorage(configValue: string | null): IStorage {
  return {
    getConfig: async (key: string) =>
      key === 'puzzle_budgets' && configValue !== null ? { value: configValue } : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub; only getConfig is exercised
  } as unknown as IStorage;
}

describe('puzzleConfig', () => {
  beforeEach(() => setBudgets(null));  // reset cache

  test('loadBudgets uses DB value when present', async () => {
    const stub = '{"25":{"target":1,"cap":1},"50":{"target":1,"cap":2},"100":{"target":2,"cap":3},"250":{"target":3,"cap":4}}';
    await loadBudgets(makeStubStorage(stub));
    expect(getBudgets()?.['25']).toEqual({ target: 1, cap: 1 });
  });

  test('loadBudgets falls back to DEFAULT_BUDGETS when row missing', async () => {
    await loadBudgets(makeStubStorage(null));
    expect(getBudgets()).toEqual(DEFAULT_BUDGETS);
  });

  test('loadBudgets falls back to DEFAULT_BUDGETS when JSON is malformed', async () => {
    await loadBudgets(makeStubStorage('not json'));
    expect(getBudgets()).toEqual(DEFAULT_BUDGETS);
  });

  test('setBudgets updates the cache synchronously', () => {
    const next = {
      "25": { target: 99, cap: 99 },
      "50": DEFAULT_BUDGETS["50"],
      "100": DEFAULT_BUDGETS["100"],
      "250": DEFAULT_BUDGETS["250"],
    };
    setBudgets(next);
    expect(getBudgets()?.['25'].target).toBe(99);
  });
});
