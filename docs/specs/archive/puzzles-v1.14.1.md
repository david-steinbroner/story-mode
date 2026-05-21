# Puzzles v1.14.1 — Design Spec

**Status:** Drafted 2026-05-19, awaiting PM greenlight.
**Scope:** Design-heavy items from the v1.14.0 audit pass. Targeted for rollout before flipping `puzzles_enabled='true'`. Mechanical fixes (Tier 1 in the audit) execute alongside without further design work — see the audit findings for that list.
**Out of scope:** UX iterations (turn-based puzzles, attempt cap with consequences, interactive cryptogram) — separate spec.

---

## 1. Synonym tolerance (scramble + fill-in-blank)

**Decision (PM, 2026-05-19):** Puzzles accept multiple valid answers where the mechanic allows it. Boosts replay variance and pass rate. See memory `puzzle-synonym-policy`.

### Scramble — validator-logic change

Current: validator does strict equality against the canonical answer at `routes.ts` /api/puzzle/attempt. Any other valid anagram is rejected (the audit confirmed TONES rejected for NOEST→STONE).

**New rule** — submission passes when all three hold:
1. `sort(uppercase(submission)) === sort(uppercase(payload.letters))` (permutation of the puzzle's letters)
2. Submission is in `server/puzzles/wordlist.txt`
3. Submission length === `payload.letters.length`

**Result:** NOEST accepts STONE, TONES, NOTES, ONSET — any wordlist entry that's a valid anagram.

**Files:** `routes.ts` (attempt handler), `puzzleService.ts` (verify any validator reused at attempt-time matches).

**No data model change. No migration. Existing puzzles unaffected.**

### Fill-in-blank — generator + payload extension

Current: gen produces one canonical `answer`; validator strict-equals. No way to know that ALERT, SIGNAL, and ALARM all fit `"send an immediate ___"` without the generator telling us.

**Approach:**

1. **Generator prompt update** (`puzzleService.ts`): instruct Haiku to emit `acceptedAnswers: string[]` with 3–5 entries — first is primary, each must fit semantically + match blank length constraints.
2. **Payload schema extension** in `shared/types/puzzles.ts`: add optional `acceptedAnswers?: string[]` to fill-in-blank payload type.
3. **Validator update** at `routes.ts /api/puzzle/attempt`:
   ```
   const accepted = payload.acceptedAnswers ?? [puzzle.answer];
   const correct = accepted.some(a => normalize(a) === normalize(submission));
   ```
4. **Backward compat:** existing rows lack the field; `?? [puzzle.answer]` keeps them validating as today.

**No DB schema change** (payload is JSONB). No migration.

### Cryptogram — no change

Cryptograms have one decoding by mechanic. Synonym tolerance would mean accepting nonsense. Pass-rate boost here belongs to the v1.14.2 UX track (more revealed letters / shorter phrases).

---

## 2. Race condition fixes

### Puzzle cap (Musical Teeth got 3/2)

Read-check-write in `puzzleDispatch.dispatchPuzzleFromResponse:127-160` is not isolated. Concurrent paths can both pass the gate.

**Approach:** generate FIRST (outside any txn), then wrap the count-check-insert in a serializable transaction:

```
const puzzle = await generatePuzzle(...);
return await db.transaction(async tx => {
  const soFar = await countPuzzlesForStory(tx, storyId, sessionId);
  if (!getBudgetContext(totalPages, soFar).canEmit) {
    // log puzzle_dropped (see §3)
    return null;
  }
  await createPuzzle(tx, puzzle);
  return puzzle;
}, { isolationLevel: 'serializable' });
```

**Trade-off:** under contention, a freshly-generated puzzle gets dropped on the floor. Telemetry will tell us how often this happens; if non-trivial, defer to v1.15 with a row-level reservation pattern.

### Daily spend cap

Same race shape: `canMakeRequest` reads total, gate passes, AI call happens, `trackRequest` writes. Two concurrent paths can both pass.

**Status post-/ultrareview:** the v1.14.1 attempt at a cheap fix (`SELECT FOR UPDATE` on the daily row) was reverted. In postgres-js autocommit, the row lock releases the instant the SELECT returns — the "mitigation" did nothing. Even wrapping in a proper transaction wouldn't help: the gate read has no write inside it for serializable conflict detection to fire on, and we can't hold a lock across the AI call. **The race is documented as a known gap; cap can briefly overshoot under concurrency.**

**Deferred to v1.15:** a true reservation pattern — atomic UPDATE that increments by an estimated cost gated by WHERE clause, settled to actual cost on completion. Adds operational complexity but is the only correct fix.

---

## 3. Silent-drop telemetry

`dispatchPuzzleFromResponse` currently returns null in three cases without logging:
- `canEmit = false` (cap hit)
- `parsePuzzleRequest` validation failure (AI emitted malformed request)
- generation + fallback both fail (currently throws — addressed by Tier 1 defensive guard)

**Add `puzzle_dropped` event** via `eventLog.recordEvent` at each drop site:
- `event_type`: `puzzle_dropped`
- `session_id`, `story_id`
- `metadata`: `{ reason: 'cap' | 'parse_fail' | 'gen_fail', requested_type?, requested_theme?, requested_difficulty?, current_count?, cap? }`

**Admin dashboard card** in `AdminDashboard.tsx`: count + reason breakdown for the last 24h. Mirrors the existing fallback-rate card pattern.

**Why this matters:** without it, the "prose sets up puzzle that doesn't emit" pattern the PM caught manually would be invisible at scale.

---

## 4. Stale lock sweeper

`storyCreationLocks` (30s TTL) and `chatLocks` (60s TTL) accumulate stale rows when requests crash before releasing.

**Approach:** lazy purge on acquire. Before the existing UPSERT-with-`setWhere` logic, delete any expired rows for the key:

```
await db.delete(storyCreationLocks).where(and(
  eq(storyCreationLocks.sessionId, sessionId),
  lt(storyCreationLocks.expiresAt, new Date())
));
// existing acquire logic continues
```

Same pattern in `chatLocks` acquisition.

**Why not a background sweeper:** adds operational surface (cron + process management). Lazy purge piggybacks on existing paths and is free for clients who never collide.

**Trade-off:** stale locks for *other* sessions/stories persist until their own next acquire. Acceptable for low-volume lock surfaces.

---

## Acceptance criteria

- **Scramble:** NOEST accepts STONE, TONES, NOTES, ONSET via /api/puzzle/attempt; non-anagram words still rejected. Unit test added.
- **Fill-in-blank:** newly generated puzzles include `acceptedAnswers`; validator accepts any member case-folded. Backward compat verified on legacy rows. Unit test added.
- **Cryptogram:** behavior unchanged. Regression check.
- **Puzzle cap:** concurrent dispatch on same story cannot exceed cap. Unit test simulates concurrent calls.
- **Daily spend:** known race documented; FOR UPDATE attempt reverted (post-/ultrareview). Real fix is the v1.15 reservation pattern.
- **Telemetry:** every dropped puzzle emits a `puzzle_dropped` event. Verify in `event_log` after a forced cap-hit.
- **Stale locks:** a request soft-killed mid-flight leaves a lock that auto-clears on the next acquire (any session).

---

## Out of scope (deferred)

- **Letter-cohesion** (prose previewing specific puzzle letters): keep current `<never_preview_puzzle_content>` prompt rule, optionally add a Sentry breadcrumb. Revisit in v1.14.2 if still surfacing.
- **Full spend-reservation pattern** with `reserved_micros` column: now confirmed as the real fix; deferred to v1.15.
- **Cryptogram synonym tolerance:** declined by mechanic.
- **Anti-repetition** (no STONE×4): Tier 1 mechanical — pass last-N session answers into gen prompt, executed without spec.
- **Soft-delete sibling reads** (`getCharacter`, `getQuests`, `getMessages` family, `getActiveSummary`): v1.14.1 only closed `getGameState`. The sibling tables don't carry `deletedAt`, so closure requires a JOIN-back or a route-layer pre-flight. Flagged by /ultrareview as a half-deleted UX inconsistency; queued for v1.14.2.

---

## Maintenance footer

- **Update when:** v1.14.1 ships → archive to `docs/specs/archive/`. Until then, edit in place if scope changes.
- **TL;DR rule:** scope-frozen for the sprint; don't add post-merge findings here — those go to ROADMAP or a new spec.
- *Last updated: 2026-05-19.*
