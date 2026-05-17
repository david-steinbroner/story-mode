import { db } from "./db";
import { dailySpend } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { captureError } from "./sentry";

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface DailyTotals {
  date: string;
  totalCost: number;
  requestCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
}

interface AllTimeStats {
  totalCost: number;
  requestCount: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
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

const pricingFor = (model: string) => MODEL_PRICING[model] ?? FALLBACK_PRICING;

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
    return (usage.promptTokens / 1000) * input + (usage.completionTokens / 1000) * output;
  }

  private async getDailyTotals(): Promise<DailyTotals> {
    const date = todayKey();
    try {
      const rows = await db.select().from(dailySpend).where(eq(dailySpend.date, date)).limit(1);
      if (rows.length === 0) {
        return { date, totalCost: 0, requestCount: 0, totalPromptTokens: 0, totalCompletionTokens: 0 };
      }
      const row = rows[0];
      return {
        date,
        totalCost: microsToDollars(row.totalCostMicroDollars),
        requestCount: row.requestCount,
        totalPromptTokens: row.totalPromptTokens,
        totalCompletionTokens: row.totalCompletionTokens,
      };
    } catch (err) {
      captureError(err, { context: "spendTracker.getDailyTotals" });
      // On read failure we fail open — better to serve a request than to lock the
      // app out of the AI path because the spend table is briefly unreachable.
      return { date, totalCost: 0, requestCount: 0, totalPromptTokens: 0, totalCompletionTokens: 0 };
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
        })
        .from(dailySpend);
      const r = rows[0];
      return {
        totalCost: microsToDollars(r?.totalCostMicros ?? 0),
        requestCount: r?.requestCount ?? 0,
        totalPromptTokens: r?.totalPromptTokens ?? 0,
        totalCompletionTokens: r?.totalCompletionTokens ?? 0,
      };
    } catch (err) {
      captureError(err, { context: "spendTracker.getAllTimeTotals" });
      return { totalCost: 0, requestCount: 0, totalPromptTokens: 0, totalCompletionTokens: 0 };
    }
  }

  async canMakeRequest(): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
    const today = await this.getDailyTotals();

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
        })
        .onConflictDoUpdate({
          target: dailySpend.date,
          set: {
            requestCount: sql`${dailySpend.requestCount} + 1`,
            totalCostMicroDollars: sql`${dailySpend.totalCostMicroDollars} + ${costMicros}`,
            totalPromptTokens: sql`${dailySpend.totalPromptTokens} + ${tokenUsage.promptTokens}`,
            totalCompletionTokens: sql`${dailySpend.totalCompletionTokens} + ${tokenUsage.completionTokens}`,
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
  }> {
    const [today, allTime] = await Promise.all([this.getDailyTotals(), this.getAllTimeTotals()]);
    return {
      today,
      allTime,
      dailyLimit: DAILY_LIMIT_USD,
      remainingBudget: Math.max(0, DAILY_LIMIT_USD - today.totalCost),
      averageCostPerRequest: allTime.requestCount > 0 ? allTime.totalCost / allTime.requestCount : 0,
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
