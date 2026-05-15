# Story Mode — Milestone History

> **TL;DR (read this first):** Live at mystorymode.com on **v1.9.4**. Milestones 1–5 shipped pre-launch (Foundation → AI Memory → Page Structure pivot → Pacing → Polish & UX Overhaul). Pre-launch audit Phases 1–5 (2026-05-11). **Active milestone:** Milestone 6 (Guide chatbot) — partial via v1.8.1's hardcoded Q&A drawer; the AI-powered intent matcher + `POST /api/guide/chat` endpoint are still TODO. **Most recent meaningful push:** the 2026-05-15 audit is shipping in risk-isolated PRs — A1 (v1.9.3) + A2 (v1.9.4) so far. Full version-by-version detail in the "Completed Milestones" entries below.
>
> *Last updated: 2026-05-15 · Maintenance rule at the bottom.*

---

## Current Milestone

### Milestone 6: Your Guide — Interactive Chatbot

**Goal:** Turn the static Guide mascot on the bookshelf into a real conversational character that helps users navigate, get inspired, and resolve common intents (resume, start new, delete, explain, etc.) — falling back to AI for freeform questions.

#### Shipped (partial progress — pivoted from the original plan)

The original Milestone 6 plan called for a slide-up `GuideChat.tsx` modal triggered by tapping the Guide avatar. Through v1.8.x we instead landed on the **sticky-drawer pattern** — the same drawer affordance now appears on every screen (bookshelf, wizard, in-story), so the chatbot uses an interaction grammar the user already knows from elsewhere in the app rather than introducing a fourth modal model. Several Milestone 6 outcomes already ship in production:

- **Bookshelf drawer Q&A (v1.8.1)** — sticky drawer at the bottom of the bookshelf. Peek copy "What do you want to do?". Expanded: primary CTA "Start a New Story" + two `ChoiceButton`s ("Tell me how this works", "What kinds of stories?"). Tapping a question appends a `PlayerBubble` + a hardcoded Guide reply to the scroll area above. Q&A history is ephemeral per visit.
- **Wizard drawer Q&A (v1.8.2, v1.8.4, v1.8.6)** — same pattern on Step 1 (AI-generated character suggestions via `/api/story/surprise-me?count=3`) and Step 2 ("Tell me about these lengths" + "Can I keep going after a story is done?" with canned replies; the CTA bubble "How long should your story be?" auto-re-appends after every reply so the call to action stays at the bottom).
- **Shared Guide primitives (v1.8.0–v1.8.1)** — `GuideBubble`, `PlayerBubble`, `ChoiceButton`, `TypingDots`, `CenteredHeader`. The interaction grammar for the chatbot is now consistent everywhere the Guide speaks.
- **Bookshelf greeting + state-aware copy (v1.7.4–v1.7.5)** — `getGreeting()` in `Bookshelf.tsx` produces 10 state-aware Guide bubbles personalized on most-recent story title, with a 12h "Welcome back" gate and length-tier-up suggestion. This is the Guide already speaking to the user; the chatbot just turns it bidirectional.
- **Foundation components (pre-milestone, still available)** — `GuideConfirmDialog.tsx` (confirmation modal) and `GuideStoryCard.tsx` (story info card with genre badge + progress bar). Not currently wired into the drawer flow; can host the story-action intents (resume / delete / reset) when those land.

#### Remaining

