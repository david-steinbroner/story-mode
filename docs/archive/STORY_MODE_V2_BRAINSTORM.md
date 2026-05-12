# Story Mode V2 — Brainstorm & Design Brief

*David + Rachel brainstorm, March 2026. Captured and organized for reference.*

---

## The Big Idea

Story Mode V2 reimagines the app around a **storybook metaphor**. Instead of a flat chat interface, the entire experience is framed as a library of books. You browse a bookshelf, pull out a story, open it, and play through it — page by page. A single AI character lives across the whole app as your guide, narrator, and companion.

---

## Core Concepts

### 1. The Bookshelf (Home Screen)

The home screen is a bookshelf. Each story you're playing (or have finished) is a physical book on the shelf. You tap a book to open it and continue where you left off.

- New stories appear as blank or freshly bound books
- Finished stories look worn, well-read, maybe with a bookmark ribbon
- The shelf can grow — more stories = a bigger library
- Community template stories could live on a separate "Public Library" shelf
- Visual inspiration: Gumby entering a book, the feeling of stepping *into* a story

### 2. The Guide (Persistent AI Character)

A single AI character that exists across the entire app experience. Not just the narrator inside stories — this character is also:

- **The Librarian** — greets you on the bookshelf, helps you pick or start a story, explains how things work (onboarding)
- **The Narrator / DM** — runs your story when you're inside a book, describes scenes, presents choices
- **The Concierge** — helps you manage your experience outside of stories: "Want to see how your character has grown?" "You've earned the ability to start a new story with this character." "This story is almost finished — only 8 pages left."

Key qualities:
- Has a consistent personality and voice across all contexts
- Warm, encouraging, slightly playful — not robotic
- Remembers you across stories (knows your characters, preferences, history)
- NOT Clippy — not intrusive or annoying. More like a favorite bookshop owner who knows exactly what you like
- Could have a visual avatar/design that becomes iconic to the brand

This is a major differentiator. Most AI apps have a faceless chatbot that only appears in one mode. Story Mode's Guide is a *character* that ties the whole experience together.

### 3. Page-Based Story Structure

Every story has a fixed page count. One "page" = one AI reply (narrative + choices). This replaces the current infinite-conversation model.

**Story lengths (tiers):**

| Format | Pages | Analogy | Estimated tokens |
|---|---|---|---|
| Short Story | 25 pages | A bedtime story | ~budgetable |
| Novella | 50 pages | A weekend read | ~budgetable |
| Novel | 100 pages | A deep dive | ~budgetable |
| Epic | 250 pages | A saga | ~budgetable |

**Why this is powerful:**

- **Player experience**: You always know where you are in the story. "Page 37 of 50" creates natural pacing, tension, and a sense of progress. The AI can pace the narrative — rising action, climax, resolution — because it knows the total length.
- **Cost management**: Hard cap on token spend per story. You can calculate exact costs per tier. No more runaway conversations burning through API budget.
- **Story quality**: Constraints breed creativity. A 25-page story forces tight, punchy storytelling. A 250-page epic allows sprawl. The AI prompt can adapt its pacing strategy to the format.
- **Business model potential**: Free tier = 25-page stories. Paid = longer formats. Clean, understandable value prop.

### 4. Cross-Story Character Travel (Breaking the 4th Wall)

At a certain threshold (maybe finishing a story, maybe reaching a character "level"), players unlock the ability to take their character *out* of one story and *into* another.

- Your character literally "closes the book" and steps back onto the bookshelf
- You can then open a different book and bring that character in
- This is explicitly meta/4th-wall-breaking — the character *knows* they're moving between stories
- Creates a reason to invest in a single character long-term
- Opens up wild narrative possibilities: a medieval knight entering a sci-fi story, a detective entering a fairy tale

**Progression unlock ideas:**
- Finish your first 25-page story → unlock the ability to start a new story with an existing character
- Finish a 50-page story → unlock cross-genre travel
- Get a character nominated as a community template → special "legendary" status

