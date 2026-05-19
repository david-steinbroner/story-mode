import { db } from "./db";
import { dailySpend } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { captureError } from "./sentry";

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  // Prompt-cache attribution. Both default to 0 when the provider doesn't
  // return cache stats (any non-Anthropic model, or Anthropic with caching
  // not active). cachedTokens + cacheWriteTokens are SUBSETS of promptTokens,
  // not in addition to it — the rest is treated as uncached input.
  cachedTokens?: number;
  cacheWriteTokens?: number;
}

interface DailyTotals {
  date: string;
  totalCost: number;
  requestCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCachedTokens: number;
  totalCacheWriteTokens: number;
}

interface AllTimeStats {
  totalCost: number;
  requestCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalCachedTokens: number;
  totalCacheWriteTokens: number;
}

interface SessionSpend {
  requestCount: number;
  totalCost: number;
  totalTokens: number;
}

const DAILY_LIMIT_USD = 10;
const WARNING_THRESHOLD_USD = 8;

// Per-1K-token USD pricing keyed by full OpenRouter model ID.
// Source: openrouter.ai/models — must be updated when adding a model to
// `MODEL_ALIASES` in `server/aiModel.ts`. Unknown models fall back to
// FALLBACK_PRICING (Sonnet 4 rates) so we never under-charge.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "anthropic/claude-3.5-haiku": { input: 0.0008, output: 0.004 },
  "anthropic/claude-sonnet-4": { input: 0.003, output: 0.015 },
};

// Safe over-estimate for unmapped models. If we forget to add a new model
// above, we'd rather over-count than under-count and quietly blow the cap.
const FALLBACK_PRICING = { input: 0.003, output: 0.015 };

// Anthropic prompt-cache multipliers (vs base input rate). Verified against
// OpenRouter's caching guide as of 2026-05-17. If TTL changes to 1h the
// write multiplier becomes 2.0×; we default to 5m TTL across the codebase.
const CACHE_READ_MULTIPLIER = 0.10;
const CACHE_WRITE_5M_MULTIPLIER = 1.25;

const pricingFor = (model: string) => MODEL_PRICING[model] ?? FALLBACK_PRICING;

// "How much did caching save me today" — naive estimate: each cached-read
// token would have cost the full uncached input rate if we hadn't cached
// it. Uses Sonnet 4 rates since that's what page-gen runs on, which is
// where ~all our cache hits come from. Approximate — exact savings need
// per-call model accounting, which isn't worth the schema complexity for
// a single rollup number on the dashboard.
const estimateCacheSavings = (cachedTokens: number): number => {
  const baseRate = MODEL_PRICING["anthropic/claude-sonnet-4"].input;
  return (cachedTokens / 1000) * baseRate * (1 - CACHE_READ_MULTIPLIER);
};

// Convert dollar cost to integer micro-dollars for safe atomic accumulation in
// Postgres. Avoids floating-point drift when many small charges add up.
const dollarsToMicros = (dollars: number) => Math.round(dollars * 1_000_000);
const microsToDollars = (micros: number) => micros / 1_000_000;

const todayKey = () => new Date().toISOString().split("T")[0];

class SpendTracker {
  // Per-session totals are kept in memory only — they're a debugging convenience
  // for the admin dashboard and don't need to survive restarts. Daily / lifetime
  // totals come from Postgres.
  private sessionSpends = new Map<string, SessionSpend>();

  private calculateCost(usage: TokenUsage, model: string): number {
    const { input, output } = pricingFor(model);
    const cached = usage.cachedTokens ?? 0;
    const cacheWrite = usage.cacheWriteTokens ?? 0;
    // The Anthropic usage block reports cached/write as SUBSETS of the
    // total input, so subtract them out before billing the uncached portion
    // at full rate. Math.max guards against any provider that reports
    // overlap (shouldn't happen, but cheap insurance).
    const uncachedInput = Math.max(0, usage.promptTokens - cached - cacheWrite);
    return (
      (uncachedInput / 1000) * input +
      (cached / 1000) * input * CACHE_READ_MULTIPLIER +
      (cacheWrite / 1000) * input * CACHE_WRITE_5M_MULTIPLIER +
      (usage.completionTokens / 1000) * output
    );
  }

