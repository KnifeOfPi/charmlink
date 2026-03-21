"use client";

import { useEffect, useState, useCallback } from "react";

type Period = "today" | "7d" | "30d" | "all";

interface DeviceSplit {
  mobile: number;
  tablet: number;
  desktop: number;
}

interface CreatorStats {
  creator: string;
  views: number;
  clicks: number;
  ctr: number;
  uniqueVisitors: number;
  referrers: Record<string, number>;
  devices: DeviceSplit;
  countries: Record<string, number>;
  instagramViews: number;
  instagramClicks: number;
  dailyBreakdown: Record<string, { views: number; clicks: number }>;
  linkBreakdown: Record<string, { clicks: number; url: string }>;
  topLink: string | null;
}

interface OverviewStats {
  totalViews: number;
  totalClicks: number;
  overallCtr: number;
  uniqueVisitors: number;
  creators: CreatorStats[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function topN(obj: Record<string, number>, n: number): [string, number][] {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

function BarChart({ data, colorClass }: { data: [string, number][]; colorClass: string }) {
  const max = Math.max(...data.map(([, v]) => v), 1);
  return (
    <div className="space-y-1">
      {data.map(([label, value]) => (
        <div key={label} className="flex items-center gap-2 text-xs">
          <span className="w-28 truncate text-gray-400 text-right">{label}</span>
          <div className="flex-1 bg-gray-800 rounded overflow-hidden h-4">
            <div
              className={`h-4 ${colorClass} rounded transition-all`}
              style={{ width: `${pct(value, max)}%` }}
            />
          </div>
          <span className="w-8 text-gray-300 text-right">{value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Daily Chart ───────────────────────────────────────────────────────────────

function DailyChart({ daily }: { daily: Record<string, { views: number; clicks: number }> }) {
  const sorted = Object.entries(daily).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const maxViews = Math.max(...sorted.map(([, v]) => v.views), 1);
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1 min-w-max h-24 mt-2">
        {sorted.map(([day, val]) => (
          <div key={day} className="flex flex-col items-center gap-0.5">
            <div className="flex items-end gap-px h-20">
              <div
                className="w-3 bg-blue-500 rounded-t"
                style={{ height: `${pct(val.views, maxViews)}%` }}
                title={`${day}: ${val.views} views`}
              />
              <div
                className="w-3 bg-pink-500 rounded-t"
                style={{ height: `${pct(val.clicks, maxViews)}%` }}
                title={`${day}: ${val.clicks} clicks`}
              />
            </div>
            <span className="text-gray-600 text-xs" style={{ fontSize: "9px" }}>
              {day.slice(5)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-1 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500 rounded-sm inline-block" />Views</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-pink-500 rounded-sm inline-block" />Clicks</span>
      </div>
    </div>
  );
}

// ── Creator Row ───────────────────────────────────────────────────────────────

function CreatorRow({ stats }: { stats: CreatorStats }) {
  const [expanded, setExpanded] = useState(false);
  const deviceTotal = stats.devices.mobile + stats.devices.tablet + stats.devices.desktop;
  const igPct = pct(stats.instagramViews, stats.views);

  return (
    <>
      <tr
        className="border-t border-gray-800 cursor-pointer hover:bg-gray-800/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-3 px-4 text-white font-medium">
          <span className="mr-2 text-gray-500">{expanded ? "▾" : "▸"}</span>
          {stats.creator}
        </td>
        <td className="py-3 px-4 text-gray-300 text-right">{stats.views.toLocaleString()}</td>
        <td className="py-3 px-4 text-gray-300 text-right">{stats.clicks.toLocaleString()}</td>
        <td className="py-3 px-4 text-right">
          <span className={`font-bold ${stats.ctr >= 20 ? "text-green-400" : stats.ctr >= 10 ? "text-yellow-400" : "text-gray-400"}`}>
            {stats.ctr}%
          </span>
        </td>
        <td className="py-3 px-4 text-gray-400 text-right text-sm">{stats.topLink || "—"}</td>
      </tr>
      {expanded && (
        <tr className="border-t border-gray-800 bg-gray-900/60">
          <td colSpan={5} className="px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

              {/* Link breakdown */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Clicks by Link</h4>
                {Object.keys(stats.linkBreakdown).length > 0 ? (
                  <BarChart
                    data={Object.entries(stats.linkBreakdown).map(([k, v]) => [k, v.clicks]).sort((a, b) => (b[1] as number) - (a[1] as number)) as [string, number][]}
                    colorClass="bg-pink-500"
                  />
                ) : <p className="text-gray-600 text-xs">No clicks yet</p>}
              </div>

              {/* Referrers */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Top Referrers</h4>
                <BarChart data={topN(stats.referrers, 5)} colorClass="bg-purple-500" />
              </div>

              {/* Devices */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Devices</h4>
                <div className="space-y-2">
                  {(["mobile", "tablet", "desktop"] as const).map((d) => (
                    <div key={d} className="flex items-center gap-2 text-xs">
                      <span className="w-16 text-gray-400 capitalize">{d}</span>
                      <div className="flex-1 bg-gray-800 rounded h-3">
                        <div
                          className="h-3 bg-indigo-500 rounded"
                          style={{ width: `${pct(stats.devices[d], deviceTotal)}%` }}
                        />
                      </div>
                      <span className="text-gray-300 w-8 text-right">{stats.devices[d]}</span>
                    </div>
                  ))}
                </div>

                <h4 className="text-xs font-semibold text-gray-500 uppercase mt-4 mb-2">Instagram Traffic</h4>
                <div className="flex items-center gap-2 text-xs">
                  <div className="flex-1 bg-gray-800 rounded h-3">
                    <div className="h-3 bg-orange-500 rounded" style={{ width: `${igPct}%` }} />
                  </div>
                  <span className="text-orange-400 font-bold">{igPct}%</span>
                </div>
                <p className="text-gray-600 text-xs mt-1">{stats.instagramViews} IG views · {stats.instagramClicks} IG clicks</p>
              </div>

              {/* Countries */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Top Countries</h4>
                <BarChart data={topN(stats.countries, 5)} colorClass="bg-teal-500" />
              </div>

              {/* Daily chart */}
              <div className="md:col-span-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Daily (last 14 days)</h4>
                <DailyChart daily={stats.dailyBreakdown} />
              </div>

            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Overview Cards ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-gray-600 text-xs mt-1">{sub}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [period, setPeriod] = useState<Period>("7d");
  const [data, setData] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Check for ?key= in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const k = params.get("key");
    if (k) {
      setKey(k);
      setAuthed(true);
    }
  }, []);

  const fetchData = useCallback(async (adminKey: string, p: Period) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/analytics/overview?period=${p}`, {
        headers: { Authorization: `Bearer ${adminKey}` },
      });
      if (res.status === 401) {
        setError("Invalid admin key");
        setAuthed(false);
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      setError("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed && key) {
      fetchData(key, period);
    }
  }, [authed, key, period, fetchData]);

  // ── Auth screen ──────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">GhostLink Analytics</h1>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-1">Admin Key</label>
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && key && setAuthed(true)}
                placeholder="Enter GHOSTLINK_ADMIN_KEY"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-pink-500"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={() => key && setAuthed(true)}
              className="w-full bg-pink-600 hover:bg-pink-500 text-white font-bold py-2 rounded-lg transition-colors text-sm"
            >
              Access Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">GhostLink Analytics</h1>
            <p className="text-gray-500 text-sm mt-0.5">Track views, clicks, and conversions</p>
          </div>
          <div className="flex gap-2">
            {(["today", "7d", "30d", "all"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-pink-600 text-white"
                    : "bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800"
                }`}
              >
                {p === "today" ? "Today" : p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "All Time"}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-gray-500 animate-pulse">Loading analytics…</div>
          </div>
        )}

        {error && <div className="bg-red-900/30 border border-red-800 text-red-400 rounded-lg p-4 mb-6">{error}</div>}

        {data && !loading && (
          <>
            {/* Overview cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard label="Total Views" value={data.totalViews.toLocaleString()} />
              <StatCard label="Total Clicks" value={data.totalClicks.toLocaleString()} />
              <StatCard label="Overall CTR" value={`${data.overallCtr}%`} />
              <StatCard
                label="Unique Visitors"
                value={data.uniqueVisitors.toLocaleString()}
                sub="by session ID"
              />
            </div>

            {/* Per-creator table */}
            <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  Creators — click row to expand
                </h2>
              </div>
              {data.creators.length === 0 ? (
                <div className="px-4 py-12 text-center text-gray-600">No data for this period</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs uppercase">
                        <th className="py-2 px-4 text-left">Creator</th>
                        <th className="py-2 px-4 text-right">Views</th>
                        <th className="py-2 px-4 text-right">Clicks</th>
                        <th className="py-2 px-4 text-right">CTR</th>
                        <th className="py-2 px-4 text-right">Top Link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.creators
                        .sort((a, b) => b.views - a.views)
                        .map((c) => (
                          <CreatorRow key={c.creator} stats={c} />
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
