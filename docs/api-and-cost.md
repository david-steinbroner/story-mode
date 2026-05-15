# Story Mode — API, Rate Limits, & Cost

> **TL;DR (read this first):** AI is **Claude 3.5 Haiku via OpenRouter**, ~**$0.003 per page** (short story ~$0.09, novel ~$0.35, epic ~$0.88). **Rate limits:** 240 AI calls/hr, 1000 general/hr, both keyed by `sessionId`, Postgres-backed since v1.3.0. **Daily spend cap: $10** (hard ceiling, warns at $8). Max tokens 2000 per AI call. **Retry budget: 2 attempts max** — cap shared between parse-failure retries and Chunk B quality-validator retries (stall / fake choices / final-page breach). Realistic post-Chunk-A retry rate 5–15%, adding +$0.005 to +$0.015 per story. API responses use `{success, data}` / `{success: false, error}` shape. **Source of truth for current numbers:** `server/rateLimit.ts`, `server/spendTracker.ts`, `server/aiService.ts`, `server/aiValidators.ts`.
>
> *Last updated: 2026-05-14 · Maintenance rule at the bottom.*

---

## AI provider & model

| Field | Value | Where configured |
|---|---|---|
| Provider | OpenRouter | `server/aiService.ts`, `server/summaryService.ts` |
| Model | `anthropic/claude-3.5-haiku` | Same files (literal string in `chat.completions.create`) |
| Per-call max tokens | **2000** | `aiService.ts → generateResponse()` |
| Response format | `{ type: "json_object" }` | Same |
| Retry budget on parse failure | **2 retries** (3 total attempts), 150ms delay between | `generateResponse()` |
| Em-dash post-processing | `, ` substitution | `generateResponse()` |

History: started on Claude 3.5 Haiku → switched to Mistral Small Creative → switched to DeepSeek V3 → reverted to Haiku (commit `2621f8c`, *"feat: revert to Claude 3.5 Haiku for better writing quality"*). See `docs/MILESTONES.md` for the swap rationale.

---

## Per-page cost math

Token rates from Anthropic via OpenRouter (defined in `server/spendTracker.ts`):

- **Input:** $0.0008 per 1K tokens
- **Output:** $0.004 per 1K tokens

A typical page turn:
- Input ~1,000–2,500 tokens (system prompt + recent messages + rolling summary + character context)
- Output ~300–500 tokens (80–140 words narrative + JSON wrapper + choices)
- **Per-page average: ~$0.003** (range $0.002–$0.004 depending on how deep into the story)

## Per-story cost estimates

Includes rolling summary calls every 10 pages (~$0.005 each):

| Length | Pages | All-in cost |
|---|---|---|
| Short Story | 25 | **~$0.09** |
| Novella | 50 | ~$0.18 |
| Novel | 100 | ~$0.35 |
| Epic | 250 | ~$0.88 |

Plus ~$0.0005 per "Surprise me" call (90-token output).

### Capacity by credit balance

| OpenRouter credit | Short stories | Novellas | Novels | Epics |
|---|---|---|---|---|
| $50 | ~550 | ~275 | ~140 | ~55 |
| $200 | ~2,200 | ~1,100 | ~570 | ~225 |
| $500 | ~5,500 | ~2,750 | ~1,425 | ~565 |

---

## Daily spend cap

Defined in `server/spendTracker.ts`:

- **Hard cap:** `$10/day` (UTC midnight reset). Beyond this, `/api/ai/chat` returns 429 with reset-time info.
- **Warning threshold:** `$8/day`. Captures a Sentry error so we know we're close.
- **Tracking:** persistent in the `daily_spend` table (one row per UTC date). Atomic upsert per AI call.
- **Per-session totals:** in-memory only (debugging convenience; not durable).

When the cap is hit, all AI calls fail until UTC midnight. Surprise-me, story creation, and chat all share the same budget.

---

## Rate limits

Defined in `server/rateLimit.ts`. Both limits are **per session**, not per IP — keyed via the `x-session-id` header (falls back to IP for admin/healthcheck requests without a session header).

| Limit | Value | Path |
|---|---|---|
| General API | **1000 / hour** | All non-AI endpoints |
| AI calls | **240 / hour** | `/api/ai/chat`, `/api/story/new`, `/api/story/surprise-me` |

The daily $10 cap is the real cost ceiling. These limits are politeness against runaway clients, not budget.

History: AI was 20→60→240; general was 100→500→1000. See `docs/MILESTONES.md` for the timing of each bump.

