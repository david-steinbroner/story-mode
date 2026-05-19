import { describe, expect, test, afterEach, beforeAll, afterAll } from 'vitest';
import {
  validatePuzzle,
  _setWordlistForTesting,
  _loadFallbackPools,
  pickFallback,
  _validateFallbackPools,
  generatePuzzle,
  _setGeneratorForTesting,
} from './puzzleService';

// Inject a small in-memory wordlist for tests so we don't depend on the
// real wordlist.txt being present in the test sandbox.
_setWordlistForTesting(new Set(['treasure', 'library', 'compass', 'lantern']));

describe('validatePuzzle — scramble', () => {
  test('valid: letters sort-equal to answer + answer in wordlist', () => {
    const result = validatePuzzle({
      type: 'scramble',
      answer: 'TREASURE',
      payload: { letters: 'AETRESUR' },
      hints: ['something a sailor seeks', 'starts with T', 'T_E_S_R_'],
    });
    expect(result.ok).toBe(true);
  });

  test('invalid: letters do not sort-equal answer', () => {
    const result = validatePuzzle({
      type: 'scramble',
      answer: 'TREASURE',
      payload: { letters: 'ABCDEFGH' },
      hints: ['x', 'y', 'z'],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/sort/i);
  });

  test('invalid: answer not in wordlist', () => {
    const result = validatePuzzle({
      type: 'scramble',
      answer: 'ASTROLAB',
      payload: { letters: 'AABLORST' },
      hints: ['x', 'y', 'z'],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/wordlist/i);
  });

  test('invalid: answer length out of bounds', () => {
    const result = validatePuzzle({
      type: 'scramble',
      answer: 'AB',
      payload: { letters: 'BA' },
      hints: ['x', 'y', 'z'],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/length/i);
  });

  test('invalid: hint leaks answer verbatim', () => {
    const result = validatePuzzle({
      type: 'scramble',
      answer: 'TREASURE',
      payload: { letters: 'AETRESUR' },
      hints: ['the answer is TREASURE', 'starts with T', 'T_E_S_R_'],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/hint.*leak/i);
  });
});

describe('validatePuzzle — cryptogram', () => {
  test('valid: mapping applied to ciphertext yields answer', () => {
    const result = validatePuzzle({
      type: 'cryptogram',
      answer: 'THE KEY IS HIDDEN',
      payload: {
        ciphertext: 'ABC HCG DE BDQQCS',
        mapping: { A: 'T', B: 'H', C: 'E', D: 'I', E: 'S', G: 'Y', H: 'K', Q: 'D', S: 'N' },
        revealed: ['A'],
      },
      hints: ['an instruction', 'ends in N', 'second word is KEY'],
    });
    expect(result.ok).toBe(true);
  });

  test('invalid: applying mapping does not yield answer', () => {
    const result = validatePuzzle({
      type: 'cryptogram',
      answer: 'WRONG',
      payload: {
        ciphertext: 'AAAAA',
        mapping: { A: 'X' },
        revealed: ['A'],
      },
      hints: ['x', 'y', 'z'],
    });
    expect(result.ok).toBe(false);
  });

  test('invalid: mapping not a bijection', () => {
    const result = validatePuzzle({
      type: 'cryptogram',
      answer: 'AAAA',
      payload: {
        ciphertext: 'ABAB',
        mapping: { A: 'A', B: 'A' },  // both map to A — not a bijection
        revealed: ['A'],
      },
      hints: ['x', 'y', 'z'],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/bijection/i);
  });

  test('invalid: no pre-revealed letter (pure brute force)', () => {
    const result = validatePuzzle({
      type: 'cryptogram',
      answer: 'THE',
      payload: {
        ciphertext: 'XYZ',
        mapping: { X: 'T', Y: 'H', Z: 'E' },
        revealed: [],
      },
      hints: ['x', 'y', 'z'],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/reveal/i);
  });
});

describe('validatePuzzle — fill-in-the-blank', () => {
  test('valid: sentence has exactly one ___ slot, answer is plausible length', () => {
    const result = validatePuzzle({
      type: 'fill-in-the-blank',
      answer: 'MOON',
      payload: {
        sentence: 'By the light of the silver ___, the path becomes clear.',
        blankLengthHint: { min: 4, max: 4 },
      },
      hints: ['x', 'y', 'z'],
    });
    expect(result.ok).toBe(true);
  });

  test('invalid: sentence missing ___ slot', () => {
    const result = validatePuzzle({
      type: 'fill-in-the-blank',
      answer: 'MOON',
      payload: { sentence: 'No blank here.' },
      hints: ['x', 'y', 'z'],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/blank/i);
  });

  test('invalid: sentence has multiple ___ slots', () => {
    const result = validatePuzzle({
      type: 'fill-in-the-blank',
      answer: 'MOON',
      payload: { sentence: 'The ___ and the ___ shine.' },
      hints: ['x', 'y', 'z'],
    });
    expect(result.ok).toBe(false);
  });

  test('invalid: answer too short', () => {
    const result = validatePuzzle({
      type: 'fill-in-the-blank',
      answer: 'A',
      payload: { sentence: 'The letter is ___.' },
      hints: ['x', 'y', 'z'],
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/length/i);
  });
});

describe('fallback pool', () => {
  // Real wordlist needed for fallback scramble validation. Clear the test
  // stub so getWordlist() lazy-loads from disk for these checks, then
  // restore the small stub afterwards so the rest of the suite is fast.
  beforeAll(() => _setWordlistForTesting(null));
  afterAll(() => _setWordlistForTesting(new Set(['treasure', 'library', 'compass', 'lantern'])));

  test('_loadFallbackPools returns ≥20 entries per type', () => {
    const pools = _loadFallbackPools();
    expect(pools.scramble.length).toBeGreaterThanOrEqual(20);
    expect(pools.cryptogram.length).toBeGreaterThanOrEqual(20);
    expect(pools['fill-in-the-blank'].length).toBeGreaterThanOrEqual(20);
  });

  test('pickFallback returns an entry matching type + difficulty', () => {
    const entry = pickFallback('scramble', 'easy');
    expect(entry).toBeDefined();
    expect(entry?.difficulty).toBe('easy');
  });

  test('_validateFallbackPools passes — every fallback entry self-validates', () => {
    const result = _validateFallbackPools();
    expect(result.failures).toEqual([]);
  });
});

describe('generatePuzzle', () => {
  // Reset the injected generator after every test so leakage between tests
  // (or across test files in the same Vitest worker) can't silently pass.
  afterEach(() => _setGeneratorForTesting(null));

  test('happy path: AI returns valid puzzle on first try', async () => {
    _setGeneratorForTesting(async () => ({
      type: 'scramble',
      answer: 'TREASURE',
      payload: { letters: 'AETRESUR' },
      hints: ['sailor seeks', 'starts with T', 'T_E_S_R_'],
    }));
    const result = await generatePuzzle({ type: 'scramble', theme: 'pirate', difficulty: 'easy' });
    expect(result.isFallback).toBe(false);
    expect(result.puzzle.answer).toBe('TREASURE');
  });

  test('re-rolls once on invalid first response', async () => {
    let calls = 0;
    _setGeneratorForTesting(async () => {
      calls++;
      if (calls === 1) {
        return { type: 'scramble', answer: 'TREASURE', payload: { letters: 'WRONG' }, hints: ['x','y','z'] };
      }
      return { type: 'scramble', answer: 'COMPASS', payload: { letters: 'CAMOPSS' }, hints: ['navigation tool', 'starts with C', 'C_M_A_S'] };
    });
    const result = await generatePuzzle({ type: 'scramble', theme: 'pirate', difficulty: 'easy' });
    expect(calls).toBe(2);
    expect(result.isFallback).toBe(false);
    expect(result.puzzle.answer).toBe('COMPASS');
  });

  test('falls back when both AI attempts fail validation', async () => {
    _setGeneratorForTesting(async () => ({
      type: 'scramble', answer: 'NOPE', payload: { letters: 'WRONG' }, hints: ['x','y','z'],
    }));
    const result = await generatePuzzle({ type: 'scramble', theme: 'pirate', difficulty: 'easy' });
    expect(result.isFallback).toBe(true);
    expect(result.puzzle).toBeDefined();
  });
});
