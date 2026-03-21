import { Metadata } from "next";
import { headers } from "next/headers";
import { readEvents, buildSummary } from "../../../lib/analytics";
import creatorsData from "../../../creators.json";
import { CreatorsConfig, AnalyticsSummary } from "../../../lib/types";
import { AnalyticsDashboard } from "./AnalyticsDashboard";

const creators: CreatorsConfig = creatorsData as CreatorsConfig;

export const metadata: Metadata = {
  title: "GhostLink Analytics",
  robots: "noindex",
};

// Force dynamic so we always get fresh data
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ key?: string; period?: string }>;
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const { key, period: periodParam } = await searchParams;
  const adminKey = process.env.GHOSTLINK_ADMIN_KEY;

  // Auth check
  if (adminKey && key !== adminKey) {
    const headersList = await headers();
    const auth = headersList.get("authorization");
    if (auth !== `Bearer ${adminKey}`) {
      return (
        <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
          <div className="text-white text-center">
            <h1 className="text-2xl font-bold mb-4">🔒 Analytics</h1>
            <p className="text-gray-400 mb-4">Add ?key=YOUR_KEY to the URL</p>
            <form action="/admin/analytics" method="get">
              <input
                name="key"
                type="password"
                placeholder="Admin key"
                className="bg-gray-800 text-white border border-gray-600 rounded-lg px-4 py-2 mr-2 outline-none focus:border-pink-500"
                autoFocus
              />
              <button
                type="submit"
                className="bg-pink-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-pink-700"
              >
                Enter
              </button>
            </form>
          </div>
        </main>
      );
    }
  }

  const period = (periodParam || "7d") as "today" | "7d" | "30d" | "all";
  const events = readEvents();
  const creatorSlugs = Object.keys(creators);
  const summaries: AnalyticsSummary[] = creatorSlugs.map((slug) =>
    buildSummary(events, slug, period)
  );

  const totals = {
    totalViews: summaries.reduce((s, c) => s + c.totalViews, 0),
    humanViews: summaries.reduce((s, c) => s + c.humanViews, 0),
    botViews: summaries.reduce((s, c) => s + c.botViews, 0),
    totalClicks: summaries.reduce((s, c) => s + c.totalClicks, 0),
    premiumClicks: summaries.reduce((s, c) => s + c.premiumClicks, 0),
    uniqueSessions: summaries.reduce((s, c) => s + c.uniqueSessions, 0),
  };

  return (
    <AnalyticsDashboard
      summaries={summaries}
      totals={totals}
      period={period}
      adminKey={key || ""}
    />
  );
}
