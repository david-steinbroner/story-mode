# CLAUDE.md — Story Mode Engineering Operating Manual

> Read this entire document at the start of every session before writing any code.
> Single source of truth for how we work, what we're building, and how decisions get made.
> The umbrella `/Users/davidsteinbroner/Projects/CLAUDE.md` also applies; this file extends it.

---

## 1. What We're Building

**Story Mode** is a mobile-first, AI-powered interactive storytelling platform. Users describe a character in plain language, the AI builds a world around them, and the story unfolds through tap-based choices — no dice, no stats, no TTRPG knowledge required.

**Target user:** Someone who has never played a tabletop RPG, may dislike traditional fantasy settings, and wants a creative story experience with zero friction.

**Core loop:**
1. User describes themselves in 2–3 sentences
2. AI generates a world, opening scene, and first quest
3. User taps one of 3–4 choices to advance the story
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
- [ ] Any new env vars are added to `.env.example` with a description
- [ ] If a new API route was added, it is documented in `docs/api.md`
- [ ] If a schema change was made, the migration was run and `shared/schema.ts` reflects it
- [ ] You have told me what you changed, what you tested, and what to watch out for

**Never say a task is complete if you haven't manually verified it works.**

---

## 4. How We Communicate

After completing any task, your response must include:

- **What I did** — Brief description of changes made, files touched.
- **How to test it** — Exact steps to verify the feature works. Be specific.
- **Watch out for** — Any edge cases, known limitations, or things that could go wrong.
- **What's next (optional)** — If there's a logical next step, flag it. Don't start it without being asked.

---

## 5. Version Control Rules

This project is hosted (Render auto-deploys from `main`), so it's in commit-mode per the umbrella convention — commit and push after each completed task.

- **Commit format:** `[type]: short description`
  - Types: `feat`, `fix`, `refactor`, `style`, `chore`, `docs`
  - Examples: `feat: add supabase session persistence`, `fix: correct token cost calculation`
- **Never commit:**
  - `.env` files or secrets
  - `node_modules/`
  - `console.log` statements left in production code
  - Commented-out code blocks (delete, don't comment out)
- **Branching:** We work on `main` for now. When we get closer to a wider release, we'll introduce feature branches.

---

## 6. Code Style Guide

### General
- TypeScript strict mode is on. No `any` types without a comment explaining why.
- No implicit returns in functions that should return a value.
- Descriptive names. `generateStoryResponse` not `genResp`. `playerSessionId` not `sid`.
- Functions do one thing. If a function is over 40 lines, it probably needs to be split.
- No magic numbers or strings. Use named constants. Put them at the top of the file or in `shared/constants.ts`.

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
- All DB queries go through the storage layer (`server/storage.ts` or service files) — never query the DB directly from a route handler.
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
| AI | OpenRouter → DeepSeek V3 | Via OpenAI SDK. Switched from Claude 3.5 Haiku for better creative writing + JSON reliability. |
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
- Primary interactions are **tap-based choices** — the AI returns 3–4 options, user taps one
- Free text input exists but is secondary
- All tap targets minimum 44x44px
- Mobile-first: design for 375px width, then scale up

---

## 9. Milestone History

Current milestone, completed milestones, and prior cleanup history live in `docs/MILESTONES.md`. Read that file when you need context on past decisions or what shipped recently.

Current version: **v0.7.18** (visible at the bottom of the bookshelf — bump on every meaningful change).

---

## 10. Files to Know

| File | What it does |
|---|---|
| `shared/schema.ts` | Database schema (Drizzle + Zod types). Source of truth for data models. All tables include `sessionId` and `storyId` for isolation. Includes `storySummaries` table. `gameState` has `storyTitle`, `storyArchived`, and `storyComplete` columns. |
| `server/db.ts` | Database connection pool (postgres-js + Drizzle). Pool: max 20, idle_timeout 20, connect_timeout 10. Exports `db` instance and `testConnection()`. |
| `server/dbStorage.ts` | Production storage implementation. All CRUD operations with session + story scoping and business logic (level-ups, quest rewards). |
| `server/storage.ts` | Exports `IStorage` interface and the active `DbStorage` storage instance. |
| `server/routes.ts` | All API endpoints. Thin handlers only. Includes story lifecycle routes (`/api/story/new`, `/api/stories`, `/api/stories/:storyId`, `/api/story/surprise-me`, `PATCH /api/stories/:storyId/archive`). Server-side story creation lock (`storyCreationLocks` Map). Uses `getSessionId(req)` helper. |
| `server/aiService.ts` | All AI calls via DeepSeek V3. Prompt construction with pacing guidance, content freedom, anti-repetition rules. JSON response parsing with markdown fence stripping. Rolling summary integration. Returns `tokenUsage` for cost tracking. Logs truncated to 50 chars for privacy. |
| `server/summaryService.ts` | Rolling story summary generation. Condenses older messages into narrative summaries every 10 messages. |
| `server/spendTracker.ts` | Real-time cost tracking with actual token counts. Tracks daily/all-time spend, per-session usage. Provides admin stats. |
| `client/src/App.tsx` | 3-view routing (bookshelf → newStory → game) and top-level state. `enterStory()` and `navigateToBookshelf()` set `_activeStoryId` synchronously before invalidating queries. Complex — be careful here. |
| `client/src/components/Bookshelf.tsx` | Main landing screen. Virtual bookshelf with book spines, quick-continue card. Guide avatar is a DropdownMenu trigger (font size, archive toggle, admin). Archive is server-side (`storyArchived` column). Long-press any book spine for actions (end story, archive, unarchive). |
| `client/src/components/NewStoryCreation.tsx` | 2-step story creation wizard: page count → character description. Includes "Surprise me" AI character generator (max_tokens: 90, 1–2 sentences). |
| `client/src/components/ChatInterface.tsx` | Story reading screen. Fixed nav bar with Guide avatar menu trigger, message display, collapsible bottom drawer for choices, font size controls, End Story confirmation, scroll-to-bottom button. |
| `client/src/components/GuideAvatar.tsx` | Shared Guide mascot component (glowing orb SVG). Props: `size`, `animate`. Used in both Bookshelf and ChatInterface. |
| `client/src/components/GuideConfirmDialog.tsx` | Reusable confirmation modal for Guide chatbot actions. Built on shadcn AlertDialog with brand palette. |
| `client/src/components/GuideStoryCard.tsx` | Presentational story info card (genre badge, page progress, character description). Slots into GuideConfirmDialog. |
| `client/src/components/StoryProgress.tsx` | Page progress bar with pacing phase labels. Not currently rendered (kept for future repurposing). |
| `client/src/lib/queryClient.ts` | API request helpers. Adds `x-session-id` and `x-story-id` headers to all requests. `getQueryFn` uses `queryKey[0]` as the fetch URL. |
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

Exists in the codebase but scheduled for removal — do not build on top of:

- The `users`, `enemies`, `campaigns` **table definitions** in `shared/schema.ts` — dead code from the D&D paradigm. Removing requires a migration and could break things, so leaving for now.

A list of what's already been deleted (historical reference) lives in `docs/MILESTONES.md`.

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
- [ ] Update `docs/MILESTONES.md` to reflect what shipped and what's next
- [ ] Update Section 10 (Files to Know) and Section 12 (Deliberately Deleting) if the codebase shape changed
- [ ] Verify `.env.example` has all current env vars documented
- [ ] Check for any console.log statements that should be removed from production code

This prevents technical debt from accumulating between milestones. Cowork will remind you to do this — if it doesn't, ask.
