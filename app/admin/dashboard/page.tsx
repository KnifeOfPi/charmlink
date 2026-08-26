"use client";

import { useEffect, useState } from "react";
import { useAdminAuth } from "../useAdminAuth";
import { AdminNav } from "../AdminNav";

interface Totals {
  totalViews: number;
  humanViews: number;
  botViews: number;
  totalClicks: number;
  premiumClicks: number;
  uniqueSessions: number;
}

interface RecentEvent {
  id: string;
  type: string;
  creator_slug: string;
  link_label: string | null;
  link_type: string | null;
  device: string;
  country: string;
  created_at: string;
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-5">
      <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-3xl font-bold ${accent ? "text-[#e91e8a]" : "text-white"}`}>{value}</p>
      {sub && <p className="text-gray-600 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { ready, authHeaders } = useAdminAuth();
  const [totals, setTotals] = useState<Totals | null>(null);
  const [recent, setRecent] = useState<RecentEvent[]>([]);
  const [creatorCount, setCreatorCount] = useState(0);
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "all">("7d");
  const [loading, setLoading] = useState(true);

  // Honeypot ban list maintenance. A ban lasts 24h and causes middleware to
  // serve that IP the decoy page instead of the creator page, so a stale
  // backlog keeps real visitors locked out even after the honeypot itself is
  // fixed. This surfaces the count and lets it be cleared without a terminal.
  const [banCount, setBanCount] = useState<number | null>(null);
  const [banBusy, setBanBusy] = useState(false);
  const [banMsg, setBanMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, period]);

  async function loadData() {
    setLoading(true);
    try {
      const headers = authHeaders();
      const [overviewRes, creatorsRes, recentRes] = await Promise.all([
        fetch(`/api/analytics/overview?period=${period}`, { headers }),
        fetch("/api/admin/creators", { headers }),
        fetch("/api/admin/recent-events", { headers }),
      ]);

      if (overviewRes.ok) {
        const data = await overviewRes.json();
        setTotals(data.totals);
      }
      if (creatorsRes.ok) {
        const creators = await creatorsRes.json();
        setCreatorCount(Array.isArray(creators) ? creators.length : 0);
      }
      if (recentRes.ok) {
        const data = await recentRes.json();
        setRecent(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
    void loadBanCount();
  }

  async function loadBanCount() {
    try {
      const res = await fetch("/api/admin/bans", { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setBanCount(typeof data.banned === "number" ? data.banned : null);
      } else {
        setBanCount(null);
      }
    } catch {
      setBanCount(null);
    }
  }

  async function flushBans() {
    setBanBusy(true);
    setBanMsg(null);
    try {
      const res = await fetch("/api/admin/bans", {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      setBanMsg(
        res.ok
          ? data.message ?? `Cleared ${data.flushed ?? 0}.`
          : data.error ?? "Failed to clear bans."
      );
      await loadBanCount();
    } catch (err) {
      setBanMsg(err instanceof Error ? err.message : "Failed to clear bans.");
    } finally {
      setBanBusy(false);
    }
  }

  const ctr = totals && totals.humanViews > 0
    ? ((totals.premiumClicks / totals.humanViews) * 100).toFixed(1)
    : "0.0";

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AdminNav />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">Overview of all creators</p>
          </div>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as typeof period)}
            className="bg-[#1a1a1a] border border-[#333] text-white text-sm rounded-lg px-3 py-2
                       outline-none focus:border-[#e91e8a]"
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </div>

        {loading ? (
          <div className="text-gray-500 text-center py-16">Loading...</div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard label="Total Creators" value={creatorCount} />
              <StatCard label="Page Views" value={totals?.humanViews ?? 0} sub={`${totals?.botViews ?? 0} bots filtered`} />
              <StatCard label="Premium Clicks" value={totals?.premiumClicks ?? 0} accent />
              <StatCard label="Overall CTR" value={`${ctr}%`} sub="premium / views" accent />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6">
                <h2 className="text-white font-semibold mb-4">More Stats</h2>
                <div className="grid grid-cols-2 gap-4">
                  <StatCard label="Total Views (incl bots)" value={totals?.totalViews ?? 0} />
                  <StatCard label="Total Clicks" value={totals?.totalClicks ?? 0} />
                  <StatCard label="Unique Sessions" value={totals?.uniqueSessions ?? 0} />
                </div>
              </div>

              <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6">
                <h2 className="text-white font-semibold mb-4">Recent Activity</h2>
                {recent.length === 0 ? (
                  <p className="text-gray-600 text-sm">No recent events</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {recent.map((event) => (
                      <div key={event.id} className="flex items-center justify-between py-2 border-b border-[#222] last:border-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                            event.type === "pageview" ? "bg-blue-900 text-blue-300" : "bg-pink-900 text-pink-300"
                          }`}>
                            {event.type === "pageview" ? "view" : "click"}
                          </span>
                          <span className="text-gray-300 text-sm truncate">{event.creator_slug}</span>
                          {event.link_label && (
                            <span className="text-gray-500 text-xs truncate">→ {event.link_label}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <span className="text-gray-600 text-xs">{event.country}</span>
                          <span className="text-gray-700 text-xs">
                            {new Date(event.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Blocked visitors — honeypot IP ban list */}
            <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-6 mt-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-white font-semibold mb-1">Blocked Visitors</h2>
                  <p className="text-gray-500 text-sm">
                    IPs the honeypot has banned. A ban lasts 24 hours, and while it
                    is active that visitor sees the decoy page instead of the creator
                    page. Clearing is safe — genuine bots get re-banned on their next
                    hit.
                  </p>
                  <p className="mt-3 text-3xl font-bold text-white">
                    {banCount === null ? "—" : banCount.toLocaleString()}
                    <span className="text-gray-600 text-sm font-normal ml-2">
                      currently blocked
                    </span>
                  </p>
                  {banMsg && (
                    <p className="text-[#e91e8a] text-sm mt-3">{banMsg}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => void loadBanCount()}
                    disabled={banBusy}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-[#222] text-gray-300
                               border border-[#333] hover:bg-[#2a2a2a] disabled:opacity-50"
                  >
                    Refresh
                  </button>
                  <button
                    onClick={() => void flushBans()}
                    disabled={banBusy || banCount === 0}
                    className="px-4 py-2 rounded-lg text-sm font-bold bg-[#e91e8a] text-white
                               hover:opacity-90 disabled:opacity-40"
                  >
                    {banBusy ? "Clearing…" : "Clear all bans"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
