import type { Store, IncrementResponse, Options } from "express-rate-limit";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { rateLimitBuckets } from "@shared/schema";
import { captureError } from "./sentry";

// Postgres-backed store for express-rate-limit. Replaces the default in-memory
// MemoryStore so buckets survive deploys and stay coherent across instances.
//
// Each limiter passes its own prefix so different limiters never share a row
// for the same client key. Atomic UPSERT with a CASE-guarded reset means a
// single round-trip per request — no read-then-write race.
export class PostgresRateLimitStore implements Store {
  private windowMs = 60 * 60 * 1000;

  constructor(private readonly keyPrefix: string) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private prefixed(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }

  async increment(rawKey: string): Promise<IncrementResponse> {
    const key = this.prefixed(rawKey);
    const now = new Date();
    const newResetAt = new Date(now.getTime() + this.windowMs);
    // postgres-js doesn't accept raw Date in sql`...` template params; pass ISO
    // strings and let Postgres implicit-cast to timestamptz.
    const nowIso = now.toISOString();
    const newResetIso = newResetAt.toISOString();

    try {
      // If the row is missing OR its window has elapsed, start a new window at 1.
      // Otherwise increment the existing count. Both branches run in a single
      // UPSERT so two concurrent requests can't both see "fresh window".
      const result = await db
        .insert(rateLimitBuckets)
        .values({ key, count: 1, resetAt: newResetAt })
        .onConflictDoUpdate({
          target: rateLimitBuckets.key,
          set: {
            count: sql`CASE WHEN ${rateLimitBuckets.resetAt} <= ${nowIso}::timestamptz THEN 1 ELSE ${rateLimitBuckets.count} + 1 END`,
            resetAt: sql`CASE WHEN ${rateLimitBuckets.resetAt} <= ${nowIso}::timestamptz THEN ${newResetIso}::timestamptz ELSE ${rateLimitBuckets.resetAt} END`,
          },
        })
        .returning({ count: rateLimitBuckets.count, resetAt: rateLimitBuckets.resetAt });

      const row = result[0];
      return {
        totalHits: row.count,
        resetTime: row.resetAt,
      };
    } catch (err) {
      // Fail open on store errors — better to skip the limit on a Postgres
      // hiccup than to lock everyone out of the AI path. The spendTracker cap
      // is the real cost ceiling. Return totalHits=1 (the bucket should reflect
      // *this* request even though we couldn't persist) so express-rate-limit
      // doesn't reject the response as invalid.
      captureError(err, { context: "PostgresRateLimitStore.increment", prefix: this.keyPrefix });
      return { totalHits: 1, resetTime: newResetAt };
    }
  }

  async decrement(rawKey: string): Promise<void> {
    const key = this.prefixed(rawKey);
    try {
      await db
        .update(rateLimitBuckets)
        .set({ count: sql`GREATEST(${rateLimitBuckets.count} - 1, 0)` })
        .where(eq(rateLimitBuckets.key, key));
    } catch (err) {
      captureError(err, { context: "PostgresRateLimitStore.decrement", prefix: this.keyPrefix });
    }
  }

  async resetKey(rawKey: string): Promise<void> {
    const key = this.prefixed(rawKey);
    try {
      await db.delete(rateLimitBuckets).where(eq(rateLimitBuckets.key, key));
    } catch (err) {
      captureError(err, { context: "PostgresRateLimitStore.resetKey", prefix: this.keyPrefix });
    }
  }
}
