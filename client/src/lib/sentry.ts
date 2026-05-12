import * as Sentry from "@sentry/react";

export function initSentry() {
  // Only initialize if DSN is provided
  if (!import.meta.env.VITE_SENTRY_DSN) {
    console.log("Sentry DSN not configured, skipping initialization");
    return;
  }

  try {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      integrations: [
        Sentry.browserTracingIntegration(),
        // Disable replay integration to avoid 403 errors
        // Sentry.replayIntegration({
        //   maskAllText: false,
        //   blockAllMedia: false,
        // }),
      ],

      // Performance Monitoring
      tracesSampleRate: 0.1, // 10% of transactions

      // Session Replay - disabled
      // replaysSessionSampleRate: 0.1, // 10% of sessions
      // replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

      // Filter out development errors
      beforeSend(event) {
        if (import.meta.env.MODE === 'development') {
          return null; // Don't send in dev
        }
        return event;
      },
    });
  } catch (error) {
    console.error("Failed to initialize Sentry:", error);
  }
}

// Helper to capture custom errors with context
export function captureError(error: Error, context?: Record<string, any>) {
  console.error('[Sentry] Capturing error:', error.message, context);
  Sentry.captureException(error, {
    extra: context,
  });
}

// Helper to set user context with character info
export function setUserContext(userId: string, characterInfo?: {
  name?: string;
  level?: number;
  class?: string;
}) {
  Sentry.setUser({
    id: userId,
    username: characterInfo?.name || 'Unknown Adventurer',
  });

  if (characterInfo) {
    Sentry.setContext("character", {
      name: characterInfo.name,
      level: characterInfo.level,
      class: characterInfo.class,
    });
  }
}

// Helper to set game state context
export function setGameContext(context: {
  currentScene?: string;
  activeQuestCount?: number;
  itemCount?: number;
  inCombat?: boolean;
  currentView?: string;
  currentTab?: string;
}) {
  Sentry.setContext("game_state", context);
}

// Helper to add breadcrumb (trail of events leading to error)
export function addBreadcrumb(message: string, data?: Record<string, any>) {
  Sentry.addBreadcrumb({
    message,
    data,
    level: 'info',
  });
}

// Helper to capture messages
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, any>) {
  if (context) {
    Sentry.setContext("message_context", context);
  }

  Sentry.captureMessage(message, level);
}
