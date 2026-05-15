import { useState, useEffect, useCallback } from "react";

interface SpendStats {
  todaysCost: number;
  allTimeCost: number;
  requestsToday: number;
  requestsAllTime: number;
  averageCostPerRequest: number;
  dailyBudgetRemaining: number;
  dailyLimit: number;
  todaysTokens: { prompt: number; completion: number };
  allTimeTokens: { prompt: number; completion: number };
}

interface SessionStats {
  sessions: Array<{
    sessionId: string;
    requestCount: number;
    totalCost: number;
    totalTokens: number;
  }>;
  totalSessions: number;
}

// Chunk B: AI quality validator metrics. Counts of each violation kind over
// the last 24h, plus rates against pages generated. Higher rates = the
// validators are catching more bad output; rates trending down over time
// after Chunk A's prompt restructure is the success signal we're after.
interface AIQualityStats {
  windowHours: number;
  totalPagesGenerated: number;
  totalViolationRows: number;
  counts: {
    stall: number;
    fakeChoices: number;
    finalPageBroken: number;
    momentumFired: number;
  };
  rates: {
    stall: number;
    fakeChoices: number;
    finalPageBroken: number;
    momentumFired: number;
  };
}

// 1.5.1: Recent event_log rows so support can look up a user's story by
// session_id + story_id when they report an issue.
interface RecentActivity {
  events: Array<{
    id: string;
    sessionId: string;
    storyId: string | null;
    eventType: string;
    properties: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

export default function AdminDashboard() {
  const [adminKey, setAdminKey] = useState("");
  // 6-digit TOTP code from the admin's authenticator app (1Password, etc.).
  // Sent on every admin request via the x-admin-totp header alongside the
  // key. Verified server-side in server/adminAuth.ts.
  const [totpCode, setTotpCode] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [spendStats, setSpendStats] = useState<SpendStats | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [aiQualityStats, setAiQualityStats] = useState<AIQualityStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // v1.9.0 — AI model toggle. `stored` is what's in app_config (alias or null);
  // `resolved` is the full OpenRouter ID that AI calls actually hit right now.
  const [modelOverride, setModelOverride] = useState<{ stored: string | null; resolved: string } | null>(null);
  const [modelToggleSaving, setModelToggleSaving] = useState(false);
  const [modelToggleError, setModelToggleError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!adminKey || !totpCode) return;

    setLoading(true);
    setError(null);

    try {
      const headers = {
        "x-admin-key": adminKey,
        "x-admin-totp": totpCode.replace(/\s+/g, ""),
      };

      const responses = await Promise.all([
        fetch("/api/admin/spend", { headers }),
        fetch("/api/admin/sessions", { headers }),
        fetch("/api/admin/ai-quality", { headers }),
        fetch("/api/admin/recent-activity", { headers }),
        fetch("/api/admin/model-override", { headers }),
      ]);
      const [spendRes, sessionRes, qualityRes, activityRes, modelRes] = responses;

      // 401 on any response = wrong key or wrong TOTP (server collapses both
      // so the response doesn't leak which factor failed). Reset auth so the
      // login screen reappears instead of leaving them on a half-loaded dash.
      if (responses.some((r) => r.status === 401)) {
        setError("Invalid credentials");
        setIsAuthenticated(false);
        // Clear the TOTP code so a stale 6-digit doesn't sit in the field
        // after its 30s window has expired. The key is usually right; the
        // TOTP is what most often needs re-entering.
        setTotpCode("");
        return;
      }

      // Any other non-OK: surface the server's actual error text. The admin
      // endpoints return JSON like { error: "..." } — fall back to status text
      // if the body isn't parseable (e.g. an HTML error page from a proxy).
      const firstBad = responses.find((r) => !r.ok);
      if (firstBad) {
        let serverMessage = `Server error (${firstBad.status})`;
        try {
          const body = await firstBad.clone().json();
          if (body && typeof body.error === "string" && body.error.trim()) {
            serverMessage = body.error;
          }
        } catch {
          // body wasn't JSON; keep the status-based fallback
        }
        setError(serverMessage);
        return;
      }

      const [spend, sessions, quality, activity, modelOv] = await Promise.all([
        spendRes.json(),
        sessionRes.json(),
        qualityRes.json(),
        activityRes.json(),
        modelRes.json(),
      ]);

      setSpendStats(spend);
      setSessionStats(sessions);
      setAiQualityStats(quality);
      setRecentActivity(activity);
      setModelOverride({ stored: modelOv.stored ?? null, resolved: modelOv.resolved });
      setIsAuthenticated(true);
      setLastUpdated(new Date());
    } catch (err) {
      // fetch() throws on network failure (DNS, offline, CORS preflight reject).
      // A JSON parse failure on a successful response would also land here but
      // is much less likely than "the server didn't answer at all".
      const isNetworkError =
        err instanceof TypeError ||
        (err instanceof Error && err.message.toLowerCase().includes("fetch"));
      setError(isNetworkError ? "Couldn't reach the server" : err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [adminKey, totpCode]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchStats]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStats();
  };

  // v1.9.0 — flip the runtime AI model between Haiku and Sonnet. The next
  // AI call uses the new value (server updates its in-memory cache inside
  // this POST handler). We also re-fetch stats afterward so the resolved
  // display matches what's now live.
  const saveModelOverride = async (model: "haiku" | "sonnet") => {
    if (modelToggleSaving) return;
    setModelToggleSaving(true);
    setModelToggleError(null);
    try {
      const res = await fetch("/api/admin/model-override", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
          "x-admin-totp": totpCode.replace(/\s+/g, ""),
        },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) {
        let msg = `Server error (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch { /* not JSON; keep status */ }
        setModelToggleError(msg);
        return;
      }
      const data = await res.json();
      setModelOverride({ stored: data.stored ?? null, resolved: data.resolved });
    } catch (err) {
      setModelToggleError(err instanceof Error ? err.message : "Couldn't reach the server");
    } finally {
      setModelToggleSaving(false);
    }
  };

  const formatCurrency = (value: number) => {
    return `$${value.toFixed(4)}`;
  };

  const formatNumber = (value: number) => {
    return value.toLocaleString();
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "#FAF9F6" }}>
        <div className="bg-white rounded-lg shadow-md p-6 w-full max-w-sm">
          <h1 className="text-xl font-semibold mb-4" style={{ color: "#5C5470" }}>
            Admin Dashboard
          </h1>
          <form onSubmit={handleSubmit}>
            <label className="block text-sm font-medium mb-2" style={{ color: "#5C5470" }}>
              Admin Key
            </label>
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              className="w-full px-3 py-2 border rounded-md mb-4 focus:outline-none focus:ring-2"
              style={{ borderColor: "#DBD8E3", color: "#5C5470", fontSize: "16px" }}
              placeholder="Enter admin key"
              autoFocus
            />
            <label className="block text-sm font-medium mb-2" style={{ color: "#5C5470" }}>
              2FA Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={7}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full px-3 py-2 border rounded-md mb-4 focus:outline-none focus:ring-2 tracking-[0.5em] text-center font-mono"
              style={{ borderColor: "#DBD8E3", color: "#5C5470", fontSize: "20px" }}
              placeholder="123456"
            />
            {error && (
              <p className="text-red-500 text-sm mb-4">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !adminKey || totpCode.length !== 6}
              className="w-full py-2 px-4 rounded-md font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#5C5470", color: "white" }}
            >
              {loading ? "Loading..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Dashboard. h-dvh + overflow-y-auto scopes scrolling to this container
  // since `html, body { overflow: hidden }` is set globally for the game
  // view's fixed layout. Mirrors the fix applied to Bookshelf in v1.3.0.
  return (
    <div className="h-dvh overflow-y-auto p-4 md:p-8" style={{ backgroundColor: "#FAF9F6" }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ color: "#5C5470" }}>
            Admin Dashboard
          </h1>
          <div className="text-sm" style={{ color: "#5C5470" }}>
            {lastUpdated && (
              <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
            )}
            <span className="ml-2 text-xs opacity-60">(auto-refreshes every 30s)</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Spend Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <Card title="Today's Cost" value={formatCurrency(spendStats?.todaysCost || 0)} />
          <Card title="All-Time Cost" value={formatCurrency(spendStats?.allTimeCost || 0)} />
          <Card title="Requests Today" value={formatNumber(spendStats?.requestsToday || 0)} />
          <Card title="Requests All-Time" value={formatNumber(spendStats?.requestsAllTime || 0)} />
          <Card title="Avg Cost/Request" value={formatCurrency(spendStats?.averageCostPerRequest || 0)} />
          <Card
            title="Daily Budget Remaining"
            value={formatCurrency(spendStats?.dailyBudgetRemaining || 0)}
            subtitle={`of ${formatCurrency(spendStats?.dailyLimit || 10)} limit`}
          />
        </div>

        {/* AI Model Toggle (v1.9.0) — flip between Haiku and Sonnet at runtime.
            Persists in app_config; next AI call picks up the change. */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold mb-1" style={{ color: "#5C5470" }}>
            AI Model
          </h2>
          <p className="text-xs mb-4" style={{ color: "#5C5470", opacity: 0.7 }}>
            Currently active: <span className="font-mono">{modelOverride?.resolved ?? "loading…"}</span>
            {modelOverride?.stored ? (
              <> — admin override: <span className="font-mono">{modelOverride.stored}</span></>
            ) : (
              <> — using server default</>
            )}
          </p>
          <div className="flex items-center gap-2">
            {(["haiku", "sonnet"] as const).map((m) => {
              const isActive = modelOverride?.stored === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => saveModelOverride(m)}
                  disabled={modelToggleSaving || isActive}
                  className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: isActive ? "#5C5470" : "#FAF9F6",
                    color: isActive ? "#FAF9F6" : "#5C5470",
                    border: "1px solid #5C5470",
                    cursor: isActive || modelToggleSaving ? "default" : "pointer",
                    opacity: modelToggleSaving && !isActive ? 0.5 : 1,
                  }}
                >
                  {m === "haiku" ? "Haiku" : "Sonnet"}
                </button>
              );
            })}
            {modelToggleSaving && (
              <span className="text-xs ml-2" style={{ color: "#5C5470", opacity: 0.6 }}>
                Saving…
              </span>
            )}
          </div>
          {modelToggleError && (
            <p className="text-xs mt-2 text-red-600">{modelToggleError}</p>
          )}
        </div>

        {/* Token Usage */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#5C5470" }}>
            Token Usage
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium mb-2" style={{ color: "#5C5470" }}>Today</h3>
              <p className="text-sm" style={{ color: "#5C5470" }}>
                Prompt: {formatNumber(spendStats?.todaysTokens?.prompt || 0)}
              </p>
              <p className="text-sm" style={{ color: "#5C5470" }}>
                Completion: {formatNumber(spendStats?.todaysTokens?.completion || 0)}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2" style={{ color: "#5C5470" }}>All-Time</h3>
              <p className="text-sm" style={{ color: "#5C5470" }}>
                Prompt: {formatNumber(spendStats?.allTimeTokens?.prompt || 0)}
              </p>
              <p className="text-sm" style={{ color: "#5C5470" }}>
                Completion: {formatNumber(spendStats?.allTimeTokens?.completion || 0)}
              </p>
            </div>
          </div>
        </div>

        {/* Session Stats */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#5C5470" }}>
            Sessions ({sessionStats?.totalSessions || 0})
          </h2>
          {sessionStats?.sessions && sessionStats.sessions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "#5C5470" }}>
                    <th className="text-left py-2 px-2">Session ID</th>
                    <th className="text-right py-2 px-2">Requests</th>
                    <th className="text-right py-2 px-2">Cost</th>
                    <th className="text-right py-2 px-2">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionStats.sessions.map((session) => (
                    <tr key={session.sessionId} className="border-t" style={{ borderColor: "#DBD8E3" }}>
                      <td className="py-2 px-2 font-mono text-xs break-all" style={{ color: "#5C5470" }}>
                        <span>{session.sessionId}</span>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard?.writeText(session.sessionId)}
                          className="ml-2 inline-block text-[10px] underline cursor-pointer"
                          style={{ color: "#5C5470", opacity: 0.6 }}
                          title="Copy full session ID"
                        >
                          copy
                        </button>
                      </td>
                      <td className="py-2 px-2 text-right" style={{ color: "#5C5470" }}>
                        {formatNumber(session.requestCount)}
                      </td>
                      <td className="py-2 px-2 text-right" style={{ color: "#5C5470" }}>
                        {formatCurrency(session.totalCost)}
                      </td>
                      <td className="py-2 px-2 text-right" style={{ color: "#5C5470" }}>
                        {formatNumber(session.totalTokens)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "#5C5470" }}>No session data yet</p>
          )}
        </div>

        {/* AI Quality Stats (Chunk B). Rolling 24h window — counts of each
            validator violation and their rate against pages generated.
            Rates trending down over time after a prompt change is the
            success signal. */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold mb-1" style={{ color: "#5C5470" }}>
            AI Quality (last {aiQualityStats?.windowHours ?? 24}h)
          </h2>
          <p className="text-xs mb-4" style={{ color: "#5C5470" }}>
            {formatNumber(aiQualityStats?.totalPagesGenerated ?? 0)} pages generated,
            {" "}
            {formatNumber(aiQualityStats?.totalViolationRows ?? 0)} responses with at least one violation
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <QualityCard
              title="Stalls"
              count={aiQualityStats?.counts.stall ?? 0}
              rate={aiQualityStats?.rates.stall ?? 0}
              hint="Page didn't introduce a new entity, location, fact, or escalation"
            />
            <QualityCard
              title="Fake Choices"
              count={aiQualityStats?.counts.fakeChoices ?? 0}
              rate={aiQualityStats?.rates.fakeChoices ?? 0}
              hint="Two of three choices were variants of the same action"
            />
            <QualityCard
              title="Final-Page Breaks"
              count={aiQualityStats?.counts.finalPageBroken ?? 0}
              rate={aiQualityStats?.rates.finalPageBroken ?? 0}
              hint="Last page ended on a choice prompt instead of resolving"
            />
            <QualityCard
              title="Momentum Fires"
              count={aiQualityStats?.counts.momentumFired ?? 0}
              rate={aiQualityStats?.rates.momentumFired ?? 0}
              hint="Reader stalled; the world was forced to act on the next page"
            />
          </div>
        </div>

        {/* Recent Activity (1.5.1). Last 20 event_log rows with full
            session_id + story_id so support can look up a user's story
            for customer-support lookups. Both IDs have copy-to-clipboard
            buttons and the table scrolls horizontally on narrow screens. */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold mb-1" style={{ color: "#5C5470" }}>
            Recent Activity
          </h2>
          <p className="text-xs mb-4" style={{ color: "#5C5470" }}>
            Last {recentActivity?.events?.length ?? 0} events across all sessions
          </p>
          {recentActivity?.events && recentActivity.events.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "#5C5470" }}>
                    <th className="text-left py-2 px-2">When</th>
                    <th className="text-left py-2 px-2">Event</th>
                    <th className="text-left py-2 px-2">Session</th>
                    <th className="text-left py-2 px-2">Story</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.events.map((evt) => (
                    <tr key={evt.id} className="border-t" style={{ borderColor: "#DBD8E3" }}>
                      <td className="py-2 px-2 text-xs whitespace-nowrap" style={{ color: "#5C5470" }}>
                        {new Date(evt.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-xs font-mono" style={{ color: "#5C5470" }}>
                        {evt.eventType}
                      </td>
                      <td className="py-2 px-2 font-mono text-[11px] break-all" style={{ color: "#5C5470" }}>
                        <span>{evt.sessionId}</span>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard?.writeText(evt.sessionId)}
                          className="ml-2 inline-block text-[10px] underline cursor-pointer"
                          style={{ color: "#5C5470", opacity: 0.6 }}
                          title="Copy session ID"
                        >
                          copy
                        </button>
                      </td>
                      <td className="py-2 px-2 font-mono text-[11px] break-all" style={{ color: "#5C5470" }}>
                        {evt.storyId ? (
                          <>
                            <span>{evt.storyId}</span>
                            <button
                              type="button"
                              onClick={() => navigator.clipboard?.writeText(evt.storyId!)}
                              className="ml-2 inline-block text-[10px] underline cursor-pointer"
                              style={{ color: "#5C5470", opacity: 0.6 }}
                              title="Copy story ID"
                            >
                              copy
                            </button>
                          </>
                        ) : (
                          <span style={{ opacity: 0.4 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "#5C5470" }}>No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
}

function QualityCard({
  title,
  count,
  rate,
  hint,
}: {
  title: string;
  count: number;
  rate: number;
  hint: string;
}) {
  const pct = (rate * 100).toFixed(1);
  return (
    <div className="rounded-md p-3" style={{ backgroundColor: "#FAF9F6", border: "1px solid #DBD8E3" }}>
      <p className="text-xs font-medium mb-1" style={{ color: "#5C5470" }}>{title}</p>
      <p className="text-xl font-semibold" style={{ color: "#5C5470" }}>{count}</p>
      <p className="text-xs" style={{ color: "#5C5470" }}>{pct}% of pages</p>
      <p className="text-[10px] mt-1 leading-tight" style={{ color: "#5C5470", opacity: 0.7 }}>{hint}</p>
    </div>
  );
}

function Card({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h3 className="text-sm font-medium mb-1" style={{ color: "#5C5470" }}>
        {title}
      </h3>
      <p className="text-2xl font-bold" style={{ color: "#5C5470" }}>
        {value}
      </p>
      {subtitle && (
        <p className="text-xs mt-1" style={{ color: "#5C5470", opacity: 0.7 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
