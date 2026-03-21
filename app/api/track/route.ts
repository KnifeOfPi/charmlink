import { NextRequest, NextResponse } from "next/server";
import { appendEvent, detectDevice, generateId } from "../../../lib/analytics";
import { isInstagramBrowser } from "../../../lib/bot-detect";

interface TrackPayload {
  creator: string;
  linkLabel: string;
  linkUrl?: string;
  timestamp: string;
  userAgent: string;
  referer: string;
  sessionId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: TrackPayload = await request.json();
    const ua = body.userAgent || request.headers.get("user-agent") || "";
    const country = request.headers.get("x-vercel-ip-country") || "unknown";
    const device = detectDevice(ua);
    const instagram = isInstagramBrowser(ua);
    const sessionId = body.sessionId || "unknown";

    appendEvent({
      type: "click",
      id: generateId(),
      creator: body.creator,
      linkLabel: body.linkLabel,
      linkUrl: body.linkUrl || "",
      linkType: "premium",
      timestamp: body.timestamp || new Date().toISOString(),
      userAgent: ua,
      referer: body.referer || "",
      country,
      device,
      isInstagram: instagram,
      sessionId,
    });

    console.log("[ghostlink:track]", JSON.stringify({
      creator: body.creator,
      linkLabel: body.linkLabel,
      device,
      country,
      instagram,
      ip: request.headers.get("x-forwarded-for") || "unknown",
    }));

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
