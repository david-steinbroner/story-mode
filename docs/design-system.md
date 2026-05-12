# Story Mode — Design System

> **TL;DR (read this first):** Pastel Playground palette (cream background, soft teal primary, warm peach secondary, sage accent, terracotta destructive). Light-only — no dark mode. Inter sans for UI, Cinzel serif for hero headers, Crimson Pro serif for story body via `.story-prose`. Mobile-first at 375px. Tap targets ≥44px. Tap-first interaction model — every long-press action also has a visible button (e.g. `MoreVertical` on book spines). **Source of truth for color/typography values is `client/src/index.css`.** AI voice and banned vocabulary live in `docs/ai-voice.md`.
>
> *Last updated: 2026-05-12 · Maintenance rule at the bottom.*

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
- **No dark mode.** The brand is light-only. The `.dark` CSS block was removed. **Note:** `tailwind.config.ts` still has `darkMode: ["class"]` configured (vestigial — should be removed in a future cleanup; tracked in `docs/ROADMAP.md`).
- **No hardcoded hex in components.** Use Tailwind tokens. Hardcoded hex still exists in some places — phased out per `docs/ROADMAP.md`.

### Accessibility & contrast

Pastels frequently fail WCAG contrast. Verified pairs:

- Foreground (`#5C6B73`) on Background (`#FFF8F0`) → **5.6:1** (passes AA for normal text, fails AAA).
- Test any new color pairing against the **4.5:1 minimum** for body text. Use a contrast checker before introducing new combinations.
- `muted-foreground` on `background` is lower contrast (~3.5:1) — only use for truly secondary text, never primary content.

---

## Typography

Defined in `client/src/index.css` lines 102-104 and `tailwind.config.ts`.

| Stack | Family | Used for | Status |
|---|---|---|---|
| `font-sans` | **Inter** | Body text, UI chrome, buttons | Loaded via Google Fonts in `index.html` ✓ |
| `font-serif` | **Cinzel**, fallback Georgia | Hero headers (bookshelf "Story Mode" title, "The end." on finished page) | ⚠️ Cinzel is declared in CSS but NOT loaded in `index.html` — currently renders as Georgia. Either add the Google Fonts link or update the declaration. |
| `.story-prose` | **Crimson Pro**, fallback Georgia | Story narrative body text on the reading screen | ⚠️ Same — declared in `index.css` line 313 but NOT loaded. Renders as Georgia. |
| `font-mono` | Menlo | Debug output, code samples (rare) | System font, no load needed |

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
| `Bookshelf.tsx` | Landing screen. Virtual shelves, book spines, first-visit hero with example prompts, Guide dropdown. |
| `NewStoryCreation.tsx` | 2-step wizard. Page count → character description. |
| `ChatInterface.tsx` | Story reading screen. Nav bar, message list with regenerate, bottom drawer for choices. |
| `GuideAvatar.tsx` | Shared Guide mascot SVG. The glowing orb. |
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

- **Update when:** palette, typography, spacing, shadow, animation, interaction model, or component inventory changes. Update *in the same commit* as the code change.
- **TL;DR refresh:** rewrite the top block whenever palette, typography, or core interaction rules shift.
- **Drift check:** the periodic cleanup pass in `CLAUDE.md §11` includes diffing `index.css` color tokens against the palette table above. If the table is wrong, this doc loses authority.
- **Source of truth conflicts:** CSS wins. If this doc disagrees with `index.css`, update this doc.
- **Last updated:** 2026-05-12
