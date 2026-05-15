import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
// Sentry MUST be initialized before any other imports that may throw, so its
// instrumentation hooks are in place when the rest of the app loads.
import { initSentry, Sentry, captureError } from "./sentry";
initSentry();
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { generalLimiter } from "./rateLimit";
import { testConnection } from "./db";
import { loadAdminModelOverride } from "./aiModel";
import { storage } from "./storage";

const app = express();
app.set('trust proxy', 1); // Render's reverse proxy fronts every request

// ---------------------------------------------------------------------------
// Content Security Policy (PR-A4, audit 2026-05-15 #19).
//
// IMPORTANT: this is the single source of truth for which external origins
// the browser is allowed to talk to. If you add a NEW external origin (CDN,
// analytics tracker, font host, embedded widget, third-party script, etc.),
// you MUST update the relevant directive below or the browser will block it
// once we promote out of report-only.
//
// See CLAUDE.md §10 — "new external origin" is a stop-and-ask trigger.
//
// Currently in REPORT-ONLY mode (`reportOnly: true`): violations are sent to
// the browser console as warnings but the request is not blocked. Watch the
// console after deploy. If clean for ~24h in prod, flip `reportOnly` to
// `false` to enforce. A `report-uri` endpoint is a future enhancement.
// ---------------------------------------------------------------------------
const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  // 'unsafe-inline' covers Tailwind + Shadcn runtime style injection.
  // 'unsafe-eval' covers Vite dev HMR; harmless in prod since prod bundle
  // doesn't eval. Tighter version (nonces/hashes) is a future enhancement.
  scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
  // Permissive image sources — story Mode doesn't serve user-supplied images
  // today, but tightening this can wait until that ships.
  imgSrc: ["'self'", "data:", "https:"],
  // Outbound fetch/xhr/websocket destinations. Sentry SDK posts to *.ingest.sentry.io,
  // PostHog posts to *.posthog.com / *.i.posthog.com. OpenRouter calls happen
  // server-side so don't need a directive.
  connectSrc: [
    "'self'",
    "ws:",
    "wss:",
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
    "https://*.posthog.com",
    "https://*.i.posthog.com",
  ],
  workerSrc: ["'self'", "blob:"],
  // Clickjacking protection (replaces X-Frame-Options).
  frameAncestors: ["'none'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
};

app.use(helmet({
  contentSecurityPolicy: {
    directives: CSP_DIRECTIVES,
    reportOnly: true,
  },
  // helmet's default COEP is "require-corp", which breaks third-party assets
  // (Sentry, PostHog, Google Fonts) that don't set CORP headers themselves.
  crossOriginEmbedderPolicy: false,
  // Default of "no-referrer" breaks analytics referrer tracking — soften.
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/api", generalLimiter);

// Lightweight access log. In production we never include the response body
// because story content is the response body — that would leak reader-typed
// prose and AI output into Render's log retention.
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    if (!path.startsWith("/api")) return;
    const duration = Date.now() - start;
    log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
  });

  next();
});

(async () => {
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error("[server] Failed to connect to database. Exiting.");
    process.exit(1);
  }

  // Load the admin AI-model override from the app_config table into
  // aiModel.ts's in-memory cache. Silent failure leaves the override at
  // null and falls through to env/DEFAULT_MODEL.
  await loadAdminModelOverride(storage);

  const server = await registerRoutes(app);

  // Pipe everything that escapes a route handler through Sentry. Must come
  // after registerRoutes so it sits at the bottom of the middleware stack.
  Sentry.setupExpressErrorHandler(app);

  // Final error formatter. Returns a generic message to the client (so internal
  // error text never leaks) while preserving the original error for Sentry.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    captureError(err);
    if (!res.headersSent) {
      res.status(status).json({
        error: status >= 500 ? "Something went wrong on our end." : (err.message || "Bad request"),
      });
    }
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Render binds to PORT; nothing else is reachable, so this is the only port
  // we listen on. Local dev defaults to 5000 to match docs.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
