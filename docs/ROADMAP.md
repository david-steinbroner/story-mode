# Story Mode — Roadmap

> **TL;DR (read this first):** Live at mystorymode.com on **v1.2.0**. Pre-launch audit Phases 1–5 shipped 2026-05-11; AI voice rewrite + UX polish + parse-failure hardening + rate-limit fix shipped 2026-05-12; doc framework restructure (router pattern, ai-voice + api-and-cost split out) shipped 2026-05-12. **Next up:** Milestone 6 (Guide chatbot), monetization decision, `messages.created_at` migration, palette consolidation. **Not blocked on anything** — pick by appetite.
>
> *Last updated: 2026-05-12 · Maintenance rule at the bottom.*

---

## Next up (decided, not yet built)

In rough priority order.

### Milestone 6: Guide chatbot on the bookshelf
- **What:** Turn the static Guide mascot on the bookshelf into a real conversational character. Hybrid: client-side canned responses (resume, start new, delete, help) + AI-powered freeform chat for unmatched intents.
- **Status:** Foundation components built (`GuideConfirmDialog.tsx`, `GuideStoryCard.tsx`). Chat UI, intent matcher, `POST /api/guide/chat` endpoint, and wiring all still TODO.
- **Done when:** the bookshelf Guide can resume an existing story, start a new one, delete an existing one, and explain how the app works end-to-end through the chat — falling back to AI for any unmatched intent.
- **Why it matters:** Currently there's no client-side UI to delete an *active* (non-archived) story. The chatbot was meant to host that flow.
- **Detail:** see `docs/MILESTONES.md` Milestone 6 section for the 7-step task list.

### Monetization decision
- **What:** Pick a model. Three candidates:
  - **Free shorts + paid novels/epics** — pay-per-story. Aligns with cost (shorts are ~$0.09, novels ~$0.35). Simplest mental model.
  - **Subscription** — $5–10/mo, unlimited shorts + N novels. Predictable revenue, but free riders consume disproportionate AI cost.
  - **Credit system** — buy N credits, each story costs M credits. Most flexible, most complex UI.
- **Status:** Cost math done (~$0.003/page; see `docs/api-and-cost.md`). No UI, no Stripe integration, no tier logic in code.
- **Blocks on:** PM decision. Once chosen, enable the `pricing-strategy` skill and design the paywall flow with `paywall-upgrade-cro`.
- **Done when:** at least one paid path exists in the codebase and a user can complete a purchase.

### messages table needs `created_at`
- **What:** Add `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` to the `messages` table.
- **Why now:** Bit us during debugging on 2026-05-11 — we couldn't chronologically order messages because `id` is UUID (random) and `timestamp` is a string like "08:35 PM". One small migration.
- **Done when:** migration ran, schema reflects it, `getMessages` queries order by `created_at` instead of returning unsorted.

### Palette consolidation
- **What:** Replace hardcoded hex strings (`#FFF9F0`, `#6C7A89`, etc.) sprinkled through components with Tailwind tokens (`bg-background`, `text-foreground`, `bg-primary`). All tokens already defined.
- **Also:** remove the vestigial `darkMode: ["class"]` from `tailwind.config.ts` since we have no dark mode.
- **Risk:** Visual regressions if a hex value doesn't map cleanly to a token.
- **Why deferred:** Too risky for a no-behavior-change cleanup pass without a visual regression test setup.
- **Done when:** `grep -rn '#[0-9A-Fa-f]\{6\}' client/src/components` returns zero hits.

---

## Maybe / TBD

Items raised but not committed to. Decide before doing.

- **Cross-story character travel** — was Milestone 7. Lets a reader's character carry between stories. Open question: does it break the "fresh start" simplicity?
- **Community story library** — was Milestone 8. Browse stories other readers have completed. Big scope; needs moderation/safety story.
- **Adaptive genre theming** — was Milestone 9. UI shifts subtly based on inferred genre.
- **Two-tab deduplication beyond rate limit** — the `/api/ai/chat` chat lock is in-memory. If Render scales to >1 instance, the lock becomes useless. Move to Postgres if/when scaling.
- **Sentry sample rate** — currently 10% trace. Revisit if costs spike or we miss errors.
- **AI retry budget + rate-limit ceiling revisit** — current is 3 attempts + 240/hr. Once we have real concurrent-user data, retune.
- **Desktop UX polish for end-story / delete on active stories** — currently no path on desktop to end an in-progress story without long-press (mouse equivalent exists via the kebab, but UX is awkward).
- **`subagent-driven-development` discipline** — skill enabled but pattern not consistently used. Try on the next multi-task chunk.

---

## Recently shipped

See `docs/MILESTONES.md` for the full history. Most recent (2026-05-11 / 2026-05-12):

- **2026-05-12 — Doc framework restructure** — CLAUDE.md as router; new `ai-voice.md` and `api-and-cost.md`; design-system.md updated; stale docs deleted/archived
- **2026-05-12 — UX polish** — drawer peek fix, regenerate moved to message header + confirm dialog, "Need a spark?" bookshelf collapsible, dev `tsx watch`
- **2026-05-12 — Parse-failure hardening** — `max_tokens: 2000`, single-quote dialogue rule, 3-attempt retry, em-dash post-processing
- **2026-05-12 — Rate limits** — AI 60→240/hr, general 500→1000/hr, keyed by sessionId
- **2026-05-11 — Phases 1–5 pre-launch audit** — security hardening, brand/domain, DB-backed reliability infra, distribution polish (hero, feedback, ErrorBoundary, kebab UX), code cleanup (-1,059 lines net)
- **2026-05-11 — AI voice rewrite** — 80–140 word target, no em dashes, macro-choice rule, milestone-driven pacing

---

## Maintenance

- **Update when:** a new "next up" item is decided OR a planned item ships (move it to MILESTONES, leave a one-line entry under "Recently shipped" here).
- **TL;DR refresh:** rewrite the top block whenever "next up" priorities shift, a milestone ships, or the version bumps. The version in the TL;DR must match `package.json` — if they ever disagree, update this doc.
- **Stale check:** if "Maybe / TBD" items have sat untouched for 2+ weeks, prune or promote them. They're decisions in-flight, not graveyards.
- **Same commit as code:** doc updates ride along with the code commit.
- **Last updated:** 2026-05-12
