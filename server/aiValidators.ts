// Heuristic detectors for AI quality violations. Run after a response is
// generated and parsed; failed detectors trigger a single retry with a
// stronger directive injected. Story Momentum is the odd one out: it doesn't
// retry the current response, it inspects the reader's recent inputs and
// returns a directive to inject into the *current* prompt so the AI knows
// to escalate the beat.
//
// All detectors are pure-heuristic in v1. No embeddings, no sidecar AI calls.
// Cost impact is retry-only. Conservative thresholds; we'd rather miss a
// borderline stall than over-trigger and waste calls.
import type { Message } from "@shared/schema";

// Common English stopwords. Filtered out before token-overlap checks so
// "the door" and "the box" don't appear identical because they share "the".
const STOPWORDS = new Set([
  "a", "an", "and", "as", "at", "be", "but", "by", "for", "from",
  "i", "if", "in", "is", "it", "its", "me", "my", "of", "on", "or",
  "so", "that", "the", "this", "to", "up", "was", "we", "what", "when",
  "with", "you", "your", "are", "do", "have", "has", "had", "will",
  "would", "could", "should", "can", "just", "like", "into", "out",
  "then", "now", "still", "very", "more", "some", "all", "any", "no",
  "not", "too", "also", "back", "down", "away", "off",
]);

// Phrases that signal "the reader wants to maintain the current state."
// Inputs matching any of these collapse to a single canonical token before
// Jaccard so synonyms can't fool the detector — "keep working," "continue
// silently," "ignore the sound," "pretend you heard nothing" all look
// identical even though their surface tokens differ. Path A fix added
// 2026-05-13 after the heuristic missed an obvious 6-page stall.
//
// This is a band-aid. The real fix is narrative-state tracking (Chunk D);
// these patterns will miss cases they weren't written for, and they'll
// over-fire on inputs that look stall-shaped but are forward-motion in
// context. Tradeoff is acceptable until Chunk D lands.
const STALL_PATTERNS: RegExp[] = [
  // "keep working / continue silently / stay still" — persist verb + state verb
  /\b(keep|continue|stay|remain|persist|hold)\s+(working|going|doing|silent|silently|still|put|on|here|quiet|quietly|busy|washing|scrubbing|watching|listening|looking|waiting|reading|sitting|standing)/i,
  // Direct "ignore / pretend / disregard" intent
  /\b(ignore|pretend|disregard)\b/i,
  // "do nothing" / "do not move" / "don't react"
  /\bdo\s+nothing\b/i,
  /\bdo\s+not\s+(move|react|engage|respond)/i,
  /\bdon'?t\s+(move|react|do|engage|look|notice|acknowledge|respond)/i,
  // "say nothing" / "just wait"
  /\bsay\s+nothing\b/i,
  /\bjust\s+(wait|watch|listen|stand)/i,
  // Bare maintain-state inputs
  /^\s*(wait|nothing|silence|hold|keep going|continue|stay)\s*\.?\s*$/i,
];

function isStallInput(text: string): boolean {
  return STALL_PATTERNS.some((re) => re.test(text));
}

// Words that signal "something changed on this page." If the new page
// contains at least one of these, it's *probably* not a pure-restatement.
// Conservative list; we want to err toward letting pages through, not
// retrying every page.
const CHANGE_INDICATORS = new Set([
  "arrives", "arrived", "appears", "appeared", "enters", "entered",
  "opens", "opened", "reveals", "revealed", "shifts", "shifted",
  "cracks", "cracked", "breaks", "broke", "shatters", "shattered",
  "shouts", "shouted", "screams", "screamed", "whispers", "whispered",
  "leaps", "leaped", "lunges", "lunged", "grabs", "grabbed",
  "new", "another", "different", "suddenly", "without warning",
  "next", "moments", "later", "afterward", "meanwhile",
  // Forced-progression indicators
  "before you can", "without waiting", "the world", "the moment",
]);

// Lowercase, strip punctuation, split on whitespace, drop stopwords.
// Uses ASCII-only regex (`[^a-z0-9\s]`) rather than the Unicode property
// class — tsconfig doesn't target ES2018 where the `u` flag is allowed,
// and the heuristic only ever needs to compare English-language prose.
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

// Like tokenSet, but if the input matches any STALL_PATTERN, replace the
// whole token bag with a single canonical marker. Two stall inputs phrased
// differently ("keep working" vs "ignore him") will both produce
// {__stall__} and Jaccard them to 1.0. Only used by Story Momentum
// (player-input similarity); page-novelty and choice-distinctness still
// use raw tokenSet because those operate on AI prose where the same
// collapsing would be too aggressive.
function canonicalTokenSet(text: string): Set<string> {
  if (isStallInput(text)) return new Set(["__stall__"]);
  return tokenSet(text);
}

