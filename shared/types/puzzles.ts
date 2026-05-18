// Shared payload + hint typing for the three puzzle types. The Drizzle
// `payload` column is JSONB; this discriminated union pins the runtime
// shape so client + server agree without each defining its own copy.

export type PuzzleType = 'scramble' | 'cryptogram' | 'fill-in-the-blank';
export type PuzzleDifficulty = 'easy' | 'medium' | 'hard';

export interface ScramblePayload {
  letters: string;        // shuffled letters; sorted(letters) === sorted(answer)
}

export interface CryptogramPayload {
  ciphertext: string;     // length 8–40 chars
  mapping: Record<string, string>;  // ciphertext-letter → plaintext-letter
  revealed: string[];     // ciphertext letters whose mapping is shown pre-solve
}

export interface FillInBlankPayload {
  sentence: string;       // contains exactly one '___' slot
  blankLengthHint?: { min: number; max: number };
}

export type PuzzlePayload =
  | ({ type: 'scramble' } & ScramblePayload)
  | ({ type: 'cryptogram' } & CryptogramPayload)
  | ({ type: 'fill-in-the-blank' } & FillInBlankPayload);

// Exactly three hint tiers (Approach 5). Tuple type so positional access
// is type-safe.
export type Hints = readonly [string, string, string];

// The client receives this shape from any endpoint that returns a puzzle.
// Note: NO `answer` field — answer never leaves the server.
export interface PuzzleClientView {
  id: string;
  type: PuzzleType;
  theme: string;
  difficulty: PuzzleDifficulty;
  payload: PuzzlePayload;
  hints: Hints;
}