---

## API response shape

All API responses follow this shape (defined in `CLAUDE.md §6`):

```ts
// Success
{ success: true, data: T }

// Error
{ success: false, error: string, code?: string }
```

For 429 (rate limit), the response also includes:
```ts
{ error: string, limit?: number, window?: string, retryAfter: number }
```

The client uses `retryAfter` to display a countdown when applicable.

---

## Endpoints index

Primary API surface (server/routes.ts). All require `x-session-id` header except `/api/admin/*` which requires `x-admin-key`. **Story-scoped routes also require `x-story-id` (v1.8.7)** — `/api/character`, `/api/quests`, `/api/items`, `/api/messages`, `/api/game-state` (GET/PATCH), `/api/ai/chat`, `/api/ai/quick-action`. GETs return empty (`[]` or `null`) when the header is missing; writes return 400. Story-creation and listing endpoints don't need it (`/api/story/new`, `/api/story/surprise-me`, `/api/stories`).

### Story lifecycle
| Method | Path | Notes |
|---|---|---|
| POST | `/api/story/new` | Creates a new story with first page. DB-backed creation lock (`story_creation_locks` table). |
| POST | `/api/story/surprise-me` | Generates 1–2 sentence character description(s). Optional `?count=N` (1–5, default 1). `count=1` returns legacy `{ description: string }`; `count>1` returns `{ descriptions: string[] }` via a single AI call with `response_format: json_object` (the prompt asks the model to span different vibes/settings). ~$0.0005 per description. |
| GET | `/api/stories` | All stories for this session. |
| DELETE | `/api/stories/:storyId` | Permanent delete. Logs `story_deleted` event. |
| PATCH | `/api/stories/:storyId/archive` | `{ archived: boolean }`. Logs `story_archived` / `story_unarchived`. |
| PATCH | `/api/game-state` | Update current story state. Setting `storyComplete: true` logs `story_completed`. |

### AI
| Method | Path | Notes |
|---|---|---|
| POST | `/api/ai/chat` | Generate next page. Per-(session, story) chat lock (in-memory, 60s). Logs `page_turned` + `ai_fallback` on error. |

### Admin (require `x-admin-key` matching `ADMIN_KEY` env var)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/spend` | Today + all-time spend stats. |
| GET | `/api/admin/sessions` | Per-session usage (in-memory, since-last-restart). |

---

## Cost monitoring SQL

Run these against the Supabase project to see live cost data.

**Total spend + average cost per call:**
```sql
SELECT
  ROUND(SUM(total_cost_micro_dollars) / 1000000.0, 4) AS total_spent_usd,
  SUM(request_count) AS total_ai_calls,
  ROUND(
    (SUM(total_cost_micro_dollars) / 1000000.0)
    / NULLIF(SUM(request_count), 0),
    5
  ) AS avg_cost_per_call_usd
FROM daily_spend;
```

**Today only:**
```sql
SELECT * FROM daily_spend WHERE date = CURRENT_DATE;
```

**Parse-failure rate (AI quality signal):**
```sql
SELECT
  COUNT(*) FILTER (WHERE event_type = 'page_turned') AS pages_turned,
  COUNT(*) FILTER (WHERE event_type = 'ai_fallback') AS fallbacks,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE event_type = 'ai_fallback')
    / NULLIF(COUNT(*) FILTER (WHERE event_type = 'page_turned'), 0),
    2
  ) AS fallback_pct
FROM event_log
WHERE created_at > NOW() - INTERVAL '24 hours';
```

Target: `fallback_pct` below 1%. Sustained above 5% means the retry logic isn't compensating for a deeper problem.

---

## Monetization (future)

Not yet implemented. Tracked in `docs/ROADMAP.md` → "Monetization decision."

Math floor when we do monetize: **a 100-page novel costs ~$0.35 in API**. Pricing must clear that with margin for infrastructure (Render, Supabase) + retention loss + fraud. Free tier likely covers short stories; novels/epics are the natural paywall.

---

## Maintenance

- **Update when:** rate limits, max-tokens, model, daily cap, or pricing tier values change. Same commit as the code change.
- **TL;DR refresh:** rewrite the top block whenever model swaps, rate-limit ceilings move materially, or the daily cap changes.
- **Source of truth conflicts:** code (`rateLimit.ts`, `spendTracker.ts`, `aiService.ts`) wins. If this doc disagrees, update this doc.
- **Last updated:** 2026-05-14