// Jaccard similarity over token sets. 0 = no overlap, 1 = identical.
// `Set.forEach` instead of `for...of` to dodge the ES2015 iteration
// requirement that the current tsconfig doesn't enable.
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  a.forEach((t) => {
    if (b.has(t)) intersect++;
  });
  return intersect / (a.size + b.size - intersect);
}

// ──────────────────────────────────────────────────────────────────────
// Detector 1: Page novelty (anti-stall)
//
// Compares new AI content against the last N AI messages. If the new
// content has very high overlap with prior content AND lacks any
// change-indicator vocabulary, it's a stall.
// ──────────────────────────────────────────────────────────────────────
export function detectStall(
  newContent: string,
  priorAiMessages: Message[]
): boolean {
  if (priorAiMessages.length === 0) return false;
  const newTokens = tokenSet(newContent);
  if (newTokens.size < 10) return false; // too short to judge

  const recent = priorAiMessages.slice(-2);
  const priorTokens = tokenSet(recent.map((m) => m.content).join(" "));

  const overlap = jaccard(newTokens, priorTokens);

  // Look for any change indicator in the new content.
  const newLower = newContent.toLowerCase();
  const hasChangeIndicator = Array.from(CHANGE_INDICATORS).some((w) =>
    newLower.includes(w)
  );

  // Trigger if both conditions: very high overlap AND no signal of change.
  // Threshold tuned conservatively — the typical "tunnel stall" page has
  // ~70% overlap with its predecessor; a healthy new beat is usually <40%.
  return overlap > 0.55 && !hasChangeIndicator;
}

// ──────────────────────────────────────────────────────────────────────
// Detector 2: Choice distinctness
//
// Parses the bulleted choice list from the response content. For each
// pair of choices, computes token overlap. If any pair is too similar,
// the choices are orbital (different verbs on the same object) and we
// retry.
// ──────────────────────────────────────────────────────────────────────
export function detectFakeChoices(content: string): boolean {
  const choices = extractChoices(content);
  if (choices.length < 2) return false;

  for (let i = 0; i < choices.length; i++) {
    for (let j = i + 1; j < choices.length; j++) {
      const a = tokenSet(choices[i]);
      const b = tokenSet(choices[j]);
      // Two choices with >50% token overlap are essentially the same
      // action. "Shake the box" vs "Pry the box" share "box" but differ
      // in verb — that's fine. "Hold perfectly still" vs "Stay perfectly
      // still" share most tokens — that's not fine.
      if (jaccard(a, b) > 0.5) {
        return true;
      }
    }
  }
  return false;
}

// Pulls the bulleted choice text out of an AI response. Format from the
// system prompt is `**What do you do?**` followed by lines starting with `•`.
function extractChoices(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("•"))
    .map((line) => line.slice(1).trim())
    .filter((line) => line.length > 0);
}

// ──────────────────────────────────────────────────────────────────────
// Detector 5: Missing choices on a non-final page
//
// Functionally the worst class of violation — the reader is stuck with no
// way forward except the free-text input. Caught the v1.11.0 regression
// where Rule #3's refined RIGHT example read as a complete page response
// and taught Sonnet to omit the choice block entirely.
// ──────────────────────────────────────────────────────────────────────
export function detectMissingChoices(
  content: string,
  isFinalPage: boolean,
): boolean {
  if (isFinalPage) return false;
  if (extractChoices(content).length < 2) return true;
  if (!content.toLowerCase().includes("what do you do?")) return true;
  return false;
}

// ──────────────────────────────────────────────────────────────────────
// Detector 3: Final-page enforcement
//
// The system prompt says the final page must not offer choices. The model
// occasionally forgets and ends a 25/25 page on a `**What do you do?**`
// prompt. Hard check: if it's the final page and we see a choices block
// or the literal prompt string, retry.
// ──────────────────────────────────────────────────────────────────────
export function detectFinalPageBreach(
  content: string,
  isFinalPage: boolean
): boolean {
  if (!isFinalPage) return false;
  if (content.toLowerCase().includes("what do you do?")) return true;
  if (extractChoices(content).length > 0) return true;
  return false;
}

