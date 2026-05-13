# Plan of Attack: AI Quality Pass (Reframed)

> **TL;DR:** Original spec (`ai-quality-pass.md`) proposed five new approaches. Audits (BE / FE / interactive-fiction / product, 2026-05-13) revealed **most of those rules are already in `server/aiService.ts`** — the AI is ignoring its own rules. This reframes the work from "write new prompt rules" to "make the existing rules stick + add the genuinely missing pieces." Four big chunks of work, sequenced by leverage and cost. PM decisions needed before kickoff (model upgrade, skip-choice escape hatch, schema shape for entity tracking).
>
> *Drafted 2026-05-13 immediately after the audits, while context was hot.*

---

## The big surprise

The original spec proposed writing rules that already exist:

| Spec proposal | Already exists at |
|---|---|
| Per-page pacing directives (Approach 1) | `server/aiService.ts:48–101` — `getPacingGuidance()` with 6 milestones (setup / rising / escalation / climax / last 3 / final) |
| Final-page resolution mode (Approach 1) | `aiService.ts:54–60` — final-page directive: *"No choices. Write a definitive ending in 80 to 140 words."* |
| Choice-quality rule (Approach 2, prompt half) | `aiService.ts:147–158` — *"Each choice must lead to a DIFFERENT direction... NOT three angles on the same moment"* + worked bad/good examples |
| "ONE THING must change every page" (the anti-stall rule) | `aiService.ts:142` — already in the system prompt as a hard rule |
| "Don't restage scenes" (anti-stall rule) | `aiService.ts:143` — already in the system prompt |
| Em-dash ban | `aiService.ts:121` + post-process strip |
| Input handling (reader text is in-story content) | `aiService.ts:180–181` |

The "tunnel stall" the user saw at pages 7–15 of *Whispers of the Familiar* is a **direct violation** of the existing rule "ONE THING must change every page." The "hold still / stay still" false-choice pattern is a **direct violation** of "each choice must lead to a DIFFERENT direction." The rules are in the prompt. The AI just isn't following them.

**This reframes the entire effort.** We are not writing a new prompt. We are figuring out why an existing prompt is being ignored, building enforcement mechanisms for the rules that already exist, and then adding the rules that genuinely don't.

---

## What's actually missing

Cross-referencing the original five approaches against current code:

| Approach | What's in code today | Genuinely new? |
|---|---|---|
| 1. Pacing skeleton | Per-page directives at 6 milestones, including final-page mode | **No — already there.** Spec restated existing behavior. |
| 2. Choice quality (prompt half) | "Each choice must lead to a DIFFERENT direction" + examples | **No — already there.** |
| 2. Skip-choice escape hatch | Current prompt says choices are MANDATORY (`aiService.ts:160, 167`) | **Yes — net new feature.** Conflicts with current invariant; has FE work. |
| 3. Player agency clause | Input handling rule exists but doesn't say "follow off-script ideas" | **Yes — net new.** Small prompt addition. |
| 4. Prose-tell prohibitions | Only em-dashes are banned. Rule-of-three, hedge adverbs, body-language tics, "something" antagonist not addressed | **Yes — net new (prompt + post-process layers).** |
| 5. Entity commitment tracking | No mechanism exists; summary captures plot beats but not entity specifics | **Yes — net new (architectural).** |

So the *genuinely* new prompt-level work is: agency clause + prose-tell prohibitions + (maybe) skip-choice escape hatch. The rest is enforcement of existing rules, plus the architectural entity-tracking piece.

---

## The reframed theory of why the AI ignores its own rules

Four candidate explanations, ordered roughly by how actionable each is:

1. **Rule attention dilution.** The system prompt is ~80 lines of rules. Rule weighting in LLM attention favors recency and emphasis. Some of the most important rules (the anti-stall rule at line 142, the choice rule at line 147) are buried mid-prompt. The pacing guidance is appended dynamically *after* the choice rule, pushing the choice rule further from the end.
2. **Soft enforcement.** When the model emits a stall page, nothing happens. No retry, no feedback. The em-dash strip is the only existing enforcement mechanism, and it's purely cosmetic. Rules without consequences are suggestions.
3. **Model capability.** Claude 3.5 Haiku is the smaller Claude model. Rule-following ability scales with model size. The current prompt may be at or near Haiku's working capacity for sustained rule application across a 25-page arc.
4. **Abstract rule wording.** "ONE THING must change every page" is interpretable. The model can rationalize "atmosphere shifted = something changed" and satisfy the rule by its own reading while the reader experiences stasis.

The fix list maps to these explanations:

- For #1: prompt restructure — move key rules to the end.
- For #2: detection + retry on rule violations.
- For #3: model upgrade test.
- For #4: concrete enforcement criteria with measurable definitions.

---

## Four big chunks of work

Sized for "step away for an hour, come back and chew on this" — each chunk is roughly a focused half-week of work, not a half-day.

### Chunk A — Strengthen rule weighting (cheapest, fastest, lowest risk)

**Goal:** Make the existing rules stick better without changing the rules themselves or adding infrastructure.

**Work:**
- Reorder the system prompt so the highest-leverage rules (anti-stall, choice quality, agency) sit at the END of the prompt, where Claude's attention is highest.
- Tighten redundant or weak rules. The current prompt has ~80 lines; some are stylistic noise. Aim for ~60 lines, with the rules that matter weighted clearly.
- Add concrete anti-examples drawn from real failure modes in *Whispers of the Familiar* — the "stairs override," the "hold still / stay still" trio, the "something massive" antagonist that never resolved.
- Add the agency clause (Approach 3) since we're already touching the prompt: *"If the reader's input would take the story in a direction you didn't plan, follow them. You are not the author of what happens — you are the author of how it unfolds."*
- A/B by re-generating 3 fresh stories with the same seeds (cat earthquake, etc) on old vs new prompt. Measure: did the stall happen? Did the choices feel fake? Did the AI override player input?

**Files:** `server/aiService.ts` (prompt + pacing), `docs/ai-voice.md` (codify the changes).

**Size:** ~2 days of prompt iteration + manual testing. Single PR.

**Risk:** Low. Pure prompt change. Easy to roll back. May produce marginal-to-medium improvement; on its own probably doesn't solve the deepest stalls.

---

### Chunk B — Validate + retry on rule violations (real teeth, real cost) ✅ SHIPPED 2026-05-13 (v1.5.0)

**Goal:** Stop trusting the model to follow the rules. Detect violations in the output and retry, the same way we strip em-dashes today. Plus a new detector that addresses a subtler failure mode surfaced during Chunk A testing: **orbital choices** where 3 options are different actions on the same object (e.g. "shake the box / pry the box / put it back") — technically distinct verbs, semantically the same dilemma.

**What shipped:** All 4 detectors live in `server/aiValidators.ts`. Wired into `server/aiService.ts.generateResponse` — Story Momentum runs before the AI call (injects directive); the other 3 run after parse + em-dash strip and trigger one retry on violation. All violations log to `event_log` as `ai_quality_violation`. New admin section at `/admin?admin=1` surfaces 24h counts + rates. Story Momentum detector got a Path A patch (synonym canonicalization via `STALL_PATTERNS`) after initial testing showed the token-overlap heuristic missed "keep working / continue silently / ignore him" stalls. Known band-aid; the real fix is Chunk D's narrative-state tracking.

**Four heuristic detectors (no extra AI calls in v1 — keeps cost down):**

1. **Page-novelty detector.** Compare new page's content against the previous 2 pages. Check: does a new entity name appear? A new location word? A new fact established? A new sensory beat? If none — retry with a stronger directive: "the previous page already showed X; this page must introduce something new."

2. **Choice-distinctness detector.** Extract action verbs and target objects from each of the 3 choices. If 2 of 3 share the same verb root OR target the same object — retry. Catches both the obvious false-choice pattern ("hold still / stay still") and the subtler orbital pattern ("shake box / pry box / put box back").

