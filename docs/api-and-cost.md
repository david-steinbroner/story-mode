# Story Mode — API, Rate Limits, & Cost

> **TL;DR (read this first):** Two models in rotation via OpenRouter — page generation is whichever the admin toggle (`app_config.active_model`) points at (today **Claude Sonnet 4**, ~$0.011 per page uncached, less once cache reads kick in), rolling summaries and surprise-me always run on **Claude 3.5 Haiku** for cost (~$0.001 per call). Per-call cost is computed from a per-model `MODEL_PRICING` map in `server/spendTracker.ts`, so the cost column is correct even when the admin flips models mid-day. **Prompt caching is live on page-gen calls** (v1.10.0) — cached input tokens billed at 10% of base rate via Anthropic's ephemeral 5-min cache through OpenRouter; daily savings surfaced on the admin dashboard. Sonnet-era short story ~$0.30, novel ~$1.10, epic ~$2.75 before cache savings. **Every AI call path tracks spend** (v1.9.9 closed the followup/sidequest/world-gen gap). **Rate limits:** 240 AI calls/hr, 1000 general/hr, both keyed by `sessionId`, Postgres-backed since v1.3.0. **Daily spend cap: $10** (hard ceiling, warns at $8). Max tokens 2000 per AI call. **Retry budget: 2 attempts max** — cap shared between parse-failure retries and Chunk B quality-validator retries (stall / fake choices / final-page breach). API responses use `{success, data}` / `{success: false, error}` shape. **Source of truth for current numbers:** `server/rateLimit.ts`, `server/spendTracker.ts`, `server/aiService.ts`, `server/aiValidators.ts`, `server/aiModel.ts`.
>
> *Last updated: 2026-05-17 · Maintenance rule at the bottom.*

---

## AI provider & model

| Field | Value | Where configured |
|---|---|---|
| Provider | OpenRouter | `server/aiService.ts`, `server/summaryService.ts` |
| Page-generation model | Admin toggle (`app_config.active_model`) — today: `anthropic/claude-sonnet-4` | `server/aiModel.ts → resolveModel()` |
| Summary model (hardcoded) | `anthropic/claude-3.5-haiku` | `server/summaryService.ts → SUMMARY_MODEL` |
| Surprise-me model (hardcoded) | `anthropic/claude-3.5-haiku` | `server/routes.ts` (in `/api/story/surprise-me`) |
| Per-call max tokens | **2000** | `aiService.ts → generateResponse()` |
| Response format | `{ type: "json_object" }` | Same |
| Retry budget on parse failure | **2 retries** (3 total attempts), 150ms delay between | `generateResponse()` |
| Em-dash post-processing | `, ` substitution | `generateResponse()` |

History: Haiku 3.5 was the default through v1.8.x; v1.9.0 added the admin runtime model toggle; v1.9.8 flipped page-generation to Sonnet 4 as the active production model and made cost tracking per-call model-aware (was hardcoded Haiku constants before); v1.9.9 closed the helper-call tracking gap; v1.10.0 enabled Anthropic prompt caching on page-gen. See `docs/MILESTONES.md` for the cost-audit lane that landed those four versions.

---

## Per-call cost math

Pricing is a per-model map keyed by full OpenRouter model ID, defined in `server/spendTracker.ts → MODEL_PRICING`:

| Model | Input ($/1K) | Output ($/1K) |
|---|---|---|
| `anthropic/claude-3.5-haiku` | $0.0008 | $0.004 |
| `anthropic/claude-sonnet-4` | $0.003 | $0.015 |

Unknown models fall back to Sonnet 4 rates (`FALLBACK_PRICING`) so we never silently under-charge.

A typical page turn at Sonnet 4 rates (without caching):
- Input ~1,000–2,500 tokens (system prompt + recent messages + rolling summary + character context)
- Output ~300–500 tokens (80–140 words narrative + JSON wrapper + choices)
- **Per-page average: ~$0.011** at Sonnet 4 uncached (was ~$0.003 on Haiku 3.5)

---

## Prompt caching (v1.10.0)

Anthropic ephemeral prompt caching is live on the page-generation path via OpenRouter. Where it applies:

