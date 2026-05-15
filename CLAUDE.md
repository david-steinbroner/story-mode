# CLAUDE.md — Story Mode Engineering Operating Manual

> Read this at the start of every session.
> Single source of truth for **how we work** — rules, current state, and pointers to the docs that hold the rest.
> The umbrella `/Users/davidsteinbroner/Projects/CLAUDE.md` also applies; this file extends it.

---

## 0. Document map (consult before diving in)

| Concern | Source of truth | Read it when |
|---|---|---|
| Engineering rules, working protocol, code style | **this file** | every session start |
| Brand, palette, typography, visual interaction | `docs/design-system.md` | UI work, copy, brand questions |
| AI voice, narration, choice rules, banned vocab | `docs/ai-voice.md` | any AI prompt change, voice tuning, content rules |
| API, rate limits, token cost, daily cap | `docs/api-and-cost.md` | spend questions, rate-limit changes, endpoint additions |
| What shipped, milestone history | `docs/MILESTONES.md` | context on past decisions |
| What's next, deferred items | `docs/ROADMAP.md` | starting new work, deciding priority |
| How to run / deploy / scripts | `README.md` | onboarding, environment trouble, finding npm scripts |

**Read TL;DR headers first.** Read deeper only if the task demands it.

---

## 1. What we're building

Story Mode is a mobile-first, AI-powered interactive storytelling platform. Live at **mystorymode.com**. Detailed product description + stack are in `README.md`.

What this is NOT: a D&D simulator, a free-text chat game, a combat-focused experience, desktop-first.

---

## 2. Your role + working rules

You are the engineering team. I am the PM. You write code; I make product decisions.

### Five non-negotiable rules

1. **No decisions without me.** Propose options + tradeoffs; I pick. Product, UX, scope, architectural tradeoffs — anything a reasonable PM might disagree with. Micro-coding (variable names, import order, helper placement, loop construct) you handle.
2. **No changes without me, except in-task execution after greenlight.** Default is *propose, don't act*. Once I greenlight a task scope, you execute the planned file edits inside that scope without further check-ins. New scope or unplanned files → stop and ask.
3. **Front-load permissions.** When starting a task, state what tool operations it'll need ("This will need ~5 file edits, 2 bash commands, an SQL run"). I greenlight once; you execute end-to-end.
4. **Front-load requirements.** Gather everything you need from me in one round of questions, not piecemeal. Goal: once greenlit, auto-run to done.
5. **Version bump on every push** (not every commit). `package.json` AND the bookshelf UI footer. Same number. Patch for docs-only, minor for features, major for breaking changes.

### Before starting any task

1. Read and understand the task
2. Identify which files will be touched + risks/dependencies
3. Outline the tool operations you'll need (rule 3)
4. Confirm scope. If unclear, ask. A 30-second question saves a 30-minute revert.

---

## 3. Definition of Done

A task is not done until all of the following are true:

- [ ] The feature works as described
- [ ] No existing features are broken (smoke test on `localhost:3000` in a private window: create story → read 1–2 pages → end story → archive)
- [ ] `npm run check` passes (`tsc --noEmit`)
- [ ] No console errors in the browser during normal use
- [ ] Code follows the style guide in §5
- [ ] Any new env var is in `.env.example` with a description
- [ ] Any schema change has a migration; `shared/schema.ts` reflects it
- [ ] Living docs updated in the SAME commit if the change touches their concern (see §11 Maintenance Protocol)
- [ ] Version bumped on push (rule 5 in §2)
- [ ] You told me what changed, what you tested, and what to watch out for

After every completed task, your response includes: **What I did** (files + summary), **How to test** (specific steps), **Watch out for** (edge cases), **What's next** (optional flag, don't act).

---

## 4. Version control

Render auto-deploys from `main`. Commit-mode per the umbrella convention — commit and push after each task once I've approved.

- **Commit format:** `type(scope): short description`
  - Types: `feat`, `fix`, `refactor`, `style`, `chore`, `docs`
  - Example: `feat(reliability): Phase 3, DB-backed spend`
