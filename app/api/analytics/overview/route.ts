import { NextRequest, NextResponse } from "next/server";
import { readEvents, filterByPeriod, buildOverviewStats, Period } from "../../../../lib/analytics";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.GHOSTLINK_ADMIN_KEY;
  if (!adminKey) return true;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${adminKey}`;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") || "all") as Period;

  const allEvents = readEvents();
  const filtered = filterByPeriod(allEvents, period);
  const stats = buildOverviewStats(filtered);

  return NextResponse.json(stats);
}
