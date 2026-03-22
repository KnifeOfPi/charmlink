import { NextRequest, NextResponse } from "next/server";
import { getAllCreators, getAnalytics, getAnalyticsOverview } from "../../../../lib/db";

export const runtime = "nodejs";

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

  const period = (new URL(request.url).searchParams.get("period") || "7d") as
    | "today"
    | "7d"
    | "30d"
    | "all";

  try {
    const [creators, totals] = await Promise.all([
      getAllCreators(),
      getAnalyticsOverview(period),
    ]);

    const summaries = await Promise.all(
      creators.map((c) => getAnalytics(c.slug, period))
    );

    return NextResponse.json({ period, creators: summaries, totals });
  } catch (err) {
    console.error("[analytics:overview] DB error", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
