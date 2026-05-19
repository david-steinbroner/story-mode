/**
 * Puzzle service (v1.14.0). Generation + validation + fallback for
 * AI-generated word puzzles. See docs/specs/puzzles.md §Approach 2-3.
 *
 * Architecture:
 *   generatePuzzle(req) -> validates with validatePuzzle() -> on fail,
 *   re-rolls once with a stricter prompt -> on second fail, pulls from
 *   the hand-curated fallback pool. The fallback pool is itself validated
 *   at startup via _validateFallbackPools() so we can't ship bad fallbacks.
 *
 * Asset paths: the project is "type": "module" and bundled with esbuild
 * --format=esm in production. `__dirname` is undefined in pure ESM, so we
 * derive a base directory from `import.meta.url` and resolve assets relative
 * to it. The build step (see package.json) copies server/puzzles/* into
 * dist/puzzles/* so the bundled production file finds them.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import type { PuzzleType, PuzzleDifficulty } from "../shared/types/puzzles";
import { resolveModel } from "./aiModel";
import { captureError } from "./sentry";

// ESM-safe base directory. Works under tsx (dev/tests) and under the
// esbuild ESM bundle in production. Both place puzzles/ as a sibling.
const __thisDir = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Wordlist (scramble validator). Loaded once from disk into a Set for O(1)
// membership checks. Header lines starting with '#' are skipped.
// ---------------------------------------------------------------------------

let _wordlist: Set<string> | null = null;

export function _setWordlistForTesting(set: Set<string> | null): void {
  _wordlist = set;
}

function getWordlist(): Set<string> {
  if (_wordlist) return _wordlist;
  const filePath = path.join(__thisDir, 'puzzles', 'wordlist.txt');
  const raw = fs.readFileSync(filePath, 'utf8');
  _wordlist = new Set(
    raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.toLowerCase())
  );
  return _wordlist;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export interface RawPuzzle {
  type: PuzzleType;
  answer: string;
  payload: Record<string, unknown>;
  hints: readonly [string, string, string];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary match: a hint must not contain the answer as a standalone
// word. Avoids both false negatives ("the color RED is bold" → leak for
// 3-char answer "RED") and false positives ("your HEART beats" doesn't leak
// the answer "ART" because ART is embedded in HEART, not a standalone word).
function checkHintsDontLeakAnswer(answer: string, hints: readonly string[]): ValidationResult {
  if (!answer) return { ok: true };
  const re = new RegExp(`\\b${escapeRegExp(answer)}\\b`, 'i');
  for (const h of hints) {
    if (re.test(h)) {
      return { ok: false, reason: `hint leaks answer verbatim: "${h}"` };
    }
  }
  return { ok: true };
}

function validateScramble(p: RawPuzzle): ValidationResult {
  const ans = p.answer.toLowerCase();
  if (ans.length < 4 || ans.length > 9) {
    return { ok: false, reason: `answer length ${ans.length} out of bounds (4-9)` };
  }
  const letters = (p.payload.letters as string | undefined) ?? '';
  const sortedA = ans.split('').sort().join('');
  const sortedL = letters.toLowerCase().split('').sort().join('');
  if (sortedA !== sortedL) {
    return { ok: false, reason: `payload.letters do not sort-equal answer` };
  }
  if (!getWordlist().has(ans)) {
    return { ok: false, reason: `answer "${ans}" not in scramble wordlist` };
  }
  const hintLeak = checkHintsDontLeakAnswer(p.answer, p.hints);
  if (!hintLeak.ok) return hintLeak;
  return { ok: true };
}

function validateCryptogram(p: RawPuzzle): ValidationResult {
  const ans = p.answer.toUpperCase();
  const ciphertext = (p.payload.ciphertext as string | undefined) ?? '';
  const mapping = (p.payload.mapping as Record<string, string> | undefined) ?? {};
  const revealed = (p.payload.revealed as string[] | undefined) ?? [];

  // Apply mapping (preserve spaces + punctuation).
  let decoded = '';
  for (const ch of ciphertext) {
    if (ch >= 'A' && ch <= 'Z') {
      const m = mapping[ch];
      if (!m) return { ok: false, reason: `ciphertext letter "${ch}" missing from mapping` };
      decoded += m;
    } else {
      decoded += ch;
    }
  }
  if (decoded !== ans) {
    return { ok: false, reason: `applied mapping yields "${decoded}", expected "${ans}"` };
  }

  // Bijection: no two ciphertext letters map to the same plaintext. Run this
  // before the length check so we can call out a structural defect (e.g. a
  // mapping with duplicate plaintexts) regardless of answer length.
  const seen = new Set<string>();
  for (const v of Object.values(mapping)) {
    if (seen.has(v)) return { ok: false, reason: `mapping is not a bijection (duplicate plaintext "${v}")` };
    seen.add(v);
  }

  // At least one revealed letter is required to keep puzzles solvable in
  // a reasonable number of guesses (per spec §Approach 3).
  if (revealed.length === 0) {
    return { ok: false, reason: `must reveal at least one mapping letter` };
  }

  if (ans.length < 8 || ans.length > 40) {
    return { ok: false, reason: `answer length ${ans.length} out of bounds (8-40)` };
  }

  const hintLeak = checkHintsDontLeakAnswer(p.answer, p.hints);
  if (!hintLeak.ok) return hintLeak;
  return { ok: true };
}

function validateFillInBlank(p: RawPuzzle): ValidationResult {
  const ans = p.answer;
  if (ans.length < 3) {
    return { ok: false, reason: `answer length ${ans.length} below minimum (3)` };
  }
  const sentence = (p.payload.sentence as string | undefined) ?? '';
  const matches = sentence.match(/___/g) ?? [];
  if (matches.length !== 1) {
    return { ok: false, reason: `sentence must contain exactly one blank ("___") slot (found ${matches.length})` };
  }
  const hintLeak = checkHintsDontLeakAnswer(p.answer, p.hints);
  if (!hintLeak.ok) return hintLeak;
  return { ok: true };
}

export function validatePuzzle(p: RawPuzzle): ValidationResult {
  switch (p.type) {
    case 'scramble':         return validateScramble(p);
    case 'cryptogram':       return validateCryptogram(p);
    case 'fill-in-the-blank': return validateFillInBlank(p);
    default:                 return { ok: false, reason: `unknown puzzle type` };
  }
}

// ---------------------------------------------------------------------------
// Fallback pool (Approach 3 safety net)
// ---------------------------------------------------------------------------

interface FallbackEntry {
  difficulty: PuzzleDifficulty;
  theme: string;
  answer: string;
  payload: Record<string, unknown>;
  hints: readonly [string, string, string];
}

type FallbackPools = Record<PuzzleType, FallbackEntry[]>;

let _pools: FallbackPools | null = null;

export function _loadFallbackPools(): FallbackPools {
  if (_pools) return _pools;
  const base = path.join(__thisDir, 'puzzles', 'fallback');
  _pools = {
    'scramble':          JSON.parse(fs.readFileSync(path.join(base, 'scramble.json'), 'utf8')),
    'cryptogram':        JSON.parse(fs.readFileSync(path.join(base, 'cryptogram.json'), 'utf8')),
    'fill-in-the-blank': JSON.parse(fs.readFileSync(path.join(base, 'fill-in-the-blank.json'), 'utf8')),
  };
  return _pools;
}

/**
 * Pick a fallback entry of the given type + difficulty. If no entry matches
 * the difficulty exactly, fall back to any entry of that type. Random pick
 * (Math.random) — deterministic seeding is a Vitest test-only concern and
 * gets injected via the second arg.
 */
