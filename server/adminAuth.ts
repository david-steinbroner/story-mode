/**
 * Admin authentication — the single seam for all admin login checks.
 *
 * The Express adminAuth middleware in `server/routes.ts` calls
 * `verifyAdminSession()` from this file on every protected request. Keep
 * verification logic HERE, not inlined in routes, so the multi-admin
 * migration is a one-file change.
 *
 * ----------------------------------------------------------------------------
 * Today: single-admin, env-var backed, session-token based (v1.14.5).
 *
 *   Env vars (all required for admin login):
 *
 *   - ADMIN_KEY          — long random string, timing-safe compared
 *   - ADMIN_TOTP_SECRET  — base32 TOTP secret, verified with otplib
 *                          (RFC 6238, 30s window, ±1 step drift tolerance)
 *   - ADMIN_JWT_SECRET   — 32+ byte random string used to sign session tokens
 *
 *   Flow:
 *   1. Client POSTs key + TOTP to /api/admin/login.
 *   2. Server verifies both factors via `verifyAdminCredentials`.
 *   3. On success, `issueAdminSession` returns a JWT (8h expiry).
 *   4. Client stores the token in localStorage; sends as
 *      `Authorization: Bearer <token>` on every admin request.
 *   5. Middleware calls `verifyAdminSession` on each request.
 *
 *   The TOTP step happens once per ~8h, not on every request like v1.14.4.
 *
 * ----------------------------------------------------------------------------
 * Rotating ADMIN_JWT_SECRET acts as "log out all sessions" — any token signed
 * with the old secret immediately fails `verifyAdminSession`. There is no
 * server-side denylist; revocation is via secret rotation. Acceptable for
 * the single-admin model.
 *
 * ----------------------------------------------------------------------------
 * To set up / rotate the TOTP secret:
 *
 *   1. Locally: `tsx scripts/gen-admin-totp.ts`
 *      Prints a QR code in the terminal + the base32 secret string.
 *   2. Scan the QR with 1Password (or paste the secret manually).
 *   3. Paste the base32 secret into Render env as ADMIN_TOTP_SECRET.
 *   4. Redeploy. Old codes from any prior secret immediately stop working.
 *
 * To set / rotate ADMIN_JWT_SECRET:
 *   1. Generate: `openssl rand -hex 32`
 *   2. Paste into Render env as ADMIN_JWT_SECRET.
 *   3. Redeploy. All existing JWTs immediately invalidated.
 *
 * ----------------------------------------------------------------------------
 * Future migration to multi-admin (DB-backed) — when we actually need it:
 *
 *   1. Add `admin_users` table:
 *        id, username, key_hash (bcrypt/argon2), totp_secret,
 *        recovery_codes (JSONB), created_at, last_login_at, is_active
 *   2. Replace the body of `verifyAdminCredentials()` below with a DB
 *      lookup by username. Keep the function signature stable.
 *   3. Add `x-admin-username` header to /login; surface a username field
 *      in `AdminDashboard.tsx` login form.
 *   4. Extend JWT payload with `sub: <userId>` for per-admin attribution.
 *   5. Drop the ADMIN_KEY / ADMIN_TOTP_SECRET env vars after migration.
 *
 *   The session-token shape stays the same.
 * ----------------------------------------------------------------------------
 */

import { verifySync } from "otplib";
import { timingSafeEqual } from "crypto";
import jwt, { type Algorithm, type JwtPayload } from "jsonwebtoken";

// Allow ±30 seconds of clock drift between the admin's phone and the server.
// Standard tolerance for TOTP apps. 30s = ±1 step at the default 30s period.
const TOTP_DRIFT_TOLERANCE_SECONDS = 30;

// v1.14.5: session token lifetime. 8h aligns with a workday; admin re-logs
// in once a day. Make this configurable via env var if we ever need finer
// control per environment.
const SESSION_TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8 hours
const JWT_ALGORITHM: Algorithm = "HS256";

/** Why a verification failed. Maps to HTTP status in the middleware. */
export type AdminAuthFailureReason =
  | "not-configured" // server missing ADMIN_KEY or ADMIN_TOTP_SECRET → 503
  | "invalid-credentials"; // anything else (bad key, bad TOTP, missing header) → 401

export type AdminAuthResult =
  | { ok: true }
  | { ok: false; reason: AdminAuthFailureReason };

