# Admin Dashboard Polish — v1.14.5 Design Spec

**Status:** Drafted 2026-05-20, awaiting PM greenlight.
**Scope:** Three improvements to `/admin`:
1. Real OpenRouter balance card (replaces the misleading "Daily Budget" synthetic limit as the source of truth)
2. Session-token auth (replaces TOTP-per-request, which currently logs the admin out every ~30s)
3. Logout button

**Out of scope:**
- Multi-admin support (still single env-backed admin; multi-admin migration path documented in `server/adminAuth.ts` header is unchanged)
- Token refresh flow (single fixed-expiry JWT; user re-logs in after expiry)
- Cookie-based sessions (localStorage chosen — see §2 trade-offs)
- Server-side token revocation list (stateless JWT — see §2 trade-offs)
- Removing the existing "Daily Budget Remaining" card (it gets *renamed* to "Daily Spend Cap" to disambiguate from the new real-balance card — see §1)
- Admin warning when OpenRouter balance is low (out of scope; can be a v1.14.x followup)

---

## §1 — OpenRouter balance card

### Problem

The "Daily Budget Remaining" card on `/admin` shows `$10 − today's local tally`. This is a synthetic spend cap we enforce locally (`spendTracker.canMakeRequest`), not money in your OpenRouter account. PM expected it to reflect real prepaid balance.

### Approach

**Server side** — new admin endpoint that proxies OpenRouter's balance API:

