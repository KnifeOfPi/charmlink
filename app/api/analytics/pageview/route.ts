import { NextRequest, NextResponse } from "next/server";
import { appendEvent, detectDevice, generateId } from "../../../../lib/analytics";
import { isBot, isInstagramBrowser } from "../../../../lib/bot-detect";

interface PageViewPayload {
  creator: string;
  userAgent: string;
  referer: string;
  sessionId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: PageViewPayload = await request.json();
    const ua = body.userAgent || request.headers.get("user-agent") || "";
    const country = request.headers.get("x-vercel-ip-country") || "unknown";
    const device = detectDevice(ua);
    const bot = isBot(ua);
    const instagram = isInstagramBrowser(ua);

    appendEvent({
      type: "pageview",
      id: generateId(),
      creator: body.creator,
      timestamp: new Date().toISOString(),
      userAgent: ua,
      referer: body.referer || "",
      country,
      device,
      isBot: bot,
      isInstagram: instagram,
      sessionId: body.sessionId || "unknown",
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
