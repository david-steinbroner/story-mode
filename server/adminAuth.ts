/**
 * Admin authentication — the single seam for all admin login checks.
 *
 * The Express adminAuth middleware in `server/routes.ts` calls
 * `verifyAdminCredentials()` from this file. Keep verification logic HERE,
 * not inlined in routes, so the multi-admin migration is a one-file change.
 *
 * ----------------------------------------------------------------------------
 * Today: single-admin, env-var backed.
 *
 *   - ADMIN_KEY            — long random string, timing-safe compared
 *   - ADMIN_TOTP_SECRET    — base32 TOTP secret, verified with otplib
 *                            (RFC 6238, 30s window, ±1 step drift tolerance)
 *
 *   Both must be set in env for admin login to work. If either is missing,
 *   /api/admin/* returns 503 "Admin auth not configured on server".
 *
 *   The 6-digit code can come from any TOTP app (1Password, Google
 *   Authenticator, Authy, etc.).
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
 * ----------------------------------------------------------------------------
 * Future migration to multi-admin (DB-backed) — when we actually need it:
 *
 *   1. Add `admin_users` table:
 *        id, username, key_hash (bcrypt/argon2), totp_secret,
 *        recovery_codes (JSONB), created_at, last_login_at, is_active
 *   2. Replace the body of `verifyAdminCredentials()` below with a DB
 *      lookup by username. Keep the function signature stable — middleware
 *      and routes don't need to change.
 *   3. Add `x-admin-username` header to admin requests; surface a username
 *      field in `AdminDashboard.tsx` login form.
 *   4. Drop the ADMIN_KEY / ADMIN_TOTP_SECRET env vars after the migration
 *      seeds the first admin row.
 *
 *   The wire format (`x-admin-key` + `x-admin-totp` headers) stays the same.
 *   The middleware in `server/routes.ts` stays the same. Only this file
 *   meaningfully changes.
 * ----------------------------------------------------------------------------
 */

import { verifySync } from "otplib";
import { timingSafeEqual } from "crypto";

// Allow ±30 seconds of clock drift between the admin's phone and the server.
// Standard tolerance for TOTP apps. 30s = ±1 step at the default 30s period.
const TOTP_DRIFT_TOLERANCE_SECONDS = 30;

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