### 5. Community Templates & Player-Created Content

When a player's story or character is developed enough (played enough pages, has rich history), it becomes eligible for community features:

- **Story templates**: A player's completed world/setting can be nominated and voted on to become a template that other players can start new stories in. "Play in the world that @rachel created."
- **NPC injection**: A player's character can appear as an NPC in other players' stories. Your retired hero becomes a mysterious stranger in someone else's adventure.
- **Curation**: Nomination + community voting keeps quality high. Not everything gets promoted — only the stories/characters that resonated.

This solves the cold-start problem: new players get curated, player-tested worlds to start in, instead of generating everything from scratch.

### 6. Adaptive Visual Theming

As a story develops, its visual presentation evolves to match the tone and genre:

- A horror story gradually darkens — background shifts, typography might get more unsettling
- A romance warms up — softer colors, warmer tones
- A mystery might get more noir — desaturated, high contrast
- The book's "cover" on the shelf reflects the story's evolved aesthetic

This could start simple (background color shifts based on genre tags) and get sophisticated over time (AI-driven theme generation based on story content analysis).

---

## How These Ideas Connect

```
                    THE GUIDE (persistent AI character)
                         |
            ┌────────────┼────────────┐
            ▼            ▼            ▼
       BOOKSHELF    INSIDE A      BETWEEN
       (browse,     STORY         STORIES
        start,      (play page    (manage
        manage)     by page)      characters)
            │            │            │
            │            ▼            │
            │     PAGE STRUCTURE      │
            │     (25/50/100/250)     │
            │     = cost control      │
            │     = pacing            │
            │     = progression       │
            │            │            │
            │            ▼            │
            │     FINISH A STORY ─────┘
            │            │
            │     ┌──────┴──────┐
            │     ▼             ▼
            │  CHARACTER     STORY/WORLD
            │  TRAVEL        BECOMES
            │  (carry to     TEMPLATE
            │  new story)    (community)
            │                    │
            │                    ▼
            └──── TEMPLATES ON BOOKSHELF
                  (new players discover
                   community content)
```

