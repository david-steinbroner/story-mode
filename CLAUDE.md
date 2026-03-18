# CLAUDE.md — Story Mode Engineering Operating Manual

---

## ⚙️ How to Deploy This File

**This file was written by Claude (claude.ai) and should be added to your project by Claude Code.**

Give Claude Code this prompt:

> "Add the attached CLAUDE.md file to the root of the project, alongside package.json. Do not modify its contents. Confirm when done."

---

## 🧭 The Three-Tool Workflow

This project is managed using three AI tools with distinct roles. Understanding who does what prevents confusion and wasted effort.

| Tool | Role | Best For |
|---|---|---|
| **Cowork (Claude desktop app)** | PM, strategist, prototyper | Planning, audits, architecture decisions, brainstorming, prototyping UI, writing docs, small scoped fixes (<5 files), creating prompts for Claude Code |
| **Claude Code** | Executing engineer | Implementing defined tasks, multi-file refactors, running dev server, testing, committing changes, anything touching 5+ files |
| **Cursor (Cohort)** | Senior engineer with full codebase access | Deep code analysis, answering "what does this code actually do," large-scale debugging |

### How we decide who does what:

**Cowork handles it directly when:**
- The fix is small and well-understood (under ~5 files)
- Cowork already investigated the issue and knows exactly what to change
- It's a doc update, status update, or planning task
- It's UI prototyping or brainstorming
- It's creating a prompt, spec, or decision doc

**Hand it to Claude Code when:**
- The change touches 5+ files or is a large refactor
- It needs the dev server running to test interactively
- It needs to run the build, lint, or test suite
- It's a commit, push, or git operation
- The task benefits from Claude Code's 86 installed skills
- Cowork hasn't investigated yet and Claude Code can figure it out independently

**When handing off to Claude Code**, Cowork provides a natural language prompt — not a terminal command. Claude Code takes directions conversationally, just like talking to a teammate. The prompt should include: what to do, why, which files are involved, and what to watch out for.

### The handoff pattern:
1. **You bring a goal to Cowork.** We talk through it, make decisions, scope the task.
2. **Cowork either does it directly OR writes a prompt for Claude Code** — and tells you which.
3. **If Claude Code:** You paste the prompt. Claude Code executes. You paste back any output Cowork needs to see.
4. **Cowork reviews and plans the next step.**

You should never have to translate outputs into instructions yourself. If Cowork gives you something — a document, a plan, a code review — it will also tell you exactly what to do with it and which tool to use.

### Prompt template for Claude Code handoffs

When Cowork writes a prompt for Claude Code, use this format. It's what Claude Code processes most efficiently:

```
## Task
One sentence: what to build/fix/change.

## Why
One sentence: the product reason this matters.

## Files involved
- `path/to/file.tsx` — what changes here
- `path/to/other.ts` — what changes here

## Acceptance criteria
- [ ] Specific, testable outcome 1
- [ ] Specific, testable outcome 2
- [ ] Specific, testable outcome 3

## Watch out for
- Known gotcha or dependency
- "Don't change X while you're in there"
- Edge case to handle

## Context (if needed)
Any decision already made in Cowork that Claude Code shouldn't re-litigate.
E.g., "We considered approach A but chose B because..."
```

**What helps Claude Code most:**
- **File paths** — it can start immediately instead of searching
- **Acceptance criteria as checkboxes** — it knows exactly when it's done
- **"Watch out for"** — prevents breaking adjacent things
- **Decisions already made** — stops it from proposing alternatives you've already rejected

**What to skip:**
- Don't explain *how* to code it (Claude Code figures out implementation)
- Don't paste large code blocks for context (it reads files itself)
- Don't give vague goals like "make it better" or "clean this up"
- Don't re-explain architecture that's already in CLAUDE.md

**The sweet spot:** Tell Claude Code *what* and *why* with specificity. Skip the *how* unless there's a non-obvious constraint.

---

> **For Claude Code:** Read everything below this line at the start of every session before writing any code.
> This is the single source of truth for how we work, what we're building, and how decisions get made.

