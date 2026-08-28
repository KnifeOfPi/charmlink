import { NextRequest, NextResponse } from "next/server";
import { getAnalyticsBatch, getAnalyticsOverview } from "../../../../lib/db";

export const runtime = "nodejs";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${adminKey}`;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const period = (new URL(request.url).searchParams.get("period") || "7d") as
    | "today"
    | "7d"
    | "30d"
    | "all";

  try {
    // Sequential, not Promise.all: both sides open connections from a pool of
    // 3, and running them together is what pushed this endpoint past its
    // connect timeout in the first place.
    const totals = await getAnalyticsOverview(period);
    const summaries = await getAnalyticsBatch(period);

    return NextResponse.json({ period, creators: summaries, totals });
  } catch (err) {
    console.error("[analytics:overview] DB error", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
