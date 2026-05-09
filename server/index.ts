import express, { type Request, Response, NextFunction } from "express";
// Sentry MUST be initialized before any other imports that may throw, so its
// instrumentation hooks are in place when the rest of the app loads.
import { initSentry, Sentry, captureError } from "./sentry";
initSentry();
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { generalLimiter } from "./rateLimit";
import { testConnection } from "./db";

const app = express();
app.set('trust proxy', 1); // Render's reverse proxy fronts every request
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
