# Story Mode

Create a character, step into a story, and choose what happens next.

Story Mode is an interactive storytelling app with an AI guide. Describe someone you'd like to play, then follow the story through short passages and choices you can tap. You can also write your own response when you want to try something different.

It's built for people who want a little adventure without learning a game system or organizing a group.

[Try Story Mode](https://mystorymode.com)

## What you can do

- Start a story from a character idea, or ask for suggestions.
- Shape the adventure through your choices.
- Return to your stories from your bookshelf.

## Run it locally

Use Node.js 20. Copy [`.env.example`](.env.example) to a local `.env` and fill in your own settings, then run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Local use needs an OpenRouter API key and a PostgreSQL database. The example file also explains the admin settings and optional email and monitoring services.

The main settings are `OPENROUTER_API_KEY`, `DATABASE_URL`, `ADMIN_KEY`, `ADMIN_TOTP_SECRET`, and `ADMIN_JWT_SECRET`. Optional settings are `RESEND_API_KEY`, `ISSUE_REPORT_FROM_EMAIL`, `ISSUE_REPORT_TO_EMAIL`, `SENTRY_DSN`, `VITE_POSTHOG_KEY`, and `VITE_POSTHOG_HOST`.

For development, start with [the project guide](CLAUDE.md). It links to the design, story-writing, and operating notes. [Milestones](docs/MILESTONES.md) record past work, and [the roadmap](docs/ROADMAP.md) explains planned work.
