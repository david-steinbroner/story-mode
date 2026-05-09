import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

// Each story page turn fans out to ~4-5 GET requests for character/quests/items/messages,
// so a 25-page session burns ~125 reads on its own. The limit has to comfortably fit a
// long session by a single user without throttling them.
const GENERAL_LIMIT = 500;
const AI_LIMIT = 60;

// express-rate-limit attaches state to req.rateLimit at runtime via module augmentation,
// but the augmentation only registers if the package is imported as a side-effect type.
// This helper lets us reach the field without sprinkling `as any` through the file.
function getRateLimitInfo(req: Request) {
  return (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit;
}

export const generalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: GENERAL_LIMIT,
  message: { error: 'Too many requests from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log(`[RateLimit] General limit exceeded for IP: ${req.ip}`);
    const resetTime = getRateLimitInfo(req)?.resetTime;
    res.status(429).json({
      error: 'Too many requests. Please try again in a few minutes.',
      retryAfter: Math.ceil((resetTime?.getTime() || Date.now()) / 1000),
    });
  },
});

// AI calls are the costly path — DB writes plus an OpenRouter charge per request.
// 60/hour comfortably covers a full story session at one page per minute.
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: AI_LIMIT,
  message: { error: 'Too many AI requests. Please wait before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const resetTime = getRateLimitInfo(req)?.resetTime;
    const minutesUntilReset = resetTime
      ? Math.ceil((resetTime.getTime() - Date.now()) / (1000 * 60))
      : 60;

    console.log(`[RateLimit] AI limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: `You've used your AI request limit. Please try again in ${minutesUntilReset} minutes.`,
      limit: AI_LIMIT,
      window: '1 hour',
      retryAfter: Math.ceil((resetTime?.getTime() || Date.now()) / 1000),
    });
  },
});

// Reserved for very expensive operations (image generation, bulk imports). Currently unused
// but kept exported because adding rate-limited endpoints in the future is common.
export const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Rate limit exceeded for this operation.' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.log(`[RateLimit] Strict limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'This operation has a strict rate limit. Please try again later.',
      limit: 5,
      window: '1 hour',
    });
  },
});