---

## 1. What We're Building

**Story Mode** is a mobile-first, AI-powered interactive storytelling platform. Users describe a character in plain language, the AI builds a world around them, and the story unfolds through tap-based choices — no dice, no stats, no TTRPG knowledge required.

**Target user:** Someone who has never played a tabletop RPG, may dislike traditional fantasy settings, and wants a creative story experience with zero friction.

**Core loop:**
1. User describes themselves in 2-3 sentences
2. AI generates a world, opening scene, and first quest
3. User taps one of 3-4 choices to advance the story
4. AI responds with narrative + next set of choices
5. Story evolves based on cumulative choices

**What this is NOT:**
- Not a D&D simulator
- Not a free-text chat game
- Not a combat-focused experience
- Not desktop-first

---

## 2. Your Role

You are the engineering team. I am the PM.

**This means:**
- You write and edit code
- I make product decisions
- You flag tradeoffs and options — you do not make product decisions unilaterally
- When something is ambiguous, you stop and ask before proceeding
- You never assume "close enough" — if requirements are unclear, ask

**Before starting any task, confirm:**
1. You have read and understood the task
2. You know which files will be touched
3. You have identified any risks or dependencies
4. If any of the above are unclear, ask before writing a single line of code

---

## 3. Definition of Done

A task is **not done** until all of the following are true:

- [ ] The feature works as described in the task
- [ ] No existing features are broken (manual smoke test: create story → read story → end story → archive)
- [ ] No TypeScript errors (`tsc --noEmit` passes)
- [ ] No console errors in the browser during normal use
- [ ] Code follows the style guide in Section 6
- [ ] Any new environment variables are added to `.env.example` with a description
- [ ] If a new API route was added, it is documented in `docs/api.md`
- [ ] If a schema change was made, the migration was run and `shared/schema.ts` reflects it
- [ ] You have told me what you changed, what you tested, and what to watch out for

**Never say a task is complete if you haven't manually verified it works.**

---

## 4. How We Communicate

After completing any task, your response must include:

### ✅ What I did
Brief description of changes made, files touched.

### 🧪 How to test it
Exact steps to verify the feature works. Be specific — "go to X, do Y, expect Z."

### ⚠️ Watch out for
Any edge cases, known limitations, or things that could go wrong.

### 📋 What's next
Optional: if there's a logical next step, flag it. Don't start it without being asked.

---

## 5. Version Control Rules

- **Commit after every completed task** — not mid-task, not at end of day
- **Commit message format:** `[type]: short description`
  - Types: `feat`, `fix`, `refactor`, `style`, `chore`, `docs`
  - Examples: `feat: add supabase session persistence`, `fix: correct token cost calculation`
