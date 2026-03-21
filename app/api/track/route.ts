import { NextRequest, NextResponse } from "next/server";
import { appendEvent, parseDeviceType, generateId } from "../../../lib/analytics";
import { ClickEvent } from "../../../lib/types";

interface TrackPayload {
  creator: string;
  linkLabel: string;
  linkUrl: string;
  linkType: "social" | "premium";
  sessionId: string;
  isInstagram: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body: TrackPayload = await request.json();
    const ua = request.headers.get("user-agent") || "";
    const country = request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || "unknown";

    const event: ClickEvent = {
      type: "click",
      id: generateId(),
      creator: body.creator,
      linkLabel: body.linkLabel,
      linkUrl: body.linkUrl,
      linkType: body.linkType || "social",
      timestamp: new Date().toISOString(),
      userAgent: ua,
      referer: request.headers.get("referer") || "",
      country,
      device: parseDeviceType(ua),
      isInstagram: body.isInstagram || false,
      sessionId: body.sessionId || generateId(),
    };

    appendEvent(event);
    console.log("[ghostlink:click]", event.creator, event.linkLabel, event.linkType);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
