"use client";

import { useState } from "react";
import { AnalyticsSummary } from "../../../lib/types";

const PREMIUM_COLOR = "#e91e8a";
const TOTAL_COLOR = "#6b7280"; // gray-500 — context bar, not an identity color

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
  onPeriodChange: (period: "today" | "7d" | "30d" | "all") => void;
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

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${n}`;
}

function bucketLabel(bucket: string, period: "today" | "7d" | "30d" | "all"): string {
  const d = new Date(bucket);
  if (period === "today") return d.toLocaleTimeString("en-US", { hour: "numeric" });
  if (period === "7d") return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function bucketLabelFull(bucket: string, period: "today" | "7d" | "30d" | "all"): string {
  const d = new Date(bucket);
  return period === "today"
    ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ClickTimeseriesChart({
  data,
  period,
}: {
  data: AnalyticsSummary["clickTimeseries"];
  period: "today" | "7d" | "30d" | "all";
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const hasData = data.length > 0 && data.some((d) => d.total > 0);
  const max = Math.max(...data.map((d) => d.total), 1);
  const labelStep = Math.max(1, Math.ceil(data.length / 8));
  const chartHeight = 100;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-gray-400 text-xs uppercase tracking-wide">Clicks over time</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: TOTAL_COLOR }} />
              Total
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PREMIUM_COLOR }} />
              Premium
            </span>
          </div>
          {hasData && (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2"
            >
              {showTable ? "View chart" : "View table"}
            </button>
          )}
        </div>
      </div>

      {!hasData ? (
        <p className="text-gray-600 text-sm">No data</p>
      ) : showTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="py-1.5 pr-3 font-normal">Period</th>
                <th className="py-1.5 pr-3 font-normal">Total clicks</th>
                <th className="py-1.5 font-normal">Premium clicks</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i} className="border-b border-gray-900 text-gray-300">
                  <td className="py-1.5 pr-3">{bucketLabelFull(d.bucket, period)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{d.total}</td>
                  <td className="py-1.5 tabular-nums">{d.premium}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          {hovered !== null && (
            <div
              className="absolute z-10 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs shadow-lg pointer-events-none whitespace-nowrap"
              style={{
                bottom: chartHeight + 28,
                left: `${Math.min(92, Math.max(8, ((hovered + 0.5) / data.length) * 100))}%`,
                transform: "translateX(-50%)",
              }}
            >
              <p className="text-white font-semibold mb-1">{bucketLabelFull(data[hovered].bucket, period)}</p>
              <p className="text-gray-300">
                <span style={{ color: PREMIUM_COLOR }} className="font-bold">
                  {data[hovered].premium}
                </span>{" "}
                premium
              </p>
              <p className="text-gray-400">
                <span className="text-gray-300 font-bold">{data[hovered].total}</span> total
              </p>
            </div>
          )}

          {/* Gridlines */}
          <div className="absolute inset-x-0 top-0 flex flex-col justify-between text-[10px] text-gray-600 pointer-events-none" style={{ height: chartHeight }}>
            <div className="border-t border-gray-800/70 relative">
              <span className="absolute -top-2.5 right-0 bg-gray-900 pl-1">{formatCompact(max)}</span>
            </div>
            <div className="border-t border-gray-800/50" />
            <div className="border-t border-gray-800/70 relative">
              <span className="absolute -top-2.5 right-0 bg-gray-900 pl-1">0</span>
            </div>
          </div>

          <div className="flex items-end gap-[3px]" style={{ height: chartHeight }}>
            {data.map((d, i) => (
              <div
                key={i}
                tabIndex={0}
                role="img"
                aria-label={`${bucketLabelFull(d.bucket, period)}: ${d.total} total clicks, ${d.premium} premium`}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(i)}
                onBlur={() => setHovered(null)}
                className="relative flex-1 h-full flex items-end justify-center outline-none focus-visible:ring-2 focus-visible:ring-pink-500 rounded"
              >
                <div
                  className="absolute bottom-0 w-full max-w-[18px] rounded-t-[4px] transition-all"
                  style={{
                    height: `${(d.total / max) * 100}%`,
                    backgroundColor: hovered === i ? "#8b95a6" : TOTAL_COLOR,
                    opacity: hovered === i ? 1 : 0.7,
                  }}
                />
                <div
                  className="absolute bottom-0 w-[45%] max-w-[8px] rounded-t-[4px] transition-all"
                  style={{ height: `${(d.premium / max) * 100}%`, backgroundColor: PREMIUM_COLOR }}
                />
              </div>
            ))}
          </div>

          <div className="flex gap-[3px] mt-1.5">
            {data.map((d, i) => (
              <div key={i} className="flex-1 text-center">
                {i % labelStep === 0 && (
                  <span className="text-[10px] text-gray-600">{bucketLabel(d.bucket, period)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CreatorCard({
  summary,
  period,
}: {
  summary: AnalyticsSummary;
  period: "today" | "7d" | "30d" | "all";
}) {
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

      {/* Clicks over time */}
      <div className="mb-6">
        <ClickTimeseriesChart data={summary.clickTimeseries} period={period} />
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

export function AnalyticsDashboard({ summaries, totals, period, onPeriodChange }: DashboardProps) {
  const periods: Array<{ value: "today" | "7d" | "30d" | "all"; label: string }> = [
    { value: "today", label: "Today" },
    { value: "7d", label: "7 Days" },
    { value: "30d", label: "30 Days" },
    { value: "all", label: "All Time" },
  ];

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
            <h1 className="text-3xl font-bold">👑 CharmLink Analytics</h1>
            <p className="text-gray-500 text-sm mt-1">Creator performance dashboard</p>
          </div>
          {/* Period selector */}
          <div className="flex gap-2">
            {periods.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onPeriodChange(value)}
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
          CharmLink v1 · Data stored in data/analytics.json · Migrate to Postgres when needed
        </p>
      </div>
    </main>
  );
}