- **Never commit:**
  - `.env` files or secrets
  - `node_modules/`
  - Console.log statements left in production code
  - Commented-out code blocks (delete, don't comment out)
- **Branch strategy:** We work on `main` for now. When we get closer to production, we'll introduce feature branches.

---

## 6. Code Style Guide

### General
- **TypeScript strict mode is on.** No `any` types without a comment explaining why.
- **No implicit returns** in functions that should return a value.
- **Descriptive names.** `generateStoryResponse` not `genResp`. `playerSessionId` not `sid`.
- **Functions do one thing.** If a function is over 40 lines, it probably needs to be split.
- **No magic numbers or strings.** Use named constants. Put them at the top of the file or in `shared/constants.ts`.

### React Components
- Functional components only — no class components
- Props interfaces defined above the component: `interface StoryCardProps { ... }`
- One component per file
- File name matches component name: `StoryCard.tsx` exports `StoryCard`
- Keep components under 200 lines. Extract sub-components if needed.
- No inline styles. Use Tailwind classes only.

### Server / API
- Route handlers are thin — they validate input and call a service function. Business logic lives in service files, not routes.
- All API responses follow this shape:
  ```typescript
  // Success
  { success: true, data: T }

  // Error
  { success: false, error: string, code?: string }
  ```
- All routes validate input with Zod before touching the database or AI.
- Never expose internal error messages to the client. Log them server-side, return a generic message to the client.

### Database
- All DB queries go through the storage layer (`server/storage.ts` or equivalent service files) — never query the DB directly from a route handler.
- Schema changes require a migration. Never hand-edit the database.
- Column names are `snake_case` in Postgres, `camelCase` in TypeScript (Drizzle handles this).

### AI Integration
- System prompts live in their own files or clearly labeled constants — never inline in route handlers.
- All AI calls are wrapped in try/catch with a meaningful fallback.
- Log token usage on every AI call for cost tracking.
- Never send raw user input to the AI without sanitization.

---

## 7. Tech Stack Reference

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + TypeScript | SPA, view routing via state in App.tsx |
| UI | shadcn/ui + Tailwind CSS | Only import components we actually use |
| Data fetching | TanStack Query (React Query) | All server state |
| Build | Vite | Path aliases: `@` = client/src, `@shared` = shared/ |
| Server | Express.js + Node | Serves API and static files |
| Database | PostgreSQL via Supabase | Drizzle ORM for queries and migrations |
| Auth/Sessions | Supabase anonymous sessions | No accounts required — session per browser |
| AI | OpenRouter → Claude 3.5 Haiku | Via OpenAI SDK |
| Analytics | PostHog | Client-side only |
| Errors | Sentry | Client + server, 10% trace sample |
| Deployment | Render (web service + postgres) | Auto-deploy from main branch |

---

## 8. Brand & UX Rules

These are non-negotiable. Any code that touches the UI must follow these.

### Language
Never use these words in UI copy, component names, variable names, or comments meant to be user-facing:
- Dungeon Master / DM / Narrator → use **Your Guide** (always "Your Guide" in user-facing UI, "Guide" in code/system prompts)
- Campaign → use **Story** or **Adventure**
- Session → use **Chapter**
- Character Sheet → use **Your Character**
- Party / Group → use **Friends**
- Quest → use **Mission** or **Goal** (in UI only — `quest` is fine in code)
- NPC → use **character** or **person in the story**
- Roll / Dice → don't reference dice at all
- Stats / Ability Scores → use **Traits**

### Colors (Pastel Playground palette)
```
Cream background:  #FFF9F0  ← main backgrounds
Soft indigo:       #6C7A89  ← text, headers
Peachy pink:       #FFB6B9  ← primary CTAs
Mint green:        #A8E6CF  ← success states
Lavender:          #C9B6E4  ← secondary actions
```
- No pure black (`#000000`) anywhere
- No dark mode by default
- All backgrounds are cream or white — never gray

### Interaction Model
- Primary interactions are **tap-based choices** — the AI returns 3-4 options, user taps one
- Free text input exists but is secondary
- All tap targets minimum 44x44px
- Mobile-first: design for 375px width, then scale up

---

## 9. Previous Milestone (Reference)

**Milestone 5: Polish, Bugs & UX Overhaul** ✅ (complete)

The core product pivot is complete — Story Mode is now a page-based interactive storytelling platform with a bookshelf, AI-inferred genre, and a Guide mascot. This milestone fixed bugs, tightened the UX, and made the experience feel polished.

### Bugs fixed: ✅
1. **Story isolation bug** ✅ — Threaded `storyId` through `generateResponse()`, `getGameContext()`, and `checkAndTriggerSummarization()` in `aiService.ts`.
2. **"End" button** ✅ — Now calls `PATCH /api/game-state` with `storyComplete: true` instead of deleting the story. Includes AlertDialog confirmation.
3. **Narrator fallback error on story creation** ✅ — Added retry logic in `generateResponse()` (150ms delay + fresh context refetch on JSON parse failure) and a route-level retry in `/api/story/new` (200ms delay). Up to 3 total attempts before user sees the fallback.

### UX improvements completed: ✅
4. **Story screen overhaul** ✅ — Complete redesign:
   - Removed progress bar, mic button, and persistent text input
   - Consolidated into single top nav bar: "Story Mode" | "Page X of Y" | three-dot dropdown menu
   - Menu contains: Back to Library, font size controls (+/-), End Story with confirmation
   - Story choices moved from inline message bubbles to a collapsible bottom drawer
   - Bottom drawer auto-expands on new choices, collapses on selection or outside tap
   - "I have something else in mind..." option with expandable text input in the drawer
   - Smart auto-scroll: AI messages scroll to top of new text, player messages scroll to bottom
   - Font size persisted in localStorage (Small/Medium/Large/X-Large)
5. **Remove emoji icons** ✅ — Stripped all decorative icons and emojis from Bookshelf, NewStoryCreation, ChatInterface, App, and ColdStartLoader. Only functional icons remain.
6. **"Surprise me" button** ✅ — Calls `POST /api/story/surprise-me` for AI-generated character descriptions (Claude 3.5 Haiku, max_tokens: 90, 1-2 sentences).
7. **Genre step removed** ✅ — Story creation simplified from 3 steps to 2 (page count → character description). AI infers genre from the character description. Genre stored as "auto" in the database.
8. **Info box → popover tooltip** ✅ — Replaced the character description info box with a small (i) icon popover.

### Decisions made (scoped into Milestone 6):
9. **"Your Guide" naming** ✅ — All UI references to "narrator" renamed to "Your Guide." System prompts use "Guide." Badge in story view, loading state, error messages, toasts, and summary service all updated.
10. **Guide chatbot** — Decision: YES, make the mascot a real chatbot. Scoped as Milestone 6 with a hybrid approach (canned responses for common actions, AI for open-ended questions). Reusable confirmation components (`GuideConfirmDialog`, `GuideStoryCard`) already built.

### Out of scope for this milestone:
- RAG / vector search
- User accounts or cross-device persistence
- New genres or story mechanics
- Removing dead server code (users/enemies/campaigns tables) — separate cleanup task

---

## 9b. Current Milestone

**Milestone 6: Your Guide — Interactive Chatbot + Bookshelf Nav**

**Goal:** Two things: (1) Turn the static Guide mascot on the bookshelf into a real conversational character that helps users navigate the app and get inspired. (2) Add a proper nav bar / menu to the bookshelf screen, mirroring the menu already in the story reading screen.

---

### Work completed this session:

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
- **Version number on bookshelf** ✅ — Small text at bottom of library page, bumped with each deploy. Currently v0.7.0.

**Code cleanup shipped:**
- Deleted: `CharacterQuestionnaire.tsx`, `AbilityScoreRoller.tsx`, `CampaignManager.tsx`
- Deleted: `MemStorage` class (~665 lines)
- Deleted: Enemy routes, combat routes, campaign routes (~350 lines)
- Net: **-1,362 lines** removed

---

### Bookshelf nav / menu — completed ✅

The Guide avatar in the bookshelf header is now a DropdownMenu trigger. Menu items: font size controls (shared `storymode-font-size` localStorage key), archive toggle (only when archived stories exist), admin link. The same Guide avatar replaces the three-dot icon on the story reading screen for consistency.

This sets up the Guide chatbot — when we build it, the avatar tap will open the chat instead of the menu, and settings will move into the chat.

---

### Guide chatbot — not yet built:

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

---

### Remaining tasks:
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

## 9c. Completed Milestones

### Milestone 1: Foundation — Real Persistence & Session Isolation ✅

Replaced in-memory storage with PostgreSQL via Supabase. Added session isolation so each browser gets its own independent game state. Created DbStorage class, frontend session management via `x-session-id` header, real token cost tracking, and admin dashboard.

### Milestone 2: AI Memory & Context — Rolling Story Summary ✅

Implemented rolling story summaries so the AI maintains full narrative context beyond the last 5 messages. Created `summaryService.ts` with automatic summarization triggered every 10 unsummarized messages. Added `storySummaries` table to schema. Summaries capture key plot points, NPC relationships, quest progress, and player decisions. Integrated into `getGameContext()` so the AI always has the full story arc.

### Milestone 3: Product Pivot — Page-Based Storytelling Platform ✅

Major pivot from D&D-style gameplay to a page-based interactive storytelling platform. Built:
- **Bookshelf UI** (`Bookshelf.tsx`): Virtual bookshelf with color-coded book spines by genre, "Currently Reading" and "Finished" shelves, quick-continue card for most recent story.
- **Story creation wizard** (`NewStoryCreation.tsx`): Originally 3-step flow with genre selection, now simplified to 2 steps — page count → character description. AI infers genre from the description.
- **Multi-story support**: Added `storyId` scoping across all tables. Each session can have multiple independent stories.
- **Guide mascot** (`GuideAvatar`): Glowing orb character with personality, appears on bookshelf. AI system prompt rewritten as "The Guide — a warm, witty, and imaginative storyteller."
- **New API routes**: `POST /api/story/new`, `GET /api/stories`, `DELETE /api/stories/:storyId`.
- **3-view routing** in App.tsx: bookshelf → newStory → game.

### Milestone 4: Pacing & Narrative Structure ✅

Added act-based pacing guidance so the AI shapes the narrative arc across the full page count. Created `getPacingGuidance()` that divides stories into Setup (0-20%), Rising Action (20-50%), Escalation (50-75%), Climax (75-90%), and Resolution (final pages). Built `StoryProgress.tsx` component showing current page, progress bar, and pacing labels. AI receives different narrative instructions based on story position. Final page delivers a definitive conclusion with no choices.

---

## 10. Files to Know

| File | What it does |
|---|---|
| `shared/schema.ts` | Database schema (Drizzle + Zod types). Source of truth for data models. All tables include `sessionId` and `storyId` for isolation. Includes `storySummaries` table. `gameState` has `storyTitle`, `storyArchived`, and `storyComplete` columns. |
| `server/db.ts` | Database connection pool (postgres-js + Drizzle). Exports `db` instance and `testConnection()`. |
| `server/dbStorage.ts` | Production storage implementation. All CRUD operations with session + story scoping and business logic (level-ups, quest rewards). |
| `server/storage.ts` | Exports `IStorage` interface and the active `DbStorage` storage instance. |
| `server/routes.ts` | All API endpoints. Thin handlers only. Includes story lifecycle routes (`/api/story/new`, `/api/stories`, `/api/stories/:storyId`, `/api/story/surprise-me`, `PATCH /api/stories/:storyId/archive`). Server-side story creation lock (`storyCreationLocks` Map). Uses `getSessionId(req)` helper. |
| `server/aiService.ts` | All AI calls. Prompt construction with pacing guidance, rolling summary integration, response parsing, action execution. Returns `tokenUsage` for cost tracking. |
| `server/summaryService.ts` | Rolling story summary generation. Condenses older messages into narrative summaries every 10 messages. |
| `server/spendTracker.ts` | Real-time cost tracking with actual token counts. Tracks daily/all-time spend, per-session usage. Provides admin stats. |
| `client/src/App.tsx` | 3-view routing (bookshelf → newStory → game) and top-level state. `enterStory()` and `navigateToBookshelf()` set `_activeStoryId` synchronously before invalidating queries. Complex — be careful here. |
| `client/src/components/Bookshelf.tsx` | Main landing screen. Virtual bookshelf with book spines, quick-continue card. Guide avatar is a DropdownMenu trigger (font size, archive toggle, admin). Archive is server-side (`storyArchived` column). Long-press any book spine for actions (end story, archive, unarchive). |
| `client/src/components/NewStoryCreation.tsx` | 2-step story creation wizard: page count → character description. Includes "Surprise me" AI character generator (max_tokens: 90, 1-2 sentences). |
| `client/src/components/ChatInterface.tsx` | Story reading screen. Fixed nav bar (non-sticky, flex layout keeps it pinned), message display, collapsible bottom drawer for choices (defaults collapsed), font size controls, End Story confirmation. |
| `client/src/components/GuideConfirmDialog.tsx` | Reusable confirmation modal for Guide chatbot actions. Built on shadcn AlertDialog with brand palette. Props: title, description, children slot, confirm/cancel labels. |
| `client/src/components/GuideStoryCard.tsx` | Presentational story info card (genre badge, page progress, character description). Slots into GuideConfirmDialog. Genre colors match bookshelf spines. |
| `client/src/components/StoryProgress.tsx` | Page progress bar with pacing phase labels. Not currently rendered (removed from game view) but kept for future repurposing. |
| `client/src/lib/queryClient.ts` | API request helpers. Adds `x-session-id` and `x-story-id` headers to all requests. `getQueryFn` uses `queryKey[0]` as the fetch URL (not the full joined key — extra elements are for cache differentiation only). |
| `client/src/components/AdminDashboard.tsx` | Internal admin UI at `/admin`. Shows spend metrics, session stats. Protected by admin key prompt. |
| `client/src/lib/posthog.ts` | Analytics. Don't remove events — add to them. |
| `.env.example` | All required env vars documented here. Includes `DATABASE_URL` and `ADMIN_KEY`. |

---

## 11. Do Not Touch (Without Explicit Instruction)

- `client/src/lib/posthog.ts` — analytics event taxonomy is intentional, don't reorganize
- `client/src/lib/sentry.ts` / `server/sentry.ts` — error tracking config
- `shared/schema.ts` — only change with a migration plan approved by me first
- `.env` — never commit, never log values, never hardcode
- The `components/ui/` folder — only remove unused components when I specifically ask for a cleanup pass

---

## 12. What We're Deliberately Deleting (Eventually)

These exist in the codebase but are scheduled for removal. Do not build on top of them:

- The `users`, `enemies`, `campaigns` **table definitions** in `shared/schema.ts` — dead code from the D&D paradigm. Removing requires a migration and could break things, so leaving for now.

**Already deleted:**
- `components/examples/` — removed (was dead storybook code)
- `server/worker.ts` — removed (was dead Cloudflare Workers stub)
- `CombatInterface.tsx` — removed (wrong product paradigm)
- `CharacterCreation.tsx` — removed (replaced by new story creation flow)
- `CharacterQuestionnaire.tsx`, `AbilityScoreRoller.tsx`, `CampaignManager.tsx` — removed (D&D character creation, replaced by `NewStoryCreation.tsx`)
- `MemStorage` class in `server/storage.ts` — removed (~665 lines). `IStorage` interface and `DbStorage` export remain.
- Enemy routes (`GET/POST/PATCH /api/enemies`) — removed
- Combat route (`POST /api/combat/action`) — removed (~260 lines)
- Campaign routes (`GET/POST/PATCH/DELETE /api/campaigns/*`) — removed (~90 lines)

---

## 13. Questions to Ask Before Starting

If any of the following are true, stop and ask before writing code:

- The task touches `shared/schema.ts`
- The task requires a new environment variable
- The task changes how the AI prompt is structured
- The task changes how sessions or identity work
- The task touches more than 5 files
- The task could break the core smoke test
- You're not sure if something is in or out of scope

When in doubt, ask. A 30-second question saves a 30-minute revert.

---

## 14. Maintenance & Cleanup Cadence

After every major feature session or milestone completion, run through this checklist before moving on:

- [ ] Delete any dead code identified during the session (unused components, dead routes, stale imports)
- [ ] Check build logs for warnings: duplicate keys, unused imports, deprecation notices, bundle size issues
- [ ] Run `npm audit` and note any new high/critical vulnerabilities
- [ ] Run `tsc --noEmit` and fix any new type errors
- [ ] Update CLAUDE.md Sections 9b, 10, and 12 to reflect the current state of the codebase
- [ ] Verify `.env.example` has all current env vars documented
- [ ] Check for any console.log statements that should be removed from production code

This prevents technical debt from accumulating between milestones. Cowork will remind you to do this — if it doesn't, ask.
