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

export default function AdminDashboard() {
  const [adminKey, setAdminKey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [spendStats, setSpendStats] = useState<SpendStats | null>(null);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    if (!adminKey) return;

    setLoading(true);
    setError(null);

    try {
      const headers = { "x-admin-key": adminKey };

      const [spendRes, sessionRes] = await Promise.all([
        fetch("/api/admin/spend", { headers }),
        fetch("/api/admin/sessions", { headers }),
      ]);

      if (spendRes.status === 401 || sessionRes.status === 401) {
        setError("Invalid admin key");
        setIsAuthenticated(false);
        return;
      }

      if (!spendRes.ok || !sessionRes.ok) {
        throw new Error("Failed to fetch stats");
      }

      const [spend, sessions] = await Promise.all([
        spendRes.json(),
        sessionRes.json(),
      ]);

      setSpendStats(spend);
      setSessionStats(sessions);
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

  // Dashboard
  return (
    <div className="min-h-screen p-4 md:p-8" style={{ backgroundColor: "#FAF9F6" }}>
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
      </div>
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
