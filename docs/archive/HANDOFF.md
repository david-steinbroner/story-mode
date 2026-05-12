# HANDOFF.md — Session Context for Future David & Claude

---

## Session Date & Summary

**Date:** March 17, 2026

**What happened this session:**
Completed Milestone 5 (all bugs fixed, all UX improvements shipped). Started Milestone 6 groundwork — scoped the Guide chatbot, built reusable confirmation components, renamed all "narrator" references to "Your Guide", and fixed several late-breaking bugs.

**What we accomplished (across March 16-17):**

### Milestone 5 — Complete
1. **Bug fixes:** Story isolation (storyId threading), End button (PATCH instead of DELETE), narrator fallback error (retry logic with 150ms delay + route-level retry)
2. **Story screen overhaul:** Consolidated nav bar, bottom drawer for choices, smart auto-scroll, font size controls, page indicator
3. **Icon/emoji cleanup:** Stripped all decorative icons and emojis for a cleaner literary feel
4. **"Surprise me" button:** AI-generated character descriptions via `POST /api/story/surprise-me`
5. **Genre step removed:** 2-step story creation (page count → character description), AI infers genre
6. **Tooltip fix:** Info box replaced with popover on character description
7. **Cowork plugin:** 23 Claude Code skills packaged for Cowork

### Milestone 6 Groundwork
8. **"Your Guide" naming:** All UI references to "narrator" renamed to "Your Guide" across ChatInterface, App, aiService, summaryService
9. **Guide chatbot components:** `GuideConfirmDialog.tsx` and `GuideStoryCard.tsx` — reusable confirmation flow components
10. **Guide chatbot scoped:** Full M6 spec written in CLAUDE.md with hybrid approach (canned + AI), task breakdown, architecture
11. **Query key scoping:** Fixed React Query cache issues by scoping query keys with `activeStoryId`
12. **Sticky nav fix:** ChatInterface nav bar now properly sticky
13. **New Story button:** Shows "Start a New Story" button + shelf when all stories are finished (no active stories)

**Key decisions:**
- M5 is fully complete — all 3 bugs fixed, all UX items shipped
- M6 is the Guide chatbot. Hybrid approach: canned responses for common actions (free), AI for open-ended (Haiku, ~$0.001-0.002 per call)
- "Your Guide" is the canonical user-facing name. "Guide" in code/system prompts.

---

## Previous Sessions

**March 16, 2026 (morning):** Shipped M3, M5, and multi-story support. App went from flat chat to bookshelf-based story reader with page structure, pacing, and multiple stories per session. Cleaned up 15 dead component/hook files.

**March 15, 2026:** Major creative pivot. V2 brainstorm with Rachel — bookshelf metaphor, Guide character, page-based stories. Built interactive prototype. Revised milestone roadmap.

**February 26, 2026:** Milestone 2 (Rolling Story Summary) — complete implementation committed (5e29dd7). Never live-tested.

---

## Milestone Roadmap

| # | Milestone | Status | What It Is |
|---|-----------|--------|------------|
| 1 | Foundation | ✅ Done | DB persistence, session isolation |
| 2 | AI Memory | ✅ Done (needs live test) | Rolling story summary |
| 3 | Page Structure | ✅ Done | Fixed page counts, AI pacing, story completion |
| 4 | The Guide | ⚠️ Partial | Guide avatar on bookshelf; full unified personality not yet implemented |
| 5 | Polish & UX | ✅ Done | Bug fixes, story screen overhaul, icon cleanup, genre removal, surprise me |
| **6** | **Your Guide Chatbot** | **In Progress** | **Interactive chatbot on bookshelf — canned + AI hybrid** |
| 7 | Cross-Story Travel | Not started | Character persistence across stories |
| 8 | Community Templates | Not started | Player-created content, voting, moderation |
| 9 | Adaptive Theming | Not started | Genre influences visual design |

### What's still open:
- **M2 (AI Memory):** Never live-tested. Needs a 15+ message playthrough to verify summarization triggers and recall.
- **M4 (The Guide):** Guide avatar exists on bookshelf with greetings, but the full vision (unified AI personality) is not yet wired into story narration system prompts.
- **M6 (Guide Chatbot):** Foundation built (components + spec). Implementation tasks 1-7 remain (see CLAUDE.md section 9b for full spec).

---

## What Was Built (All Commits This Session)

```
4f560ef fix: scope query keys by storyId, fix sticky nav bar, show New Story button when all stories finished
ffb529a style: rename narrator references to Your Guide across UI and server
365e8ca feat: add GuideConfirmDialog and GuideStoryCard reusable components
db07f31 fix: add retry logic for intermittent JSON parse failure on new story creation
1659ba5 docs: update CLAUDE.md and HANDOFF.md for M5 progress
1e4a4e8 feat: story screen UX overhaul — consolidated nav, bottom drawer choices, auto-scroll
0494a33 feat: remove genre step, simplify story creation to 2-step flow
157961d feat: add "Surprise me" button for AI-generated character descriptions
77ad0a0 style: remove decorative icons and emojis from UI for cleaner literary feel
b5fc7b9 feat: add font size controls behind settings icon on story screen
2f1ce2a feat: add "I have something else in mind" custom input option to story choices
4556fd5 feat: add subtle page indicator to story screen header
8c923b8 fix: remove broken mic button, persistent text input, and progress bar from story screen
6fed6d5 fix: End button marks story finished instead of deleting it
58c1155 fix: thread storyId through AI service to fix story isolation bug
```

