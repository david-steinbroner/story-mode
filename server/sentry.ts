import * as Sentry from "@sentry/node";

export function initSentry() {
  if (!process.env.SENTRY_DSN) {
    console.log("Sentry DSN not configured, skipping initialization");
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',

    // 10% sampling on traces. Story Mode's per-request cost (DB + AI) is much
    // higher than the Sentry billing cost, so even at low sample rates we get
    // useful latency signal across the AI critical path.
    tracesSampleRate: 0.1,

    // Drop development events at the SDK boundary so dev-time noise never
    // touches the production project. We still init in dev (so the SDK is
    // wired up), but no events leave the box.
    beforeSend(event) {
      if (process.env.NODE_ENV === 'development') {
        return null;
      }
      return event;
    },
  });

  // Crash safety. Express's error middleware doesn't catch errors thrown from
  // setImmediate / setTimeout / native promise rejections; without these
  // listeners the worker exits silently and Render's auto-restart hides it.
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    Sentry.captureException(err);
    // Give Sentry a moment to flush before letting the default handler run.
    Sentry.close(2000).then(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
    Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
  });
}

export function captureError(error: unknown, context?: Record<string, any>) {
  Sentry.captureException(error, {
    extra: context,
  });
}

export function setUserContext(userId: string, username?: string) {
  Sentry.setUser({
    id: userId,
    username: username,
  });
}

export { Sentry };
