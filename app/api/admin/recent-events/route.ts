import { NextRequest, NextResponse } from "next/server";
import { getRecentEvents } from "../../../../lib/db";

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
  try {
    const events = await getRecentEvents(30);
    return NextResponse.json(events);
  } catch (err) {
    console.error("[admin:recent-events]", err);
    return NextResponse.json([], { status: 500 });
  }
}