  private async getDailyTotals(forUpdate = false): Promise<DailyTotals> {
    const date = todayKey();
    try {
      // v1.14.1: optional FOR UPDATE so canMakeRequest can serialize concurrent
      // gate checks on the same day's row. Doesn't eliminate the read-check-
      // write race (the AI call still happens between canMakeRequest and
      // trackRequest, outside the lock) but it prevents simultaneous gate
      // reads from both passing when the daily total is right at the cap.
      // Full reservation pattern is deferred to v1.15.
      const baseQuery = db.select().from(dailySpend).where(eq(dailySpend.date, date)).limit(1);
      const rows = forUpdate ? await baseQuery.for('update') : await baseQuery;
      if (rows.length === 0) {
        return { date, totalCost: 0, requestCount: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalCachedTokens: 0, totalCacheWriteTokens: 0 };
      }
      const row = rows[0];
      return {
        date,
        totalCost: microsToDollars(row.totalCostMicroDollars),
        requestCount: row.requestCount,
        totalPromptTokens: row.totalPromptTokens,
        totalCompletionTokens: row.totalCompletionTokens,
        totalCachedTokens: row.totalCachedTokens,
        totalCacheWriteTokens: row.totalCacheWriteTokens,
      };
    } catch (err) {
      captureError(err, { context: "spendTracker.getDailyTotals" });
      // On read failure we fail open — better to serve a request than to lock the
      // app out of the AI path because the spend table is briefly unreachable.
      return { date, totalCost: 0, requestCount: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalCachedTokens: 0, totalCacheWriteTokens: 0 };
    }
  }

  private async getAllTimeTotals(): Promise<AllTimeStats> {
    try {
      const rows = await db
        .select({
          totalCostMicros: sql<number>`COALESCE(SUM(${dailySpend.totalCostMicroDollars}), 0)::integer`,
          requestCount: sql<number>`COALESCE(SUM(${dailySpend.requestCount}), 0)::integer`,
          totalPromptTokens: sql<number>`COALESCE(SUM(${dailySpend.totalPromptTokens}), 0)::integer`,
          totalCompletionTokens: sql<number>`COALESCE(SUM(${dailySpend.totalCompletionTokens}), 0)::integer`,
          totalCachedTokens: sql<number>`COALESCE(SUM(${dailySpend.totalCachedTokens}), 0)::integer`,
          totalCacheWriteTokens: sql<number>`COALESCE(SUM(${dailySpend.totalCacheWriteTokens}), 0)::integer`,
        })
        .from(dailySpend);
      const r = rows[0];
      return {
        totalCost: microsToDollars(r?.totalCostMicros ?? 0),
        requestCount: r?.requestCount ?? 0,
        totalPromptTokens: r?.totalPromptTokens ?? 0,
        totalCompletionTokens: r?.totalCompletionTokens ?? 0,
        totalCachedTokens: r?.totalCachedTokens ?? 0,
        totalCacheWriteTokens: r?.totalCacheWriteTokens ?? 0,
      };
    } catch (err) {
      captureError(err, { context: "spendTracker.getAllTimeTotals" });
      return { totalCost: 0, requestCount: 0, totalPromptTokens: 0, totalCompletionTokens: 0, totalCachedTokens: 0, totalCacheWriteTokens: 0 };
    }
  }

  async canMakeRequest(): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
    // v1.14.1: read the day's spend row with FOR UPDATE so two concurrent
    // gate checks serialize. Partial mitigation for the read-check-write
    // race; full reservation pattern deferred to v1.15.
    const today = await this.getDailyTotals(true);

    if (today.totalCost >= DAILY_LIMIT_USD) {
      const resetTime = new Date();
      resetTime.setUTCHours(24, 0, 0, 0);
      const hoursUntilReset = Math.ceil((resetTime.getTime() - Date.now()) / (1000 * 60 * 60));
      return {
        allowed: false,
        reason: `Daily AI budget limit reached ($${DAILY_LIMIT_USD}). Resets in ${hoursUntilReset} hours.`,
      };
    }