export function pickFallback(
  type: PuzzleType,
  difficulty: PuzzleDifficulty,
  rng: () => number = Math.random,
): FallbackEntry | null {
  const pool = _loadFallbackPools()[type];
  if (!pool || pool.length === 0) return null;
  const matched = pool.filter(e => e.difficulty === difficulty);
  const candidates = matched.length > 0 ? matched : pool;
  return candidates[Math.floor(rng() * candidates.length)];
}

/**
 * Validate every fallback entry against its own validator. Called at boot
 * (and by `npx tsx -e "...puzzleService._validateFallbackPools()"`) after
 * authoring. If this returns any failures, the fallback pool is unsafe to
 * ship and the failing entries must be fixed before deploy.
 */
export function _validateFallbackPools(): { failures: Array<{ type: PuzzleType; index: number; reason: string }> } {
  const pools = _loadFallbackPools();
  const failures: Array<{ type: PuzzleType; index: number; reason: string }> = [];
  for (const type of ['scramble', 'cryptogram', 'fill-in-the-blank'] as PuzzleType[]) {
    pools[type].forEach((entry, index) => {
      const result = validatePuzzle({ ...entry, type });
      if (!result.ok) failures.push({ type, index, reason: result.reason ?? 'unknown' });
    });
  }
  return { failures };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface PuzzleRequest {
  type: PuzzleType;
  theme: string;
  difficulty: PuzzleDifficulty;
  stricterRetry?: string;  // populated on re-roll with the prior failure reason
}

export interface GenerationResult {
  puzzle: RawPuzzle;
  isFallback: boolean;
}

type Generator = (req: PuzzleRequest) => Promise<RawPuzzle>;

let _generator: Generator | null = null;

export function _setGeneratorForTesting(g: Generator | null): void {
  _generator = g;
}

// ---------------------------------------------------------------------------
// Real puzzle generation via OpenRouter. The puzzle subsystem owns its own
// OpenAI SDK client to keep generation cleanly separable from narration.
// Model is always Haiku (per resolveModel({ purpose: 'puzzle-generation' })).
//
// Client is lazy so this module can be imported in environments without an
// API key (tests inject a generator via `_setGeneratorForTesting` and never
// hit the real client; the OpenAI SDK throws at construction if `apiKey`
// is empty so eager construction would break those imports).
// ---------------------------------------------------------------------------

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (_openai) return _openai;
  _openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
  });
  return _openai;
}