The page structure is the **keystone** — it enables cost control, story pacing, progression systems, AND community features (you can't nominate an infinite conversation, but you *can* nominate a completed 100-page story).

---

## Open Questions

1. **Guide character design**: What does the Guide look/sound like? Gender? Species? Art style? This becomes the face of the brand.
2. **Page economy**: Are pages consumed on AI replies only, or do player inputs count too? (Recommendation: AI replies only — player agency shouldn't feel like it costs something.)
3. **Cross-story continuity**: When a character travels between stories, what carries over? Stats/traits? Inventory? Relationships? Or just the character's identity and history?
4. **Template curation**: Who moderates? Pure community voting? Editorial picks? Algorithmic? Some combo?
5. **Multiplayer implications**: If characters can enter other people's stories, is there a real-time multiplayer angle eventually? Or is it always async (your character appears as an NPC)?
6. **Guide memory scope**: Does the Guide remember you across ALL stories? Or does it have a "librarian mode" memory (knows your preferences) vs. "narrator mode" memory (only knows current story)?
7. **Visual theming implementation**: Start with preset genre palettes, or go straight to AI-driven dynamic theming?
8. **Naming the Guide**: Does the Guide have a name? Is it customizable? Or is it always the same character for everyone?

---

## Rough Milestone Mapping

These ideas layer on top of the existing roadmap. Rough sequencing based on dependencies:

| Priority | Concept | Depends On | Why This Order |
|---|---|---|---|
| **Next** | Page-based story structure | Milestone 2 (AI memory) | Keystone feature — enables cost control, pacing, and progression. Can be built on current codebase. |
| **Next** | The Guide character | Page structure | Needs a defined personality/voice. Could start as narrator improvements + onboarding flow. |
| **Then** | Bookshelf UI | Guide + page structure | The big visual redesign. Replaces current flat interface. Subsumes Milestone 3 (brand redesign). |
| **Then** | Cross-story character travel | Page structure (need "finished" stories) | Requires character persistence across stories and the concept of a "completed" book. |
| **Later** | Community templates | Cross-story travel + enough users | Needs a base of completed stories to nominate from. Needs moderation/voting system. |
| **Later** | Adaptive visual theming | Bookshelf UI | Enhancement layer on top of the bookshelf. Start with genre presets, evolve to dynamic. |

---

## Business Model & Unit Economics

Full financial model in `Story_Mode_Economics.xlsx` (same directory). Summary below.

### The Page System IS the Business Model

The page-based structure isn't just a design choice — it's the cost control mechanism. Each page costs roughly $0.005 in AI tokens (Claude 3.5 Haiku via OpenRouter). That means story costs are completely predictable:

- Short Story (25 pages): ~$0.13
- Novella (50 pages): ~$0.27
- Novel (100 pages): ~$0.54
- Epic (250 pages): ~$1.35

### Subscription Tiers

**Free** ($0/mo) — 50 pages/month (two short stories). Enough to hook people, cheap enough to give away (~$0.26 cost per free user). Community browse-only.

**Storyteller** ($5/mo) — 300 pages/month. Unlocks novellas, novels, community voting, cross-story character travel. At average usage (~120 pages), costs ~$0.65 in AI. ~87% margin.

**Author** ($10/mo) — 1,000 pages/month. Haiku + Sonnet (better writing quality for longer stories). Full community access, 4th-wall breaking, template creation. At average usage (~400 pages), costs ~$4.50 in AI (Sonnet is ~4x more expensive). ~55% margin.

### Why This Works

The page cap means you never have a runaway cost situation. Free users can't burn more than 50 pages of AI. Paying users have generous limits but hard ceilings. And the tiers have natural upsell: you start a short story for free, get hooked, and pay $5 to play a novel. Then you want Sonnet-quality writing and community features, so you upgrade to $10.

### Scaling Economics (from the spreadsheet)

At 1,000 total users (Month 6 target): ~$150/mo AI cost, ~$610/mo revenue = profitable.
At 5,000 users (Month 12): ~$660/mo AI cost, ~$4,500/mo revenue = healthy.
At 15,000+ users (Month 18): ~$2,400/mo AI cost, ~$18,000/mo revenue = real business.

Infrastructure (Supabase, Render) stays under $50/mo until significant scale.

---

## Launch Strategy

### Phase 1: Alpha (Months 1-2)
Just David + Rachel + a handful of friends. Ship the page structure, the Guide character, and test with real playthroughs. Monthly cost: ~$5-10. Goal: validate that AI pacing across a fixed page count actually creates good stories.

### Phase 2: Beta (Months 3-5)
Ship the bookshelf UI (port the prototype into the real codebase). Get 50-200 beta testers. Build a waitlist/landing page. Goal: find the "wow" moment and measure story completion rate.

### Phase 3: Public Launch (Month 6)
- **Product Hunt** — Core audience of early adopters and makers
- **Reddit** — r/interactivefiction, r/writing, r/rpg, r/storytelling
- **TikTok/Reels** — Screen recordings of interesting story moments (the visual theming makes this screenshot-worthy)
- **Indie Hackers** — Build-in-public narrative
- **Built-in referrals** — "Invite a friend to your story" mechanic (their character becomes an NPC)

### Phase 4: Community Flywheel (Months 7-12)
Ship cross-story travel and community templates. Now the product markets itself: players share completed stories, their characters show up in other people's adventures, and the best worlds become templates. Each feature is gated to a subscription tier, creating natural upsell pressure.

### Key Metrics to Watch
- Story completion rate (>40% = page model works)
- Pages per session (>8 = people are hooked)
- Free → Storyteller conversion (>5% = business viable)
- D7 retention (>25% = people come back)
- AI cost per MAU (<$0.50 = unit economics hold)

---

*This is a living doc. Update it as ideas evolve.*
*Last updated: March 15, 2026*