---

## Exact State of Every File Area

### Foundation (M1) — solid:
- `server/db.ts` — DB connection pool
- `server/dbStorage.ts` — All CRUD with session + storyId scoping
- `server/storage.ts` — IStorage interface (updated with storyId and summary methods)
- `shared/schema.ts` — Drizzle schema (includes storySummaries, page fields, storyId)
- `client/src/lib/queryClient.ts` — Session ID + Story ID header injection

### AI (M2 + retry logic) — built, M2 needs live test:
- `server/aiService.ts` — Context injection, background summarization trigger, page pacing, storyId scoping, retry logic for JSON parse failures, "Your Guide" persona
- `server/summaryService.ts` — Rolling story summary generation, "Your Guide" references
- `server/routes.ts` — All endpoints including `POST /api/story/surprise-me`, retry logic in `/api/story/new`

### Story Screen (M5 overhaul) — shipped:
- `client/src/components/ChatInterface.tsx` — Sticky nav bar with dropdown menu, pure narrative messages, collapsible bottom drawer for choices, font size controls, End Story with AlertDialog, smart auto-scroll, "Your Guide" labels
- `client/src/App.tsx` — 3-view routing, query keys scoped by storyId, delegates game UI to ChatInterface

### Bookshelf + Story Creation — shipped:
- `client/src/components/Bookshelf.tsx` — Home screen with bookshelf, "Start a New Story" button when all stories finished, cleaned of decorative icons
- `client/src/components/NewStoryCreation.tsx` — 2-step wizard (page count → character description) with "Surprise me" button and info popover

### Guide Chatbot Foundation (M6) — components built, chat UI not yet:
- `client/src/components/GuideConfirmDialog.tsx` — Reusable confirmation modal (cream bg, pastel palette)
- `client/src/components/GuideStoryCard.tsx` — Story info card (genre badge, progress, character desc)

### Still scheduled for deletion:
- `users`, `enemies`, `campaigns` tables and related routes
- `MemStorage` class in `server/storage.ts`
- `CharacterQuestionnaire.tsx`, `AbilityScoreRoller.tsx`, `CampaignManager.tsx`

---

## The Next Thing To Do

**Current: Milestone 6 — Your Guide Chatbot** (see CLAUDE.md section 9b for full spec)

Task breakdown:
1. Build `GuideChat.tsx` — modal UI with message list, text input, Guide avatar
2. Implement client-side intent matcher — keyword matching for canned intents
3. Wire canned intents to confirmation dialogs using `GuideConfirmDialog` + `GuideStoryCard`
4. Build `POST /api/guide/chat` endpoint with Guide-specific system prompt
5. Connect AI fallback for unmatched intents
6. Wire GuideChat to Guide mascot tap on Bookshelf
7. Test all flows: resume, new story, delete, help, clear data, AI freeform

**After M6:**
- Live-test M2 (AI Memory) — 15+ message playthrough
- Bookshelf display for "auto" genre stories (AI returns genre tag, update record)
- M4 completion (Guide personality in story narration prompts)
- Production hardening (M6+)

---

## Environment & Infra State

### `.env` variables (names only):
```
OPENROUTER_API_KEY    # Required for AI responses + summarization
DATABASE_URL          # Supabase PostgreSQL connection string
PORT                  # Server port (default 5000, dev uses 3000)
NODE_ENV              # development | production
SENTRY_DSN            # Optional error tracking
ADMIN_KEY             # Required for /api/admin/* endpoints
```

### Database state:
- **Tables**: `characters`, `quests`, `items`, `messages`, `game_state`, `story_summaries`
- **Applied migrations**: `001` (base), `002` (sessions), `003_add_page_structure`, `004_add_story_id`
- **All tables have**: `session_id` and `story_id` columns for isolation
- **Genre column**: Accepts "auto" for AI-inferred genre stories

---

## Key Reference Files

| File | Purpose |
|---|---|
| `CLAUDE.md` | Engineering operating manual — read first every session |
| `HANDOFF.md` | This file — session context and next steps |
| `STORY_MODE_V2_BRAINSTORM.md` | V2 vision doc (bookshelf, Guide, pages, community) |
| `story-mode-prototype.html` | Interactive UI prototype for V2 |
| `design_guidelines.md` | Brand specs (Pastel Playground palette) |

---

*Last updated: March 17, 2026 by David + Claude Code*
