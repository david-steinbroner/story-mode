# Story Mode — Milestone History

> **TL;DR (read this first):** Story Mode is live at mystorymode.com on **v1.2.1**. Pre-launch audit Phases 1–5 (security, brand/domain, reliability, polish, cleanup) shipped 2026-05-11 across five commits on `main`. AI voice rewrite, parse-failure hardening, rate-limit fix, drawer/regenerate UX polish, and the doc framework restructure (CLAUDE.md router + ai-voice.md + api-and-cost.md split) shipped 2026-05-12. **Current in-flight milestone:** Milestone 6 (Guide chatbot on bookshelf) — foundation components exist (`GuideConfirmDialog`, `GuideStoryCard`), chat UI + intent matcher + `POST /api/guide/chat` endpoint still TODO. **Completed:** Milestones 1–5 (Foundation, AI Memory, Page Structure pivot, Pacing, Polish + UX Overhaul) plus the Pre-launch Audit.
>
> *Last updated: 2026-05-12 · Maintenance rule at the bottom.*

---

## Current Milestone

### Milestone 6: Your Guide — Interactive Chatbot + Bookshelf Nav

**Goal:** Two things: (1) Turn the static Guide mascot on the bookshelf into a real conversational character that helps users navigate the app and get inspired. (2) Add a proper nav bar / menu to the bookshelf screen, mirroring the menu already in the story reading screen.

#### Work completed this session

**Bug fixes shipped:**
- **Story view "No messages yet"** ✅ — `queryClient.ts` URL fix (`queryKey[0]` only) + `_activeStoryId` timing fix (set synchronously in `enterStory`/`navigateToBookshelf`).
- **New story button missing when all stories archived** ✅ — Filter condition fix (`stories.length > 0` instead of `completedStories.length > 0`).
- **Nav bar not fixed on mobile** ✅ — `h-screen` → `h-dvh` for mobile Safari viewport, plus `overflow: hidden` on `html`/`body`.
- **Player messages appearing out of order** ✅ — Optimistic cache update added to `aiChatMutation.onMutate` so player choices appear immediately.
- **End Story not persisting** ✅ — Route-level retry expanded to catch all error types (was only catching `parse_failure`). Captured `storyIdToEnd` before async state changes.
- **Duplicate story creation** ✅ — Server-side creation lock (`Map<sessionId, timestamp>`, 30s window, 429 on duplicates). Client-side: `isSubmitting` ref guard (no timeout reset) + `isCreatingStory` state check at top of `onStartStory`.
- **AI fallback showing D&D text** ✅ — All fallback messages updated to brand voice ("Your Guide"), removed DM/NPC/combat/quest/weapon/magical weave references. Updated `generateFollowUpQuest` system prompt.

**Features shipped:**
- **AI-generated story titles** ✅ — `storyTitle` column on `gameState`, parsed from AI opening response. Bookshelf displays real titles, fallback to "Untitled Story".
- **Always-visible "Start a New Story" button** ✅ — Shows whenever stories exist, not only when Currently Reading is empty.
- **Scroll-to-bottom button** ✅ — Floating ChevronDown button appears when scrolled >100px from bottom in story reading screen.
- **Long-press end/archive on active stories** ✅ — Active book spines now show End Story + Archive popover on long-press.
- **Text selection disabled on book spines** ✅ — `select-none` prevents highlighting on long-press.
- **Loading button copy** ✅ — Changed from "The Guide is writing..." to "Starting your story..."
- **Archive moved to database** ✅ — `storyArchived` boolean column on `gameState`, `PATCH /api/stories/:storyId/archive` endpoint. Replaces localStorage.
- **Guide avatar as universal menu icon** ✅ — Extracted `GuideAvatar.tsx` as shared component. Replaces three-dot icon on story screen. Bookshelf avatar is now a DropdownMenu trigger with font size, archive toggle, and admin link.
- **Version number on bookshelf** ✅ — Small text at bottom of library page, bumped with each deploy. (Current version is in `package.json` and the footer; bumped many times since this milestone.)
- **Content freedom in AI prompts** ✅ — Added CONTENT FREEDOM section to system prompt allowing mature themes when reader-initiated.
- **AI model swap** ✅ — Claude 3.5 Haiku → Mistral Small Creative → DeepSeek V3. DeepSeek had best JSON reliability at this milestone. **Later reverted to Claude 3.5 Haiku** for writing quality (commit `2621f8c`, 2026-05-11). Current model is documented in `docs/api-and-cost.md`.
- **Choice drawer always visible** ✅ — Drawer shows whenever story is active (not gated on parsed choices), so "I have something else in mind..." is always available.
- **Choice parser expanded** ✅ — `parseMessageContent()` now handles bullets, numbered lists, and "Option A:" labels. Strips all prefixes.
- **Book spine labels improved** ✅ — Removed unreadable 7px spine text, widened label area to 110px, 2-line clamp instead of truncate.

