"use client";

import { useEffect, useState } from "react";
import { useAdminAuth } from "../useAdminAuth";
import { AdminNav } from "../AdminNav";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import { AnalyticsSummary } from "../../../lib/types";

interface TotalsData {
  totalViews: number;
  humanViews: number;
  botViews: number;
  totalClicks: number;
  premiumClicks: number;
  uniqueSessions: number;
}

export default function AnalyticsPage() {
  const { ready, authHeaders } = useAdminAuth();
  const [summaries, setSummaries] = useState<AnalyticsSummary[]>([]);
  const [totals, setTotals] = useState<TotalsData>({
    totalViews: 0, humanViews: 0, botViews: 0,
    totalClicks: 0, premiumClicks: 0, uniqueSessions: 0,
  });
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "all">("7d");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, period]);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/overview?period=${period}`, {
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSummaries(data.creators ?? []);
        setTotals(data.totals ?? {
          totalViews: 0, humanViews: 0, botViews: 0,
          totalClicks: 0, premiumClicks: 0, uniqueSessions: 0,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a]">
        <AdminNav />
        <div className="text-gray-500 text-center py-16">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AdminNav />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
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
        <AnalyticsDashboard summaries={summaries} totals={totals} period={period} adminKey="" />
      </main>
    </div>
  );
}