1. **AI fallback endpoint** — `POST /api/guide/chat` with a short Guide-specific system prompt (~200 tokens, "helpful librarian" persona). Lightweight Haiku call (~$0.001–0.002 per interaction), no `x-story-id` required since it's a bookshelf-context helper. Spend tracking via the existing `spendTracker.trackRequest` path; per-call `ai_call` event_log row matches the v1.9.0 attribution shape.
2. **Freeform input on the bookshelf drawer** — currently the drawer only exposes two `ChoiceButton`s. Add an always-visible text input (mirroring the in-story drawer's "I have something else in mind…" field). Tapping send routes through (3).
3. **Client-side intent matcher** — keyword match the freeform input against canned intents first (resume, new story, delete, help, reset). On match: surface the appropriate confirmation flow using `GuideConfirmDialog` + `GuideStoryCard` (already built). On no match: forward to the AI endpoint from (1).
4. **Story-action canned intents in the drawer** — add "Continue last story" (jump to most-recent active), "Delete a story" (with `GuideConfirmDialog` + `GuideStoryCard`), "Reset everything" (clear session) as drawer `ChoiceButton`s alongside the existing two. Also closes the no-delete-UI gap that's been on the backlog since pre-launch.
5. **Decide: ephemeral vs persistent thread.** Currently the drawer Q&A is ephemeral per bookshelf visit. The AI freeform path needs a decision: ephemeral (matches today's pattern) or persistent in localStorage / DB with a cap (e.g. last 10 messages). Lean ephemeral until there's a reason — it's the simpler shape and matches user expectation set by v1.8.x.

#### Out of scope (explicitly deferred)
- Guide appearing during active stories (the in-story drawer is a different surface)
- Voice / audio narration
- Guide avatar customization
- Cross-session memory of prior Guide conversations

---

## Completed Milestones

### Audit 2026-05-15 PR-A2: story-scoping POST/DELETE guards (2026-05-15) — v1.9.4 ✅

Defensive `400 Missing x-story-id` guard added to three routes that previously accepted the request even without the story-scoping header. No client today calls these without the header — pure hardening against a future caller (or accidental curl) that forgets it.

- **POST `/api/quests`** (`server/routes.ts:811`) — guard above the existing Zod parse.
- **POST `/api/messages`** (`server/routes.ts:963`) — guard above the timestamp build.
- **DELETE `/api/messages`** (`server/routes.ts:986`) — guard above `clearMessages(sessionId)`. Note the underlying storage method is still session-wide (clears all stories for the session); the guard at least requires the caller to claim a story context. PR-B revisit should either scope the wipe to storyId or remove the endpoint.

**Not in scope:** POST `/api/items` — deferred to PR-B alongside the items keep-or-delete decision (#4).

### Audit 2026-05-15 PR-A1: correctness + a11y + sanitization (2026-05-15) — v1.9.3 ✅

First ship out of the 2026-05-15 audit (see `docs/specs/audit-2026-05-15.md`). Five risk-low findings bundled because they share a smoke-test profile (deterministic, no AI or CSP changes): the queryKey caching bug, error-envelope normalization, Zod-error sanitization, reduced-motion respect, and aria-labels on the two unlabeled inputs.

**Findings shipped:**
- **#1 — `/api/character` queryKey adds `activeStoryId`.** `client/src/App.tsx:63`. Sibling queries (`messages`, `game-state`, `quests`) already keyed on storyId; character did not. Switching stories briefly bled the previous story's character into the new view. Same bug class as v1.8.7 with smaller blast radius. One-line fix; new cache entry per story so each first-entry re-fetches cleanly.
- **#21 — Normalize error envelope to `{ error: "..." }`.** `server/routes.ts:500, 668, 760, 766` — dropped `success: false` from the four error responses that had it. Success responses left alone (would have broken `NewStoryCreation.tsx:138` which reads `data.success` from the surprise-me success path).
- **#25 — Sanitize Zod error details.** Added `sanitizeZodIssues()` helper in `server/routes.ts:289` that strips Zod's internal `code`/`expected`/`received` fields, keeping only `{ field, message }`. Applied to all 9 sites that previously leaked `result.error.errors`. No client consumed the raw shape, so transparent change.
- **#30 — `prefers-reduced-motion` reset.** `client/src/index.css:323` adds `@media (prefers-reduced-motion: reduce)` that collapses every animation + transition to 0.01ms. Fixes WCAG 2.3.3 for the Guide bounce, typing dots, slide-ups. Global with `!important`; nothing in the app needs an exemption today.
- **#31 — `aria-label` on the two unlabeled inputs.** `ChatInterface.tsx:861` ("Tell the Guide what you do next") and `NewStoryCreation.tsx:312` ("Describe who you are in this story"). Placeholder text isn't a label per WIG.

**What's still in the audit pile:** PR-A2 (POST guards), PR-C (doc drift), PR-A3 (AI prompt hygiene + playtest), PR-A4 (CSP isolated), PR-D (perf + pagination + token pruning), PR-B (items decision), PR-E (migration journal). Ship order in `docs/specs/audit-2026-05-15.md`.

### Admin AI-model toggle: Haiku ↔ Sonnet at runtime (2026-05-14) — v1.9.0 ✅

Two-button toggle in the admin dashboard that flips the active AI model without a redeploy. Motivated by the monetization conversation — Sonnet's quality gap is real and the PM wanted a fast way to A/B the two on a live audience without coordinating a Render env-var flip + restart cycle.

**DB layer.** New migration `010_app_config.sql` adds an `app_config` table — generic key/value store (`key text PRIMARY KEY, value text NOT NULL, updated_at, updated_by`). Currently the only row is `(key='active_model', value='haiku' | 'sonnet')` but the table is generic so future runtime toggles (kill switches, feature flags) reuse the same surface instead of accumulating one-table-per-toggle. Drizzle definition in `shared/schema.ts` as `appConfig`; storage methods `getConfig(key)` and `setConfig(key, value, updatedBy?)` in `dbStorage.ts` (upsert via `onConflictDoUpdate`).

**Resolver layer (`server/aiModel.ts`).** Updated resolution chain:
1. Dev `X-Test-Model` header (unchanged, non-prod only)
2. **Admin runtime override (NEW)** — module-level `_adminOverride` variable, loaded once at boot via `loadAdminModelOverride(storage)`, updated synchronously inside the admin POST handler via `setAdminModelOverride(value)`
3. `AI_MODEL_OVERRIDE` env var (unchanged, sysadmin fallback)
4. `DEFAULT_MODEL = "anthropic/claude-3.5-haiku"` (unchanged)

Stored value is the alias (`'haiku'`/`'sonnet'`), not the full OpenRouter ID — that way bumping `MODEL_ALIASES.sonnet` to a newer Sonnet release automatically updates what live admin overrides resolve to. The resolver's existing `aliasToId` translation handles it.

**Boot wire-up.** `server/index.ts` calls `await loadAdminModelOverride(storage)` immediately after `testConnection()` succeeds. Silent failure leaves the cache at `null` and falls through to env/default; admin can re-flip once the DB recovers.

**Per-call attribution.** Two new event types in `server/eventLog.ts`:
- `ai_call` — fired from `/api/ai/chat` and `/api/ai/quick-action` after every successful AI response. Properties: `{ model, endpoint, promptTokens, completionTokens }`. Lets admin aggregate "last 7 days: X Haiku calls, Y Sonnet calls" with a simple GROUP BY on `properties->>'model'`.
- `admin_model_override_set` — fired on every flip. Properties: `{ from, to }`. Audit trail for "who set what when".

**Admin endpoints.** Both gated by existing `adminAuth` middleware (TOTP 2FA from v1.7.0):
- `GET /api/admin/model-override` returns `{ stored, resolved, aliases }` — `stored` is the alias in DB (or `null`), `resolved` is the full OpenRouter ID resolveModel would currently pick, `aliases` is the list of accepted values for the toggle UI.
- `POST /api/admin/model-override` takes `{ model: 'haiku' | 'sonnet' }`. Validates against `MODEL_ALIASES` keys; anything else 400s. On success: `storage.setConfig(...)`, `setAdminModelOverride(...)`, log audit event, return new `{ stored, resolved }`.

**Admin UI (`AdminDashboard.tsx`).** Small card sits between the Spend Metrics grid and the Token Usage block. Shows the currently-resolved model + the stored alias (or "using server default"), two buttons (Haiku, Sonnet) with the active one highlighted, inline "Saving…" indicator, error surface if the POST fails. Fetched alongside the other admin stats and refreshed on the existing 30s poll.

**Cost watchout (documented).** Sonnet is ~10–15× more expensive than Haiku per `docs/api-and-cost.md`. The $10 daily cap and warning threshold ($8) are unchanged; with Sonnet active the cap is hit much faster, but the spend tracker's behavior is identical regardless of model. Admin can see the resolved model up top of the card and on the spend monitoring rows.

**Out of scope for this milestone:** per-tier routing (e.g. shorts on Haiku, novels on Sonnet) — the file header comment in `aiModel.ts` calls it out as the next step on this seam. A/B split is also future work; the toggle is global today.

### Fix: new-story optimistic flow bled messages from previous stories (2026-05-14) — v1.8.7 ✅

**Symptom:** tapping Begin on Step 3 of the new-story wizard dropped the user into a view that showed messages from one of their previously-read stories for the 5–10s window while the new story was being generated, then snapped to the new story when the API returned.

**Root cause:** the optimistic-navigation flow introduced in v1.8.0 renders the game view as soon as Begin is tapped — *before* the `POST /api/story/new` call returns. During that window, `activeStoryId` is still `null` (only assigned by `enterStory()` after the API response). The story-scoped `useQuery` for `/api/messages` in `App.tsx` then fired with key `['/api/messages', null]` and the queryFn sent `fetch('/api/messages')` with no `x-story-id` header. Server-side `getMessages(sessionId, storyId?)` in `dbStorage.ts` does `if (storyId) conditions.push(...)` — when `storyId` was undefined, the filter was simply dropped and the query returned every message in the session across every story. Whichever existing story had the most messages dominated the view until `enterStory(newId)` finally fired.

**Client fix (`App.tsx`):** four story-scoped `useQuery` calls (`/api/character`, `/api/messages`, `/api/game-state`, `/api/quests`) now have `enabled: !!activeStoryId`. During the optimistic window the queries don't fire at all; ChatInterface gets `messages = []` and renders only the `pendingPlayerMessage` bubble + `TypingDots`. Once `enterStory(newId)` runs after the API returns, `activeStoryId` becomes truthy, the queries become enabled, and they fetch the real story's data.

**Server defensive audit (`server/routes.ts`):** every route that reads `x-story-id` now early-returns when the header is missing, so this bug class can't recur from any client mistake:
- **GETs return empty:** `/api/character` → `null`, `/api/quests` → `[]`, `/api/items` → `[]`, `/api/messages` → `[]`, `/api/game-state` → `null`.
- **Writes return 400:** `PATCH /api/game-state`, `POST /api/ai/chat`, `POST /api/ai/quick-action`. Without a storyId the underlying storage methods would have either updated every gameState row in the session (PATCH) or created orphan messages without a storyId (POSTs); refusing explicitly is safer than silent fall-through.

The storage methods themselves still accept an optional `storyId` for internal callers (admin tooling, summary service), so the storage-layer signature didn't change.

### Step 2 Q&A wipes on re-entry + CTA re-ask after every reply (2026-05-14) — v1.8.6 ✅

Two small behavior tweaks on the Step 2 chat after testing v1.8.5 showed two related awkwardnesses: returning to Step 2 from Step 3 left a wall of stale Q&A, and the user could scroll past the original "How long should your story be?" question without the Guide re-orienting them back to the decision.

**Wipe on re-entry:** new `useEffect(() => { if (step === 2) setStep2Qa([]); }, [step])`. Every transition INTO Step 2 (from Step 1 via Next, from Step 3 via back, from Step 3 via the "Length" edit-back ChoiceButton) clears the Q&A history. First entry is a no-op since `step2Qa` is already empty. The Q&A is positioned as a momentary aside, not a persistent thread.

**CTA re-ask:** `addStep2Qa` now appends a third bubble after the player question + Guide answer — a fresh Guide bubble whose content is just "How long should your story be?". The pattern in the chat area becomes:

```
[player Q] → [Guide answer] → [Guide CTA: "How long should your story be?"]
```

The top Guide bubble (prompt echo + "How long…?") still anchors first-load visibility; the bottom CTA bubble is the scroll-anchored repeat so the most recent message is always the call to action. After a user taps both canned questions in sequence they end up with three Guide CTA bubbles in the thread, which intentionally reinforces "OK but seriously, pick a length."

### Step 2 length tiles anchored + centered copy + pages/time on one line (2026-05-14) — v1.8.5 ✅

Two follow-ups to v1.8.4's smaller-tile pass, after testing showed the tiles still scrolled out of view when the Guide Q&A history accumulated below them.

**Anchored tiles:** the length tiles moved out of the scrolling content area into a `shrink-0` slot directly below the header — same pattern as the Bookshelf shelf section that landed in v1.8.2. The Guide bubble (recap + length question) and the Q&A history now scroll independently below the tiles. The user can ask "Tell me about these lengths" or "Can I keep going after a story is done?" and read the answer without losing visual context of the choice they're about to make.

Steps 1 and 3 keep their existing single-scroll layout: Step 1 has no Q&A growing beneath its action, and Step 3 has no Q&A at all (its drawer is the "Need to change anything?" edit-back menu, which doesn't append to the chat area). Anchoring them would have been visual symmetry for its own sake.

**Tile copy refinement:**
- `text-left` → `text-center` so the label/info column reads as a unit.
- Two info lines collapsed to one: `25 pages   ~15 min` (two info points separated by `&nbsp; &nbsp;` on a single `<p>`). Saves another row of vertical height on every tile and reads as a single fact instead of a stat sheet.

### Bookshelf default-tab fix + wizard layout swap + smaller length tiles + new canned Q&A (2026-05-14) — v1.8.4 ✅

Four small refinements to the v1.8.x surface, bundled because they all landed in the same review pass.

**Bookshelf default tab:** initial `activeTab` is now hardcoded to `"reading"` instead of a lazy initializer that read from `stories`. Fixes a bug where `stories=[]` on mount (React Query data in flight) caused the initializer to pick the lowest-priority non-empty bucket; the auto-switch effect only fires when the *current* tab becomes empty, so users could land on Archive even when Currently Reading had content. The existing fall-through effect handles the edge case where Currently Reading is genuinely empty once stories load (falls through to Finished, then Archive).

**Wizard layout swap:** the Guide bubble moved from the top of each step's scroll area to *below* the action. Mirrors the Bookshelf's "shelf above, Guide chat below" pattern so the wizard reads with the same visual grammar as the library page.
- Step 1: `[Textarea] → [counter] → [Next button] → [Guide bubble: "Describe who you are…"]`
- Step 2: `[Length tiles] → [Guide bubble: prompt echo + "How long…?"] → [Q&A history]`
- Step 3: `[Begin button] → [Guide bubble: recap]`

Guide bubble on Step 2 now leads with the user's prompt rendered italic + foreground color (book-title convention, same as Step 3) before the length question — so the user sees what they're committing to before picking length.

**Smaller length tiles:** 2×2 grid stays, but each tile is now compact. Single-line stacked layout (label / pages / time), left-aligned, no giant page number, `px-3 py-2.5` padding. Saves ~60–80px of vertical space below the tiles. Tap target still ≥44px.

**Step 2 drawer revamp:**
- Peek copy changed from "What do you want to do?" to "Need suggestions?" (consistent with Step 1).
- New second canned `ChoiceButton`: "Can I keep going after a story is done?" with a hardcoded Guide reply ("Once a story reaches its ending, that one's wrapped. I write a final page and the book closes. If you want more room to roam, pick a longer length next time. A novella, novel, or epic gives the world more time to breathe.") — nudges length-tier-up at the moment the user is picking length.
- Refactored the Q&A handler into a single `addStep2Qa(question, answer)` helper since there are now two canned options sharing the same flow.

### Wizard Step 3 confirmation page (2026-05-14) — v1.8.3 ✅

Same-day iteration on v1.8.2 after testing showed the auto-submit-on-length-tap was too abrupt — the user wanted a beat to confirm before the 5–10s AI call kicked off.

**New Step 3:** Tapping a length on Step 2 no longer fires `onStartStory` directly; it advances to a confirmation page. The Guide bubble recaps: *"Great choices! Your prompt: [description] [length label, pages, time] Ready?"* — prompt rendered italic + foreground color for emphasis (matches the book-title convention used elsewhere in the Guide voice). Below the bubble: a single primary "Begin" button that fires the actual start.

**Drawer on Step 3:** Peek copy is "Need to change anything?" — expanded shows three `ChoiceButton`s: **Length** (→ Step 2), **Prompt** (→ Step 1), **Start over** (clears both fields + the Q&A history + the suggestion cache, returns to Step 1). Back button on Step 3 returns to Step 2 instead of exiting the wizard. Step dots become 3 (was 2).

### Bookshelf anchored shelf + wizard step swap + drawer on both wizard steps (2026-05-14) — v1.8.2 ✅

Three layered changes plus a backend tweak for the suggestion surface.

**Bookshelf layout:** The shelf section (wooden lines + tabs + book spines) moved out of the scrollable area into a fixed slot directly below the header. The chat area (welcome bubble + Q&A) now scrolls independently below the shelf — as the user scrolls through Q&A history, the chat content disappears past the bottom edge of the shelf, which stays anchored. Reads more like a chat thread with the shelves as a persistent reference.

**Wizard step swap:** Step 1 is now character description, Step 2 is now length. Tapping a length on Step 2 auto-submits at this version (replaced in v1.8.3 with a Step 3 confirm).

**Wizard drawers:** Both wizard steps now have the sticky drawer affordance. Step 1's drawer peek is "Need suggestions?" — when first opened, lazy-fetches 3 AI-generated character descriptions and renders them as `ChoiceButton`s. A regenerate icon at the top of the drawer pulls a fresh batch. Tapping a suggestion fills the textarea and closes the drawer. The inline "Surprise Me" button is removed. Step 2's drawer peek is "What do you want to do?" — expanded shows one `ChoiceButton`, "Tell me about these lengths"; the Guide replies in a bubble explaining short / novella / novel / epic.

**Backend:** `/api/story/surprise-me` now accepts `?count=N` (1–5; default 1 for backwards compat) and returns `{ descriptions: [...] }` when count>1. Single AI call producing N distinct descriptions — the prompt explicitly tells the model to span different vibes/settings so the user gets meaningful variety, not three takes on the same archetype. Legacy `count=1` shape preserved.

### Bookshelf as a conversation: tabbed shelves + sticky drawer + shared primitives (2026-05-14) — v1.8.1 ✅

Restructure of the Bookshelf around the same interaction grammar as the in-story chat — partial progress toward Milestone 6 (the Guide chatbot), implemented with hardcoded canned responses for now.

**Layout:** header → wooden shelf line → tabs (Currently Reading | Finished | Archive — only the tabs with content show) → book spines for the active tab → wooden shelf line → Guide welcome bubble → ephemeral Q&A history → sticky drawer at the bottom. Tabs default to whichever bucket has content. Auto-switch tabs when the current one empties (e.g. archiving your last active story). Empty-state (no stories anywhere) hides the entire shelf section entirely so first-visit users see just the Guide pitch + drawer.

**Drawer:** Mirrors the in-story drawer's peek/expand pattern. Peek copy is "What do you want to do?" — companion to in-story's "What happens next?". Expanded options: primary CTA "Start a New Story" (green, fills width) + two `ChoiceButton`s ("Tell me how this works", "What kinds of stories?"). Tapping a `ChoiceButton` appends a `PlayerBubble` + a Guide reply to the scroll area above; drawer collapses. Q&A responses are hardcoded help copy (not AI-generated — the AI Guide chat is still the unstarted Milestone 6 work). Q&A history is ephemeral — resets every time the Bookshelf remounts (i.e. every visit from a story).

**Two new shared primitives:** `ChoiceButton.tsx` (outline button, single visual primitive for "pick one of these" across the app — also adopted in the in-story drawer) and `PlayerBubble.tsx` (right-aligned bubble — also adopted for the in-story player messages and the optimistic new-story bubble). Teaches users the affordance once; they recognize it everywhere.

**Removed from the Bookshelf:** the "Your Library" label + black divider, the inline "Start a New Story" button (moved into the drawer), the Need-a-Spark collapsible section (subsumed into the drawer's broader question), the standalone "+" decoration shelf, and the dropdown "Show Archive" toggle (Archive is now a tab when there's content).

### Texting-app UX pass + shared Guide-surface components (2026-05-14) — v1.8.0 ✅

Minor bump because the new-story flow now feels meaningfully different. Three new shared components, an optimistic flow change, and a Bookshelf cleanup.

**Three new shared components** under `client/src/components/`:
- `GuideBubble.tsx` — wraps the avatar-above + left-aligned-bubble pattern used everywhere the Guide speaks (bookshelf hero, both wizard steps, in-story AI pages, the typing indicator).
- `TypingDots.tsx` — iMessage-style three-dot indicator with a staggered CSS keyframe (`@keyframes typing-dot` in `index.css`). Replaces the old "Your Guide is thinking…" text card wherever the Guide is generating.
- `CenteredHeader.tsx` — 3-column grid (`44px | 1fr | 44px`) used by the Bookshelf, `NewStoryCreation`, and `ChatInterface` top bars. Title is center-aligned per the design-system convention. Bookshelf "Story Mode" title now uses Cinzel (the hero font).

**Optimistic new-story flow:** Tapping Begin Story navigates to the game view immediately. The character description renders as a right-aligned player bubble, the Guide's typing dots show below it, and when the API returns the real conversation fills in. No more blank "loading" screen during the 5–10s first-page generation.

**Auto-scroll changed:** On a brand-new story (messages ≤ 2) the chat stays at the top so the user reads their own prompt before the Guide's reply, texting-style.

**Bookshelf restructure (pre-v1.8.1 cleanup):** "Your Library" moved below the Guide greeting and centered above a horizontal divider. Continue-X module deleted (Guide already names the most-recent story). Font-size dropdown removed from the Bookshelf (was broken — Tailwind text classes overrode the container style; per design-system, font scaling is a story-screen affordance). `NewStoryCreation` header centered; "Step 1 of 2" text replaced with a two-dot indicator (filled = current).

### Bookshelf Guide revoiced: welcome-back gate + length suggestions (2026-05-14) — v1.7.5 ✅

Iteration on v1.7.4 after testing showed the copy started with bare numbers ("4 finished, 2 in the archive.") and over-used the "Last time we were in X" opener. Revoiced toward the user's example pattern: warm opener (when earned) → plain-language state description → concrete options inline ("Want to jump back in, pick up another, or start something new?"). Terminology: *ongoing*, *finished*, *in the archive* — never just "shelf".

**Three structural changes:**
- **"Welcome back." gate** — prefix prepended to states 3–10 only when 12+ hours have passed since we last greeted this user. Rolling window stored in `localStorage.lastWelcomeAt`.
- **Length-tier-up suggestion in state 9** — if every completed story is the same length AND that length isn't epic, the Guide suggests the next tier ("Ready for another? Maybe try a novella this time."). Mixed-length history → no suggestion.
- **State 8 split into 8a (1 active + N completed) and 8b (2+ active + N completed)** to avoid the "1 ongoing" phrasing awkwardness; 8a now leads with "You're partway through X."

Action verbs are now consistent across states: *jump back in* (resume most recent), *pick up another* (switch to a different active story, only in states with 2+ active), *start something new* (open the wizard).

### Bookshelf Guide copy: 10 states, personalized (2026-05-14) — v1.7.4 ✅

`getGreeting()` in `Bookshelf.tsx` expanded from 4 conditional branches to 10. New states distinct on (active count × completed count × archive presence × progress%): first visit, empty-but-archived, one-in-progress (3 progress sub-variants), multiple-in-progress, active-plus-completed mix, all-completed-no-archive, all-completed-plus-archive. Active-story states personalize via `"Last time we were in <em>{recentTitle}</em>…"` where `recentTitle = activeStories[0].storyTitle` (sorted most-recent first, same source as the Continue CTA).

Fixed two existing bugs: (1) state 8's "1 story in progress and 1 finished" hardcoded singular, (2) empty-active+archive state falling through to "You've finished 0 stories!" Pluralization uses word "one" for n=1 and digit for n≥2 — reads warmer than "1 story" mid-sentence. Voice matches `docs/ai-voice.md`: warm, campfire-friend, second person, no exclamation points except the first-visit welcome.

**Known limitation:** can't distinguish a true first visit from a returning user who deleted everything — both fall through to the first-visit pitch. Differentiating would need a `GET /api/stories/recently-deleted` endpoint; deferred.

### Avatar above bubble across all three Guide surfaces (2026-05-14) — v1.7.3 ✅

Follow-up to v1.7.2 after the avatar-beside-bubble layout proved too narrow for long-form prose. The Guide avatar now sits on its own line ABOVE the bubble (left-aligned), with the bubble below also left-aligned, giving the prose more horizontal room. Applied consistently across all three Guide surfaces so the conversation reads continuously: in-story AI pages (`ChatInterface.tsx`), bookshelf hero greeting (`Bookshelf.tsx`), and both new-story wizard steps (`NewStoryCreation.tsx`).

In-story bubble max-width bumped 82% → 88% since it's no longer competing inline with the avatar. Dropped the asymmetric `2px 16px 16px 16px` border-radius "tail" on the hero/wizard bubbles in favor of uniform `rounded-2xl` — matches the in-story bubbles for visual consistency. Player message layout unchanged (still right-aligned bubble, no avatar).

### In-story texting layout: bubbles, alignment, avatar, always-visible input (2026-05-14) — v1.7.2 ✅

Extends the Guide-as-messenger pattern from v1.6.0's bookshelf + wizard into the story reading view, going past a conservative "just add avatar" first cut into a full iMessage-style asymmetric layout.

**AI pages:** small `GuideAvatar` (28px) on the left + left-aligned bubble (`bg-muted/50`, `rounded-2xl`, max-width 82%) keeping Crimson Pro `story-prose`.

**Player messages:** right-aligned bubble (`bg-primary/10`, `rounded-2xl`, max-width 82%), no avatar — alignment is the directional cue. Dropped the "Your Guide" / "You" badge pills since avatar + alignment make them redundant. Timestamp + regenerate moved below the bubble, aligned to the bubble's edge so the bubble itself stays uncluttered. The "Your Guide is thinking…" loading bubble matches the AI layout. Palette stays muted — not iMessage-bright — so it reads as conversation without losing the book aesthetic.

**Custom input collapsed** from a two-state button-then-input into one always-visible field with `"I have something else in mind…"` as the italic placeholder. `showCustomInput` state removed.

Forward direction noted: the user is interested in eventually wiring this UI to real SMS so the conversation can feel actually real.

### Per-tab AI model override for Sonnet vs Haiku testing (2026-05-14) — v1.7.1 ✅

Dev-only infrastructure for the deferred Sonnet 2-cell comparison from `docs/specs/ai-quality-pass-plan.md`. Visiting `localhost:3000/?testmodel=sonnet` (or `haiku`, or a full OpenRouter model ID like `anthropic/claude-sonnet-4`) stores the override in that tab's `sessionStorage` and attaches an `X-Test-Model` header to every API request. Two Safari tabs in the same window can now run different models side-by-side because `sessionStorage` is per-tab.

Server-side `resolveModel()` lives in new `server/aiModel.ts` (single seam — `DEFAULT_MODEL` + `MODEL_ALIASES` + the priority chain: dev header → `AI_MODEL_OVERRIDE` env → default). **Production gated:** `NODE_ENV !== 'production'` is enforced server-side so the header is ignored on Render even if sent. New `AI_MODEL_OVERRIDE` env var also added in case we ever want to flip the production default model without a code change.

Floating "test: sonnet" badge in the corner of any tab with an active override so it's obvious which tab is which during a comparison. Also added a tiny `client/src/lib/testModel.ts` utility for URL-param parsing + sessionStorage I/O + URL cleaning.

### Admin URL + error messaging + TOTP 2FA (2026-05-14) — v1.7.0 ✅

Three changes to the admin login.

**Dropped the `?admin=1` query-string gate:** the dashboard now lives at plain `/admin`. Obscurity wasn't real protection; the server-side `ADMIN_KEY` timing-safe compare is the real lock.

**Production-ready error messaging:** replaced the generic "Failed to fetch stats" client error with three concrete states — 401 collapses to "Invalid credentials" (no leak of which factor failed), other non-OK responses surface the server's actual `error` JSON field, `fetch()` throwing shows "Couldn't reach the server". Root cause that surfaced the fix: `ADMIN_KEY` wasn't set in Render production env, server was returning 503, client was hiding the message. `ADMIN_KEY` now set in Render.

**TOTP-based 2FA.** New `server/adminAuth.ts` is the single seam for all admin verification (top-of-file comment documents the future multi-admin DB migration path — when we go multi-admin, only this one file changes). Login form takes a 6-digit code from any TOTP app (1Password recommended) alongside the secret key. New `scripts/gen-admin-totp.ts` generates the secret + prints a QR. Both `ADMIN_KEY` and `ADMIN_TOTP_SECRET` env vars are required for the dashboard to function; missing either → 503 "Admin auth not configured on server". Deps: `otplib` (runtime), `qrcode-terminal` + `@types/qrcode-terminal` (dev). Operational step before deploy: run the gen script locally → scan into 1Password → paste secret into Render env.

### Guide-chat wizard + universal sparks + in-story header + simplified titles (2026-05-13) — v1.6.0 ✅

Five surface changes pulling the new-story wizard, the bookshelf, and the in-story header into a more cohesive "the Guide is always the one talking" pattern, plus a long-needed fix to AI-generated title quality.

**Guide-chat wizard:** Both steps of `NewStoryCreation.tsx` now use the same `GuideAvatar` + chat bubble visual that the empty-shelf hero uses. Step 1's question ("How long should your story be?") and Step 2's question ("Describe who you are in this story.") are both spoken *by the Guide*, in a bubble with the Guide's avatar to the left. The previous Card-with-CardTitle layout is gone — the wizard now matches the bookshelf's open layout. Step indicator replaced with a "Step X of 2" caption next to the back arrow. Info popover on Step 2 removed since the Guide bubble is the question.

**Universal collapsible sparks:** `Bookshelf.tsx` previously had two spark surfaces — an always-visible "Need a spark? Tap one to start." block in the first-visit hero, and a collapsible "Need a spark?" toggle on populated shelves. The first-visit hero block is deleted; the collapsible is now the only spark surface and renders universally regardless of whether stories exist. Default state: closed in all states. "Start a New Story" button also lifted out of its `stories.length > 0` conditional and now renders universally as the primary CTA right after the Guide bubble.

**In-story header redesign:** `ChatInterface.tsx` top bar was a fixed `h-12` flex with "Story Mode" (left) + "Page X of Y" (center) + avatar (right). Replaced with a `grid-cols-[44px_1fr_44px]` layout: 44px spacer on the left (mirrors the avatar's footprint to keep the title centered), centered title block, avatar dropdown on the right. Title renders as `${storyTitle || "Story Mode"} (currentPage/totalPages)` with page count in muted color inline. Title is two-line capable via `break-words leading-snug`, no truncation, centered both lines. Header height is now content-sized (~48px for short titles, taller for long 2-line titles) instead of fixed.

**Simplified AI title generation:** The title prompt in `server/routes.ts` (the `/api/story/new` first-page generation) previously asked for "a short, evocative title (2-5 words). Make it atmospheric and unique, not generic." This consistently produced purple titles like "Whispers of the Familiar" / "The Last Awakening." Rewritten to demand 1–3 words, concrete noun phrase, with explicit good examples ("The Glass Suitcase", "Talking Cat", "The Vault Door") and explicit anti-patterns ("Whispers of...", "Echoes of...", "Beneath the X"). "Direct beats evocative every time."

### Admin polish + welcome copy (2026-05-13) — v1.5.1 ✅

Same-day follow-up to v1.5.0 surfacing three small gaps that Chunk B testing exposed, plus a copy rewrite the PM requested separately.

**Admin observability:**
- Sessions table no longer truncates session IDs — full 36-character UUIDs are visible inline with a "copy" link next to each. Support workflow is now: see a session in admin → copy the ID → paste into Supabase SQL editor → search the row.
- New "Recent Activity" section pulls the last 20 rows from `event_log` directly. Columns: timestamp, event_type, full session_id (with copy button), full story_id (with copy button). Story_id is the load-bearing add — `spendTracker.getSessionStats()` doesn't know about stories, but `event_log` records both IDs on every event, so this section surfaces what spend-tracking can't. Backed by new `GET /api/admin/recent-activity`.
- `logEvent` now writes a dev-only console line on every successful event log: `[event_log] {eventType} session={prefix} story={prefix} {properties}`. Gated on `NODE_ENV !== "production"` so production stays clean. Added because during Chunk B testing it was hard to tell from the terminal alone whether validators were actually logging anything.

**Empty-shelf welcome copy:**
Rewritten to be more on-brand and explicit about what Story Mode is. Previous copy: *"Welcome! Your shelf is empty — shall we start your first story?"* with a separate "Tell me about yourself" paragraph. New copy:
> Welcome! This is Story Mode, a place where you can be the hero of any story that you can imagine.
>
> I'm your personal Guide. Tell me what story you want to be in and I'll write it for you.
>
> 1. Describe your character in a sentence or two.
> 2. I build the world around what you've told me.
> 3. Tap or write choices to shape what happens next.

Positions Story Mode as the product, the Guide as a character within it, and the 3 steps explicitly. Still inside the Guide chat bubble per the hero rebrand from v1.3.0.

### AI Quality Pass — Chunk B + admin scroll fix (2026-05-13) — v1.5.0 ✅

Chunk B from the AI quality pass plan. Shifts the strategy from "trust the prompt" to "validate the output and retry." Four heuristic detectors in a new `server/aiValidators.ts`:

- **Stall detector.** Jaccard token overlap between new page and last 2 AI pages. >55% overlap AND no change-indicator vocabulary in the new page = stall. Retries once with a "previous attempt was a stall, write something forward" directive.
- **Fake-choices detector.** Pairwise Jaccard between the 3 bulleted choices. Any pair >50% = orbital choices. Retries with a "two of three choices were the same action" directive.
- **Final-page enforcement.** If `currentPage + 1 >= totalPages` and content contains "What do you do?" or bulleted choices, retry with the final-page directive emphasized.
- **Story Momentum detector.** Looks at the reader's last 2–3 player inputs. If 2+ are semantically similar, injects a "the world must act on this page" directive into the *current* system prompt (does not retry; pretext-only). The reader's choice still goes through; the world responds by escalating the beat.

**Wiring in `server/aiService.ts`:** Story Momentum runs before the AI call and appends its directive to the system prompt. The other three run after parse + em-dash strip and trigger one retry (sharing the existing retryAttempt budget of 2). All four detectors log to `event_log` as `ai_quality_violation` so admin can track rates over time.

**Path A synonym patch** (same-day fix after the first smoke test exposed a hole): the v1 Story Momentum detector used raw token overlap, which missed obvious stalls when the reader used synonyms ("keep working" / "continue silently" / "ignore him"). New `STALL_PATTERNS` regex set collapses any matching input to a single canonical `{__stall__}` token before Jaccard, so synonyms read as identical. Threshold lowered from 0.4 to 0.25 to catch near-misses. Acknowledged band-aid; the real fix is Chunk D's narrative-state tracking, but Path A buys time and catches the most embarrassing failure mode.

**Telemetry + admin:**
- New `ai_quality_violation` event type in `eventLog.ts`. Per-response `{ stall, fakeChoices, finalPageBroken, momentumFired, retryAttempt }` properties.
- New `GET /api/admin/ai-quality` endpoint. Returns 24h rolling counts + rates per detector against page-turn volume.
- New "AI Quality" section in `AdminDashboard.tsx` with 4 cards (stalls, fake choices, final-page breaks, momentum fires).
- Admin page got the `h-dvh overflow-y-auto` fix so it scrolls properly (same root cause as the bookshelf scroll fix in v1.3.0 — global `html, body { overflow: hidden }` from the game-view fixed layout was preventing scroll on other surfaces).

**Cost impact in production:** No new AI calls in v1. Retry rate expected 5–15% after Chunk A's prompt fix landed. Per-story cost change: +$0.005 to +$0.015. Within the planned envelope.

**Plan reference:** `docs/specs/ai-quality-pass-plan.md`. Chunks C (prose-tell post-process scrubbers + telemetry) and D (entity commitment tracking with cross-story-ready JSONB) remain. Sonnet 2-cell comparison still pending as a small follow-up PR.

### AI Quality Pass — Chunk A + Soft-Delete (2026-05-13) — v1.4.0 ✅

Single PR landing the first chunk of the AI quality pass (per `docs/specs/ai-quality-pass-plan.md`) bundled with the soft-delete + 30-day grace pattern for stories.

**The AI quality piece (Chunk A):**

A deep diagnostic of a completed 25-page story ("Whispers of the Familiar") through the interactive-fiction skill surfaced three core failures: stalled middles (9 consecutive pages of zero plot motion mid-story), false choices (3–4 bulleted options that all collapsed to the same outcome — "hold still / stay still / make a sudden movement"), and AI overriding off-script player input ("stairs? too exposed" — redirected to the AI's planned maintenance-passage set piece). The audit's surprise finding: **the rules to prevent all three failures were already in the system prompt.** The AI was ignoring them.

Chunk A restructured the prompt accordingly:

- **THE THREE NON-NEGOTIABLES** section moved to the END of the prompt for attention-weight recency. Each rule got a concrete WRONG/RIGHT anti-example pulled from the real Whispers failures.
- Non-Negotiable #1: "every page must introduce ONE concrete change" with the tunnel-stall as the WRONG example.
- Non-Negotiable #2: "choices must lead to different directions" with the hold-still trio as the WRONG example.
- Non-Negotiable #3 (genuinely new — not previously in the prompt): "the reader is the author of WHAT happens; you are the author of HOW" with the stairs override as the WRONG example.
- **Banned patterns expanded** from em-dashes only to: "something" as antagonist after first appearance, three-item-list cadence ("X, Y, Z" every paragraph), hedge adverbs (slightly / almost imperceptibly / softly / faintly / barely).
- **Voice section tightened.** Dialogue formatting merged into voice as a single bullet (was its own labeled section). Quest+progression compressed.
- **No changes to `getPacingGuidance()`** — the per-page narrative directives were already in place from earlier work; the audit confirmed they work but weren't being attended to until promoted-to-end.

**The soft-delete piece:**

A late-day conversation about customer support recovery (a user reported wanting to find a story they'd deleted) revealed: hard-delete was the only path. With no recovery window, support has zero ability to help a reader who regrets a delete. New pattern:

- New `game_state.deleted_at` column (migration 009). `DELETE /api/stories/:storyId` now sets `deleted_at = NOW()` instead of calling the cascading wipe.
- `getStories()` filters `WHERE deleted_at IS NULL` — readers see stories disappear from their bookshelf immediately as before.
- A lazy purge inside `getStories()` sweeps rows where `deleted_at < NOW() - 30 days` and runs the existing `clearAllAdventureData` cascade. Bounded by a partial index on `(deleted_at) WHERE deleted_at IS NOT NULL` so the sweep is cheap.
- New AlertDialog confirmation popup before delete fires. Copy is explicit about the 30-day window: *"It'll stay on our servers for 30 days in case you change your mind, then it's gone for good."* Replaces the previous `window.confirm` with a brand-consistent dialog.
- Eventually we want an admin search-by-content tool for support; for now, support queries Supabase directly (`WHERE deleted_at IS NOT NULL AND deleted_at > NOW() - INTERVAL '30 days'`).

**Plan reference:** `docs/specs/ai-quality-pass-plan.md` — Chunks B (validate + retry), C (prose-tell post-process + telemetry), D (entity commitment tracking with cross-story-ready JSONB) remain. Sonnet 2-cell comparison will run as a small follow-up PR after the v1.4.0 prompt has run on real users.

### Concurrency Hardening + UI Polish (2026-05-12) — v1.3.0 ✅

One-day pass after a full BE/FE audit. The audit surfaced ~20 candidate findings across two parallel `Explore` agents; verification dropped several from CRITICAL to LOW (orphan endpoint, sub-pennies-impact race) and confirmed the rest. Shipped the top tier in a single PR.

**Concurrency hardening:**
- `chat_locks` table + Postgres-backed lock on `/api/ai/chat` (migration 006). Replaces an in-memory `Map` that was knowingly accepted as a single-instance tradeoff; now coherent at multi-instance.
- `rate_limit_buckets` table + custom `PostgresRateLimitStore` for `express-rate-limit` (migration 006). Atomic UPSERT with CASE-guarded window reset. Fails open on Postgres hiccups so a brief DB stutter doesn't lock everyone out of the AI path. IPv6 keys normalized via `ipKeyGenerator`.
- Quest dedup now scoped by `storyId` in `dbStorage.createQuest` — fixes cross-story collision where two parallel stories with the same quest title silently merged.

**Message ordering:**
- `messages.created_at TIMESTAMPTZ` column (migration 007). `getMessages` / `getRecentMessages` order by `createdAt`. Fixes a real bug observed on phone testing: 4 messages in the same minute string returned in nondeterministic order, rendering player-AI-AI-player instead of P-A-P-A.

**Sentiment dedup:**
- `gameState.sentiment` column (migration 008). Captured once via either the End Story popup or the revisit-finished footer; the other surface reads the persisted value and hides its prompt.

**UI polish:**
- Bookshelf now scrollable on phone (root `h-dvh overflow-y-auto`; the global `html, body { overflow: hidden }` is scoped to the game view's fixed-height layout).
- Hero rebrand: welcome + "Tell me about yourself" tagline + 3 numbered steps moved INTO the Guide's chat bubble. Standalone serif hero block removed. One voice, one bubble.
- 100 hand-curated spark prompts in a `SPARK_PROMPTS` pool, 3 random per mount, refresh button (RefreshCw) right-aligned on "Need a spark?" — mirrors the in-story regenerate affordance. Applied to BOTH the empty-shelf hero and the returning-user collapsible.
- Drawer peek spacing: paragraph→peek gap 80→112px; inside `gap-2`→`gap-4` between drag handle and "What happens next?".
- Story-complete footer no longer overlaps the closing paragraph: bottom padding bumps to 240px when `storyComplete`. Scroll-to-bottom button repositions above the footer.
- Initial scroll on story open jumps to the bottom (in-progress: shows latest; finished: shows the ending above the footer).
- `crypto.randomUUID()` polyfill in `main.tsx` so plain-HTTP LAN testing (phone on same wifi) doesn't crash.

**Phase 5 leftovers wrapped:**
- Removed dead `darkMode: ["class"]` from `tailwind.config.ts`.
- Gated 3 per-request operational `console.log` calls on `NODE_ENV !== "production"` (`spendTracker.ts`, two in `routes.ts`).

**Audit findings deferred to follow-up PRs:**
- `applyAIResponse` not transactional (no observed bug, real consistency risk).
- Daily-spend check-then-write race (real, but max overage is pennies).
- DB indexes on hot paths (perf, not correctness).
- Palette consolidation (61 hex codes; visual-regression risk too high for this PR).
- `DELETE /api/messages` orphan endpoint (latent bug, no client caller).

**Out-of-scope ideas the user wants dedicated brainstorm sessions for** (logged in ROADMAP Maybe/TBD): audio drama, AI-generated puzzles, walk-to-earn mechanics.

### Pre-launch Audit (2026-05-11 → 2026-05-12) ✅

Five-phase punch list completed across five commits on `main`, taking Story Mode from "Milestone 6 in progress" to "publicly shippable" at v1.1.0. Follow-up 2026-05-12 passes shipped AI voice/UX/reliability improvements (v1.1.1) and the doc-framework restructure with `ai-voice.md` + `api-and-cost.md` split (v1.2.0).

- **Phase 1 — Security** (commit `d0966bc`): dead schema deletion, npm audit fix, Sentry on Express, Zod input caps on AI endpoints, `<user_input>` delimiters, timing-safe admin auth, stopped logging response bodies in production
- **Phase 2 — Brand + domain** (commit `6196b81`): Render service renamed, deleted Cloudflare config, removed Replit dev banner, OG image (1200×630), Twitter card, CORS for mystorymode.com. Email forwarding settled on ImprovMX.
- **Phase 3 — Reliability** (commit `0e20cf3`): `daily_spend` / `story_creation_locks` / `event_log` tables + atomic upserts, DB-backed spend tracker, per-(session, story) chat lock, full async awaits, posthog.identify, server-side funnel events. Migration `005_phase3_reliability.sql` ran in Supabase.
- **Phase 4 — Distribution polish** (commit `4a01351`): first-visit bookshelf hero with example prompts, cold-start loader on bookshelf, mailto feedback + thumbs sentiment, `<Sentry.ErrorBoundary>`, `/admin` gated behind `?admin=1`, kebab affordance on book spines + Delete option for archived, Mission Complete toast, version 1.0.0, hero example tuning (`ef84bd7`)
- **Phase 5 — Cleanup** (commit `c9dc499`): 7 dead components deleted, 2 dead AI service methods, legacy `/api/adventure/initialize` route, D&D event taxonomy from posthog.ts, ~55 verbose console.log statements, full `.dark` CSS block, stale docs (DEPLOYMENT.md / LOCAL_DEVELOPMENT.md / design_guidelines.md / replit.md), gitignored xlsx. Net -1,059 lines.
- **2026-05-12 follow-up batch** (commits `857d777`, `751b111`, `89c49db`): AI voice rewrite (80–140 words, no em dashes, milestone pacing, macro-choice rule), parse-failure hardening (`max_tokens: 2000`, single-quote dialogue, 3-attempt retry, em-dash post-processing), rate limits 60→240/hr keyed by session, drawer peek + regenerate button redesign, story-complete UI, bookshelf "Need a spark?" collapsible, dev `tsx watch`
- **2026-05-12 doc framework** (commit `a26cf2f` and successors): CLAUDE.md restructured as a router, `docs/design-system.md` + `docs/ROADMAP.md` created, then `docs/ai-voice.md` + `docs/api-and-cost.md` split out, TL;DR + maintenance-footer pattern applied to all living docs

### Milestone 5: Polish, Bugs & UX Overhaul ✅

The core product pivot is complete — Story Mode is now a page-based interactive storytelling platform with a bookshelf, AI-inferred genre, and a Guide mascot. This milestone fixed bugs, tightened the UX, and made the experience feel polished.

**Bugs fixed:**
1. **Story isolation bug** ✅ — Threaded `storyId` through `generateResponse()`, `getGameContext()`, and `checkAndTriggerSummarization()` in `aiService.ts`.
2. **"End" button** ✅ — Now calls `PATCH /api/game-state` with `storyComplete: true` instead of deleting the story. Includes AlertDialog confirmation.
3. **Narrator fallback error on story creation** ✅ — Added retry logic in `generateResponse()` (150ms delay + fresh context refetch on JSON parse failure) and a route-level retry in `/api/story/new` (200ms delay). Up to 3 total attempts before user sees the fallback.

**UX improvements:**
4. **Story screen overhaul** ✅ — Removed progress bar, mic button, and persistent text input. Consolidated into single top nav bar: "Story Mode" | "Page X of Y" | three-dot dropdown menu. Menu contains: Back to Library, font size controls (+/-), End Story with confirmation. Story choices moved from inline message bubbles to a collapsible bottom drawer. Bottom drawer auto-expands on new choices, collapses on selection or outside tap. "I have something else in mind..." option with expandable text input in the drawer. Smart auto-scroll: AI messages scroll to top of new text, player messages scroll to bottom. Font size persisted in localStorage (Small/Medium/Large/X-Large).
5. **Remove emoji icons** ✅ — Stripped all decorative icons and emojis from Bookshelf, NewStoryCreation, ChatInterface, App, and ColdStartLoader. Only functional icons remain.
6. **"Surprise me" button** ✅ — Calls `POST /api/story/surprise-me` for AI-generated character descriptions (Claude 3.5 Haiku, max_tokens: 90, 1-2 sentences).
7. **Genre step removed** ✅ — Story creation simplified from 3 steps to 2 (page count → character description). AI infers genre from the character description. Genre stored as "auto" in the database.
8. **Info box → popover tooltip** ✅ — Replaced the character description info box with a small (i) icon popover.
9. **"Your Guide" naming** ✅ — All UI references to "narrator" renamed to "Your Guide." System prompts use "Guide." Badge in story view, loading state, error messages, toasts, and summary service all updated.

**Out of scope for this milestone:** RAG / vector search, user accounts or cross-device persistence, new genres or story mechanics, removing dead server code (users/enemies/campaigns tables).

### Milestone 4: Pacing & Narrative Structure ✅

Added act-based pacing guidance so the AI shapes the narrative arc across the full page count. Created `getPacingGuidance()` that divides stories into Setup (0-20%), Rising Action (20-50%), Escalation (50-75%), Climax (75-90%), and Resolution (final pages). Built `StoryProgress.tsx` component showing current page, progress bar, and pacing labels. AI receives different narrative instructions based on story position. Final page delivers a definitive conclusion with no choices.

### Milestone 3: Product Pivot — Page-Based Storytelling Platform ✅

Major pivot from D&D-style gameplay to a page-based interactive storytelling platform.
- **Bookshelf UI** (`Bookshelf.tsx`): Virtual bookshelf with color-coded book spines by genre, "Currently Reading" and "Finished" shelves, quick-continue card for most recent story.
- **Story creation wizard** (`NewStoryCreation.tsx`): Originally 3-step flow with genre selection, now simplified to 2 steps — page count → character description. AI infers genre from the description.
- **Multi-story support**: Added `storyId` scoping across all tables. Each session can have multiple independent stories.
- **Guide mascot** (`GuideAvatar`): Glowing orb character with personality, appears on bookshelf. AI system prompt rewritten as "The Guide — a warm, witty, and imaginative storyteller."
- **New API routes**: `POST /api/story/new`, `GET /api/stories`, `DELETE /api/stories/:storyId`.
- **3-view routing** in App.tsx: bookshelf → newStory → game.

### Milestone 2: AI Memory & Context — Rolling Story Summary ✅

Implemented rolling story summaries so the AI maintains full narrative context beyond the last 5 messages. Created `summaryService.ts` with automatic summarization triggered every 10 unsummarized messages. Added `storySummaries` table to schema. Summaries capture key plot points, NPC relationships, quest progress, and player decisions. Integrated into `getGameContext()` so the AI always has the full story arc.

### Milestone 1: Foundation — Real Persistence & Session Isolation ✅

Replaced in-memory storage with PostgreSQL via Supabase. Added session isolation so each browser gets its own independent game state. Created DbStorage class, frontend session management via `x-session-id` header, real token cost tracking, and admin dashboard.

---

## Already deleted (historical reference)

These were removed during milestones 5–6:

- `components/examples/` — was dead storybook code
- `server/worker.ts` — dead Cloudflare Workers stub
- `CombatInterface.tsx` — wrong product paradigm
- `CharacterCreation.tsx` — replaced by new story creation flow
- `CharacterQuestionnaire.tsx`, `AbilityScoreRoller.tsx`, `CampaignManager.tsx` — D&D character creation
- `MemStorage` class in `server/storage.ts` — ~665 lines. `IStorage` interface and `DbStorage` export remain.
- Enemy routes (`GET/POST/PATCH /api/enemies`)
- Combat route (`POST /api/combat/action`) — ~260 lines
- Campaign routes (`GET/POST/PATCH/DELETE /api/campaigns/*`) — ~90 lines
- **2026-05-11 Phase 5 cleanup:** 7 components (`DMChatInterface`, `HealthBar`, `StatDisplay`, `ItemCard`, `QuestCard`, `PageHeader`, `StoryProgress`, `ThemeToggle`), 2 AI service methods (`generateQuestIdeas`, `generateNPCDialogue`), legacy `POST /api/adventure/initialize` route + schema, D&D PostHog event helpers, ~55 verbose `console.log` statements, the entire `.dark {…}` CSS variable block (~100 lines). Net -1,059 lines.
- **2026-05-09 Supabase RLS hardening:** dropped `users`, `enemies`, `campaigns` tables in production; enabled RLS on all 6 live tables (no policies — server bypasses via postgres role).

---

## Maintenance

- **Update when:** any milestone work ships (committed code) — add a section under "Completed Milestones" or extend the current one. Also append to "Already deleted" when meaningful dead code is removed. Bump "Last updated" below.
- **TL;DR rule:** current-state-only, ~60 words. Cover: live version, milestones 1–5 status, active milestone (Milestone 6) status, latest push pointer. **Do not** append a sentence per shipped version — version-by-version detail lives in the "Completed Milestones" entries below, and that's the format readers should reach for when they want history.
- **Same commit as code:** the doc update rides along with the milestone commit, not as a separate hygiene commit.
- **Last updated:** 2026-05-14