/**
 * Verify an admin login attempt. Returns ok=true only when BOTH factors pass.
 *
 * We intentionally collapse "wrong key" and "wrong TOTP" into a single
 * `invalid-credentials` reason so the response doesn't leak which factor
 * failed — that's the standard auth-best-practice. The legitimate admin
 * gets a single "Invalid credentials" message and retries; an attacker who
 * only has the key learns nothing about how far they got.
 */
export function verifyAdminCredentials(
  key: string | undefined,
  totp: string | undefined,
): AdminAuthResult {
  const expectedKey = process.env.ADMIN_KEY;
  const totpSecret = process.env.ADMIN_TOTP_SECRET;

  if (!expectedKey || !totpSecret) {
    return { ok: false, reason: "not-configured" };
  }

  // Both factors required. Missing either → fail before doing crypto work.
  if (typeof key !== "string" || typeof totp !== "string") {
    return { ok: false, reason: "invalid-credentials" };
  }

  // Constant-time key compare. Length mismatch short-circuits since
  // timingSafeEqual throws on unequal-length buffers.
  if (key.length !== expectedKey.length) {
    return { ok: false, reason: "invalid-credentials" };
  }
  const provided = Buffer.from(key);
  const expected = Buffer.from(expectedKey);
  if (!timingSafeEqual(provided, expected)) {
    return { ok: false, reason: "invalid-credentials" };
  }

  // TOTP verify. otplib does constant-time comparison internally and
  // accepts the current window ±1 by the options set above.
  // Strip whitespace so a code with stray spaces still verifies.
  const cleanedTotp = totp.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleanedTotp)) {
    return { ok: false, reason: "invalid-credentials" };
  }
  let totpResult: { valid: boolean };
  try {
    totpResult = verifySync({
      token: cleanedTotp,
      secret: totpSecret,
      epochTolerance: TOTP_DRIFT_TOLERANCE_SECONDS,
    });
  } catch {
    // Malformed secret in env. Treat as not-configured so the response
    // points at the right fix instead of looking like a user error.
    return { ok: false, reason: "not-configured" };
  }
  if (!totpResult.valid) {
    return { ok: false, reason: "invalid-credentials" };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// v1.14.5 — session tokens. Issued by POST /api/admin/login after the
// key+TOTP factors verify; sent by the client on every subsequent admin
// request via Authorization: Bearer. Avoids re-verifying TOTP on every poll.
// ---------------------------------------------------------------------------

export interface SessionIssueResult {
  token: string;
  expiresAt: string; // ISO timestamp
}

/**
 * Sign a session JWT. Throws if ADMIN_JWT_SECRET is missing — callers should
 * verify env var presence (or rely on the middleware's not-configured path).
 */
export function issueAdminSession(): SessionIssueResult {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    throw new Error("ADMIN_JWT_SECRET not configured");
  }
  const expiresAtSec = Math.floor(Date.now() / 1000) + SESSION_TOKEN_TTL_SECONDS;
  const token = jwt.sign(
    { sub: "admin" },
    secret,
    { algorithm: JWT_ALGORITHM, expiresIn: SESSION_TOKEN_TTL_SECONDS },
  );
  return {
    token,
    expiresAt: new Date(expiresAtSec * 1000).toISOString(),
  };
}

/**
 * Verify a session token from an Authorization: Bearer header. Returns
 * ok=true only when the signature matches our secret AND the token hasn't
 * expired. Both bad-signature and expired tokens collapse into
 * "invalid-credentials" so the response doesn't leak which it was.
 */
export function verifyAdminSession(token: string | undefined): AdminAuthResult {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) {
    return { ok: false, reason: "not-configured" };
  }
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "invalid-credentials" };
  }
  try {
    const decoded = jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] }) as JwtPayload;
    if (decoded.sub !== "admin") {
      return { ok: false, reason: "invalid-credentials" };
    }
    return { ok: true };
  } catch {
    // jsonwebtoken throws on bad sig / malformed / expired. Collapse all.
    return { ok: false, reason: "invalid-credentials" };
  }
}

/**
 * Helper: extract the bearer token from an Authorization header value.
 * Returns undefined if absent or malformed (anything other than
 * "Bearer <token>"). Lets the middleware delegate header parsing here.
 */
export function extractBearerToken(authHeader: string | undefined): string | undefined {
  if (typeof authHeader !== "string") return undefined;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}
