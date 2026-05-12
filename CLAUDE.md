# CLAUDE.md — Story Mode Engineering Operating Manual

> Read this entire document at the start of every session before writing any code.
> Single source of truth for **how we work** — rules, current state, and pointers to the docs that hold the rest.
> The umbrella `/Users/davidsteinbroner/Projects/CLAUDE.md` also applies; this file extends it.

---

## 0. Document map (consult before diving in)

| Concern | Source of truth | Read it when |
|---|---|---|
| Engineering rules, working protocol, code style | **this file** | every session start |
| Brand language, palette, typography, voice | `docs/design-system.md` | any UI work, AI prompt change, copy change |
| What shipped, milestone history | `docs/MILESTONES.md` | when you need context on past decisions |
| What's next, deferred items | `docs/ROADMAP.md` | starting new work or deciding priority |
| How to run / deploy | `README.md` | onboarding or environment trouble |

**Read the TL;DR header** of any living doc first. Read deeper only if the task demands it. Don't read every doc on every session — that's the whole point of this structure.

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

## 2. Your Role + Working Rules

You are the engineering team. I am the PM.

- You write and edit code. I make product decisions.
- You flag tradeoffs and options. You do not make product decisions unilaterally.
- When ambiguous, stop and ask before proceeding.
- You never assume "close enough" — if requirements are unclear, ask.

### Working rules (non-negotiable)

1. **No decisions without me.** Propose options with tradeoffs; I pick. Product, UX, scope, tradeoffs — anything a reasonable PM might disagree with goes through me. Micro-coding choices (variable names, import order, loop construct, helper placement) you handle.
2. **No changes without me.** Draft edits, show them, wait for "do it," then edit. The default is *propose, don't act*.
3. **Front-load permissions.** When starting a task, tell me up front what tools/operations it'll need ("This will need ~5 file edits + 2 bash commands + an SQL run"). I greenlight once; you execute without interrupting for each step.
4. **Front-load requirements.** Gather everything you need from me in one round of questions, not piecemeal. Goal: once greenlit, you can auto-run to done.
5. **Version bump on every push.** `package.json` AND the visible UI tag (bookshelf footer). Same number both places. Bump on push, not on commit. Patch for docs-only, minor for features, major for breaking.

### Before starting any task

1. Read and understand the task
2. Know which files will be touched
3. Identify risks or dependencies
4. **Outline what tool operations you'll need** (rule 3)
5. If anything is unclear, ask before writing a single line

---

## 3. Definition of Done

A task is not done until all of the following are true:

- [ ] The feature works as described in the task
- [ ] No existing features are broken (manual smoke test: create story → read story → end story → archive)
- [ ] No TypeScript errors (`tsc --noEmit` passes)
- [ ] No console errors in the browser during normal use
- [ ] Code follows the style guide in Section 6
- [ ] Any new env vars are added to `.env.example` with a description
- [ ] Any schema change was migrated and `shared/schema.ts` reflects it
- [ ] Living docs (MILESTONES / ROADMAP / design-system) updated if the change touches their concern — *in the same commit*, not later
- [ ] Version bumped (package.json + UI footer)
- [ ] You have told me what you changed, what you tested, and what to watch out for

**Never say a task is complete if you haven't manually verified it works.**

---

## 4. How We Communicate

After completing any task, your response must include:

- **What I did** — Brief description of changes made, files touched.
- **How to test it** — Exact steps to verify the feature works. Be specific.
- **Watch out for** — Edge cases, known limitations, things that could go wrong.
- **What's next (optional)** — If there's a logical next step, flag it. Don't start it without being asked.

---

## 5. Version Control Rules

Render auto-deploys from `main`, so this is in commit-mode per the umbrella convention — commit and push after each completed task **once I've approved**.

- **Commit format:** `[type](scope): short description`
  - Types: `feat`, `fix`, `refactor`, `style`, `chore`, `docs`
  - Examples: `feat(reliability): Phase 3 — DB-backed spend`, `fix(chat): release lock on regenerate`
