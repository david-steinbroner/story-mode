# Story Mode

Mobile-first AI storytelling. Describe a character in a sentence or two; your Guide builds a world around them and the story unfolds through tap-based choices. No accounts, no dice, no RPG knowledge required.

Live at **[mystorymode.com](https://mystorymode.com)**.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Tailwind, shadcn/ui, TanStack Query |
| Server | Express, Node 20 |
| Database | PostgreSQL (Supabase), Drizzle ORM |
| AI | Anthropic via OpenRouter — Sonnet 4 for page generation (admin-toggleable to Haiku 3.5 from `/admin`), Haiku 3.5 for summaries and surprise-me. Prompt caching active on page-gen (10× discount on cached input). Per-call cost math in `server/spendTracker.ts → MODEL_PRICING`. |
| Analytics | PostHog (client) + `event_log` table (server, ground truth) |
| Errors | Sentry (client + server) |
| Deploy | Render (web service + managed Postgres), auto-deploy from `main` |

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Required env vars (see `.env.example`):

- `OPENROUTER_API_KEY` — AI responses
- `DATABASE_URL` — Supabase connection string
- `ADMIN_KEY` — protects `/api/admin/*`
- `SENTRY_DSN`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` — optional, observability

```bash
npm run check        # tsc --noEmit
npm run db:push      # push schema to DB (after editing shared/schema.ts)
```

**Testing on a real phone over LAN:** find your machine's IP with `ifconfig | grep "inet "`, then visit `http://192.168.x.x:3000` on a device on the same wifi. Useful since Story Mode is mobile-first.

## Deploying

`git push origin main` → Render auto-deploys. Render builds via `npm run build`, runs `npm start` from `dist/`.

## Layout

```
client/src/         React SPA
  App.tsx           3-view router: bookshelf / newStory / game
  components/       Bookshelf, NewStoryCreation, ChatInterface, GuideAvatar
  lib/              API helpers, analytics, error tracking
server/
  index.ts          Express setup, rate limiting, Sentry
  routes.ts         All API endpoints (thin handlers)
  aiService.ts      AI calls, prompt construction, pacing
  summaryService.ts Rolling story summaries
  spendTracker.ts   DB-backed daily AI spend cap
  eventLog.ts       Server-side funnel analytics
  dbStorage.ts      Postgres queries (session + story scoped)
shared/schema.ts    Drizzle schema + Zod types — source of truth
migrations/         SQL migrations
```

## For engineers

Before touching code, read `CLAUDE.md` (root) — it's the engineering operating manual. It also routes to:

- `docs/design-system.md` — palette, typography, spacing, interaction model
- `docs/ai-voice.md` — Guide voice, narration rules, banned vocabulary, prompt structure
- `docs/api-and-cost.md` — endpoints, rate limits, token cost, daily cap
- `docs/MILESTONES.md` — what shipped and when
- `docs/ROADMAP.md` — what's next

**A note on collaboration:** when working with an AI agent on this codebase, CLAUDE.md §2 establishes five working rules (no decisions without the PM, no changes without the PM, front-load permissions, front-load requirements, version bump on every push). The agent should propose before acting on anything that shapes the product.

## Design constraints

- **Anonymous sessions** per browser. No accounts; sessions live in localStorage.
- **Tap-first.** AI returns 3–4 choices; free text is secondary. All tap targets ≥ 44px.
- **No RPG terminology in UI.** "Your Guide" not "DM"; "Story" not "Campaign"; "Page" not "Session".
- **Mobile-first.** Designed at 375px; scales up.
- **Pastel Playground palette.** Cream backgrounds, no pure black, light-only (no dark mode).