3. **Final-page enforcement.** If `storyComplete` is true and the content contains "What do you do?" or bulleted choices — retry with the final-page directive emphasized. Catches the page-25-ends-on-cliffhanger failure.

4. **Story Momentum detector (the world doesn't wait).** Inspect the reader's last 2–3 inputs. If they're semantically similar (same object engaged repeatedly, same verb class repeated) — on the *next* page, inject a "the world must act" directive into the prompt. Does NOT retry the current page; injects pressure for the upcoming one. This addresses a brainstorm insight from 2026-05-13: when a reader stalls by repeatedly engaging the same beat, the world should respond by forcing progression (the box opens on its own, the moment passes, a new force enters the scene). Player agency is preserved — they can still choose — but stalling has narrative cost.
   - **WRONG (current behavior — AI lets reader stall indefinitely):** Page 3 shake box → soft chirp. Page 4 shake box → louder chirp. Page 5 shake box → louder still. Three pages, no progression.
   - **RIGHT (after this rule):** Page 3 shake box → soft chirp. Page 4 shake box → box trembles harder. Page 5 shake box → "Before you can shake it again, the lid splits. A small wing pushes through the gap." The world acted.

**Retry mechanism.** Extends the existing em-dash retry path in `server/aiService.ts`. Max 1 retry per detector to avoid runaway cost. Story Momentum is the exception — it doesn't trigger retry, just injects the directive for the next call.

**Telemetry.** Per-response `aiQualityViolations: { stallDetected, fakeChoices, finalPageBroken, momentumPressureFired, emdashesStripped }`. Logged to `eventLog`. New section on the admin dashboard (`/admin?admin=1`) surfacing rolling violation rates and rates over time so we can see whether Chunk A's prompt changes actually reduced violations.

**Files:**
- `server/aiValidators.ts` — new file. The 4 detector functions.
- `server/aiService.ts` — wire validators into the response pipeline; inject momentum directive when triggered.
- `server/eventLog.ts` — telemetry hooks (extends existing event types).
- `client/src/components/AdminDashboard.tsx` — new "AI quality" section.

**Size:** ~4–6 days. Detection logic + retry plumbing + telemetry + admin surfacing + testing. Single PR.

**Risk:** Medium. Retries double the cost on violation pages. If detectors over-trigger, daily spend cap could become tight. Ship with conservative thresholds and monitor in admin.

**Cost impact:** Purely heuristic in v1 = no new AI calls, only retry cost. Realistic retry rate after Chunk A: 5–15%. Adds ~$0.005–$0.015 per story. Aligns with the Cost Impact table above.

**Out of scope for Chunk B v1:** semantic similarity via embeddings or sidecar AI calls. Start with heuristics. Escalate only if heuristics miss too much. (Same principle that got us here from Chunk A: try the cheap fix first.)

---

### Chunk C — Add the genuinely missing rules (prompt + post-process)

**Goal:** Address the AI-tell patterns (Approach 4) and refine the agency clause (Approach 3) that didn't fit in Chunk A.

**Work:**
- Prompt-layer additions to the banned-patterns section: no three-item lists as a default cadence, no hedge adverbs as filler ("slightly," "almost imperceptibly," "softly"), no repeated body-language tics across pages, no "something" as antagonist after page 2.
- Concrete anti-examples for each banned pattern (Claude responds well to "WRONG: ... RIGHT: ..." framing).
- Post-process scrubs for the patterns we can detect mechanically — hedge-adverb density, "something" antagonist near violence verbs. Same model as the em-dash strip.
- Add a `tellDensity` per-response metric to telemetry so we can measure improvement.

**Files:** `server/aiService.ts`, `docs/ai-voice.md`, possibly `server/aiValidators.ts` if it exists from Chunk B.

**Size:** ~2–3 days. Single PR.

**Risk:** Low-medium. Some patterns are subjective ("rule of three" isn't always bad). Bias toward "fewer of these, not zero of these" — soft thresholds.

---

### Chunk D — Entity commitment tracking (architectural, biggest)

**Goal:** Make the antagonist stay specific across 25 pages. Same for any named entity.

**Work:**
- Add an entity sheet, scoped to `(sessionId, storyId)`. **Schema decision (locked 2026-05-13): JSONB column on `game_state`**, with a JSON shape designed to migrate cleanly to a normalized cross-story characters table later (see Cross-Story Migration Path below).
- AI extracts entity updates in a JSON sidechannel of each response (naive approach: `{ entities: [{ localId, globalId, type, name, description, firstAppearancePage, facts }] }`). Server merges into the sheet.
- Every subsequent generation call includes the entity sheet in context with an instruction to not contradict or re-vague.
- Cap sheet size (15–20 entities for a 25-page story) and prune oldest-non-recent entries if it overflows.

**Files:** schema migration, `server/aiService.ts`, `server/summaryService.ts` (or peer service), client changes if we surface the sheet (FE audit flagged cache invalidation as an open question).

**Size:** ~5–7 days. Schema design + extraction + injection + testing across multiple stories. Single PR.

**Risk:** Higher than the other chunks. Adds tokens to every prompt (estimated +400–700 tokens/call → +$0.015–$0.026 per 25-page story). Risk of contradictions between the entity sheet and the rolling summary if not designed carefully (BE auditor flagged this).

#### Cross-Story Migration Path (load-bearing — read before designing the JSONB shape)

**PM intent (confirmed 2026-05-13):** Eventually we want characters that users have created (or that the AI introduced) to be able to appear in other stories — both in the same user's other stories AND across users. This is the "Cross-story character travel" item from `docs/ROADMAP.md` Maybe/TBD (was Milestone 7), now upgraded to a near-term direction.

**Implication for Chunk D's schema:** JSONB on `game_state` is the right *current* choice for the immediate "antagonist consistency in one story" problem. It is NOT the right *end state* for cross-story characters — JSONB doesn't index well for cross-row queries.

**To avoid painting ourselves into a corner, the JSON shape must include forward-looking fields:**

```json
{
  "entities": [
    {
      "localId": "antagonist-1",
      "globalId": null,
      "type": "antagonist",
      "name": "Dimensional Hunter",
      "description": "Massive mechanical-organic, red scanning beams, tracks patterns",
      "firstAppearancePage": 2,
      "facts": ["tracks bio-signatures", "blocked by quantum suppression"]
    }
  ]
}
```

Two fields are load-bearing for the future:
- **`localId`** — unique within the story. Used today for in-story coherence.
- **`globalId`** — null today. When we promote to cross-story, this becomes the FK to a global `characters` table.

**Migration path when we go cross-story (estimated 6–12 months from now):**
1. Add a `characters_global` table (or similar — schema TBD when we get there).
2. For each entity in JSONB with `type IN ('character', 'antagonist', ...)`, insert a row in `characters_global` and update the JSONB entry's `globalId` to point to it.
3. Code paths read JSONB first, hydrate from `characters_global` when `globalId` is set.
4. New stories can REFERENCE existing globals (e.g., "this story features a returning character — pull its facts from `characters_global`").

**Estimated migration effort when we get there:** ~half a day if the JSONB shape is designed correctly now. Materially more if we have to retroactively assign `localId`/`globalId` to existing JSONB entries that didn't have those fields.

**Why we're not building the normalized table now:** The cross-story feature has its own design surface (privacy, moderation, "do other users' characters appear in my story without my consent?"), and that surface deserves its own focused thinking. Doing JSONB-with-migration-ready-shape lets Chunk D ship without resolving any of that.

**Rule for the JSONB shape:** if a future field would clearly belong in a normalized characters table, include it as an optional field in the JSONB now (even if null) so we don't have to backfill at migration time.

---

### Explicitly NOT in this plan

- **Approach 1 (pacing skeleton) as written in the original spec** — already shipped, no work needed beyond verifying it triggers correctly in Chunk B.
- **Approach 2's skip-choice escape hatch** — flagged as deferred. The FE audit identified real UI design work and the conflict with the current "choices mandatory" invariant. If Chunks A + B make existing choices stop being fake, this feature may not be needed. Revisit after measuring.
- **Approach 2's prompt half** — already shipped (the choice rule exists in the system prompt).

---

## Sequencing recommendation

**PR order, by leverage and cost:**

1. **Chunk A** first. Cheapest, fastest, lowest risk. Probably 30% of the perceived improvement. Ship in days.
2. **Chunk B** second. Real teeth. Compounds with A — A makes the rules clearer, B makes them enforced. This is the highest single-PR leverage.
3. **Chunk C** third. Independent of A and B; could parallelize but probably cleaner serial. Polishes the prose layer.
4. **Chunk D** last. Heaviest architectural lift. Worth doing only after A+B+C have shipped and we can measure what's still wrong.

If we ship Chunks A+B+C and the stories feel substantially better, Chunk D may not be needed at all — or may be deferred to a future quarter.

---

## Decisions — LOCKED (2026-05-13)

1. **No Sonnet upgrade as default.** Sonnet is ~3.75× Haiku cost (~$0.28/story vs ~$0.075). Would blow up dev iteration cost ($2.80/test story) and drop the daily cap from ~133 to ~36 short stories. **But:** a 2-cell comparison (Sonnet + old prompt, Sonnet + new prompt) will run as a small follow-up PR after Chunk A ships. ~$1.68 one-time testing cost. Production decision (ship Sonnet for all / paid-tier only / length-gated / revert) follows the data.
2. **Skip-choice escape hatch deferred.** Real UI design work + conflict with current "choices mandatory" invariant. Revisit after Chunks A+B; may be unnecessary if existing-rule enforcement makes false choices stop on its own.
3. **Entity tracking schema (Chunk D):** JSONB column on `game_state`, with a JSON shape designed to migrate to a normalized cross-story characters table later. See Chunk D's "Cross-Story Migration Path" subsection.
4. **Telemetry surfacing:** extend the existing admin dashboard (`/admin?admin=1`). New section for rule-violation metrics.
5. **Chunk A first.** Restructure the prompt → ship → then the Sonnet env flag + 2-cell comparison → then Chunk B (validate + retry) → then Chunk C (prose tells) → then Chunk D (entity tracking).

## Cost impact (locked decisions, on Haiku)

| Chunk | Per-story Δ | % vs baseline | Notes |
|---|---|---|---|
| A — Prompt restructure | **−$0.005 to −$0.015** | **−7% to −20%** | Net savings; shorter prompt = fewer input tokens. |
| B — Validate + retry | +$0.005 to +$0.015 | +7% to +20% | Retry rate dependent (assume 5–15% after A). |
| C — Prose-tell prohibitions | +$0.001 to +$0.005 | +1% to +7% | Negligible. |
| D — Entity tracking | +$0.015 to +$0.025 | +20% to +33% | Biggest. Entity sheet adds 400–700 tokens / call. |
| **All four combined** | **+$0.01 to +$0.03** | **+13% to +40%** | Daily cap fits ~100–115 stories vs ~133 today. |

One-time test costs across all four chunks: ~$3.50 in dev. Plus ~$1.68 for the Sonnet 2-cell comparison after Chunk A.

---

## What I'd do if you greenlit Chunk A right now

Walk through *Whispers of the Familiar* one more time with the IF skill loaded, picking 6–8 representative anti-patterns ("stairs override," "hold still trio," tunnel stall paragraphs, vague antagonist mentions, hedge-adverb pile-ups). For each, write the WRONG version drawn from the actual story, paired with a RIGHT version. Drop those into a restructured prompt at the end (where attention is highest). Re-test against 3 fresh seeded stories. That's the Chunk A workpiece.

---

## Maintenance

- **Update when:** a chunk starts (mark in-progress), a chunk ships (mark shipped + commit ref + observed effect), or an audit assumption turns out to be wrong.
- **Stale check:** if this plan is more than 4 weeks old and nothing's been shipped from it, the model picture may have moved (new Claude models, different pricing); audit the plan against current capabilities before reviving.
- **Last updated:** 2026-05-13