**Infrastructure & reliability shipped:**
- **Rate limits increased** ✅ — General: 100 → 500/hr, AI: 20 → 60/hr (each page turn fires 4-5 fetches). **Later bumped again** during the 2026-05-12 pass; current values in `docs/api-and-cost.md`.
- **Trust proxy** ✅ — `app.set('trust proxy', 1)` for Render reverse proxy compatibility with rate limiter.
- **DB connection pool** ✅ — Increased pool from default 10 → max 20 with idle/connect timeouts. Fixes `MaxClientsInSessionMode`.
- **DeepSeek JSON compatibility** ✅ — Removed `response_format: { type: "json_object" }` (DeepSeek returns 400). Added markdown code fence stripping for ```json wrappers.
- **Production log privacy** ✅ — Removed raw prompt/response log blocks, truncated all content previews to 50 chars.

**Code cleanup shipped:**
- Deleted: `CharacterQuestionnaire.tsx`, `AbilityScoreRoller.tsx`, `CampaignManager.tsx`
- Deleted: `MemStorage` class (~665 lines)
- Deleted: Enemy routes, combat routes, campaign routes (~350 lines)
- Net: **-1,362 lines** removed during this milestone's cleanup (Phase 5 of the pre-launch audit on 2026-05-11 removed an additional -1,059 lines; see below).
- Fixed duplicate `aiResponseReceived` key in `posthog.ts` (kept enhanced version)
- Fixed PostHog `disabled` → `opt_out_capturing_by_default` (eliminated TS error)
- Updated caniuse-lite browserslist database
- `npm audit fix`: 24 → 6 vulnerabilities (remaining 6 require Vite 8.0 breaking change)

#### Bookshelf nav / menu — completed ✅

The Guide avatar in the bookshelf header is now a DropdownMenu trigger. Menu items: font size controls (shared `storymode-font-size` localStorage key), archive toggle (only when archived stories exist), admin link. The same Guide avatar replaces the three-dot icon on the story reading screen for consistency.

This sets up the Guide chatbot — when we build it, the avatar tap will open the chat instead of the menu, and settings will move into the chat.

#### Guide chatbot — not yet built

**Foundation (already built before this milestone):**
- `GuideConfirmDialog.tsx` — Reusable modal dialog (cream background, pastel palette, min 44px tap targets). Props: title, description, children slot, confirm/cancel labels, callbacks.
- `GuideStoryCard.tsx` — Presentational card showing story info (genre badge with color coding, page progress, character description, progress bar). Slots into GuideConfirmDialog.

**Canned responses (no AI call, handled client-side):**

Each canned response flows through a `GuideConfirmDialog` for confirmation before taking action.

| Intent | Trigger phrases | Confirmation screen | Action |
|---|---|---|---|
| Resume story | "resume", "continue", "keep reading" | GuideConfirmDialog with GuideStoryCard showing the story | Navigate to story view |
| Start new story | "new story", "start", "begin" | GuideConfirmDialog: "Start a new adventure?" | Navigate to story creation |
| Delete a story | "delete", "remove" | GuideConfirmDialog with GuideStoryCard: "Remove this story?" | DELETE `/api/stories/:storyId`, refresh bookshelf |
| How it works | "how does this work", "help", "what is this" | No confirmation needed — display canned explainer directly in chat | Show hardcoded explanation |
| Clear all data | "delete my data", "reset everything", "start over" | GuideConfirmDialog: "This will remove all your stories. Are you sure?" | Clear session data |

**AI-powered responses (one Haiku call each):**
- "What kind of story should I write?" / open-ended creative prompts → AI generates personalized suggestions based on reading history
- "Tell me about my stories" → AI summarizes their bookshelf
- Any freeform message that doesn't match a canned intent

**Architecture:**
- New component: `GuideChat.tsx` — slide-up modal triggered by tapping the Guide mascot on the bookshelf
- New API route: `POST /api/guide/chat` — lightweight endpoint with its own short system prompt (~200 tokens, "helpful librarian" persona)
- Intent matching: client-side keyword matching first; if no canned match, forward to AI endpoint
- Max 10 messages per conversation before auto-clearing (this is a helper, not a persistent chat)
- The Guide only appears on the bookshelf for now (not during active stories)

**Cost estimate:** ~$0.001-0.002 per AI-powered Guide interaction. Most interactions will be canned (free).

#### Remaining tasks

1. Build `GuideChat.tsx` — slide-up modal UI with message list, text input, Guide avatar
2. Implement client-side intent matcher — keyword matching for canned intents
3. Wire canned intents to confirmation dialogs using existing `GuideConfirmDialog` + `GuideStoryCard`
4. Build `POST /api/guide/chat` endpoint with short Guide-specific system prompt
5. Connect AI fallback for unmatched intents
6. Wire GuideChat to the Guide mascot tap on Bookshelf (replace current menu — settings move into chat)
7. Test all flows: resume, new story, delete, help, clear data, AI freeform

**Out of scope:**
- Guide appearing during active stories
- Guide remembering past conversations across sessions
- Voice or audio
- Guide avatar customization

---

## Completed Milestones

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

- **Update when:** any milestone work ships (committed code) — add a section under "Completed Milestones" or extend the current one. Also append to "Already deleted" when meaningful dead code is removed.
- **TL;DR refresh:** rewrite the top block whenever the current milestone changes or a phase ships. Keep it under ~10 lines so it's scannable in one read.
- **Same commit as code:** the doc update rides along with the milestone commit, not as a separate hygiene commit.
- **Last updated:** 2026-05-12