// ──────────────────────────────────────────────────────────────────────
// Detector 4: Story Momentum (the world doesn't wait)
//
// Inspects the reader's recent player inputs. If 2+ of the last 3 are
// semantically similar (high token overlap, suggesting same object /
// same verb class), returns a directive to inject into the *current*
// prompt that tells the AI to escalate the beat. Player agency is
// preserved (they still chose); the world responds by acting back.
// ──────────────────────────────────────────────────────────────────────
export function detectStallPattern(playerMessages: Message[]): string | null {
  const recent = playerMessages.slice(-3);
  if (recent.length < 2) return null;

  // Filter to only player-sender messages just in case caller passed a
  // mixed array.
  const playerOnly = recent.filter((m) => m.sender === "player");
  if (playerOnly.length < 2) return null;

  // Pair-wise similarity via canonicalTokenSet — inputs matching any
  // STALL_PATTERN collapse to {__stall__} so synonyms (keep / continue /
  // stay / ignore / pretend) all read as identical. Threshold 0.25 is
  // permissive enough to catch near-misses; lower than that produced too
  // many false positives in dry-run testing.
  let similarPairs = 0;
  for (let i = 0; i < playerOnly.length - 1; i++) {
    const a = canonicalTokenSet(playerOnly[i].content);
    const b = canonicalTokenSet(playerOnly[i + 1].content);
    if (jaccard(a, b) > 0.25) similarPairs++;
  }

  // Two similar pairs in a 3-input window means the reader has been
  // repeating themselves across three turns. One similar pair (last 2
  // similar) is suggestive but not definitive — fire only on two.
  if (similarPairs < (playerOnly.length >= 3 ? 2 : 1)) return null;

  return `\n\nSTORY MOMENTUM (the world doesn't wait):\nThe reader has stalled on the same beat across multiple turns. Their last few inputs have been variations on the same action. THE WORLD MUST ACT ON THIS PAGE. The object reveals itself, the moment passes, or a new force enters the scene. Do not let the reader continue stalling. Move the story forward by your authority as the Guide.`;
}

// ──────────────────────────────────────────────────────────────────────
// Aggregate violation report. Returned by runValidators so the caller
// can decide whether to retry and what to log.
// ──────────────────────────────────────────────────────────────────────
export interface ViolationReport {
  stallDetected: boolean;
  fakeChoices: boolean;
  finalPageBroken: boolean;
  missingChoices: boolean;
  // True if any retry-triggering violation fired. Story Momentum is NOT
  // a retry trigger; it's a pretext directive applied before the call.
  shouldRetry: boolean;
}

export function runValidators(
  newContent: string,
  priorAiMessages: Message[],
  isFinalPage: boolean
): ViolationReport {
  const stallDetected = detectStall(newContent, priorAiMessages);
  const fakeChoices = detectFakeChoices(newContent);
  const finalPageBroken = detectFinalPageBreach(newContent, isFinalPage);
  const missingChoices = detectMissingChoices(newContent, isFinalPage);

  return {
    stallDetected,
    fakeChoices,
    finalPageBroken,
    missingChoices,
    shouldRetry: stallDetected || fakeChoices || finalPageBroken || missingChoices,
  };
}

// Build a retry hint string to append to the next system-prompt build. Only
// includes hints for violations that fired, so the AI sees a focused
// directive on what to fix.
export function buildRetryHint(report: ViolationReport): string {
  const hints: string[] = [];
  if (report.stallDetected) {
    hints.push(
      `YOUR PREVIOUS ATTEMPT WAS A STALL: it repeated the same beat as the prior page without introducing a new entity, location, fact, consequence, or escalation. The reader has already seen this beat. Write a page that moves forward.`
    );
  }
  if (report.fakeChoices) {
    hints.push(
      `YOUR PREVIOUS ATTEMPT OFFERED ORBITAL CHOICES: two or more of the three choices were variations of the same action on the same object. Each choice must lead to a meaningfully different next page. Different scene, different person, different stake.`
    );
  }
  if (report.finalPageBroken) {
    hints.push(
      `YOUR PREVIOUS ATTEMPT BROKE THE FINAL PAGE RULE: this is the last page of the story. Do NOT offer choices. Do NOT end with "What do you do?". Resolve the central conflict and end the story in 80-140 words.`
    );
  }
  if (report.missingChoices) {
    hints.push(
      `YOUR PREVIOUS ATTEMPT OMITTED THE CHOICE BLOCK: every non-final page MUST end with the literal header **What do you do?** followed by 2-3 bullet lines starting with the • character. Without choices the reader has no way to act. This is not optional. Add the choice block to the end of the page.`
    );
  }
  if (hints.length === 0) return "";
  return `\n\nRETRY DIRECTIVE — read this before generating:\n${hints.join("\n\n")}`;
}
