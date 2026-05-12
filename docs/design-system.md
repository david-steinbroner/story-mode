# Story Mode — Design System

> **TL;DR (read this first):** Pastel Playground palette (cream, teal, peach, sage). Light-only — no dark mode. Cinzel serif for headers, Inter sans for body. Mobile-first at 375px. Tap targets ≥44px. Banned vocabulary: DM, NPC, dice, stats, campaign. Use Your Guide, character, Mission, Story, Traits. **Source of truth for colors/typography is `client/src/index.css`.** This doc and CLAUDE.md describe rules and rationale; the CSS file is the implementation.
>
> *Last updated: 2026-05-12 · Maintenance rule at the bottom.*

---

## Palette

Defined as HSL CSS variables in `client/src/index.css` under `:root`. Light mode only — the `.dark` block was removed (CLAUDE.md §8: "No dark mode by default").

| Role | Hex | Token | Used for |
|---|---|---|---|
| **Background** | `#FFF8F0` | `bg-background` | Main page backgrounds. Never pure white. |
| **Foreground** | `#5C6B73` | `text-foreground` | Primary text. Warm charcoal, never pure black. |
| **Border** | (HSL 30 20% 88%) | `border-border` | Default borders, dividers |
| **Card** | (HSL 40 40% 99%) | `bg-card` | Card surfaces, slightly off-white on cream |
| **Primary** | `#7FBFB0` | `bg-primary` | Primary CTAs ("Start a New Story", Regenerate confirm). Soft teal. |
| **Secondary** | `#F4C2A7` | `bg-secondary` | Secondary actions, soft accents. Warm peach. |
| **Accent / Success** | `#A8C2A0` | `bg-accent` | Success states, positive feedback. Sage green. |
| **Destructive** | `#C67B5C` | `bg-destructive` | Delete, end story, error states. Terracotta — never pure red. |
| **Muted** | (HSL 30 30% 94%) | `bg-muted` | Inactive backgrounds, disabled states |

### Color rules

- **Never use pure black** (`#000`). Use `text-foreground` (#5C6B73). Shadows already account for this — they're tinted (HSL 220 25% 15%).
- **Never use pure white** for backgrounds. Use `bg-background` (cream) or `bg-card` (off-white).
- **No dark mode.** The brand is light-only. If you find yourself adding a `.dark` selector, stop and revisit the requirement.
- **No hardcoded hex in components.** Always use Tailwind tokens (`bg-primary`, `text-foreground`). Hardcoded hex still exists in some places — a follow-up cleanup pass will tokenize them.

---

## Typography

Defined in `client/src/index.css` lines 102-104.

| Stack | Font | Used for |
|---|---|---|
| `font-sans` | **Inter** | Body text, UI chrome, buttons |
| `font-serif` | **Cinzel** | Hero headers (`<h1>` on bookshelf, "The end." on finished page) |
| `font-mono` | Menlo | Debug output, code samples (rare) |

- Base body size: **16px** (`font-size: 16px` on `body`). Prevents iOS Safari auto-zoom on input focus.
- Heading line-height: **1.3** (set globally on `h1–h6`).
- Body line-height: **1.6**.
- Bold weight on all headings.
- User-controllable font size on the story screen via the Guide menu — stored in `localStorage` as `storymode-font-size`.

---

## Spacing & Sizing

- **Tap targets minimum 44×44px** — enforced globally on `button`, `[role="button"]`, `input[type="button"]`, `input[type="submit"]` via `min-height: 44px; min-width: 44px` in `index.css`. iOS HIG guideline.
- **Mobile-first**: design at 375px width, then scale up. Sm breakpoint is 640px (Tailwind default).
- **Border radius**: Tailwind defaults overridden to `lg: 9px / md: 6px / sm: 3px`. Slightly tighter than stock for a softer feel.
- **Spacing**: standard Tailwind scale (`p-2`, `gap-4`, etc.). No custom spacing tokens.

---

## Interaction Model

Story Mode is fundamentally **tap-first**.

- The AI generates 3–4 choice options per page. The user taps one.
- Free text input exists in the bottom drawer ("I have something else in mind...") but is secondary — most users will tap.
- All interactions need a desktop-accessible affordance, not just long-press. Book-spine actions have a kebab (⋯) button alongside long-press.
- No swipe gestures. Story Mode is not a game with gestural inputs — it's a reading interface with tap choices.
- Confirmation dialogs for any action that costs an AI call (e.g. Regenerate) or is irreversible (Delete). Use shadcn `AlertDialog`.

---

## Brand Language (banned vocabulary)

Never use these words in UI copy, component names, user-facing variable names, or AI output. Comments meant to be user-facing also apply. The AI's system prompt enforces this for narrative output.

| ❌ Don't use | ✅ Use instead |
|---|---|
| Dungeon Master / DM / Narrator | **Your Guide** (UI) / Guide (code/system prompts) |
| Campaign | **Story** or **Adventure** |
| Session | **Chapter** |
| Character Sheet | **Your Character** |
| Party / Group | **Friends** |
| Quest | **Mission** or **Goal** (UI only — `quest` is fine in code) |
| NPC | **character** or **person in the story** |
| Roll / Dice | Don't reference dice at all |
| Stats / Ability Scores | **Traits** |
| Em dashes (`—`, `–`) in AI output | Periods or commas (post-processed server-side) |

---

## Voice (for AI-generated text)

The Guide's narrative voice is defined in `server/aiService.ts → getSystemPrompt()`. Summary:

- **Adventure Time + 80s CYOA + Gravity Falls**, not Tolkien.
- Warm and a little playful. Like a friend telling a story at a campfire, not a fantasy novelist.
- Direct. Short sentences. Plain words.
- Second person ("You step into the market. The smell hits you.").
- **No em dashes.** Periods or commas.
- Concrete over abstract. *"She has a knife in her boot"* beats *"menace lurks in her bearing."*
- 80–140 words per page. One scene, one beat. Tight.
- One thing must change every page.

If the AI voice ever needs to be tuned, edit `getSystemPrompt()` and the inline per-page instruction in `generateResponse()` together. Test 3–5 page turns before committing.

---

## Where the components live

- `client/src/components/ui/` — shadcn primitives (Button, Card, AlertDialog, DropdownMenu, Popover, etc.). Don't hand-edit unless updating via `npx shadcn add`.
- `client/src/components/` — composed product components (Bookshelf, ChatInterface, GuideAvatar, etc.).
- `tailwind.config.ts` — color tokens, font stacks, radius, animation.
- `client/src/index.css` — CSS variables, base layer rules, global typography.

---

## Maintenance

- **Update when:** the brand language, palette, typography, or interaction model changes. Update *with the code change*, not in a separate doc-hygiene commit.
- **TL;DR refresh:** rewrite the top block whenever palette or core rules shift.
- **Source of truth conflicts:** the CSS file wins. If this doc disagrees with `index.css`, update this doc.
- **Last updated:** 2026-05-12