- New endpoint: `GET /api/admin/openrouter-balance` (behind the same admin middleware as the rest)
- Internally: `GET https://openrouter.ai/api/v1/credits` with `Authorization: Bearer ${process.env.OPENROUTER_API_KEY}` header
- Response shape from OpenRouter (per their docs): `{ data: { total_credits: number, total_usage: number } }`
- We return: `{ totalCredits, totalUsage, remainingCredits, cachedAt: ISO string }`
- **Cached in-memory for 1 hour** (the balance doesn't change minute-to-minute and we don't want to hammer OR's API on every dashboard poll)
- On OpenRouter API failure: return last-cached value if present, else `{ error: "OpenRouter balance unavailable" }` 503. Don't 500 the whole admin dashboard.

**No new env var needed** — uses existing `OPENROUTER_API_KEY`. The key never leaves the server.

**Client side**:

- New `OpenRouter Credits` card in the existing Spend section
- Shows: `remainingCredits` formatted as `$NN.NN` with subtitle `of $TT used (as of HH:MM)` where TT = `totalCredits`
- Loading state: `—`
- Stale-data badge (small `(1h cache)` note) so PM knows it's not real-time
- **Rename the existing "Daily Budget Remaining" card → "Daily Spend Cap Remaining"** with subtitle `of $10 internal cap`. Disambiguates from the new real-balance card; PM was confused about which was which.
- Layout consequence: Spend section's `grid grid-cols-1 md:grid-cols-3 gap-3` currently has 6 cards. Adding a 7th will wrap to a new row (one card alone on the third row). Acceptable. If aesthetically off, bump to `md:grid-cols-4` to get an even 4×2 grid — cosmetic, defer to build-time.

### Error cases

- **`OPENROUTER_API_KEY` missing in env**: endpoint returns 503 with `{ error: "OpenRouter API key not configured" }`. Card shows `—`. Doesn't take down the dashboard.
- **OpenRouter API call fails (500, timeout, etc.)**: return last cached value if present, else 503 with `{ error: "OpenRouter balance unavailable" }`. Card shows last value or `—`.
- **OpenRouter returns unexpected JSON shape**: log to Sentry, return 503.

### Files touched

- `server/routes.ts` — add `GET /api/admin/openrouter-balance` handler
- `client/src/components/AdminDashboard.tsx` — new card + fetch URL in the existing `Promise.allSettled` (the v1.14.2 pattern means OR API outage won't break the dashboard)
- No schema, no migration

### Acceptance criteria

- Card shows current OpenRouter remaining credits within 1h freshness
- Refreshes ~hourly automatically (next dashboard poll after the 1h cache window expires)
- OpenRouter API outage: card shows last-cached or `—`; rest of dashboard unaffected
- Network tab shows `/api/admin/openrouter-balance` returning 200 with sensible JSON

---

## §2 — Session-token auth

### Problem

Current admin auth (per `server/adminAuth.ts`) verifies `x-admin-key` + `x-admin-totp` on every request. The frontend caches the TOTP code from initial login and replays it on every 30s auto-refresh. TOTP codes are valid for ~30s (±30s drift tolerance, so practically 60–90s). The polling outlives the code; first stale-TOTP refresh returns 401 across all admin endpoints; the dashboard interprets that as "wrong credentials" and forces re-login.

### Approach

**Server side** — issue session tokens after initial TOTP verification:

- **New env var: `ADMIN_JWT_SECRET`** (32+ byte random hex/base64 string). Document in `.env.example` + `server/adminAuth.ts` header.
- **New library: `jsonwebtoken`** (~30KB, industry standard, MIT). Alternative: hand-roll HMAC-SHA256 using Node's built-in `crypto` — saves the dep but adds ~40 lines. Going with the library for clarity unless PM objects.
- **New endpoint: `POST /api/admin/login`**
  - Body: `{ adminKey: string, totp: string }`
  - **Wrapped in `strictLimiter`** (5/hr per session, already defined in `server/rateLimit.ts`) — prevents brute-force on the key+TOTP factor pair. The other admin endpoints stay on `generalLimiter` via the catch-all `/api` prefix.
  - Calls existing `verifyAdminCredentials(key, totp)` — keeps the single-admin seam pattern from `adminAuth.ts`
  - On success: signs a JWT with payload `{ sub: "admin", iat, exp }`, 8h expiry. Returns `{ token: string, expiresAt: ISO string }`
  - On failure: 401 with the same collapsed message
- **New endpoint: `POST /api/admin/logout`**
  - Stateless JWT means logout is client-side only (token discard). Server endpoint exists so the wire shape supports future denylist if we add it; for v1.14.5 it's a no-op that returns 204.
- **New helper: `verifyAdminSession(token)`** in `server/adminAuth.ts`
  - Verifies signature with `ADMIN_JWT_SECRET`, checks `exp`, returns `{ ok: true }` or `{ ok: false, reason }`
  - Keeps the auth seam pattern (multi-admin migration would replace this body too)
- **Modified middleware: `adminAuth` in `routes.ts`**
  - First tries `Authorization: Bearer ...` → `verifyAdminSession`
  - If header absent: returns 401 (no fallback to key+TOTP for protected endpoints; key+TOTP is only accepted at `/api/admin/login`)
  - Existing `/api/admin/login` route uses the old `verifyAdminCredentials` directly, bypassing the middleware

**Client side**:

- On login form submit: `POST /api/admin/login` with key+TOTP, receive token, store in `localStorage` under key `admin_session_token`
- On every admin request: `Authorization: Bearer ${token}` header (replaces the `x-admin-key` + `x-admin-totp` headers)
- On 401 from any admin endpoint: clear stored token, show login form
- On page reload: read token from localStorage, immediately attempt the dashboard fetch — if 401, show login

### Trade-offs (so the choice is explicit)

| Decision | Picked | Alternative | Why |
|---|---|---|---|
| Token shape | **Signed JWT** | Random opaque + DB sessions table | 1-admin app, no need for revocation. JWT is stateless, no schema change. |
| Storage | **`localStorage`** | `httpOnly` cookie + CSRF token | localStorage is XSS-vulnerable, but admin dashboard renders no user-supplied content (low XSS risk). Cookie path requires server-side cookie handling, CSRF, same-site choice — adds ~50 lines. |
| Expiry | **8 hours** | 24h or 7 days | 8h matches a workday; admin re-logs in once a day. Configurable via constant. |
| Refresh | **None** | Sliding window or refresh token | Out of scope — extra surface for not much benefit at 1-admin scale. |
| Server-side revocation | **None** | Token denylist (DB or in-memory) | Stateless JWT means we can't kill a token before exp. For 1-admin if the secret leaks, rotate `ADMIN_JWT_SECRET` (invalidates all tokens). Acceptable. |

### Files touched

- `package.json` + `package-lock.json` — add `jsonwebtoken` (and `@types/jsonwebtoken` for dev)
- `.env.example` — add `ADMIN_JWT_SECRET=` placeholder + comment
- `server/adminAuth.ts` — add `verifyAdminSession()` + `issueAdminSession()` helpers; update header comment to document the seam now covers both factor-check and session-issue/verify
- `server/routes.ts` — add `POST /api/admin/login`, `POST /api/admin/logout`; modify `adminAuth` middleware to use `verifyAdminSession`
- `client/src/components/AdminDashboard.tsx` — login submit hits `/login` endpoint, store token in localStorage, send via Authorization header on subsequent fetches, handle expiry/401 by clearing token + showing login form

### Acceptance criteria

- After single TOTP entry, dashboard polls every 30s for 8 hours without re-prompting
- Token persists across browser refresh (localStorage)
- 401 from any admin endpoint clears the token + returns to login form
- After `ADMIN_JWT_SECRET` rotation, all in-flight tokens immediately fail
- Existing `tsx scripts/gen-admin-totp.ts` setup script is unaffected (TOTP is still used at login)

---

## §3 — Logout button

### Problem

No way to manually invalidate session. Closing the tab leaves the token in localStorage.

### Approach

- Header (line ~362-371 of `AdminDashboard.tsx`) gets a `Log out` button on the right, next to "Last updated"
- Styling: text button, matches the existing header chrome (no big primary-button)
- `onClick`:
  1. `fetch('/api/admin/logout', { method: 'POST', headers: { Authorization: \`Bearer ${token}\` } })` — best-effort, ignore failures
  2. `localStorage.removeItem('admin_session_token')`
  3. `setIsAuthenticated(false)` + clear in-memory token state
  4. Form fields reset to empty

Trivial once §2 is in place — entirely client-side once token is gone.

### Acceptance criteria

- "Log out" button visible in dashboard header
- Clicking it returns to the login form
- localStorage no longer has `admin_session_token`
- Reload after logout shows login form (not the dashboard)

---

## Open design questions for PM

These need PM input **before I start building** (per CLAUDE.md "no decisions without me"):

1. **Token expiry — 8h, 24h, or 7d?** Spec says 8h. Longer = less re-login friction, more risk if token leaks.
2. **OpenRouter balance refresh cadence — 1h or different?** Spec says 1h cache. Tighter = more API calls to OR; looser = staler dashboard.
3. **Library choice — `jsonwebtoken` vs hand-rolled HMAC?** Spec says use the library (clearer, 30KB). The hand-rolled version saves the dep but adds ~40 lines of crypto code.
4. **Logout button placement — header next to timestamp, or in a dropdown menu?** Spec says header, inline. Alternative is a settings menu (more space for future items like "rotate JWT secret", "change TOTP").
5. **Low-balance warning on the OpenRouter card?** Spec says no (out of scope for v1.14.5). Could be a one-liner — alert badge when remaining < $X.
6. **Rename of "Daily Budget Remaining" → "Daily Spend Cap Remaining"?** Spec says yes (matches the actual semantics). If you'd rather keep the old label, flag it.

---

## Risk areas

- **Token storage in localStorage** is the main security concession. The dashboard renders no user-supplied content (no XSS surface today), and the admin is one trusted person. Documented in §2 trade-offs. If we ever add user content to the admin dashboard (e.g., rendering issue-report descriptions raw), revisit.
- **JWT secret rotation** invalidates all in-flight tokens, which is the "logout all sessions" mechanism. Document this in `server/adminAuth.ts` header.
- **`ADMIN_JWT_SECRET` missing in env** → all logins 503 with "Admin auth not configured" (existing pattern). Document in `.env.example`.
- **OpenRouter API outage** → `Promise.allSettled` in the dashboard fetch means the balance card shows `—` but everything else loads. Same defensive pattern as v1.14.2.
- **Token leak in browser dev tools / extensions** — accepted risk for the 1-admin model. Rotate the secret if you suspect compromise.

---

## Implementation order (when greenlit)

1. **§1 first (OpenRouter card)** — additive, independent, no auth changes. Quick win.
2. **§2 (session auth)** — bigger surface, breaks the existing TOTP-on-every-request flow. Push, test login flow on prod, then move on.
3. **§3 (logout button)** — depends on §2.

Each section gets its own themed commit. Final ship commit bumps `1.14.4 → 1.14.5`.

## Test plan

- **Unit (Vitest)**:
  - `verifyAdminSession` accepts a freshly issued token, rejects expired tokens, rejects bad signatures, rejects malformed JWTs
  - `issueAdminSession` returns a token that round-trips through `verifyAdminSession`
  - OpenRouter balance proxy: caches a successful response, returns cached value on OR API failure, returns 503 when no cache and OR fails
- **Manual smoke on prod (post-deploy)**:
  - Log in → confirm token in localStorage, no TOTP re-prompts for 5+ minutes of polling
  - Refresh page → still logged in (token loaded from localStorage)
  - Click logout → returns to login form, token gone from localStorage, page reload shows login
  - Tamper with token in localStorage (truncate it) → next request 401 → returns to login
  - Wait 8h past login → next poll 401 → returns to login
  - Verify OpenRouter balance card matches actual balance shown in OR's web dashboard

---

## Maintenance footer

- **Update when:** v1.14.5 ships → archive to `docs/specs/archive/`. Until then, edit in place if scope changes.
- **TL;DR rule:** scope-frozen for the sprint; post-merge findings go to ROADMAP or a new spec.
- *Last updated: 2026-05-20.*
