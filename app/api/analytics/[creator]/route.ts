import { NextRequest, NextResponse } from "next/server";
import { readEvents, filterByPeriod, buildCreatorStats, Period } from "../../../../lib/analytics";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.GHOSTLINK_ADMIN_KEY;
  if (!adminKey) return true; // no key configured → open
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${adminKey}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ creator: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { creator } = await params;
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") || "all") as Period;

  const allEvents = readEvents();
  const filtered = filterByPeriod(allEvents, period);
  const stats = buildCreatorStats(filtered, creator);

  return NextResponse.json(stats);
}
