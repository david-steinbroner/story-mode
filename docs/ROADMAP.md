# Story Mode — Roadmap

> **TL;DR (read this first):** Live at mystorymode.com on **v1.5.1**. Pre-launch audit Phases 1–5 (2026-05-11); v1.2.x polish (2026-05-12); concurrency hardening + hero rebrand + sentiment dedup (2026-05-12, v1.3.0); AI quality pass Chunk A + soft-delete (2026-05-13, v1.4.0); AI quality pass Chunk B + admin scroll fix (2026-05-13, v1.5.0); **admin Recent Activity + session-ID untruncation + dev event-log visibility + empty-shelf welcome copy rewrite (2026-05-13, v1.5.1)**. **Next up:** Sonnet 2-cell comparison (small follow-up PR), Chunk C (prose-tell post-process), Chunk D (entity tracking), Milestone 6 (Guide chatbot), monetization decision. **Three big-direction brainstorms parked** under Maybe/TBD: audio drama, AI-generated puzzles, walk-to-earn.
>
> *Last updated: 2026-05-13 · Maintenance rule at the bottom.*

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

### AI quality pass — remaining chunks (B, C, D) + Sonnet comparison
- **What:** Chunk A (system prompt restructure + agency clause + banned-patterns expansion) shipped 2026-05-13 as v1.4.0. Three chunks remain: Chunk B (validate + retry on rule violations), Chunk C (prose-tell post-process scrubbers + telemetry), Chunk D (entity commitment tracking via JSONB with cross-story-ready shape).
- **Plus:** Sonnet 2-cell comparison as a small follow-up PR after the v1.4.0 prompt has run on real users for a bit. Test matrix in `docs/specs/ai-quality-pass-plan.md`.
- **Status:** Chunk A live in production. Awaiting real-user signal before B/C/D and Sonnet test.
- **Done when:** all four chunks have shipped + Sonnet decision made (ship/paid-tier/length-gated/revert).

### Palette consolidation
- **What:** Replace hardcoded hex strings (`#FFF9F0`, `#6C7A89`, etc.) sprinkled through components with Tailwind tokens (`bg-background`, `text-foreground`, `bg-primary`). All tokens already defined.
- **Status:** Vestigial `darkMode: ["class"]` was removed in v1.3.0. ~61 hardcoded hex codes still remain across 6 components; `AdminDashboard.tsx` is the worst offender (~26 instances).
- **Risk:** Visual regressions if a hex value doesn't map cleanly to a token.
- **Why deferred:** Too risky for a no-behavior-change cleanup pass without a visual regression test setup.
- **Done when:** `grep -rn '#[0-9A-Fa-f]\{6\}' client/src/components` returns zero hits.

---

## Maybe / TBD

Items raised but not committed to. Decide before doing.

- **Cross-story character travel** — was Milestone 7. Lets a reader's character carry between stories. Open question: does it break the "fresh start" simplicity?
- **Community story library** — was Milestone 8. Browse stories other readers have completed. Big scope; needs moderation/safety story.
- **Adaptive genre theming** — was Milestone 9. UI shifts subtly based on inferred genre.
- **Audio drama / SFX library** — turn the reading experience into an interactive audio drama via TTS narration + curated SFX triggered by AI-tagged cues. Cost framing: ~$0.30–$0.60/story for narration on top of writing. Brand shift from "interactive fiction" to "interactive audio drama" (Audible-adjacent). Deserves a dedicated brainstorm session.
- **AI-generated puzzles on the fly** — small puzzles woven into stories, unique per playthrough. Tricky: LLMs are notoriously bad at solvability without rigid templates + validation. ~$0.005–0.02 per puzzle as an extra AI call. UX risk: must not interrupt narrative flow. Deserves a dedicated brainstorm session.
- **Walk-to-earn / Pokemon-Go mechanics** — gamification idea floated 2026-05-12: users earn credits or unlock content via real-world activity. Open questions: how does this fit a story-reading product, what's the credit currency-vs-streak shape. Deserves a dedicated brainstorm session.
- **Sentry sample rate** — currently 10% trace. Revisit if costs spike or we miss errors.
- **AI retry budget + rate-limit ceiling revisit** — current is 3 attempts + 240/hr. Once we have real concurrent-user data, retune.
- **Desktop UX polish for end-story / delete on active stories** — currently no path on desktop to end an in-progress story without long-press (mouse equivalent exists via the kebab, but UX is awkward).
- **`subagent-driven-development` discipline** — skill enabled but pattern not consistently used. Try on the next multi-task chunk.