const PROMPTS: Record<PuzzleType, (req: PuzzleRequest) => string> = {
  'scramble': (req) => `Generate a scramble puzzle.
THEME: ${req.theme}
DIFFICULTY: ${req.difficulty}
${req.stricterRetry ? `RETRY: prior attempt failed (${req.stricterRetry}). Pick a more common, shorter answer.` : ''}

REQUIREMENTS:
- "answer": one common English noun, 4–9 letters, uppercase. Must fit the theme.
- "payload.letters": the same letters as answer, shuffled, uppercase.
- "hints": exactly 3 hints, decreasing difficulty:
  [0] category (no answer word verbatim),
  [1] starting letter,
  [2] every other letter visible (e.g. "T_E_S_R_").
Return JSON only. Schema:
{ "answer": "TREASURE", "payload": { "letters": "AETRESUR" }, "hints": ["something a sailor seeks", "starts with T", "T_E_S_R_"] }`,

  'cryptogram': (req) => `Generate a cryptogram puzzle.
THEME: ${req.theme}
DIFFICULTY: ${req.difficulty}
${req.stricterRetry ? `RETRY: prior attempt failed (${req.stricterRetry}).` : ''}

REQUIREMENTS:
- "answer": a short phrase fitting the theme, 8–40 chars, uppercase, ASCII A-Z + spaces only.
- "payload.ciphertext": the answer encoded by a bijective letter substitution; keep spaces.
- "payload.mapping": { "<ciphertext letter>": "<plaintext letter>" } covering EVERY ciphertext letter. Must be a bijection (no two ciphertext letters map to the same plaintext letter).
- "payload.revealed": array of at least 1 ciphertext letter whose mapping is pre-revealed.
- "hints": exactly 3 hints, decreasing difficulty.
Return JSON only.`,

  'fill-in-the-blank': (req) => `Generate a fill-in-the-blank puzzle.
THEME: ${req.theme}
DIFFICULTY: ${req.difficulty}
${req.stricterRetry ? `RETRY: prior attempt failed (${req.stricterRetry}).` : ''}

REQUIREMENTS:
- "answer": one word, 3+ letters, uppercase, fits the theme.
- "payload.sentence": a single sentence with the answer replaced by exactly one "___" slot.
- "payload.blankLengthHint": { "min": <answer.length>, "max": <answer.length> }.
- "hints": exactly 3 hints, decreasing difficulty.
Return JSON only.`,
};

async function defaultGenerator(req: PuzzleRequest): Promise<RawPuzzle> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY missing");
  }
  const model = resolveModel(undefined, { purpose: 'puzzle-generation' });
  const userPrompt = PROMPTS[req.type](req);

  try {
    const response = await getOpenAI().chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You generate puzzles. Reply with JSON only, no preface or commentary." },
        { role: "user",   content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });
    const raw = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);

    // Coerce / normalize. Defensive uppercase to fix common AI drift.
    return {
      type: req.type,
      answer: String(parsed.answer ?? '').toUpperCase(),
      payload: parsed.payload ?? {},
      hints: Array.isArray(parsed.hints) && parsed.hints.length === 3
        ? [String(parsed.hints[0]), String(parsed.hints[1]), String(parsed.hints[2])]
        : ['', '', ''],
    };
  } catch (err) {
    captureError(err as Error, { context: 'puzzle generation', type: req.type, difficulty: req.difficulty });
    throw err;
  }
}

export async function generatePuzzle(req: PuzzleRequest): Promise<GenerationResult> {
  const gen = _generator ?? defaultGenerator;

  // First attempt + optional re-roll
  try {
    const first = await gen(req);
    const v1 = validatePuzzle(first);
    if (v1.ok) return { puzzle: first, isFallback: false };

    // Re-roll once with the failure reason as guidance
    const retry = await gen({ ...req, stricterRetry: v1.reason });
    const v2 = validatePuzzle(retry);
    if (v2.ok) return { puzzle: retry, isFallback: false };
  } catch {
    // Generator threw (e.g., OpenRouter outage). Fall through to fallback.
  }

  // Fallback pool
  const fb = pickFallback(req.type, req.difficulty);
  if (!fb) {
    throw new Error(`No fallback puzzle available for type=${req.type}`);
  }
  return {
    puzzle: { type: req.type, answer: fb.answer, payload: fb.payload, hints: fb.hints },
    isFallback: true,
  };
}
