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
  | "ai_request_failed";

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
  } catch (err) {
    // Logging must never fail the request that triggered it.
    captureError(err, { context: "logEvent", eventType, sessionId, storyId });
  }
}
