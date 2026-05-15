# Story Mode — Design System

> **TL;DR (read this first):** Pastel Playground palette (cream background, soft teal primary, warm peach secondary, sage accent, terracotta destructive). Light-only, no dark mode. **Inter** for UI, **Cinzel** for hero headers (incl. Bookshelf title), **Crimson Pro** for story body via `.story-prose`. All three webfonts load from Google Fonts. Mobile-first at 375px. Tap targets ≥44px. Tap-first interaction model — every long-press action also has a visible button. **Messenger grammar across every Guide surface** (bookshelf, wizard, in-story) — shared primitives `GuideBubble` / `PlayerBubble` / `ChoiceButton` / `TypingDots` / `CenteredHeader` teach the user the affordance once. **Source of truth for color/typography is `client/src/index.css` + `client/index.html`.** AI voice and banned vocabulary live in `docs/ai-voice.md`.
>
> *Last updated: 2026-05-14 · Maintenance rule at the bottom.*

---

## Palette

Defined as HSL CSS variables in `client/src/index.css` under `:root`. Light mode only — the `.dark` block was removed in Phase 5 cleanup.

| Role | Hex | HSL token | Used for |
|---|---|---|---|
| **Background** | `#FFF8F0` | `bg-background` | Main page backgrounds. Never pure white. |
| **Foreground** | `#5C6B73` | `text-foreground` | Primary text. Warm charcoal, never pure black. (Replaces the older "soft indigo `#6C7A89`" you may see in archived docs.) |
| **Border** | `≈#E3D8C7` (HSL 30 20% 88%) | `border-border` | Default borders, dividers |
| **Card** | `≈#FEFAF1` (HSL 40 40% 99%) | `bg-card` | Card surfaces, slightly off-white on cream |
| **Primary** | `#7FBFB0` | `bg-primary` | Primary CTAs (Start a New Story, Regenerate confirm). Soft teal. |
| **Secondary** | `#F4C2A7` | `bg-secondary` | Secondary actions, soft accents. Warm peach. |
| **Accent / Success** | `#A8C2A0` | `bg-accent` | Success states, positive feedback. Sage green. |
| **Destructive** | `#C67B5C` | `bg-destructive` | Delete, end story, error states. Terracotta — never pure red. |
| **Muted** | `≈#F0E8DE` (HSL 30 30% 94%) | `bg-muted` | Inactive backgrounds, disabled states |

### Color rules

- **Never pure black** (`#000`). Use `text-foreground`. Shadows are tinted (HSL 220 25% 15%), not pure black either.
- **Never pure white** for backgrounds. Use `bg-background` (cream) or `bg-card`.
- **No dark mode.** The brand is light-only. The `.dark` CSS block and the `darkMode: ["class"]` Tailwind config were both removed in v1.3.0.
- **No hardcoded hex in components.** Use Tailwind tokens. Hardcoded hex still exists in some places — phased out per `docs/ROADMAP.md`.

### Accessibility & contrast

Pastels frequently fail WCAG contrast. Verified pairs:

- Foreground (`#5C6B73`) on Background (`#FFF8F0`) → **5.6:1** (passes AA for normal text, fails AAA).
- Test any new color pairing against the **4.5:1 minimum** for body text. Use a contrast checker before introducing new combinations.
- `muted-foreground` on `background` is lower contrast (~3.5:1) — only use for truly secondary text, never primary content.

---

## Typography

Defined in `client/src/index.css` lines 102-104 and `tailwind.config.ts`.

| Stack | Family | Used for |
|---|---|---|
| `font-sans` | **Inter** | Body text, UI chrome, buttons |
| `font-serif` | **Cinzel**, fallback Georgia | Hero headers (bookshelf "Story Mode" title, "The end." on finished page) |
| `.story-prose` | **Crimson Pro**, fallback Georgia | Story narrative body text — applied to AI message paragraphs in `ChatInterface.tsx` |
| `font-mono` | Menlo | Debug output, code samples (rare) |

All three webfonts (Inter, Cinzel, Crimson Pro) load via the Google Fonts link in `client/index.html`. Menlo is a system font.

- Base body size: **16px** (`font-size: 16px` on `body`). Prevents iOS Safari auto-zoom on input focus.
- Heading line-height: **1.3** (set globally on `h1–h6`).
- Body line-height: **1.6**.
- Heading weight: **semibold (600)** — not full bold.
- User-controllable font size on the story screen via the Guide menu, persisted in `localStorage` as `storymode-font-size`.

---

## Spacing & sizing

- **Tap targets minimum 44×44px** — enforced globally on `button`, `[role="button"]`, `input[type="button"]`, `input[type="submit"]` via `min-height: 44px; min-width: 44px` in `index.css`. iOS HIG.
- **Mobile-first:** design at 375px, scale up. `sm` breakpoint is 640px (Tailwind default).
- **Border radius:** Tailwind defaults overridden in `tailwind.config.ts` to `lg: 9px / md: 6px / sm: 3px`. Slightly tighter than stock for a softer feel. (Note: `--radius: .5rem` in `index.css` is legacy/unused; the Tailwind config is the truth.)
- **Spacing:** standard Tailwind scale (`p-2`, `gap-4`, etc.). No custom spacing tokens.

---

## Shadows

Defined as CSS variables in `client/src/index.css` lines 106–113. Tinted (HSL 220 25% 15%), not pure black — keeps the cream background feeling warm.

| Token | Approx use |
|---|---|
| `--shadow-2xs`, `--shadow-xs` | Hairline elevation (chips, badges) |
| `--shadow-sm`, `--shadow` | Cards, buttons at rest |
| `--shadow-md`, `--shadow-lg` | Hover states, raised cards |
| `--shadow-xl`, `--shadow-2xl` | Modals, popovers, overlays |

