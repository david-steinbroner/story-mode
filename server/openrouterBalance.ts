/**
 * OpenRouter credit balance fetcher (v1.14.5). Proxies the OR `/credits`
 * endpoint so the dashboard can show real prepaid balance — not the
 * synthetic $10/day local cap, which is a separate concern (see
 * `spendTracker.ts`).
 *
 * Cached in-memory for 1 hour. Balance doesn't change minute-to-minute and
 * we don't want to hammer OR's API on every dashboard poll. On API failure,
 * returns the last-cached value when available so a transient OR outage
 * doesn't blank the card.
 *
 * Key never leaves the server — the dashboard calls our endpoint, which
 * calls OR with the API key from env.
 */
import { captureError } from "./sentry";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface OpenRouterBalance {
  totalCredits: number;
  totalUsage: number;
  remainingCredits: number;
  cachedAt: string; // ISO timestamp
}

interface CacheEntry {
  data: OpenRouterBalance;
  expiresAt: number;
}

let _cache: CacheEntry | null = null;

export function _resetCacheForTesting(): void {
  _cache = null;
}

export type BalanceFetchResult =
  | { ok: true; data: OpenRouterBalance; fromCache: boolean }
  | { ok: false; reason: "no-api-key" | "or-api-failed" | "bad-response-shape"; lastCached?: OpenRouterBalance };

/**
 * Returns the cached balance if fresh, otherwise fetches from OR. On failure
 * after a successful prior fetch, returns the stale cached value with a
 * fromCache flag so the caller can decide whether to show a "stale" badge.
 */
export async function getOpenRouterBalance(): Promise<BalanceFetchResult> {
  // Cached + fresh: return as-is.
  if (_cache && _cache.expiresAt > Date.now()) {
    return { ok: true, data: _cache.data, fromCache: true };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: "no-api-key",
      lastCached: _cache?.data,
    };
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter /credits returned ${response.status}`);
    }

    const body = await response.json();
    // Expected shape: { data: { total_credits: number, total_usage: number } }
    const totalCredits = body?.data?.total_credits;
    const totalUsage = body?.data?.total_usage;
    if (typeof totalCredits !== "number" || typeof totalUsage !== "number") {
      captureError(new Error("OpenRouter /credits: unexpected response shape"), {
        context: "openrouterBalance:parse",
        bodyKeys: body?.data ? Object.keys(body.data) : null,
      });
      return {
        ok: false,
        reason: "bad-response-shape",
        lastCached: _cache?.data,
      };
    }

    const data: OpenRouterBalance = {
      totalCredits,
      totalUsage,
      remainingCredits: Math.max(0, totalCredits - totalUsage),
      cachedAt: new Date().toISOString(),
    };

    _cache = {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    return { ok: true, data, fromCache: false };
  } catch (err) {
    captureError(err as Error, { context: "openrouterBalance:fetch" });
    console.error("[openrouterBalance] fetch failed:", err);
    return {
      ok: false,
      reason: "or-api-failed",
      lastCached: _cache?.data,
    };
  }
}
