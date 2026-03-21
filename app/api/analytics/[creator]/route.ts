import { NextRequest, NextResponse } from "next/server";
import { readEvents, buildSummary } from "../../../../lib/analytics";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.GHOSTLINK_ADMIN_KEY;
  if (!adminKey) return true; // No key configured = open (dev mode)
  const authHeader = request.headers.get("authorization");
  const queryKey = new URL(request.url).searchParams.get("key");
  return authHeader === `Bearer ${adminKey}` || queryKey === adminKey;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ creator: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { creator } = await params;
  const period = (new URL(request.url).searchParams.get("period") || "7d") as "today" | "7d" | "30d" | "all";
  const events = readEvents();
  const summary = buildSummary(events, creator, period);
  return NextResponse.json(summary);
}
