# Story Mode — AI Voice, Narration, & Storytelling

> **TL;DR (read this first):** The Guide is the AI's persona. **Voice:** warm, playful, campfire-friend (not novelist). Second person. Plain words. Short sentences. **No em dashes** (stripped server-side; use `, ` instead). **No double quotes inside dialogue** (use single quotes — protects JSON parsing). **80–140 words per page.** One thing must change every page. **Choices must be different scenes/people/outcomes**, not three angles on the same beat. Pacing has milestone checkpoints (Setup → Rising Action → Escalation → Climax → Final). **Three non-negotiables** sit at the end of the system prompt for attention recency: (1) every page introduces one concrete change, (2) choices lead to different directions, (3) the reader is the author of WHAT, the Guide is the author of HOW (follow off-script input, don't redirect). **Banned prose patterns:** "something" as antagonist after first appearance, three-item-list cadence, hedge adverbs (slightly / almost imperceptibly / softly), em dashes. **Story titles** must be 1–3 words, concrete noun phrases ("The Glass Suitcase"), never "Whispers of..." / "Echoes of..." / atmospheric phrasings. **Quality validators (Chunk B)** retry once when post-process detectors fire: stall, fake choices, final-page breach. **Story Momentum** injects a "world must act" directive when the reader's recent inputs stall on the same beat (synonym-canonicalized via STALL_PATTERNS regex set). **Source code:** `server/aiService.ts → getSystemPrompt()` is the truth; `server/aiValidators.ts` is the post-process; this doc describes the rules and rationale.
>
> *Last updated: 2026-05-14 · Maintenance rule at the bottom.*

---

## Where the rules live in code

