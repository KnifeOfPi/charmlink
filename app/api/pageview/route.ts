import { NextRequest, NextResponse } from "next/server";
import { appendEvent, parseDeviceType, generateId } from "../../../lib/analytics";
import { PageViewEvent } from "../../../lib/types";

interface PageViewPayload {
  creator: string;
  sessionId: string;
  isInstagram: boolean;
  isBot: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: PageViewPayload = await request.json();
    const ua = request.headers.get("user-agent") || "";
    const country = request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || "unknown";

    const event: PageViewEvent = {
      type: "pageview",
      id: generateId(),
      creator: body.creator,
      timestamp: new Date().toISOString(),
      userAgent: ua,
      referer: request.headers.get("referer") || "",
      country,
      device: parseDeviceType(ua),
      isBot: body.isBot || false,
      isInstagram: body.isInstagram || false,
      sessionId: body.sessionId || generateId(),
    };

    appendEvent(event);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
