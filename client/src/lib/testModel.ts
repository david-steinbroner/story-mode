/**
 * Per-tab AI model override (dev-only).
 *
 * Visiting `/?testmodel=sonnet` (or `?testmodel=haiku`, or a full OpenRouter
 * model ID like `?testmodel=anthropic/claude-sonnet-4`) stores that value
 * in `sessionStorage` for the current browser tab. The `queryClient.ts`
 * fetch helpers then attach an `X-Test-Model` header to every API call
 * from this tab. The server applies the override only when
 * `NODE_ENV !== 'production'` — production is hardcoded to ignore it.
 *
 * Two tabs in the same Safari window can run different models side-by-side
 * because `sessionStorage` is per-tab. Closing a tab clears its override.
 *
 * Use `?testmodel=` (empty value) to clear the override mid-session.
 *
 * Keep this file small and self-contained — it's a dev tool, not a feature.
 */

const STORAGE_KEY = "testmodel";
const URL_PARAM = "testmodel";

/**
 * Read `?testmodel=…` from the current URL, persist it to sessionStorage,
 * and strip the parameter from the address bar so it doesn't survive the
 * next reload. Idempotent — safe to call multiple times.
 *
 * Call once from `main.tsx` at app boot.
 */
export function initTestModelFromUrl(): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  if (!url.searchParams.has(URL_PARAM)) return;

  const raw = url.searchParams.get(URL_PARAM) ?? "";
  const value = raw.trim();

  if (value === "") {
    sessionStorage.removeItem(STORAGE_KEY);
  } else {
    sessionStorage.setItem(STORAGE_KEY, value);
  }

  // Clean the URL so the address bar reads `/` not `/?testmodel=sonnet`.
  // Uses replaceState so navigation history isn't polluted.
  url.searchParams.delete(URL_PARAM);
  const cleanUrl = url.pathname + (url.search || "") + url.hash;
  window.history.replaceState(null, "", cleanUrl);
}

/**
 * Current override for this tab, if any. Returns `null` when no override
 * is set — the caller should NOT send the X-Test-Model header in that case.
 */
export function getTestModel(): string | null {
  if (typeof window === "undefined") return null;
  const value = sessionStorage.getItem(STORAGE_KEY);
  return value && value.trim() ? value.trim() : null;
}
