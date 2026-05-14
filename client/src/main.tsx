import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Initialize analytics and error tracking
import { initSentry } from "./lib/sentry";
import { initPostHog } from "./lib/posthog";
import { initTestModelFromUrl } from "./lib/testModel";

// crypto.randomUUID() only exists in secure contexts (HTTPS or localhost). On a
// plain-HTTP LAN IP (phone testing on the same wifi) it's undefined, so we fall
// back to a v4 UUID built from getRandomValues, which is available everywhere.
function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

if (!localStorage.getItem('sessionId')) {
  localStorage.setItem('sessionId', generateSessionId());
}

// Initialize Sentry first (catches errors during initialization)
initSentry();

// Initialize PostHog
initPostHog();

// Dev tool: read `?testmodel=…` from the URL into sessionStorage so this
// tab's API calls include the X-Test-Model header. No-op in prod (server
// ignores the header).
initTestModelFromUrl();

createRoot(document.getElementById("root")!).render(<App />);
