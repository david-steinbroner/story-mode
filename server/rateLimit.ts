import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import { PostgresRateLimitStore } from './rateLimitStore';

// Each story page turn fans out to ~4-5 GET requests for character/quests/items/messages,
// so a 25-page session burns ~125 reads on its own. The limit has to comfortably fit a
// long session by a single user without throttling them.
const GENERAL_LIMIT = 1000;
// 60/hour was too tight: an active reader hitting a page every 30s exhausts it in 30min.
// 240/hour ≈ one page every 15 seconds for a full hour. The $10/day spend cap in
// spendTracker is the real cost ceiling; this limiter is for politeness, not budget.
const AI_LIMIT = 240;

// Key rate limiting by sessionId (which the client sends via x-session-id) so a shared
// IP (NAT / public wifi) doesn't make multiple readers compete for the same bucket.
// Falls back to IP when the header is missing — admin requests, healthchecks, etc.
// ipKeyGenerator normalizes IPv6 so per-host buckets can't be bypassed by varying
// the lower 64 bits of an IPv6 address.
const keyBySession = (req: Request) => {
  const sessionId = req.headers['x-session-id'];
  if (typeof sessionId === 'string' && sessionId.length > 0) return `session:${sessionId}`;
  return `ip:${ipKeyGenerator(req.ip ?? '')}`;
};

// express-rate-limit attaches state to req.rateLimit at runtime via module augmentation,
// but the augmentation only registers if the package is imported as a side-effect type.
// This helper lets us reach the field without sprinkling `as any` through the file.
function getRateLimitInfo(req: Request) {
  return (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit;
}

export const generalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: GENERAL_LIMIT,
  keyGenerator: keyBySession,
  store: new PostgresRateLimitStore('general'),
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[RateLimit] General limit exceeded for key: ${keyBySession(req)}`);
    }
    const resetTime = getRateLimitInfo(req)?.resetTime;
    res.status(429).json({
      error: 'Too many requests. Please try again in a few minutes.',
      retryAfter: Math.ceil((resetTime?.getTime() || Date.now()) / 1000),
    });
  },
});

// AI calls are the costly path: DB writes plus an OpenRouter charge per request.
// Keyed by session so two readers behind the same NAT don't share a bucket.
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: AI_LIMIT,
  keyGenerator: keyBySession,
  store: new PostgresRateLimitStore('ai'),
  message: { error: 'Too many AI requests. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const resetTime = getRateLimitInfo(req)?.resetTime;
    const minutesUntilReset = resetTime
      ? Math.ceil((resetTime.getTime() - Date.now()) / (1000 * 60))
      : 60;

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[RateLimit] AI limit exceeded for key: ${keyBySession(req)}`);
    }
    res.status(429).json({
      error: `You've used your AI request limit. Please try again in ${minutesUntilReset} minutes.`,
      limit: AI_LIMIT,
      window: '1 hour',
      retryAfter: Math.ceil((resetTime?.getTime() || Date.now()) / 1000),
    });
  },
});

// Strict bucket — 5 per hour. Used for low-volume, anti-spam paths.
// First user: POST /api/issue-report (v1.13.0). Keyed by session so a real
// reader filing multiple bugs on the same WiFi doesn't blow out another
// reader's bucket; falls back to IP when no session header is present.
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: keyBySession,
  store: new PostgresRateLimitStore('strict'),
  message: { error: 'Rate limit exceeded for this operation.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[RateLimit] Strict limit exceeded for key: ${keyBySession(req)}`);
    }
    res.status(429).json({
      error: 'This operation has a strict rate limit. Please try again later.',
      limit: 5,
      window: '1 hour',
    });
  },
});

// Puzzle attempt bucket (v1.14.0). Keyed by (session, puzzleId) so a single
// reader can attempt many puzzles in a session, but no single puzzle can be
// brute-forced beyond 30 submissions/hour. Submissions are cheap (string
// compare); this limit exists to deter scripted brute force, not save cost.
const PUZZLE_ATTEMPT_LIMIT = 30;

const keyBySessionAndPuzzle = (req: Request) => {
  const sessionId = req.headers['x-session-id'];
  // express-rate-limit calls keyGenerator BEFORE Zod parses the body, so we
  // read req.body.puzzleId loosely. Express's body-parser has already run
  // (see server/index.ts), so JSON body is available. Truncate to 64 chars
  // to match the Zod cap in routes.ts, so a malicious long body can't bloat
  // the rate_limit_buckets table even though Zod hasn't run yet.
  const rawPuzzleId = (req.body as { puzzleId?: unknown } | undefined)?.puzzleId;
  const puzzleId = typeof rawPuzzleId === 'string' && rawPuzzleId.length > 0
    ? rawPuzzleId.slice(0, 64)
    : null;
  const session = typeof sessionId === 'string' && sessionId.length > 0
    ? `session:${sessionId}`
    : `ip:${ipKeyGenerator(req.ip ?? '')}`;
  const puzzle = puzzleId ? `puzzle:${puzzleId}` : 'puzzle:unknown';
  return `${session}|${puzzle}`;
};

export const puzzleAttemptLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: PUZZLE_ATTEMPT_LIMIT,
  keyGenerator: keyBySessionAndPuzzle,
  store: new PostgresRateLimitStore('puzzle_attempt'),
  message: { error: 'Too many attempts on this puzzle.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[RateLimit] Puzzle attempt limit exceeded for key: ${keyBySessionAndPuzzle(req)}`);
    }
    res.status(429).json({
      error: 'Too many attempts on this puzzle in the last hour. Try again later.',
      limit: PUZZLE_ATTEMPT_LIMIT,
      window: '1 hour',
    });
  },
});
