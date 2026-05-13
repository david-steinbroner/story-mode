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

export default function AdminDashboard() {
  const [adminKey, setAdminKey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [spendStats, setSpendStats] = useState<SpendStats | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [aiQualityStats, setAiQualityStats] = useState<AIQualityStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    if (!adminKey) return;

    setLoading(true);
    setError(null);

    try {
      const headers = { "x-admin-key": adminKey };

      const [spendRes, sessionRes, qualityRes] = await Promise.all([
        fetch("/api/admin/spend", { headers }),
        fetch("/api/admin/sessions", { headers }),
        fetch("/api/admin/ai-quality", { headers }),
      ]);

      if (spendRes.status === 401 || sessionRes.status === 401 || qualityRes.status === 401) {
        setError("Invalid admin key");
        setIsAuthenticated(false);
        return;
      }

      if (!spendRes.ok || !sessionRes.ok || !qualityRes.ok) {
        throw new Error("Failed to fetch stats");
      }

      const [spend, sessions, quality] = await Promise.all([
        spendRes.json(),
        sessionRes.json(),
        qualityRes.json(),
      ]);

      setSpendStats(spend);
      setSessionStats(sessions);
      setAiQualityStats(quality);
      setIsAuthenticated(true);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

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
            {error && (
              <p className="text-red-500 text-sm mb-4">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !adminKey}
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
                      <td className="py-2 px-2 font-mono text-xs" style={{ color: "#5C5470" }}>
                        {session.sessionId.substring(0, 8)}...
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
