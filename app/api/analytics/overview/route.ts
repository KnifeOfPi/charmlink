import { NextRequest, NextResponse } from "next/server";
import { readEvents, buildSummary } from "../../../../lib/analytics";
import creatorsData from "../../../../creators.json";
import { CreatorsConfig } from "../../../../lib/types";

const creators: CreatorsConfig = creatorsData as CreatorsConfig;

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return true;
  const authHeader = request.headers.get("authorization");
  const queryKey = new URL(request.url).searchParams.get("key");
  return authHeader === `Bearer ${adminKey}` || queryKey === adminKey;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = (new URL(request.url).searchParams.get("period") || "7d") as "today" | "7d" | "30d" | "all";
  const events = readEvents();
  const summaries = Object.keys(creators).map((slug) => buildSummary(events, slug, period));

  const totals = {
    totalViews: summaries.reduce((s, c) => s + c.totalViews, 0),
    humanViews: summaries.reduce((s, c) => s + c.humanViews, 0),
    totalClicks: summaries.reduce((s, c) => s + c.totalClicks, 0),
    premiumClicks: summaries.reduce((s, c) => s + c.premiumClicks, 0),
    uniqueSessions: summaries.reduce((s, c) => s + c.uniqueSessions, 0),
  };

  return NextResponse.json({ period, creators: summaries, totals });
}