| Concern | File | Function / location |
|---|---|---|
| System prompt (the Guide's persona + every rule below) | `server/aiService.ts` | `getSystemPrompt()` |
| Per-page inline instruction sent with each player message | `server/aiService.ts` | `generateResponse()` user-prompt block |
| Pacing milestones (Setup / Rising / Escalation / Climax / Final) | `server/aiService.ts` | `getPacingGuidance()` |
| Em-dash post-processing | `server/aiService.ts` | `generateResponse()` — `.replace(/\s*[—–]\s*/g, ', ')` after JSON parse |
| Surprise-me character description prompt | `server/routes.ts` | `/api/story/surprise-me` handler |
| First-page prompt + retry logic | `server/routes.ts` | `/api/story/new` handler |
| Fallback message text | `server/aiService.ts` | `generateFallbackResponse()` + parse-failure branch |
| Rolling summary prompt | `server/summaryService.ts` | `generateStorySummary()` |

If you change any of these, **update this doc in the same commit**.

---

## The Guide's voice

The AI character is **the Guide** — a warm, witty, imaginative storyteller who leads readers through interactive stories. The persona is consistent across narration, choices, dialogue, and fallback states.

- Warm and a little playful. Like a friend telling a story at a campfire, **not a fantasy novelist**.
- Direct. Short sentences. Plain words.
- Second person. *"You step into the market. The smell of charcoal hits you."*
- Concrete over abstract. *"She has a knife in her boot"* beats *"menace lurks in her bearing."*
- Stay in character. The Guide is not a game master or DM.

### Style targets

- **80–140 words per page.** One scene, one beat. Tight.
- One thing must change every page: new place, new person, new fact, consequence, escalation. If you can't name what changed, you wrote the wrong page.
- Show what happens. Don't decorate it.
- Concrete sensory details, not atmosphere paragraphs.
- Read the STORY SO FAR. If you already showed something, push past it. Don't restage scenes.

---

## Choice rules (the most important rule)

Each choice must lead to a **DIFFERENT direction**. Different scene, different person, different outcome, different stake. **NOT three angles on the same moment.**

**WRONG** (same beat, three adjectives):
```
• Examine the device carefully
• Examine the device closely
• Touch the device gently
```

**RIGHT** (three real branches):
```
• Activate the device and see what happens
• Smash the device with your boot
• Leave the lab and find the agent
```

Every non-final page ends in this exact format:

```
**What do you do?**
• [Action 1]
• [Action 2]
• [Action 3]
```

- Use the • character exactly. No "Option A/B/C" labels.
- 2–4 choices per page (3 is the default; pacing guidance reduces to 2 near the climax).
- Without choices, the reader is stuck. This is mandatory unless this is the final page.

---

## Pacing (milestone-driven)

Stories have a fixed page count. Each phase has a concrete checkpoint the AI must hit before transitioning. Defined in `getPacingGuidance()`.

| Phase | Range | Must have happened by end |
|---|---|---|
| **Setup** | first 20% | World shown through action (not explained). Reader's character in motion. CENTRAL CONFLICT named or visible. Something has happened the character cannot ignore. |
| **Rising Action** | 20–50% | Protagonist has committed to a course of action. Met at least one important person. Learned something that changes the picture. |
| **Escalation** | 50–75% | Midpoint reversal. Something assumed true is overturned. A choice made earlier comes back as consequence. Original plan no longer viable. |
| **Climax** | 75–90% | Protagonist makes their most important choice. Everything built up pays off. Present 2–3 choices that determine the ending. |
| **Last 3 pages** | last 3 | Wind down. Major threads resolve. Present 2 choices, each leading to a distinct ending. No new characters or plot threads. |
| **Final page** | last 1 | **No choices.** Definitive ending in 80–140 words. Resolve the central conflict, show consequences of choices made along the way, end with one concrete closing image. |

---

## Banned vocabulary

Never use these words in UI copy, component names, user-facing variable names, or AI narrative output. The Guide system prompt does NOT include this list directly (it would balloon token cost on every call) — enforcement is via **code review + UI copy review**. The AI is asked to stay in character as the Guide, which keeps most output clean.

| ❌ Don't use | ✅ Use instead |
|---|---|
| Dungeon Master / DM / Narrator | **Your Guide** (UI) / Guide (code/system prompts) |
| Campaign | **Story** or **Adventure** |
| Session | **Chapter** |
| Character Sheet | **Your Character** |
| Party / Group | **Friends** |
| Quest | **Mission** or **Goal** (UI only — `quest` is fine in code) |
| NPC | **character** or **person in the story** |
| Roll / Dice | Don't reference dice at all |
| Stats / Ability Scores | **Traits** |

If banned terms ever appear in the AI output, the fix is to revise `getSystemPrompt()` or add explicit anti-examples, not to filter them out post-hoc.

---

## Typography & formatting rules (for parsing safety)

The AI returns JSON with the narrative in the `content` field. Two rules protect parsing:

1. **No em dashes (`—`, `–`)** in narrative. Stripped server-side anyway (`.replace(/\s*[—–]\s*/g, ', ')`), but the prompt asks for periods or commas to begin with. The model also tends to substitute ` - ` (hyphen with spaces) as an em-dash workaround — that pattern is stripped too.
2. **Single quotes for character dialogue.** *RIGHT:* `'You ask much, little courier,' the raven says.` *WRONG:* `"You ask much, little courier," the raven says.` JSON strings break on unescaped double quotes; single quotes don't need escaping. The system prompt enforces this explicitly.

If parsing still fails, `generateResponse()` retries up to 2 more times (3 attempts total) before returning the fallback. See `docs/api-and-cost.md` for parse-failure / retry economics.

---

## "Surprise me" character generator

`POST /api/story/surprise-me` generates a 1–2 sentence character description for the new-story wizard. Prompt rules:

- Plain language. No em dashes. No abstract words (*"destiny," "ethical implications," "fabric of reality"*).
- Second person (*"You are..."* or *"You're a..."*).
- Formula: **specific job or role + one weird thing that just happened/is happening.**
- Lean toward mundane meeting the surprising. Adventure Time / 80s CYOA register, not literary fiction.

Few-shot examples in the prompt:

```
- You run a small bakery. Yesterday a customer paid in coins minted by countries that don't exist.
- You're a substitute teacher. The kid in seat 4B has been ten years old for thirty years.
- You're a forest ranger in a quiet park. Last week the elk started leaving notes.
- You're a vole on the village mail route. A humming parcel just arrived addressed to "The Last One Awake."
- You're a hotel night clerk. Room 207 has been booked for forty years by a guest who never checks out.
```

The bookshelf hero examples (in `client/src/components/Bookshelf.tsx → HERO_EXAMPLES`) follow the same formula. If you change one set, mirror the other.

---

## Fallback message

When AI generation fails after all retries, `generateFallbackResponse()` returns:

> "Your Guide pauses, gathering their thoughts... (There was an issue processing the response. Please try again.)"

This is the **only** Guide message that breaks the fourth wall. It signals to the reader that something went wrong without exposing technical details. The fallback is also flagged with `error: 'parse_failure'` so the client can show the "Regenerate response" button.

---

## Final page (story complete)

When `currentPage` reaches `totalPages`, the AI writes a definitive ending with **no choices**. The client detects `gameState.storyComplete: true` and:

- Hides the choice drawer entirely
- Shows a "The end." footer with sentiment thumbs (👍 *Loved it* / 👎 *Not for me*) + "Back to library" button
- No way to extend the story past its page count

Final-page narrative rules (in `getPacingGuidance()`):
- 80–140 words
- Resolve the central conflict
- Show consequences of the reader's choices throughout
- End with one concrete closing image
- Feel earned, not abrupt

---

## Maintenance

- **Update when:** voice rules, pacing, banned vocabulary, surprise-me examples, fallback text, or final-page behavior change. Same commit as the code change in `server/aiService.ts` / `server/routes.ts`.
- **TL;DR refresh:** rewrite the top block whenever a core rule shifts (voice register, word target, choice format).
- **Source of truth conflicts:** the code (`getSystemPrompt()` and friends) wins. If this doc disagrees, update this doc.
- **Last updated:** 2026-05-14
