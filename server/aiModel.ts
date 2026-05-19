/**
 * Model resolution for AI calls — the single seam for picking which model
 * a given request hits.
 *
 * Why a dedicated file: when we want to do tier-based model routing later
 * (e.g. shorts on Haiku, novels on Sonnet), or run an A/B, this is where
 * the logic lives. The four `openai.chat.completions.create({...})` call
 * sites in `server/aiService.ts` all call `resolveModel()` instead of
 * hardcoding the model name.
 *
 * ----------------------------------------------------------------------------
 * Resolution order (highest priority first):
 *
 *   1. **Dev-only header override.** When NODE_ENV !== 'production' AND the
 *      X-Test-Model request header is set to a known alias OR a full
 *      OpenRouter model ID, use that. Lets us run Haiku-vs-Sonnet
 *      side-by-side in two browser tabs without restarts. Ignored in prod.
 *
 *   2. **Admin runtime override (v1.9.0).** Persisted in the `app_config`
 *      table under key `active_model`. Flipped from /admin → `POST
 *      /api/admin/model-override`, which calls `setAdminModelOverride()`
 *      below to update the in-memory cache synchronously. Effective on the
 *      VERY NEXT AI call — no restart needed. Loaded once at server start
 *      via `loadAdminModelOverride()`.
 *
 *   3. **AI_MODEL_OVERRIDE env var.** Sysadmin fallback. Persists across
 *      restarts even if the DB row is wiped.
 *
 *   4. **DEFAULT_MODEL** (Haiku). Current production default. To change the
 *      production default permanently, edit the constant below and ship.
 *
 * ----------------------------------------------------------------------------
 * Updating the Sonnet model ID:
 *
 *   OpenRouter's exact model IDs evolve as Anthropic ships new Sonnet
 *   versions. If `MODEL_ALIASES.sonnet` below is stale, check
 *   https://openrouter.ai/models?author=anthropic for the current ID and
 *   update the constant. The full ID always works as a fallback if you
 *   pass it directly: `?testmodel=anthropic/claude-sonnet-4-x`.
 */

import type { IStorage } from "./storage";

export const DEFAULT_MODEL = "anthropic/claude-3.5-haiku";

/**
 * Short aliases for the query-string toggle on the frontend
 * (`?testmodel=sonnet`) AND the admin toggle (DB stores the alias, not the
 * full ID, so swapping in a newer Sonnet model ID here updates the live
 * setting automatically). The backend also accepts full OpenRouter IDs
 * directly, so an unmapped alias just gets passed through to OpenRouter,
 * which will error if it's not real.
 *
 * Keep this list small. Adding aliases here is one half of the work; the
 * other half is updating the frontend badge to render the short label.
 */
export const MODEL_ALIASES: Record<string, string> = {
  haiku: "anthropic/claude-3.5-haiku",
  // Sonnet 4.x family on OpenRouter. Update if Anthropic ships a newer
  // Sonnet that we want to test against. Check OpenRouter's model list
  // (link in the file header) for the exact current ID.
  sonnet: "anthropic/claude-sonnet-4",
};

// Admin runtime override. Stored as an alias (e.g. "haiku" or "sonnet") OR
// a full OpenRouter ID; resolveModel() does alias-to-ID translation. Null
// means no override active; the resolver falls through to env/default.
let _adminOverride: string | null = null;

/**
 * Read the current admin override (raw stored value — alias or full ID).
 * The admin GET endpoint uses this to populate the toggle UI.
 */
export function getAdminModelOverride(): string | null {
  return _adminOverride;
}

/**
 * Update the in-memory cache. Called by the admin POST endpoint AFTER the
 * DB write succeeds. Pass `null` to clear the override.
 *
 * Synchronous so the very next AI call sees the new value — no cache delay.
 */
export function setAdminModelOverride(value: string | null): void {
  _adminOverride = value;
}

/**
 * One-shot load from DB at server boot. Failures are silent — if the DB
 * round-trip fails, the override stays null and we fall through to env/
 * default. Admin can re-set via /admin once the DB recovers.
 */
export async function loadAdminModelOverride(storage: IStorage): Promise<void> {
  try {
    const row = await storage.getConfig("active_model");
    _adminOverride = row?.value ?? null;
  } catch {
    _adminOverride = null;
  }
}

/**
 * Resolve an alias to a full OpenRouter model ID. Pass-through if the
 * input already contains "/" (provider/model shape).
 */
function aliasToId(value: string): string {
  if (value.includes("/")) return value;
  return MODEL_ALIASES[value] ?? value;
}

/**
 * Pick the model for a given request.
 *
 * @param headerValue — value of the `X-Test-Model` header. Pass `undefined`
 *   if absent. Ignored entirely when NODE_ENV === 'production'.
 * @param opts.purpose — when 'puzzle-generation', short-circuits to the haiku
 *   alias regardless of header / admin / env overrides. Rationale: puzzle gen
 *   is a structural task; the admin model toggle exists to A/B narration
 *   voice. Keeping puzzles deterministic on Haiku means cost predictability
 *   and lets the admin A/B narration without unintentionally swapping the
 *   puzzle generator. v1.14.0.
 */
export function resolveModel(
  headerValue: string | undefined,
  opts?: { purpose?: 'narration' | 'puzzle-generation' },
): string {
  if (opts?.purpose === 'puzzle-generation') {
    return aliasToId('haiku');
  }

  const isProd = process.env.NODE_ENV === "production";

  if (!isProd && typeof headerValue === "string" && headerValue.trim()) {
    const trimmed = headerValue.trim();
    if (trimmed.includes("/")) {
      return trimmed;
    }
    if (MODEL_ALIASES[trimmed]) {
      return MODEL_ALIASES[trimmed];
    }
    // Unknown short name. Fall through to admin/env/default rather than
    // sending garbage to OpenRouter.
  }

  if (_adminOverride && _adminOverride.trim()) {
    return aliasToId(_adminOverride.trim());
  }

  const envOverride = process.env.AI_MODEL_OVERRIDE;
  if (envOverride && envOverride.trim()) {
    return envOverride.trim();
  }

  return DEFAULT_MODEL;
}
