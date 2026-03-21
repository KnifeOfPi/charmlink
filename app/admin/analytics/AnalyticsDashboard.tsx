"use client";

import { useRouter } from "next/navigation";
import { AnalyticsSummary } from "../../../lib/types";

interface TotalsData {
  totalViews: number;
  humanViews: number;
  botViews: number;
  totalClicks: number;
  premiumClicks: number;
  uniqueSessions: number;
}

interface DashboardProps {
  summaries: AnalyticsSummary[];
  totals: TotalsData;
  period: "today" | "7d" | "30d" | "all";
  adminKey: string;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function BarChart({ data, max }: { data: Array<{ label: string; count: number }>; max: number }) {
  if (data.length === 0) return <p className="text-gray-600 text-sm">No data</p>;
  return (
    <div className="space-y-2">
      {data.map(({ label, count }) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-gray-400 text-xs w-24 truncate flex-shrink-0" title={label}>
            {label}
          </span>
          <div className="flex-1 bg-gray-800 rounded-full h-2">
            <div
              className="bg-pink-500 h-2 rounded-full transition-all"
              style={{ width: max > 0 ? `${(count / max) * 100}%` : "0%" }}
            />
          </div>
          <span className="text-gray-300 text-xs w-8 text-right">{count}</span>
        </div>
      ))}
    </div>
  );
}

function CreatorCard({ summary, period }: { summary: AnalyticsSummary; period: string }) {
  const deviceData = [
    { label: "Mobile", count: summary.deviceBreakdown.mobile },
    { label: "Desktop", count: summary.deviceBreakdown.desktop },
    { label: "Tablet", count: summary.deviceBreakdown.tablet },
  ];
  const maxDevice = Math.max(...deviceData.map((d) => d.count), 1);

  const topReferrers = summary.topReferrers.slice(0, 5).map((r) => ({
    label: r.referer === "" ? "direct" : r.referer.replace(/^https?:\/\//, "").split("/")[0],
    count: r.count,
  }));
  const maxRef = Math.max(...topReferrers.map((r) => r.count), 1);

  const topLinks = summary.linkBreakdown.slice(0, 5);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white capitalize">{summary.creator}</h2>
        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-full">{period}</span>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
        <StatCard label="Page Views" value={summary.totalViews} sub={`${summary.humanViews} human`} />
        <StatCard label="Premium Clicks" value={summary.premiumClicks} />
        <StatCard
          label="CTR"
          value={`${summary.ctr}%`}
          sub="premium / human views"
        />
        <StatCard label="IG Traffic" value={summary.instagramTraffic} sub="from Instagram" />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {/* Device breakdown */}
        <div>
          <h3 className="text-gray-400 text-xs uppercase tracking-wide mb-3">Device</h3>
          <BarChart data={deviceData} max={maxDevice} />
        </div>

        {/* Top referrers */}
        <div>
          <h3 className="text-gray-400 text-xs uppercase tracking-wide mb-3">Top Referrers</h3>
          <BarChart data={topReferrers} max={maxRef} />
        </div>

        {/* Link clicks */}
        <div>
          <h3 className="text-gray-400 text-xs uppercase tracking-wide mb-3">Link Clicks</h3>
          {topLinks.length === 0 ? (
            <p className="text-gray-600 text-sm">No clicks yet</p>
          ) : (
            <div className="space-y-2">
              {topLinks.map((link) => (
                <div key={link.url} className="flex items-center justify-between">
                  <span
                    className="text-xs truncate max-w-[160px]"
                    style={{ color: link.type === "premium" ? "#e91e8a" : "#9ca3af" }}
                  >
                    {link.label}
                  </span>
                  <span className="text-gray-300 text-xs font-bold">{link.clicks}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Country breakdown */}
      {summary.countryBreakdown.length > 0 && (
        <div className="mt-6">
          <h3 className="text-gray-400 text-xs uppercase tracking-wide mb-3">Countries</h3>
          <div className="flex flex-wrap gap-2">
            {summary.countryBreakdown.slice(0, 8).map(({ country, count }) => (
              <span
                key={country}
                className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-full"
              >
                {country} <span className="text-pink-400">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AnalyticsDashboard({ summaries, totals, period, adminKey }: DashboardProps) {
  const router = useRouter();
  const periods: Array<{ value: string; label: string }> = [
    { value: "today", label: "Today" },
    { value: "7d", label: "7 Days" },
    { value: "30d", label: "30 Days" },
    { value: "all", label: "All Time" },
  ];

  const switchPeriod = (p: string) => {
    const params = new URLSearchParams();
    if (adminKey) params.set("key", adminKey);
    params.set("period", p);
    router.push(`/admin/analytics?${params.toString()}`);
  };

  const overallCtr =
    totals.humanViews > 0
      ? Math.round((totals.premiumClicks / totals.humanViews) * 10000) / 100
      : 0;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white px-4 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">👑 GhostLink Analytics</h1>
            <p className="text-gray-500 text-sm mt-1">Creator performance dashboard</p>
          </div>
          {/* Period selector */}
          <div className="flex gap-2">
            {periods.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => switchPeriod(value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  period === value
                    ? "bg-pink-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Overall Totals */}
        <div className="grid grid-cols-2 gap-3 mb-8 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Views" value={totals.totalViews} />
          <StatCard label="Human Views" value={totals.humanViews} />
          <StatCard label="Bot Views" value={totals.botViews} />
          <StatCard label="Premium Clicks" value={totals.premiumClicks} />
          <StatCard label="Overall CTR" value={`${overallCtr}%`} />
          <StatCard label="Sessions" value={totals.uniqueSessions} />
        </div>

        {/* Per-Creator Cards */}
        <div className="space-y-6">
          {summaries.map((summary) => (
            <CreatorCard key={summary.creator} summary={summary} period={period} />
          ))}
        </div>

        <p className="text-center text-gray-700 text-xs mt-8">
          GhostLink v1 · Data stored in data/analytics.json · Migrate to Postgres when needed
        </p>
      </div>
    </main>
  );
}
