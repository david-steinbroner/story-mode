-- Migration 0003: issue_reports
-- In-app bug reporting. Replaces the prior mailto-only flow. Users tap
-- "Report an issue" in the bookshelf or in-story menu; the IssueReportSheet
-- POSTs to /api/issue-report which inserts into this table and (when
-- RESEND_API_KEY + ISSUE_REPORT_TO_EMAIL are set) forwards a notification.
--
-- session_id / story_id are nullable: users can opt out of attaching their
-- story context. When attached, last_message_ids carries the trailing 3 AI
-- message IDs so devs can pull narrative context to reproduce the bug.

CREATE TABLE IF NOT EXISTS issue_reports (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id VARCHAR,
  story_id VARCHAR,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  current_page INTEGER,
  last_message_ids JSONB,
  app_version TEXT,
  user_agent TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin list view sorts by created_at DESC most of the time. Partial index
-- on unresolved rows keeps the "needs attention" view cheap.
CREATE INDEX IF NOT EXISTS idx_issue_reports_created_at ON issue_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_reports_unresolved
  ON issue_reports(created_at DESC)
  WHERE resolved_at IS NULL;

-- RLS posture matches every other table — enabled, no policies. The Express
-- server uses the postgres role and bypasses RLS; anon/authenticated roles
-- are denied. Direct Supabase access from the client would fail by design.
ALTER TABLE issue_reports ENABLE ROW LEVEL SECURITY;
