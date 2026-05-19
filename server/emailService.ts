import { Resend } from "resend";

// Single seam for outbound transactional email. Currently used by the issue-
// report endpoint to forward new reports to ISSUE_REPORT_TO_EMAIL. Falls back
// to a no-op log when RESEND_API_KEY is absent so dev / unconfigured deploys
// don't crash submit flows — the DB row is still written either way.
//
// Add new email types as standalone exported functions; keep them all routed
// through `send()` so the no-op path stays a single check.

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.ISSUE_REPORT_FROM_EMAIL;
const issueReportToAddress = process.env.ISSUE_REPORT_TO_EMAIL;

let resendClient: Resend | null = null;
function getClient(): Resend | null {
  if (!apiKey) return null;
  if (!resendClient) resendClient = new Resend(apiKey);
  return resendClient;
}

async function send(message: EmailMessage): Promise<{ ok: boolean; error?: string }> {
  const client = getClient();
  if (!client || !fromAddress) {
    console.log("[emailService] no RESEND_API_KEY or ISSUE_REPORT_FROM_EMAIL set; skipping send", {
      to: message.to,
      subject: message.subject,
    });
    return { ok: false, error: "email transport not configured" };
  }
  try {
    const { error } = await client.emails.send({
      from: fromAddress,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (error) {
      console.error("[emailService] resend returned error", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error("[emailService] send threw", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

interface IssueReportEmailInput {
  id: string;
  category: string;
  description: string;
  sessionId: string | null;
  storyId: string | null;
  currentPage: number | null;
  lastMessageIds: string[];
  appVersion: string | null;
  userAgent: string | null;
  // v1.14.0 — present when the report was filed from a puzzle screen with
  // "include context" toggled on. Server-generated UUID, so safe to inline
  // into the diagnostic SQL snippet below (no injection vector).
  puzzleId: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  guide_reply: "The Guide's reply is broken or off",
  choices: "My choices didn't work",
  stuck: "The story got stuck",
  story_load: "A story didn't open or load",
  story_missing: "A story is missing or in the wrong tab",
  story_manage: "Can't archive, restore, or delete a story",
  puzzle: "A puzzle is broken or unsolvable",
  other: "Something else",
};

export async function sendIssueReportEmail(input: IssueReportEmailInput): Promise<{ ok: boolean; error?: string }> {
  if (!issueReportToAddress) {
    console.log("[emailService] no ISSUE_REPORT_TO_EMAIL set; skipping send", { reportId: input.id });
    return { ok: false, error: "issue report recipient not configured" };
  }
  const label = CATEGORY_LABELS[input.category] ?? input.category;
  const contextLines = [
    input.sessionId ? `Session: ${input.sessionId}` : null,
    input.storyId ? `Story: ${input.storyId}` : null,
    input.currentPage !== null ? `Page: ${input.currentPage}` : null,
    input.lastMessageIds.length > 0 ? `Last AI message ids: ${input.lastMessageIds.join(", ")}` : null,
    input.appVersion ? `Version: ${input.appVersion}` : null,
    input.userAgent ? `User agent: ${input.userAgent}` : null,
  ].filter(Boolean);

  // v1.14.0 — surface puzzle diagnostics inline. The puzzleId originated
  // server-side (UUID via Postgres `gen_random_uuid()`); not user-supplied,
  // so it's safe to interpolate into the diagnostic SQL snippet.
  if (input.puzzleId) {
    contextLines.push(`Puzzle ID: ${input.puzzleId}`);
    contextLines.push(
      `Inspect: SELECT * FROM puzzles WHERE id = '${input.puzzleId}'; SELECT * FROM puzzle_attempts WHERE puzzle_id = '${input.puzzleId}' ORDER BY attempted_at;`
    );
  }

  const text = [
    `New issue report — ${label}`,
    "",
    input.description,
    "",
    "---",
    ...contextLines,
    "",
    `Report id: ${input.id}`,
  ].join("\n");

  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:600px;">
      <h2 style="margin:0 0 8px;">New issue report — ${escapeHtml(label)}</h2>
      <p style="white-space:pre-wrap;color:#5C6B73;border-left:3px solid #C67B5C;padding-left:12px;margin:16px 0;">
        ${escapeHtml(input.description)}
      </p>
      <hr style="border:0;border-top:1px solid #E3D8C7;margin:24px 0;" />
      <table style="color:#5C6B73;font-size:13px;line-height:1.6;">
        ${contextLines.map((l) => `<tr><td>${escapeHtml(l!)}</td></tr>`).join("")}
      </table>
      <p style="color:#999;font-size:12px;margin-top:24px;">Report id: ${escapeHtml(input.id)}</p>
    </div>
  `.trim();

  return send({
    to: issueReportToAddress,
    subject: `[Story Mode] Issue: ${label}`,
    html,
    text,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
