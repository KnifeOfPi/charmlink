import { NextRequest, NextResponse } from "next/server";
import { getAnalytics } from "../../../../lib/db";

export const runtime = "nodejs";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${adminKey}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ creator: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { creator } = await params;
  const period = (new URL(request.url).searchParams.get("period") || "7d") as
    | "today"
    | "7d"
    | "30d"
    | "all";

  try {
    const summary = await getAnalytics(creator, period);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[analytics:creator] DB error", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}