- **`generateResponse`** in `server/aiService.ts` — system message is a 2-block structured content array. Block 1 = `getSystemPrompt(gameState)` output with `cache_control: { type: "ephemeral" }`. Block 2 = the per-call `momentumDirective + retryHint` (only present when non-empty), unmarked. Cache hits when consecutive page-turns within a story share the same pacing phase (i.e. most of a story's body).
- **Not applied** to summary calls, surprise-me, or the three quest/world helpers — their prompts are under Sonnet 4's 2048-token minimum so caching wouldn't activate anyway.

Pricing multipliers (vs. base input rate, via OpenRouter passthrough):

| Bucket | Multiplier | Sonnet 4 effective rate |
|---|---|---|
| Uncached input | 1.0× | $3.00 / M |
| Cached read | **0.10×** | $0.30 / M |
| Cache write (5-min TTL) | 1.25× | $3.75 / M |
| Cache write (1-hour TTL) | 2.00× | (not used; 5-min default everywhere) |

Cost formula in `spendTracker.calculateCost`:

```
uncached = prompt_tokens - cached_tokens - cache_write_tokens
cost = uncached × input_rate
     + cached_tokens   × input_rate × 0.10
     + cache_write     × input_rate × 1.25
     + completion      × output_rate
```

Captured per-day in `daily_spend.total_cached_tokens` and `daily_spend.total_cache_write_tokens` (migration `011_daily_spend_cache_columns.sql`). The admin dashboard's "Prompt Caching" section shows cache reads/writes today and estimated $ saved vs. uncached billing.

**Watchouts:**
- First page of any new story has zero cache benefit (cache miss + write at 1.25×). Subsequent pages in the same story within the 5-min TTL recoup with interest.
- Pacing-phase transitions (setup → rising → escalation → climax → final) flip the system-prompt text and cause a fresh cache write at the boundary.
- If `prompt_tokens_details` is absent from a response, `extractTokenUsage` defaults cached/write to 0 — cost math falls back to fully-uncached billing. Safer direction.

---

## Per-story cost estimates (Sonnet 4 + Haiku summaries)

Page generation runs on Sonnet 4; rolling summary calls every 10 pages run on Haiku 3.5 (~$0.001 each):

| Length | Pages | All-in cost (Sonnet 4) | For reference: Haiku 3.5 |
|---|---|---|---|
| Short Story | 25 | **~$0.30** | ~$0.09 |
| Novella | 50 | ~$0.55 | ~$0.18 |
| Novel | 100 | ~$1.10 | ~$0.35 |
| Epic | 250 | ~$2.75 | ~$0.88 |

Plus ~$0.0005 per "Surprise me" call (90-token Haiku output — unchanged by the page-model toggle).

### Capacity by credit balance (page-gen on Sonnet 4)

| OpenRouter credit | Short stories | Novellas | Novels | Epics |
|---|---|---|---|---|
| $50 | ~165 | ~90 | ~45 | ~18 |
| $200 | ~660 | ~360 | ~180 | ~72 |
| $500 | ~1,650 | ~900 | ~450 | ~180 |

Flip the toggle back to Haiku to roughly 3.75× these counts.

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

Primary API surface (server/routes.ts). All require `x-session-id` header except `/api/admin/*` which requires `x-admin-key` + `x-admin-totp`. **Story-scoped routes also require `x-story-id` (v1.8.7)** — `/api/character`, `/api/quests`, `/api/items`, `/api/messages`, `/api/game-state` (GET/PATCH), `/api/ai/chat`, `/api/ai/quick-action`. GETs return empty (`[]` or `null`) when the header is missing; writes return 400. Story-creation and listing endpoints don't need it (`/api/story/new`, `/api/story/surprise-me`, `/api/stories`).

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

### Admin (require `x-admin-key` matching `ADMIN_KEY` env var + valid `x-admin-totp` per `ADMIN_TOTP_SECRET`)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/spend` | Today + all-time spend stats. Response shape (v1.10.0) includes `todaysTokens` / `allTimeTokens` with `prompt`, `completion`, `cached`, `cacheWrite` fields, plus `cacheSavingsToday` and `cacheSavingsAllTime` (estimated $ saved vs. uncached billing at Sonnet 4 input rate). |
| GET | `/api/admin/sessions` | Per-session usage (in-memory, since-last-restart). |
| GET | `/api/admin/recent-activity` | Last 20 `event_log` rows for support lookup. |
| GET | `/api/admin/ai-quality` | 24h Chunk-B validator violation counts + page_turned denominator. |
| GET | `/api/admin/model-override` | Current AI model toggle (v1.9.0). Returns `{ stored, resolved, aliases }` — `stored` is the alias persisted in `app_config.active_model` (or `null`), `resolved` is the full OpenRouter model ID resolution would pick right now. |
| POST | `/api/admin/model-override` | Flip the AI model toggle (v1.9.0). Body: `{ model: 'haiku' \| 'sonnet' }`. Persists to `app_config` AND updates `server/aiModel.ts`'s in-memory cache synchronously — the next AI call uses the new value. Logs `admin_model_override_set` to `event_log` for audit. |

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

- **Update when:** rate limits, max-tokens, model, daily cap, or pricing tier values change. Same commit as the code change. Bump "Last updated" below.
- **TL;DR rule:** current-state-only — describes what the cost/limits *are*, not what changed when. Rewrite the top block whenever model swaps, rate-limit ceilings move materially, or the daily cap changes. Never a running log of rate-limit tweaks (those go in `docs/MILESTONES.md`).
- **Adding a model:** update `MODEL_PRICING` in `server/spendTracker.ts` AND `MODEL_ALIASES` in `server/aiModel.ts` AND the model table above. Cost will be wrong otherwise.
- **Source of truth conflicts:** code (`rateLimit.ts`, `spendTracker.ts`, `aiService.ts`, `aiModel.ts`) wins. If this doc disagrees, update this doc.
- **Last updated:** 2026-05-17
