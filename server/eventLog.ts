import { db } from "./db";
import { eventLog } from "@shared/schema";
import { captureError } from "./sentry";

// Server-side analytics. PostHog runs client-side and can be blocked by ad
// blockers / privacy extensions, so we duplicate the funnel-critical events
// here as ground truth. Read with SQL directly from `event_log`.
export type ServerEventType =
  | "story_started"
  | "page_turned"
  | "story_completed"
  | "story_archived"
  | "story_unarchived"
  | "story_deleted"
  | "ai_fallback"
  | "ai_request_failed"
  // Chunk B: per-response quality validators. Logged once per generateResponse
  // call, including retries. Properties carry the violation flags.
  | "ai_quality_violation"
  // v1.9.0: every successful AI call records the resolved model so admin can
  // attribute spend Haiku-vs-Sonnet over a date range. Properties: { model,
  // endpoint, durationMs?, promptTokens?, completionTokens? }.
  | "ai_call"
  // v1.9.0: admin flipped the runtime model override. Properties: { from, to }.
  | "admin_model_override_set";

export async function logEvent(
  sessionId: string,
  eventType: ServerEventType,
  properties?: Record<string, unknown>,
  storyId?: string,
): Promise<void> {
  try {
    await db.insert(eventLog).values({
      sessionId,
      storyId: storyId ?? null,
      eventType,
      properties: properties ?? null,
    });
    // Dev-only stream so the terminal shows events firing in real time.
    // Gated on NODE_ENV so production logs stay clean. Added in 1.5.1 after
    // Chunk B testing made it hard to tell whether validators were actually
    // logging anything from the dev terminal alone.
    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[event_log] ${eventType} session=${sessionId.slice(0, 8)} story=${storyId?.slice(0, 8) ?? "—"}${
          properties ? ` ${JSON.stringify(properties)}` : ""
        }`,
      );
    }
  } catch (err) {
    // Logging must never fail the request that triggered it.
    captureError(err, { context: "logEvent", eventType, sessionId, storyId });
  }
}
