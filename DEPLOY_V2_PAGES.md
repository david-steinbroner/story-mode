# Deploy: V2 Page Structure (Milestone 3)

## What Changed

### Files modified:
- `shared/schema.ts` — Added 6 new columns to `gameState` table: `totalPages`, `currentPage`, `storyLength`, `genre`, `characterDescription`, `storyComplete`
- `server/aiService.ts` — New pacing system prompt (The Guide voice), page-aware narrative arc, auto-increments `currentPage` after each AI reply
- `server/routes.ts` — New endpoints: `POST /api/story/new` (start a page-based story), `GET /api/story/status` (get current story progress)
- `server/dbStorage.ts` — Updated `clearAllAdventureData` to reset page-structure fields

### New files:
- `migrations/003_add_page_structure.sql` — Database migration

---

## Deploy Steps

### 1. Run the database migration

Connect to your Supabase SQL editor (or psql) and run:

```sql
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS total_pages INTEGER;
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS current_page INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS story_length TEXT;
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS genre TEXT;
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS character_description TEXT;
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS story_complete BOOLEAN NOT NULL DEFAULT false;
```

Or run the migration file:
```bash
psql $DATABASE_URL -f migrations/003_add_page_structure.sql
```

### 2. Test locally

```bash
cd ~/Projects/Active\ Development/story-mode
npm run dev
```

Test the new endpoint with curl or from the browser console:
```javascript
// Start a new 25-page fantasy story
fetch('/api/story/new', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-session-id': localStorage.getItem('session-id')
  },
  body: JSON.stringify({
    genre: 'fantasy',
    storyLength: 'short',
    characterDescription: 'A retired cartographer who discovers her maps can create real places'
  })
}).then(r => r.json()).then(console.log)
```

```javascript
// Check story status
fetch('/api/story/status', {
  headers: { 'x-session-id': localStorage.getItem('session-id') }
}).then(r => r.json()).then(console.log)
```

Then send messages via the normal `/api/ai/chat` endpoint and verify:
- `currentPage` increments with each AI reply
- The AI's tone matches The Guide voice (warm, literary, bookish)
- Pacing changes as you approach the end of the story
- `storyComplete` flips to `true` on the last page

### 3. Test on iPhone

While running locally, find your Mac's local IP:
```bash
ipconfig getifaddr en0
```

Then on your iPhone (same WiFi), open:
```
http://<your-ip>:3000
```

### 4. Commit and push to deploy

```bash
git add shared/schema.ts server/aiService.ts server/routes.ts server/dbStorage.ts migrations/
git commit -m "feat: add page-based story structure (Milestone 3)"
git push origin main
```

Render will auto-deploy from main.

### 5. Run migration on production

After deploy, run the same SQL migration against your production Supabase database.

---

## How to test on your iPhone (production)

Once deployed, just open https://storymode.onrender.com on your iPhone.

To test the new story flow, you'll need to hit the API directly for now (the frontend UI hasn't been updated to the bookshelf yet). Use the browser console on your phone, or test from your Mac and then continue the conversation on your phone using the same session ID.

---

## Rollback

If something breaks, the migration is safe — all new columns are nullable or have defaults. Existing sessions will continue working as before (the page system only activates when `totalPages` is set).

To rollback the code: `git revert HEAD` and push.