Use the existing scale; don't introduce custom shadow values.

---

## Animation

| Animation | Duration | Defined in | Used for |
|---|---|---|---|
| `accordion-down`, `accordion-up` | 0.2s ease-out | `tailwind.config.ts` | shadcn Accordion |
| `bounce-slow` | 3s infinite | `index.css` | (decorative, Guide avatar idle, etc.) |
| `slide-up` | 0.4s ease-out | `index.css` | Drawer / sheet entry |

Default timing for new transitions: **200ms ease-out** for state changes, **300ms** for layout shifts. Keep motion subtle — Story Mode is a reading interface, not a game.

---

## Interaction model

Story Mode is fundamentally **tap-first**.

- AI generates 3–4 choice options per page. User taps one.
- Free text in the bottom drawer ("I have something else in mind...") exists but is secondary.
- **Every long-press action also has a visible button affordance** for desktop — e.g. book spines have a `MoreVertical` (three-dot vertical) button in addition to long-press.
- No swipe gestures. Story Mode isn't a gestural game; it's a reading interface.
- Confirmation dialogs for any action that costs an AI call (Regenerate) or is irreversible (Delete). Use shadcn `AlertDialog`.

---

## Brand language

The full banned-vocabulary table + AI voice rules live in **`docs/ai-voice.md`**.

Quick summary: never use *DM, NPC, Campaign, Session, Quest (in UI), Roll, Dice, Stats*. Use *Your Guide, character, Story, Chapter, Mission, Traits*. Em dashes are banned in AI output (stripped server-side); in UI copy, prefer periods or commas too.

---

## Voice (AI-generated text)

Voice rules live in **`docs/ai-voice.md`**. Don't duplicate them here — if you're tuning voice, that's the canonical doc.

If a UI string needs to feel like the Guide is speaking (loading states, fallbacks, dialog copy), match the voice from `ai-voice.md`: warm, playful, second person, plain words, no em dashes.

---

## Key product components

Where the visually-distinctive components live (all in `client/src/components/`):

| File | What it is |
|---|---|
| `Bookshelf.tsx` | Landing screen. Anchored shelf section (tabs: Currently Reading / Finished / Archive — only the tabs with content show) above a scrolling chat area: Guide welcome bubble + ephemeral Q&A history + sticky drawer ("What do you want to do?") with primary CTA + canned Q&A `ChoiceButton`s. |
| `NewStoryCreation.tsx` | 3-step wizard: character description → length → confirm. Each step has a sticky drawer affordance — Step 1's lazy-fetches 3 AI character suggestions, Step 2's explains length tiers, Step 3's offers edit-back / start-over. Step dots indicate progress. |
| `ChatInterface.tsx` | Story reading screen. `CenteredHeader` nav bar with story title + page count. Message list with iMessage-style asymmetric bubbles — `GuideBubble` for AI, `PlayerBubble` for player; `TypingDots` while the Guide is generating. Bottom drawer for choices; always-visible custom-input field ("I have something else in mind…"). |
| `GuideAvatar.tsx` | Shared Guide mascot SVG. The glowing orb. |
| `GuideBubble.tsx` | Avatar-above + left-aligned bubble — the canonical "Guide is speaking" surface across bookshelf hero, wizard steps, in-story AI pages, and the typing indicator. |
| `PlayerBubble.tsx` | Right-aligned player bubble (`bg-primary/10`, `rounded-2xl`). Used for in-story player turns, the optimistic new-story bubble, and Q&A questions on the bookshelf. |
| `ChoiceButton.tsx` | Outline button — the single visual primitive for "pick one of these" across the app. Used in the in-story drawer, bookshelf drawer Q&A, and wizard suggestion lists. |
| `TypingDots.tsx` | iMessage-style three-dot indicator with a staggered `@keyframes typing-dot` animation in `index.css`. Shown wherever the Guide is generating. |
| `CenteredHeader.tsx` | 3-column grid (`44px | 1fr | 44px`) used by Bookshelf, `NewStoryCreation`, and `ChatInterface` top bars so titles render center-aligned regardless of side controls. |
| `GuideConfirmDialog.tsx` | Reusable confirmation modal (cream background, pastel palette, ≥44px targets). |
| `GuideStoryCard.tsx` | Presentational story info card (genre badge, page progress, character description). |
| `ColdStartLoader.tsx` | Full-screen loader for Render cold starts. |
| `ui/` | shadcn primitives. Don't hand-edit — update via `npx shadcn add`. |

---

## Where to look in the codebase

- `tailwind.config.ts` — color tokens, font stacks, radius, animation
- `client/src/index.css` — CSS variables, base layer, global typography, shadow scale
- `client/index.html` — Google Fonts links (currently only Inter; see Typography section caveat)
- `components.json` — shadcn config

---

## Maintenance

- **Update when:** palette, typography, spacing, shadow, animation, interaction model, or component inventory changes. Update *in the same commit* as the code change. Bump "Last updated" below.
- **TL;DR rule:** current-state-only — describes how the design system *is*, not what changed when. Rewrite the top block whenever palette, typography, or core interaction rules shift. Never a running log of changes (that belongs in `docs/MILESTONES.md`).
- **Drift check:** the periodic cleanup pass in `CLAUDE.md §11` includes diffing `index.css` color tokens against the palette table above. If the table is wrong, this doc loses authority.
- **Source of truth conflicts:** CSS wins. If this doc disagrees with `index.css`, update this doc.
- **Last updated:** 2026-05-14