- **Version bump on push** (rule 5). Bump `package.json` + bookshelf footer together.
- **Never commit:** `.env` files or secrets, `node_modules/`, stray production `console.log`, commented-out code blocks (delete, don't comment out).
- **Branching:** `main` only for now. Feature branches come in when we open up wider.

---

## 5. Code style

### General
- TypeScript strict mode. No `any` without a comment.
- No implicit returns where a return value is expected.
- Descriptive names (`generateStoryResponse`, not `genResp`).
- Functions do one thing. New functions over ~40 lines → split.
- No magic numbers/strings; use named constants.

### React components
- Functional only.
- Props interface above the component: `interface StoryCardProps { ... }`.
- One component per file, filename matches export.
- New components under ~200 lines (existing larger files are grandfathered; split when you touch them).
- No inline styles — Tailwind tokens only. Hardcoded hex is being phased out (see `docs/ROADMAP.md`).

### Server / API
- Route handlers are thin: validate input + call a service function. Business logic in service files.
- API responses use the shape in `docs/api-and-cost.md`.
- All routes validate input with Zod before touching DB or AI.
- Never expose internal error messages to the client.

### Database
- All DB queries go through the storage layer (`server/dbStorage.ts` or service files). Never query directly from a route handler.
- Schema changes require a migration. Never hand-edit the database.
- Postgres: `snake_case`. TypeScript: `camelCase`. Drizzle handles the mapping.

### AI integration
Voice/prompt rules are in `docs/ai-voice.md`. Code rules:
- System prompts in dedicated files or labeled constants — never inline in routes.
- All AI calls wrapped in try/catch with a meaningful fallback.
- Log token usage on every AI call (`spendTracker.trackRequest`).
- Never send raw user input to the AI without `<reader_input>...</reader_input>` delimiters.

### Logging
Operational server logs (init signals, cost tracking, request gates) are fine. `console.log('here')` debugging is not — strip before commit, or gate on `NODE_ENV !== 'production'`.

---

## 6. Tech stack pointer

Stack details (frameworks, AI provider, deploy target, env vars) live in `README.md`. AI-specific details (model, cost, rate limits) live in `docs/api-and-cost.md`.

---

## 7. Brand & voice pointer

Visual brand (palette, typography, spacing, components) → `docs/design-system.md`.
AI voice + narrative rules + banned vocabulary → `docs/ai-voice.md`.

---

## 8. Current state

Live at **mystorymode.com**. Version is in `package.json` and the bookshelf footer (same number, bumped per rule 5).

Most recently shipped + what's queued → `docs/MILESTONES.md` TL;DR and `docs/ROADMAP.md` TL;DR.

---

## 9. Files to know

| File | What it does |
|---|---|
| `shared/schema.ts` | DB schema (Drizzle + Zod). Tables: `gameState`, `messages`, `characters`, `quests`, `items`, `storySummaries`, `dailySpend`, `storyCreationLocks`, `eventLog`, `appConfig` (v1.9.0 generic runtime config — currently holds the admin AI model toggle). **Touch with a migration plan approved by me first.** |
| `server/db.ts` | Connection pool (postgres-js + Drizzle). Pool: max 20, idle_timeout 20, connect_timeout 10. |
| `server/dbStorage.ts` | All CRUD with session + story scoping and business logic. |
| `server/storage.ts` | Exports `IStorage` interface + active `DbStorage` instance. |
| `server/routes.ts` | All API endpoints (thin handlers). Endpoints catalogued in `docs/api-and-cost.md`. |
| `server/aiService.ts` | All AI calls. System prompt + pacing + JSON parsing + em-dash strip + retry. Rules in `docs/ai-voice.md`; cost in `docs/api-and-cost.md`. |
| `server/aiModel.ts` | **Single seam for model resolution.** `resolveModel()` is called from every AI call site. Priority chain: dev `X-Test-Model` header (non-prod only) → admin runtime override (v1.9.0, cached in-memory, persisted in `app_config.active_model`) → `AI_MODEL_OVERRIDE` env → `DEFAULT_MODEL`. The admin override loads from DB at server boot via `loadAdminModelOverride()` and updates synchronously inside the admin POST handler so flips take effect on the next AI call. |
| `server/summaryService.ts` | Rolling story summary, every 10 messages. |
| `server/spendTracker.ts` | DB-backed cost tracking with daily cap. See `docs/api-and-cost.md`. |
| `server/eventLog.ts` | Server-side funnel analytics ground truth. |
| `server/rateLimit.ts` | Rate limits live here; current values in the file. Keyed by `sessionId`. See `docs/api-and-cost.md`. |
| `client/src/App.tsx` | 3-view routing: bookshelf → newStory → game. **Don't reorder the `setActiveStoryId` / `invalidateQueries` calls in `enterStory` / `navigateToBookshelf`** — they must be synchronous before the invalidation. |
| `client/src/components/Bookshelf.tsx` | Landing screen. Anchored shelf section (tabs: Currently Reading / Finished / Archive) above a scrolling chat area with Guide welcome bubble + ephemeral Q&A history + sticky drawer with primary CTA + canned-answer `ChoiceButton`s. Book spines still long-press + `MoreVertical` button for archive/end/delete. |
| `client/src/components/NewStoryCreation.tsx` | 3-step wizard: description → length → confirm. Accepts `seedDescription` from bookshelf. Each step has a sticky drawer; Step 1's lazy-loads 3 AI character suggestions via `/api/story/surprise-me?count=3`. |
| `client/src/components/ChatInterface.tsx` | Story reading screen. Messenger-style layout (`GuideBubble` for AI, `PlayerBubble` for player, `TypingDots` while generating). Drawer for choices (5rem peek) + always-visible custom-input field. Story-complete footer when `storyComplete: true`. |
| `client/src/components/GuideAvatar.tsx` | Shared Guide mascot SVG. |
| `client/src/components/GuideBubble.tsx`, `PlayerBubble.tsx`, `ChoiceButton.tsx`, `TypingDots.tsx`, `CenteredHeader.tsx` | Shared Guide-surface primitives introduced in v1.8.0–v1.8.1. Used everywhere the Guide speaks (bookshelf, wizard, in-story). `TypingDots` uses `@keyframes typing-dot` in `index.css`. |
| `client/src/components/GuideConfirmDialog.tsx`, `GuideStoryCard.tsx` | Foundation for Milestone 6 chatbot (not yet wired — the v1.8.1 Q&A drawer uses hardcoded help copy, not the planned AI Guide chat). |
| `client/src/lib/queryClient.ts` | API helpers. Adds `x-session-id` and `x-story-id` headers. |
| `client/src/lib/posthog.ts` | Client analytics. Event taxonomy is intentional — don't reorganize. |
| `client/src/lib/sentry.ts` / `server/sentry.ts` | Error tracking config — don't modify without explicit ask. |
| `server/adminAuth.ts` | **Single seam for all admin auth.** Exports `verifyAdminCredentials(key, totp)`. Today: env-var backed (`ADMIN_KEY` + `ADMIN_TOTP_SECRET`). Top-of-file comment documents the migration path to DB-backed multi-admin — touch THIS file, not the middleware in `routes.ts`. |
| `client/src/components/AdminDashboard.tsx` | Internal admin UI at `/admin`. Gated by ADMIN_KEY + 2FA (TOTP). Login form takes a long secret key + a 6-digit code from any TOTP app (1Password etc.). |
| `scripts/gen-admin-totp.ts` | One-time / rotation tool. `tsx scripts/gen-admin-totp.ts` generates a fresh TOTP secret + prints a scannable QR for 1Password and the base32 secret to paste into Render's `ADMIN_TOTP_SECRET` env. |
| `.env.example` | All required env vars. Sync with code when adding new ones. |

The `client/src/components/ui/` folder is shadcn primitives. Update via `npx shadcn add`, don't hand-edit.

---

## 10. Questions to ask before starting

Stop and ask if any of the following are true:

- Task touches `shared/schema.ts`
- Task requires a new environment variable
- Task changes how the AI prompt is structured (see `docs/ai-voice.md`)
- Task changes how sessions or identity work
- Task touches a service file + a route + a schema field together (real risk surface)
- Task could break the smoke test (create story → read → end → archive)
- You're not sure if something is in or out of scope

---

## 11. Maintenance protocol

Three layers.

### Per-task (every commit)
When a code change touches a living doc's concern, **update the doc in the same commit**.

- Shipped a milestone → `docs/MILESTONES.md` entry + TL;DR refresh
- Decided a future direction or shipped a roadmap item → `docs/ROADMAP.md` update + TL;DR refresh
- Changed brand language, palette, voice, interaction model → `docs/design-system.md` (visual) or `docs/ai-voice.md` (AI) + TL;DR refresh
- Changed rate limits, model, cost behavior, daily cap → `docs/api-and-cost.md` + TL;DR refresh
- Changed §9 territory (new service, deleted component) → §9 here
- Changed env vars, schema → `.env.example`, §9 here

### End-of-session ritual
When I say "we're done" or after a push, refresh any TL;DRs that drifted and log chat-only decisions to `docs/ROADMAP.md`. ~5 lines of writes max.

### Before each milestone push
Run `tsc --noEmit` and `npm audit`. If either fails, fix before push.

---

*Living docs (the ones in `docs/`) each have their own TL;DR + maintenance footer specifying when to update them. The per-task rule above is the universal trigger; each doc's footer adds specifics.*
