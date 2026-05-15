# Spec: AI Quality Pass

> ⚠️ **STATUS: SUPERSEDED.** Audits (BE/FE/IF/product, 2026-05-13) revealed the spec was based on a false premise — most of the rules proposed in Approaches 1, 2 (prompt half), and the final-page mode of Approach 1 **are already in `server/aiService.ts`**. The actual problem isn't missing rules; it's rules not being followed. See `docs/specs/ai-quality-pass-plan.md` for the reframed plan of attack. This spec is preserved as the diagnostic artifact and the source of the user-pain framing, but its sequencing and "what we'll build" sections are out of date.
>
> **Original TL;DR (read this first):** Five approaches to fix systemic AI-narrative problems surfaced by deep-reading a finished 25-page story ("Whispers of the Familiar," 2026-05-12). Problems: stalled middles (9 pages of zero plot motion mid-story), false choices (3–4 bulleted options that all collapse to the same outcome), AI overriding off-script player input ("stairs? too exposed"), AI-prose tells (rule-of-three, hedge adverbs, "something" antagonist), and a final page that ends on a "What do you do?" prompt instead of a resolution. Five fixes: (1) pacing skeleton with per-page narrative directives, (2) choice-quality contract + skip-choice escape hatch, (3) explicit player-agency clause in the system prompt, (4) prose-tell prohibitions in prompt + post-process scrub, (5) entity commitment tracking layered onto the existing summary service. Drafted 2026-05-13.

---

## Context & motivation

The user finished a 25-page story on phone (2026-05-13) and articulated three pain points:

1. "We stall out sometimes."
2. "The AI's replies are just saying things and don't leave off on an actual decision for me."
3. "My decisions don't actually move the story forward that much."

Deep diagnostic against the interactive-fiction framework confirmed all three and surfaced two more the user didn't name: AI-prose tells become more visible the longer the story runs, and the ending mode never engages — page 25 reads like page 14.

Root causes traced to the current system:

- The system prompt in `server/aiService.ts` optimizes for **voice** (word counts, tone, banned vocabulary) but lacks **structural scaffolding** (per-page narrative directives, choice-quality contract, agency clause).
- The model defaults to its training prior: serialized-adventure prose that simmers tension, hedges specificity, and forces choice-shaped endings on every beat regardless of whether a real fork exists.
- The summary service (`server/summaryService.ts`) captures plot beats every 10 messages but doesn't track **entity commitments** — so the antagonist stays "something massive" for 25 pages because nothing reminds the model what it already established.
- Only one prose tell (em-dashes) is post-processed; deeper tells (hedge adverbs, body-language tics, vague antagonists) survive.

This spec proposes five approaches, each one largely independent of the others, to be shipped across 2–3 PRs.

---

## Approach 1 — Pacing skeleton with per-page narrative directives

### Goal

Eliminate the stalled middle (pages 7–15 of the test story showed 9 consecutive pages of zero plot motion) and the missing ending mode (page 25 ended on a `What do you do?` prompt instead of resolving).

### Approach

Define a narrative-arc map keyed to story length. Each story length (currently `short = 25 pages`, `novel = ?`, `epic = ?`) gets a per-page directive that the AI is given alongside the existing context at each turn.

Rough shape for a 25-page short:

| Page range | Directive |
|---|---|
| 1–2 | Setup. Establish character, world, voice. End with an inciting moment. |
| 3–5 | Inciting incident. Player commits to the journey. Threat or goal becomes concrete. |
| 6–10 | Rising action. Each page must introduce one of: new location, new character, new revelation, or escalated stakes. No two consecutive pages may be in the same scene unless a cliffhanger forces it. |
| 11–13 | Midpoint reveal. Recontextualize the story — the player learns something that changes what the journey means. |
| 14–18 | Complication. Stakes intensify. False victories or partial setbacks. |
| 19–22 | Climax approach. Pieces converge. Player makes the decision that defines the outcome. |
| 23–24 | Climax. Maximum tension. Resolution begins. |
| 25 | **Resolution mode.** No choices offered. Deliver closure. End the story. |

