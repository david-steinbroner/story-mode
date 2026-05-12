# Story Mode — Roadmap

> **TL;DR (read this first):** Live at mystorymode.com on v1.0.0. Pre-launch audit (Phases 1–5) shipped 2026-05-11. AI voice rewrite + rate-limit fix shipped 2026-05-12. **Next up:** Milestone 6 (Guide chatbot), monetization decision, palette consolidation. **Not blocked on anything** — pick the next item by appetite.
>
> *Last updated: 2026-05-12 · Maintenance rule at the bottom.*

---

## Next up (decided, not yet built)

Items we've committed to but haven't started. In rough priority order.

### Milestone 6: Guide chatbot on the bookshelf
- **What:** Turn the static Guide mascot on the bookshelf into a real conversational character. Hybrid: client-side canned responses (resume, start new, delete, help) + AI-powered freeform chat for unmatched intents.
- **Status:** Foundation components built (`GuideConfirmDialog.tsx`, `GuideStoryCard.tsx`). Chat UI, intent matcher, `POST /api/guide/chat` endpoint, and wiring all still TODO.
- **Why it matters:** Currently there's no client-side way to delete a story (the DELETE endpoint exists but only as a popover action). The chatbot was meant to host that flow.
- **Detail:** See `docs/MILESTONES.md` → Milestone 6 section.

### Monetization decision
- **What:** Choose a model. Free shorts + paid novels/epics? Subscription? Credits?
- **Status:** Cost-per-page math done (~$0.003/page, ~$0.09 per 25-page short, ~$0.35 per novel). No tier UI yet.
- **Blocks on:** Decision by PM. Once decided, enable `pricing-strategy` skill and design the paywall flow with `paywall-upgrade-cro`.

### Palette consolidation
- **What:** Replace hardcoded hex strings (`#FFF9F0`, `#6C7A89`, `#7FBFB0`, etc.) sprinkled through components with Tailwind tokens (`bg-background`, `text-foreground`, `bg-primary`). All tokens are already defined in `tailwind.config.ts` + `index.css`.
- **Risk:** Visual regressions if a hex value doesn't map cleanly to a token.
- **Why deferred:** Too risky for a no-behavior-change cleanup pass without a visual regression test setup.

---

## Maybe / TBD

Items raised but not committed to. Decide before doing.

- **Cross-story character travel** — was planned as Milestone 7. Lets a reader's character carry between stories. Open question: does this break the "fresh start" simplicity?
- **Community story library** — was planned as Milestone 8. Browse stories other readers have completed. Big scope; needs moderation/safety story.
- **Adaptive genre theming** — was planned as Milestone 9. UI shifts subtly based on inferred genre (mystery = blue-tinted accents, etc.).
- **Add `created_at` column to `messages` table** — small migration. Bit us during debugging on 2026-05-11 (we couldn't reliably order messages chronologically). Not urgent but real.
- **Two-tab deduplication beyond rate limit** — already have a per-(session,story) lock in `/api/ai/chat`, but it's in-memory. If Render scales to >1 instance, this lock becomes useless. Move to Postgres if/when scaling.
- **Sentry sample rate** — currently 10% trace sample. Revisit if Sentry costs spike or if we miss errors we needed.
- **`subagent-driven-development` discipline** — skill is enabled but pattern not consistently used yet. Try it on the next multi-task chunk.

---

## Recently shipped

See `docs/MILESTONES.md` for the full history. Most recent (2026-05-11 to 2026-05-12):

- **Phases 1–5 pre-launch audit** — security hardening, custom domain, reliability infrastructure (DB-backed spend tracker / locks / event log), distribution polish (hero, feedback, ErrorBoundary, desktop kebab UX), code cleanup
- **AI voice rewrite** — 80–140 word target, no em dashes, macro-choice rule, milestone-driven pacing
- **Surprise-me prompt rewrite** with few-shot examples
- **Story-complete UI** — "The end." footer with sentiment thumbs + Back to library
- **Bookshelf "Need a spark?"** collapsible inspiration prompts
- **Parse-failure hardening** — max_tokens cap, single-quote dialogue rule, 3-attempt retry
- **Rate limits** — 60→240/hr AI, keyed by session not IP

---

## Maintenance

- **Update when:** a new "next up" item is decided, OR a planned item ships (move it to MILESTONES, leave one-line entry under "Recently shipped" here).
- **TL;DR refresh:** rewrite the top block whenever the "next up" priorities shift or a milestone ships.
- **Same commit as code:** doc updates ride along with the code commit, not as standalone hygiene commits.
- **Last updated:** 2026-05-12