---

## Recently shipped

See `docs/MILESTONES.md` for the full history. Most recent:

- **2026-05-13 — Admin polish + welcome copy (v1.5.1)** — Same-day follow-up to v1.5.0 after Chunk B testing exposed two support-lookup gaps and one observability gap. Sessions table now shows full session IDs with copy-to-clipboard buttons. New Recent Activity section in admin pulls the last 20 `event_log` rows with full session_id + story_id columns (both copy-able) so support can look up a user's story by ID and search Supabase directly. `logEvent` now streams a dev-mode console line on every successful event write so developers can see firings in real time. Empty-shelf welcome copy rewritten to position Story Mode + the Guide explicitly: "Welcome! This is Story Mode, a place where you can be the hero of any story that you can imagine. I'm your personal Guide..." replacing the previous shorter "Your shelf is empty — shall we start your first story?"
- **2026-05-13 — AI quality pass Chunk B + admin scroll fix (v1.5.0)** — Four heuristic validators run on every AI response: stall (token overlap between new page and prior 2), fake-choices (token overlap between the 3 bulleted choices), final-page enforcement (no "What do you do?" on page N=totalPages), Story Momentum (token overlap across last 3 player inputs — if reader is repeating themselves, inject "the world must act" directive into the current prompt). Path A synonym-canonicalization patch added after first smoke test: stall phrasings ("keep working / continue silently / ignore him") collapse to a single canonical token so Jaccard catches them. Violations log to `event_log` as `ai_quality_violation`; new admin section at `/admin?admin=1` surfaces 24h counts + rates per detector. Admin page got the same `h-dvh overflow-y-auto` fix the bookshelf got in v1.3.0.
- **2026-05-13 — AI quality pass Chunk A + soft-delete (v1.4.0)** — System prompt in `server/aiService.ts` restructured. The THREE NON-NEGOTIABLES (anti-stall, choice-distinctness, player agency) moved to the end of the prompt where attention is highest. Concrete WRONG/RIGHT anti-examples drawn from real *Whispers of the Familiar* failures: tunnel stall, hold-still trio, stairs override. New banned patterns: "something" as antagonist after first appearance, three-item-list cadence, hedge adverbs. Soft-delete on stories (migration 009): DELETE marks `deleted_at` instead of cascading; 30-day support recovery window; lazy purge in `getStories`. New AlertDialog confirmation popup with explicit 30-day messaging. Plan: `docs/specs/ai-quality-pass-plan.md`.
- **2026-05-12 — Concurrency hardening + UI polish (v1.3.0)** — Chat lock and rate-limiter migrated from in-memory Maps to Postgres so both survive restarts and stay coherent at multi-instance. Quest dedup now scoped by `storyId`. New `messages.created_at` column fixes same-minute timestamp ties that produced nondeterministic render order. Sentiment captured once across the End Story popup and THE END footer (new `gameState.sentiment`). Hero rebrand: welcome + tagline + 3 steps moved into the Guide chat bubble; 100-prompt hand-curated spark pool with a right-aligned refresh button. Drawer peek spacing, story-complete footer overlap, scroll-on-open, and `crypto.randomUUID` polyfill for plain-HTTP LAN testing. Phase 5 leftovers wrapped: dead `darkMode` config removed, 3 noisy per-request logs gated.
- **2026-05-12 — Typography wired** — Cinzel and Crimson Pro now actually load from Google Fonts (were declared in CSS but never linked). `.story-prose` (Crimson Pro) applied to AI message paragraphs — story body text reads as a proper book serif now, not Inter sans. Repo cleanup: archived `story-mode-prototype.html`, gitignored `story-mode-plugin/`, deleted empty `story-mode-toolkit.plugin`.
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
- **Last updated:** 2026-05-13