The AI gets the *current* directive injected into context every turn alongside the page number. Page 25 specifically triggers a different prompt template that forbids the `What do you do?` ending pattern.

### Implementation surface

- New constant or table in `server/aiService.ts` (or a new module) mapping `(storyLength, currentPage) → directive`.
- Inject the directive into the system prompt or assistant context at each generation call.
- Detect the "final page" case and branch to a closing-mode template that omits the choice prompt.
- Possibly: a quick assertion in post-process that page 25 output does NOT end in `What do you do?` — if it does, retry with a stronger directive.

### Test plan

- Generate 3 fresh 25-page stories with the new pacing skeleton. Read each end-to-end and check: any 2 consecutive pages in the same scene? Does page 25 resolve? Does the midpoint reveal land?
- Re-test the "tunnel stall" failure mode by seeding a story likely to want a sneak sequence (e.g., heist plot). Verify it doesn't stall.

### Risks / open questions

- Heavy-handed directives may produce mechanical-feeling stories. Need to phrase directives as constraints, not scripts.
- Different story lengths need different maps. Short is the priority; novel/epic shapes are TBD.
- The model may ignore the directive if other context overwhelms it. May need to position the directive near the end of the prompt where attention is highest.

### Out of scope

- Genre-specific pacing skeletons (e.g., a mystery has different beats than a romance). Future iteration.
- User-configurable pacing.

---

## Approach 2 — Choice-quality contract + skip-choice escape hatch

### Goal

Eliminate false choices ("Hold perfectly still / Stay perfectly still / Make a sudden movement"), the pattern where 3–4 bulleted options collapse to the same outcome because no real fork exists at that beat.

### Approach

Rewrite the choice instruction in the system prompt from a *shape* requirement ("end with 3–4 choices") to a *quality* contract with an escape hatch:

- **Distinct outcomes required.** Each choice the AI offers must produce a meaningfully different next page. If the AI can't articulate why each option diverges, the choices fail.
- **Choices are optional, not mandatory.** If the current beat has no real fork (e.g., a single tense moment where there's only one sensible action), the AI narrates the beat and ends with an open invitation (`What do you do?`) with no bulleted options. Reader types freeform input.

Mechanism for the contract: include in the system prompt explicit examples of bad vs good choices. Possibly: ask the AI to silently consider "would these 3 choices lead to different page-26 content?" before committing to them. (Self-check prompting tends to work well with Claude.)

### Implementation surface

- Edit the system prompt section in `server/aiService.ts` that instructs choice formatting.
- Possibly: the response JSON schema for `choices` field becomes optional. Currently the client probably expects a `choices` array; need to verify it handles `choices: []` or `choices: null` cleanly and renders the drawer with just freeform input.
- `client/src/components/ChatInterface.tsx` — the drawer's `latestChoices.map(...)` path. Already handles empty state (the "I have something else in mind..." freeform input is always available per CLAUDE.md §9), but worth verifying the "no choices, just freeform" rendering is graceful.

### Test plan

- Generate stories and count: across N pages, how many had `choices: []`? Should be nonzero if the system is working — some beats genuinely don't have forks.
- For pages with choices: read the 3 options and ask "would page N+1 be different for each?" If yes for all combos, good.
- Negative case: ensure the AI doesn't go to the other extreme and start skipping choices on pages that DO have forks. Self-check could be: across a 25-page story, ≥18 pages should have choices.

### Risks / open questions

- Client UX when `choices: []`: does the drawer collapse? Does it show only the freeform input? Need to design that gracefully — the drawer currently has a 5rem peek with "What happens next?" — that becomes more important when no options are visible.
- Reader's freeform input quality drops without scaffolding. Many readers will not know what to type. Possible mitigation: when `choices: []`, show 1–2 lightweight "spark" suggestions in placeholder text, not in the bulleted list.
- May increase reader friction (some readers prefer tap-only). Counter-argument: the false-choice version of tap-only is worse.

### Out of scope

- A "suggest a choice" button for readers stuck on freeform input. Future iteration.

---

## Approach 3 — Player-agency clause in the system prompt

### Goal

Stop the AI from overriding off-script player input. Specific failure case: at page 6 of the test story, the player said "tell the cat we need to get out, maybe the stairs." AI's response: "Stairs? Too exposed. Emergency passage. Follow me." The player's idea was discarded in favor of the AI's planned set piece.

### Approach

Add an explicit, weighted instruction to the system prompt: *"If the reader's input would take the story in a direction you didn't plan, follow them. You are not the author of what happens — you are the author of how it unfolds. Render their idea well. Do not redirect them to your preferred path, even if their idea complicates the story."*

This is a small text change with outsized behavior impact. The hard part is making sure the rule is *weighted heavily enough* that the model follows it consistently — which depends on placement in the prompt (early vs late), emphasis (caps, repetition, examples), and possibly explicit anti-examples ("DO NOT do this: [the stairs example]").

### Implementation surface

- One paragraph addition to `server/aiService.ts` system prompt.
- Possibly: a section in `docs/ai-voice.md` codifying the rule with examples.

### Test plan

- Generate stories with deliberately off-script player inputs (e.g., "I want to ignore the cat and call the police") and verify the AI doesn't redirect.
- Watch for over-correction: the AI might start being too compliant ("you call the police and the police arrive and resolve everything immediately") — that's a different failure mode. Need to balance: follow the player's lead while still maintaining narrative tension.

### Risks / open questions

- Compliance vs. craft tension. Too compliant = boring. Too directive = the current problem. May need iteration to find the right tone for the rule.
- Single-paragraph addition won't be enough on its own. Pairing with Approaches 1 and 2 helps — when the AI has structural scaffolding, it has less anxiety about "where is this going" and can more easily roll with the player.

### Out of scope

- Tracking when the AI has overridden the player and surfacing it as a metric. Future iteration.

---

## Approach 4 — Prose-tell prohibitions + post-process scrub

### Goal

Reduce the visibility of Claude's training-prior patterns: rule-of-three cadence, hedge adverbs ("slightly," "almost imperceptibly"), body-language tics ("tail twitches" every page), and vague antagonist references ("something massive" for the entire story).

### Approach

Two-layer attack:

**Layer 1 — Prompt-level prohibitions.** Add to the banned-patterns section of the system prompt (where em-dashes and D&D vocabulary already live):

- **No three-item lists as a default cadence.** Don't structure descriptions as triplets ("X, Y, Z") unless the triplet is meaningful.
- **No hedge adverbs as filler.** Words like *slightly, almost, softly, faintly, barely* used more than once per page suggests filler. Cut them or commit to the action.
- **No repeated body-language tics.** Don't lean on the same physical gesture across pages (the "tail twitches" pattern). Vary or omit.
- **No "something" as an antagonist.** Once an antagonist has appeared, name it or describe it concretely. After page 2 there is no excuse for "something massive."

**Layer 2 — Post-process scrub.** For patterns detectable mechanically:

- Hedge-adverb density check: count occurrences per page; if above threshold, retry generation (similar to the em-dash strip pattern).
- "Something" near antagonist-adjacent verbs: flag and surface in admin so we can see how often this leaks through.
- Add a `tellDensity` metric to the response telemetry so we can track improvement over time.

### Implementation surface

- `server/aiService.ts` — add the banned-patterns rules to the system prompt.
- `server/aiService.ts` — add post-process detection alongside the existing em-dash strip.
- `server/spendTracker.ts` or a new telemetry hook — record tell density per response so it shows up in admin.
- `docs/ai-voice.md` — codify the rules with bad/good examples.

### Test plan

- Pre/post measurement: take 5 stories from before the change and 5 from after. Count hedge adverbs, three-item lists, "something" antagonist mentions in each. Expect a measurable drop in the post-change set.
- Manual read: do the post-change stories *feel* less AI-tell-heavy?

### Risks / open questions

- The em-dash strip occasionally creates awkward sentences (em-dashes can be load-bearing). A hedge-adverb strip would be similarly lossy — better to prompt for less, then catch what slips through.
- Some "tells" are stylistic preferences, not actual problems. Need to avoid neutering the prose by over-banning. Bias toward "fewer of these," not "zero of these."

### Out of scope

- A fine-tune or distillation pass on the model itself. Future iteration if prompt-level fixes top out.

---

## Approach 5 — Entity commitment tracking

### Goal

Make the antagonist stay specific over a 25-page arc instead of regressing to "something massive." Same for any other named entity the AI introduces — character abilities, world rules, location details.

### Approach

Layer onto the existing summary service. Currently `summaryService.ts` produces a rolling summary of *plot beats*. Add a parallel structure: an **entity sheet** that captures named/described entities and their concrete attributes.

When the AI introduces an entity (a character, an antagonist, a location, a world rule), it commits to specifics. The entity sheet captures those specifics. Every subsequent generation call includes the entity sheet in context with an instruction: *"You have already established these facts. Do not contradict them, and do not re-vague them. When referring to these entities, use the specifics on the sheet."*

Two extraction strategies, in increasing complexity:

- **Naive:** ask the AI to extract entities in a JSON sidechannel of each response (`{ entities: [{ name, type, attributes }] }`), merge into a session-scoped sheet. Cheap; relies on the model self-reporting.
- **Lossless:** add a separate small AI call every N pages that re-reads the story and updates the entity sheet from scratch. More accurate; costs another call.

Recommend starting with the naive version and seeing if it's good enough.

### Implementation surface

- New DB column or table for entity sheet, scoped by `(sessionId, storyId)`. Could be JSONB.
- Update `server/aiService.ts` to (a) include entity sheet in context, (b) parse entity updates from response.
- Update the system prompt with the entity-commitment rule.
- Possibly: surface the entity sheet in admin so we can debug "did the model remember the antagonist?"

### Test plan

- Generate a 25-page story. Read every reference to the antagonist. Does the antagonist's described form stay consistent? Does it get *more* specific over time (good) or stay the same / regress to vague (bad)?
- Edge cases: what if the model contradicts itself within a single page? What if the entity sheet contradicts the current beat?

### Risks / open questions

- The entity sheet can grow unboundedly. Need a cap or pruning strategy. For a 25-page story, probably 10–20 entities is the realistic ceiling.
- Token cost: the entity sheet adds prompt tokens to every call. For a long story this compounds. Need to measure.
- Architectural complexity: this is the heaviest of the five approaches by far. Probably its own PR after the first four ship and we see what's left.

### Out of scope

- Cross-story entity sharing (a character carrying between stories). That was a separate Maybe/TBD item in ROADMAP.

---

## Sequencing recommendation

If shipping all five:

- **PR 1:** Approaches 1 + 2 + 3 (pacing skeleton, choice contract, agency clause). All three are system-prompt-shaped changes with minimal architectural risk. They compound: real beats with real forks, and a model that follows the player. This is the highest-leverage chunk.
- **PR 2:** Approach 4 (prose tells). Independent of the above; can land any time. Prompt rules + small post-process additions.
- **PR 3:** Approach 5 (entity tracking). Architectural; deserves its own focused PR after the first two have shipped and we can see what's still missing.

---

## Maintenance

- **Update when:** an approach ships (move it to MILESTONES with the commit ref + observed effect) or a new failure mode surfaces that one of these approaches should be addressing.
- **Stale check:** if this spec is more than 4 weeks old and nothing's been built from it, it's probably not getting built — archive it or re-prioritize.
- **Same commit as code:** as each approach ships, the corresponding spec section is updated to reflect "what we actually did" vs "what we planned."
- **Last updated:** 2026-05-13
