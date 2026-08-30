"use client";

import { useState } from "react";
import { AnalyticsSummary } from "../../../lib/types";
import type { ModelAnalytics } from "../../../lib/analytics-rollup";

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
  summaries: ModelAnalytics[];
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

// Matches MIN_IMPRESSIONS_FOR_CONFIDENCE in lib/avatar-rotation.ts. Below this
// a photo's rate is still noise, and the card says so rather than presenting a
// number that invites a premature decision.
const MIN_AVATAR_IMPRESSIONS = 200;

function AvatarPerformance({
  data,
  scopeNote,
}: {
  data: AnalyticsSummary["avatarPerformance"];
  scopeNote?: string;
}) {
  // Rank only photos with enough evidence — a 100% rate off 3 views is not a
  // winner, and showing it as one is how A/B tests get misread.
  const settled = data.filter((a) => a.impressions >= MIN_AVATAR_IMPRESSIONS);
  const bestRate = Math.max(...settled.map((a) => a.conversionRate), 0);
  const sorted = [...data].sort((a, b) => {
    const aReady = a.impressions >= MIN_AVATAR_IMPRESSIONS;
    const bReady = b.impressions >= MIN_AVATAR_IMPRESSIONS;
    if (aReady !== bReady) return aReady ? -1 : 1;
    return b.conversionRate - a.conversionRate;
  });

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-gray-400 text-xs uppercase tracking-wide">
          Photo performance
          {scopeNote && <span className="text-gray-600 normal-case"> · {scopeNote}</span>}
        </h3>
        <span className="text-gray-600 text-[11px]">
          premium clicks / views · {MIN_AVATAR_IMPRESSIONS} views to call it
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {sorted.map((a) => {
          const provisional = a.impressions < MIN_AVATAR_IMPRESSIONS;
          const isBest = !provisional && bestRate > 0 && a.conversionRate === bestRate;
          return (
            <div
              key={a.avatarId}
              className={`rounded-xl border p-3 ${
                isBest ? "border-pink-500/60 bg-pink-500/5" : "border-gray-800 bg-gray-950/40"
              } ${a.isActive ? "" : "opacity-50"}`}
            >
              <div className="flex items-center gap-2 mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                <div className="min-w-0">
                  <p
                    className={`text-lg font-bold leading-none ${
                      provisional ? "text-gray-500" : "text-white"
                    }`}
                  >
                    {a.conversionRate}%
                  </p>
                  <p className="text-gray-500 text-[11px] mt-0.5 tabular-nums">
                    {a.premiumClicks} / {a.impressions}
                  </p>
                </div>
              </div>
              {/* Bar is scaled to the best settled rate, so the comparison is
                  visual; the number above carries the exact value. */}
              <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: bestRate > 0 ? `${Math.min(100, (a.conversionRate / bestRate) * 100)}%` : "0%",
                    backgroundColor: provisional ? TOTAL_COLOR : PREMIUM_COLOR,
                  }}
                />
              </div>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {provisional && (
                  <span className="text-[10px] text-gray-500">
                    {MIN_AVATAR_IMPRESSIONS - a.impressions} more views
                  </span>
                )}
                {isBest && <span className="text-[10px] text-pink-400 font-medium">best</span>}
                {a.isPinned && <span className="text-[10px] text-gray-400">📌 pinned</span>}
                {!a.isActive && <span className="text-[10px] text-gray-600">paused</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type SiteSummary = ModelAnalytics["sites"][number];

/** A domain reads best by its hostname; slug-only sites fall back to the path. */
function domainLabel(site: SiteSummary): string {
  return site.customDomain ?? `/${site.creator}`;
}

/** Side-by-side domain comparison, and the way into a single one. Collapsed by
 *  default: the point of rolling up is that the person is the unit you read,
 *  with domains available when a number needs explaining. */
function SiteBreakdown({
  sites,
  scope,
  onScope,
}: {
  sites: ModelAnalytics["sites"];
  scope: string | null;
  onScope: (slug: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (sites.length <= 1) return null;

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-gray-400 hover:text-gray-200 text-xs uppercase tracking-wide flex items-center gap-1.5"
      >
        <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        Compare {sites.length} domains
      </button>
      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="py-1.5 pr-3 font-normal">Domain</th>
                <th className="py-1.5 pr-3 font-normal text-right">Views</th>
                <th className="py-1.5 pr-3 font-normal text-right">Premium</th>
                <th className="py-1.5 font-normal text-right">CTR</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => {
                const active = s.creator === scope;
                return (
                  <tr
                    key={s.creator}
                    onClick={() => onScope(active ? null : s.creator)}
                    className={`border-b border-gray-900 cursor-pointer transition-colors ${
                      active ? "bg-pink-600/10 text-white" : "text-gray-300 hover:bg-gray-800/50"
                    }`}
                  >
                    <td className="py-1.5 pr-3">
                      {domainLabel(s)}
                      <span className="text-gray-600 ml-1.5">/{s.creator}</span>
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-right">
                      {s.totalViews.toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-right">
                      {s.premiumClicks.toLocaleString()}
                    </td>
                    <td className="py-1.5 tabular-nums text-right">{s.ctr}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-gray-600 text-[11px] mt-2">
            Click a row to scope every panel above to that domain.
          </p>
        </div>
      )}
    </div>
  );
}

/** Domain scope selector. `null` is the rolled-up model. */
function DomainTabs({
  sites,
  scope,
  onScope,
}: {
  sites: ModelAnalytics["sites"];
  scope: string | null;
  onScope: (slug: string | null) => void;
}) {
  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
      active ? "bg-pink-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
    }`;

  return (
    <div className="flex flex-wrap gap-1.5 mb-5">
      <button type="button" onClick={() => onScope(null)} className={chip(scope === null)}>
        All domains
      </button>
      {sites.map((s) => (
        <button
          key={s.creator}
          type="button"
          onClick={() => onScope(s.creator)}
          className={chip(scope === s.creator)}
          title={`/${s.creator} · ${s.totalViews.toLocaleString()} views`}
        >
          {domainLabel(s)}
          <span className={scope === s.creator ? "text-pink-200 ml-1.5" : "text-gray-600 ml-1.5"}>
            {formatCompact(s.totalViews)}
          </span>
        </button>
      ))}
    </div>
  );
}

function CreatorCard({
  summary,
  period,
}: {
  summary: ModelAnalytics;
  period: "today" | "7d" | "30d" | "all";
}) {
  // `null` = the rolled-up model; a slug scopes every panel to that one domain.
  const [scope, setScope] = useState<string | null>(null);
  const multiSite = summary.sites.length > 1;
  const site = scope ? summary.sites.find((s) => s.creator === scope) ?? null : null;
  // Every field read below exists on AnalyticsSummary, which a site row also is
  // — so scoping is a swap of the source object, not a parallel set of panels.
  const active: AnalyticsSummary = site ?? summary;

  const deviceData = [
    { label: "Mobile", count: active.deviceBreakdown.mobile },
    { label: "Desktop", count: active.deviceBreakdown.desktop },
    { label: "Tablet", count: active.deviceBreakdown.tablet },
  ];
  const maxDevice = Math.max(...deviceData.map((d) => d.count), 1);

  const topReferrers = active.topReferrers.slice(0, 5).map((r) => ({
    label: r.referer === "" ? "direct" : r.referer.replace(/^https?:\/\//, "").split("/")[0],
    count: r.count,
  }));
  const maxRef = Math.max(...topReferrers.map((r) => r.count), 1);

  const topLinks = active.linkBreakdown.slice(0, 5);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white capitalize">{summary.modelName}</h2>
          {site ? (
            <p className="text-gray-500 text-xs mt-0.5">
              <span className="text-pink-400">{domainLabel(site)}</span> · 1 of{" "}
              {summary.sites.length} domains
            </p>
          ) : (
            multiSite && (
              <p className="text-gray-500 text-xs mt-0.5">
                combined across {summary.sites.length} domains
              </p>
            )
          )}
        </div>
        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-full">{period}</span>
      </div>

      {multiSite && <DomainTabs sites={summary.sites} scope={scope} onScope={setScope} />}

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
        <StatCard label="Page Views" value={active.totalViews} sub={`${active.humanViews} human`} />
        <StatCard label="Premium Clicks" value={active.premiumClicks} />
        <StatCard
          label="CTR"
          value={`${active.ctr}%`}
          sub="premium / human views"
        />
        <StatCard label="IG Traffic" value={active.instagramTraffic} sub="from Instagram" />
      </div>

      {/* Clicks over time */}
      <div className="mb-6">
        <ClickTimeseriesChart data={active.clickTimeseries} period={period} />
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

      {/* Photo carousel performance */}
      {active.avatarPerformance.length > 0 && (
        <AvatarPerformance
          data={active.avatarPerformance}
          scopeNote={site ? `on ${domainLabel(site)}` : undefined}
        />
      )}

      <SiteBreakdown sites={summary.sites} scope={scope} onScope={setScope} />

      {/* Country breakdown */}
      {active.countryBreakdown.length > 0 && (
        <div className="mt-6">
          <h3 className="text-gray-400 text-xs uppercase tracking-wide mb-3">Countries</h3>
          <div className="flex flex-wrap gap-2">
            {active.countryBreakdown.slice(0, 8).map(({ country, count }) => (
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

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = summaries.filter((m) =>
    m.modelName.toLowerCase().includes(search.trim().toLowerCase())
  );

  // Fall back to the top row rather than showing an empty pane: `summaries` is
  // sorted by traffic, and the selected id can go stale when the period changes
  // or the search excludes the current pick.
  const selected =
    filtered.find((m) => (m.modelId ?? m.creator) === selectedId) ?? filtered[0] ?? null;

  const overallCtr =
    totals.humanViews > 0
      ? Math.round((totals.premiumClicks / totals.humanViews) * 10000) / 100
      : 0;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white px-4 py-8">
      <div className="max-w-7xl mx-auto">
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

        {/* Roster + detail. Thirty stacked cards meant scrolling to find anyone;
            the list is now the index and only one card renders at a time. */}
        <div className="grid gap-6 lg:grid-cols-[260px_1fr] items-start">
          <aside className="lg:sticky lg:top-8">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search creators…"
              aria-label="Search creators"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-pink-600 transition-colors"
            />
            <div className="mt-2 lg:max-h-[calc(100vh-13rem)] lg:overflow-y-auto rounded-xl border border-gray-800 divide-y divide-gray-900">
              {filtered.length === 0 ? (
                <p className="text-gray-600 text-sm px-3 py-4">No creator matches “{search}”.</p>
              ) : (
                filtered.map((m) => {
                  const id = m.modelId ?? m.creator;
                  const active = id === selectedId;
                  return (
                    <button
                      key={id}
                      onClick={() => setSelectedId(id)}
                      className={`w-full text-left px-3 py-2.5 transition-colors ${
                        active ? "bg-pink-600/15 border-l-2 border-l-pink-500" : "hover:bg-gray-900 border-l-2 border-l-transparent"
                      }`}
                    >
                      <p className={`text-sm truncate ${active ? "text-white font-semibold" : "text-gray-300"}`}>
                        {m.modelName}
                      </p>
                      <p className="text-gray-500 text-xs mt-0.5 tabular-nums">
                        {m.totalViews.toLocaleString()} views · {m.premiumClicks.toLocaleString()} prem
                        {m.sites.length > 1 && ` · ${m.sites.length} sites`}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
            <p className="text-gray-600 text-[11px] mt-2 px-1">
              {filtered.length} of {summaries.length} creators
            </p>
          </aside>

          <div>
            {selected ? (
              // Keyed by model so switching creators remounts the card and drops
              // any domain scope — a slug from the previous creator would other-
              // wise linger in state and silently fall back to her rolled-up view.
              <CreatorCard
                key={selected.modelId ?? selected.creator}
                summary={selected}
                period={period}
              />
            ) : (
              <p className="text-gray-600 text-sm">Select a creator to see their stats.</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
