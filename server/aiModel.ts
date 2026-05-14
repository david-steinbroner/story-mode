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
 *   2. **AI_MODEL_OVERRIDE env var.** Set in Render env if we ever want to
 *      flip the default model globally without a code change.
 *
 *   3. **DEFAULT_MODEL** (Haiku). Current production default. To change the
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

export const DEFAULT_MODEL = "anthropic/claude-3.5-haiku";

/**
 * Short aliases for the query-string toggle on the frontend
 * (`?testmodel=sonnet`). The backend also accepts full OpenRouter IDs
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

/**
 * Pick the model for a given request.
 *
 * @param headerValue — value of the `X-Test-Model` header. Pass `undefined`
 *   if absent. Ignored entirely when NODE_ENV === 'production'.
 */
export function resolveModel(headerValue: string | undefined): string {
  const isProd = process.env.NODE_ENV === "production";

  if (!isProd && typeof headerValue === "string" && headerValue.trim()) {
    const trimmed = headerValue.trim();
    // Accept either a known alias (short name) or a full model ID.
    // Full IDs always contain "/" (provider/model), aliases never do.
    if (trimmed.includes("/")) {
      return trimmed;
    }
    if (MODEL_ALIASES[trimmed]) {
      return MODEL_ALIASES[trimmed];
    }
    // Unknown short name. Fall through to env var / default rather than
    // sending garbage to OpenRouter.
  }

  const envOverride = process.env.AI_MODEL_OVERRIDE;
  if (envOverride && envOverride.trim()) {
    return envOverride.trim();
  }

  return DEFAULT_MODEL;
}