    // Remaining-request estimate uses fallback pricing so the number is
    // conservative when the active model is more expensive than Haiku.
    const remaining = DAILY_LIMIT_USD - today.totalCost;
    const estimatedCostPerRequest = FALLBACK_PRICING.input + FALLBACK_PRICING.output;
    return {
      allowed: true,
      remaining: Math.floor(remaining / estimatedCostPerRequest),
    };
  }

  async trackRequest(sessionId: string | undefined, usage: TokenUsage | undefined, model: string): Promise<void> {
    const tokenUsage: TokenUsage = usage ?? (() => {
      // Fallback estimate when OpenRouter doesn't return a usage block (rare).
      // Keeps the spend cap accurate enough that runaway costs are still capped.
      console.warn("[SpendTracker] No token usage provided, using fallback estimate");
      return { promptTokens: 1500, completionTokens: 500, totalTokens: 2000 };
    })();

    const cost = this.calculateCost(tokenUsage, model);
    const costMicros = dollarsToMicros(cost);
    const cachedTokens = tokenUsage.cachedTokens ?? 0;
    const cacheWriteTokens = tokenUsage.cacheWriteTokens ?? 0;
    const date = todayKey();

    try {
      await db
        .insert(dailySpend)
        .values({
          date,
          requestCount: 1,
          totalCostMicroDollars: costMicros,
          totalPromptTokens: tokenUsage.promptTokens,
          totalCompletionTokens: tokenUsage.completionTokens,
          totalCachedTokens: cachedTokens,
          totalCacheWriteTokens: cacheWriteTokens,
        })
        .onConflictDoUpdate({
          target: dailySpend.date,
          set: {
            requestCount: sql`${dailySpend.requestCount} + 1`,
            totalCostMicroDollars: sql`${dailySpend.totalCostMicroDollars} + ${costMicros}`,
            totalPromptTokens: sql`${dailySpend.totalPromptTokens} + ${tokenUsage.promptTokens}`,
            totalCompletionTokens: sql`${dailySpend.totalCompletionTokens} + ${tokenUsage.completionTokens}`,
            totalCachedTokens: sql`${dailySpend.totalCachedTokens} + ${cachedTokens}`,
            totalCacheWriteTokens: sql`${dailySpend.totalCacheWriteTokens} + ${cacheWriteTokens}`,
            updatedAt: sql`NOW()`,
          },
        });
    } catch (err) {
      // We log but do not propagate — losing a single tally row is preferable
      // to surfacing a cost-tracking error to the user mid-story.
      captureError(err, { context: "spendTracker.trackRequest", sessionId });
    }

    if (sessionId) {
      const sessionSpend = this.sessionSpends.get(sessionId) ?? {
        requestCount: 0,
        totalCost: 0,
        totalTokens: 0,
      };
      sessionSpend.requestCount += 1;
      sessionSpend.totalCost += cost;
      sessionSpend.totalTokens += tokenUsage.promptTokens + tokenUsage.completionTokens;
      this.sessionSpends.set(sessionId, sessionSpend);
    }

    // Re-read after writing so warning thresholds account for the just-applied
    // increment without trusting our local snapshot.
    const today = await this.getDailyTotals();
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[SpendTracker] Request tracked. Model: ${model}, Tokens: ${tokenUsage.promptTokens}+${tokenUsage.completionTokens}=${
          tokenUsage.promptTokens + tokenUsage.completionTokens
        }, Cost: $${cost.toFixed(6)}, Today: $${today.totalCost.toFixed(4)} (${today.requestCount} requests)`
      );
    }

    if (today.totalCost >= WARNING_THRESHOLD_USD && today.totalCost - cost < WARNING_THRESHOLD_USD) {
      captureError(new Error("Daily AI spend approaching limit"), {
        totalCost: today.totalCost,
        requestCount: today.requestCount,
        limit: DAILY_LIMIT_USD,
        percentage: ((today.totalCost / DAILY_LIMIT_USD) * 100).toFixed(1),
      });
    }
    if (today.totalCost >= DAILY_LIMIT_USD && today.totalCost - cost < DAILY_LIMIT_USD) {
      captureError(new Error("Daily AI spend limit reached"), {
        totalCost: today.totalCost,
        requestCount: today.requestCount,
        limit: DAILY_LIMIT_USD,
      });
    }
  }

  async getStats(): Promise<DailyTotals & { limit: number; percentage: number }> {
    const today = await this.getDailyTotals();
    return {
      ...today,
      limit: DAILY_LIMIT_USD,
      percentage: (today.totalCost / DAILY_LIMIT_USD) * 100,
    };
  }

  async getAdminStats(): Promise<{
    today: DailyTotals;
    allTime: AllTimeStats;
    dailyLimit: number;
    remainingBudget: number;
    averageCostPerRequest: number;
    cacheSavingsToday: number;
    cacheSavingsAllTime: number;
  }> {
    const [today, allTime] = await Promise.all([this.getDailyTotals(), this.getAllTimeTotals()]);
    return {
      today,
      allTime,
      dailyLimit: DAILY_LIMIT_USD,
      remainingBudget: Math.max(0, DAILY_LIMIT_USD - today.totalCost),
      averageCostPerRequest: allTime.requestCount > 0 ? allTime.totalCost / allTime.requestCount : 0,
      // Cost we would have paid if every cached token had been billed at the
      // full uncached input rate, minus what we actually paid. Uses Sonnet 4
      // pricing as the reference rate (cache hits today are page-gen calls,
      // all on Sonnet). Cache-WRITE tokens are billed *higher* than base
      // (1.25×) so they don't reduce cost — the savings comes from reads.
      cacheSavingsToday: estimateCacheSavings(today.totalCachedTokens),
      cacheSavingsAllTime: estimateCacheSavings(allTime.totalCachedTokens),
    };
  }

  getSessionStats(): Array<{ sessionId: string; requestCount: number; totalCost: number; totalTokens: number }> {
    return Array.from(this.sessionSpends.entries()).map(([sessionId, spend]) => ({
      sessionId,
      ...spend,
    }));
  }
}

export const spendTracker = new SpendTracker();
