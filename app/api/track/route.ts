import { NextRequest, NextResponse } from "next/server";

interface TrackPayload {
  creator: string;
  linkLabel: string;
  timestamp: string;
  userAgent: string;
  referer: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: TrackPayload = await request.json();
    console.log("[ghostlink:track]", JSON.stringify({
      ...body,
      ip: request.headers.get("x-forwarded-for") || "unknown",
    }));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
