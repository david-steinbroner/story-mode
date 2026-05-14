/**
 * Dump the most recent stories from the local database to a markdown
 * file so they can be reviewed side by side.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/dump-recent-stories.ts [count] [outfile]
 *
 *   count   — how many recent stories to dump (default 2)
 *   outfile — where to write (default /tmp/story-comparison.md)
 *
 * Reads DATABASE_URL from your local .env (via tsx's --env-file flag, same
 * as the dev server). Picks the N stories with the most recently created
 * AI message — i.e. whichever stories you last generated or read. For
 * each story, dumps the AI-authored pages in order.
 */

import postgres from "postgres";
import { writeFileSync } from "fs";

const count = parseInt(process.argv[2] || "2", 10);
const outfile = process.argv[3] || "/tmp/story-comparison.md";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Missing DATABASE_URL in .env");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

interface StoryRow {
  story_id: string;
  story_title: string | null;
  story_length: string | null;
  total_pages: number | null;
  current_page: number;
  story_complete: boolean;
  session_id: string;
  last_message_at: string;
}

interface MessageRow {
  content: string;
  sender: string;
  created_at: string;
}

async function main() {
  // Top N stories by the timestamp of their most recent message.
  const stories = (await sql`
    SELECT
      gs.story_id,
      gs.story_title,
      gs.story_length,
      gs.total_pages,
      gs.current_page,
      gs.story_complete,
      gs.session_id,
      MAX(m.created_at) AS last_message_at
    FROM game_state gs
    JOIN messages m ON m.story_id = gs.story_id
    WHERE gs.story_id IS NOT NULL
      AND gs.deleted_at IS NULL
    GROUP BY gs.story_id, gs.story_title, gs.story_length, gs.total_pages,
             gs.current_page, gs.story_complete, gs.session_id
    ORDER BY MAX(m.created_at) DESC
    LIMIT ${count}
  `) as unknown as StoryRow[];

  if (stories.length === 0) {
    console.error("No stories found.");
    process.exit(1);
  }

  const sections: string[] = [
    `# Story comparison dump`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    `Stories: ${stories.length}`,
    ``,
    `---`,
    ``,
  ];

  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    const messages = (await sql`
      SELECT content, sender, created_at
      FROM messages
      WHERE story_id = ${story.story_id}
        AND sender = 'dm'
      ORDER BY created_at ASC
    `) as unknown as MessageRow[];

    sections.push(`## Story ${i + 1}: ${story.story_title || "(untitled)"}`);
    sections.push(``);
    sections.push(`- **Story ID:** \`${story.story_id}\``);
    sections.push(`- **Length:** ${story.story_length || "?"}`);
    sections.push(
      `- **Pages:** ${story.current_page} of ${story.total_pages ?? "?"}`,
    );
    sections.push(`- **Complete:** ${story.story_complete ? "yes" : "no"}`);
    sections.push(`- **Last activity:** ${story.last_message_at}`);
    sections.push(`- **AI messages:** ${messages.length}`);
    sections.push(``);
    sections.push(`---`);
    sections.push(``);

    for (let j = 0; j < messages.length; j++) {
      sections.push(`### Page ${j + 1}`);
      sections.push(``);
      sections.push(messages[j].content);
      sections.push(``);
    }

    sections.push(`---`);
    sections.push(``);
  }

  writeFileSync(outfile, sections.join("\n"));
  console.log(`Wrote ${stories.length} stories to ${outfile}`);
  console.log(
    `Stories:\n${stories
      .map(
        (s, idx) =>
          `  ${idx + 1}. ${s.story_title || "(untitled)"} — ${s.current_page}/${s.total_pages ?? "?"} pages — last activity ${s.last_message_at}`,
      )
      .join("\n")}`,
  );

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
