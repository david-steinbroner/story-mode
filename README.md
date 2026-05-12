# Story Mode

Mobile-first AI storytelling. Describe a character in a sentence or two; your Guide builds a world around them and the story unfolds through tap-based choices. No accounts, no dice, no RPG knowledge required.

Live at **[mystorymode.com](https://mystorymode.com)**.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Tailwind, shadcn/ui, TanStack Query |
| Server | Express, Node 20 |
| Database | PostgreSQL (Supabase), Drizzle ORM |
| AI | Claude 3.5 Haiku via OpenRouter |
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
- `SENTRY_DSN`, `POSTHOG_KEY` — optional, observability

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

- `CLAUDE.md` — engineering operating manual (read this before editing). Covers code style, brand/UX rules, Definition of Done, "Do Not Touch" list, files-to-know table.
- `docs/MILESTONES.md` — milestone history, current state, and what was deleted along the way.

## Design constraints

- **Anonymous sessions** per browser. No accounts; sessions live in localStorage.
- **Tap-first.** AI returns 3–4 choices; free text is secondary. All tap targets ≥ 44px.
- **No RPG terminology in UI.** "Your Guide" not "DM"; "Story" not "Campaign"; "Page" not "Session".
- **Mobile-first.** Designed at 375px; scales up.
- **Pastel Playground palette.** Cream backgrounds, no pure black, light-only (no dark mode).