- **Version bump on every push** (rule 5 in §2): bump `package.json` AND the bookshelf footer together.
- **Never commit:**
  - `.env` files or secrets
  - `node_modules/`
  - `console.log` statements left in production code (operational logs in server are fine)
  - Commented-out code blocks (delete, don't comment out)
- **Branching:** We work on `main` for now. When we get closer to a wider release, we'll introduce feature branches.

---

## 6. Code Style Guide

### General
- TypeScript strict mode is on. No `any` types without a comment explaining why.
- No implicit returns in functions that should return a value.
- Descriptive names. `generateStoryResponse` not `genResp`. `playerSessionId` not `sid`.
- Functions do one thing. If a function is over 40 lines, it probably needs to be split.
- No magic numbers or strings. Use named constants. Top of file or in `shared/constants.ts`.

### React Components
- Functional components only — no class components
- Props interfaces defined above the component: `interface StoryCardProps { ... }`
- One component per file
- File name matches component name: `StoryCard.tsx` exports `StoryCard`
- Keep components under 200 lines. Extract sub-components if needed.
- No inline styles. Use Tailwind classes only. Hardcoded hex is being phased out (see `docs/ROADMAP.md` → palette consolidation).

### Server / API
- Route handlers are thin — validate input, call a service function. Business logic lives in service files.
- All API responses follow this shape:
  ```ts
  // Success
  { success: true, data: T }
  // Error
  { success: false, error: string, code?: string }
  ```
- All routes validate input with Zod before touching the DB or AI.
- Never expose internal error messages to the client. Log server-side, return generic.

### Database
- All DB queries go through the storage layer (`server/dbStorage.ts` or service files) — never query the DB directly from a route handler.
- Schema changes require a migration. Never hand-edit the database.
- Column names are `snake_case` in Postgres, `camelCase` in TypeScript (Drizzle handles this).

### AI Integration
- System prompts live in their own files or clearly labeled constants — never inline in route handlers.
- All AI calls wrapped in try/catch with a meaningful fallback.
- Log token usage on every AI call (`spendTracker.trackRequest`).
- Never send raw user input to the AI without sanitization. Use `<reader_input>...</reader_input>` delimiters.

---

## 7. Tech Stack Reference

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + TypeScript | SPA, view routing via state in `App.tsx` |
| UI | shadcn/ui + Tailwind CSS v3 | "new-york" style. See `components.json`. Tokens in `tailwind.config.ts` + `client/src/index.css`. |
| Data fetching | TanStack Query | All server state |
| Build | Vite (client) + esbuild (server) | Path aliases: `@` = `client/src`, `@shared` = `shared/` |
| Server | Express.js + Node 20 | Serves API and static files |
| Database | PostgreSQL via Supabase | Drizzle ORM for queries and migrations |
| Auth/Sessions | Anonymous session per browser | `sessionId` in localStorage, sent as `x-session-id` header |
| AI | OpenRouter → Claude 3.5 Haiku | Via OpenAI SDK. `max_tokens: 2000` per call. |
| Analytics | PostHog (client) + `event_log` table (server) | Server-side is ground truth (ad-blocker resistant) |
| Errors | Sentry | Client + server, 10% trace sample |
| Deployment | Render (web service + Supabase Postgres) | Auto-deploy from `main` |

---

## 8. Brand & UX

**Source of truth: `docs/design-system.md`.** Palette (Pastel Playground — teal primary, peach secondary, sage accent, terracotta destructive), typography (Inter + Cinzel), voice rules (Adventure Time + CYOA, no em dashes), banned vocabulary (DM, NPC, dice, stats, etc.), and interaction model (tap-first, 44px targets, mobile-first at 375px) all live there.

Read its TL;DR header at minimum before any UI / copy / AI-prompt work.

---

## 9. Current State

Current version: **v1.0.0** (visible at the bottom of the bookshelf — bump on every push per rule 5).

Most recently shipped + what's queued: see `docs/MILESTONES.md` TL;DR and `docs/ROADMAP.md` TL;DR.

---

## 10. Files to Know

| File | What it does |
|---|---|
| `shared/schema.ts` | Database schema (Drizzle + Zod). Source of truth for data models. Includes `gameState`, `messages`, `characters`, `quests`, `items`, `storySummaries`, `dailySpend`, `storyCreationLocks`, `eventLog`. |
| `server/db.ts` | Connection pool (postgres-js + Drizzle). Pool: max 20, idle_timeout 20, connect_timeout 10. |
| `server/dbStorage.ts` | Production storage. All CRUD with session + story scoping and business logic. |
| `server/storage.ts` | Exports `IStorage` interface and the `DbStorage` instance. |
| `server/routes.ts` | All API endpoints. Thin handlers. Story creation lock is DB-backed (`storyCreationLocks` table). Chat lock is in-memory per (sessionId, storyId). |
| `server/aiService.ts` | All AI calls (Claude 3.5 Haiku). Prompt construction with milestone-driven pacing. JSON response with markdown fence stripping. Rolling summary integration. Em-dash post-processing. 3-attempt retry on parse failure. |
| `server/summaryService.ts` | Rolling story summary generation, every 10 messages. |
| `server/spendTracker.ts` | DB-backed cost tracking (`daily_spend` table). Daily $10 cap + warning threshold. |
| `server/eventLog.ts` | Server-side analytics ground truth. Logs `story_started`, `page_turned`, `ai_fallback`, lifecycle events. |
| `server/rateLimit.ts` | AI: 240/hr, general: 1000/hr, keyed by `sessionId` not IP. |
| `client/src/App.tsx` | 3-view routing (bookshelf → newStory → game). `enterStory()` and `navigateToBookshelf()` set `_activeStoryId` synchronously before invalidating queries. Complex — be careful here. |
| `client/src/components/Bookshelf.tsx` | Main landing screen. First-visit hero with example prompts. Guide avatar = DropdownMenu. Book spines have long-press + kebab (⋯) menu. Archived books have Delete option. |
| `client/src/components/NewStoryCreation.tsx` | 2-step wizard: page count → character description. "Surprise me" + accepts `seedDescription` for hero example tap-through. |
| `client/src/components/ChatInterface.tsx` | Story reading screen. Top nav, message list with regenerate button (in header row, confirms before firing), bottom drawer for choices (5rem peek). Story-complete footer when `storyComplete: true`. |
| `client/src/components/GuideAvatar.tsx` | Shared Guide mascot SVG. |
| `client/src/components/GuideConfirmDialog.tsx` + `GuideStoryCard.tsx` | Foundation for the Milestone 6 chatbot (not yet wired). |
| `client/src/lib/queryClient.ts` | API helpers. Adds `x-session-id` and `x-story-id` headers. `getQueryFn` uses `queryKey[0]` as URL. |
| `client/src/lib/posthog.ts` | Client analytics. Helpers were trimmed in Phase 5 — only live ones remain. |
| `client/src/components/AdminDashboard.tsx` | Internal admin UI at `/admin?admin=1`. Gated by query string + ADMIN_KEY header. |
| `.env.example` | All required env vars. Includes `DATABASE_URL`, `ADMIN_KEY`, `OPENROUTER_API_KEY`. |

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

- The `users` table definition in `shared/schema.ts` — dead code from the D&D paradigm. (Note: `enemies` and `campaigns` are already gone, both as table definitions and as DB tables — see Supabase RLS cleanup.)
- Hardcoded hex colors in components — should be Tailwind tokens. See `docs/ROADMAP.md` → palette consolidation.

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

When in doubt, ask. A 30-second question saves a 30-minute revert. (See also rules 1–2 in §2.)

---

## 14. Maintenance Protocol

Two layers: a per-task discipline, and a periodic cleanup pass.

### Per-task (every commit)

When a code change implies a doc change, **update the doc in the same commit**. No standalone doc-hygiene commits unless I ask.

- Shipped a milestone? → entry in `docs/MILESTONES.md` + refresh its TL;DR
- Decided a future direction or shipped a roadmap item? → update `docs/ROADMAP.md` + refresh its TL;DR
- Changed brand language, palette, voice, interaction model? → update `docs/design-system.md` + refresh its TL;DR
- Changed §10 territory (added a new service, deleted a component)? → update §10 here
- Changed env vars, schema, or AI integration? → update §7 / §10 here + `.env.example`

### End-of-session ritual

When I say "we're done" or after a push, refresh any TL;DRs that drifted and add chat-only decisions to `docs/ROADMAP.md`. ~5 lines of writes max.

### Periodic cleanup pass

After every major feature session or milestone completion:

- [ ] Delete dead code identified during the session
- [ ] Check build logs for warnings: duplicate keys, unused imports, deprecation notices, bundle size issues
- [ ] Run `npm audit`; note any new high/critical vulnerabilities
- [ ] Run `tsc --noEmit`; fix new type errors
- [ ] `docs/MILESTONES.md` reflects what shipped
- [ ] §10 (Files to Know) and §12 (Deliberately Deleting) updated if the codebase shape changed
- [ ] `.env.example` has all current env vars
- [ ] No stray production `console.log` statements

This prevents tech debt from compounding between milestones.
