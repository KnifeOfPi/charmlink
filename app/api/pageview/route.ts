import { NextRequest, NextResponse } from "next/server";
import { parseDeviceType, generateId } from "../../../lib/analytics";
import { recordEvent, getCreatorBySlug } from "../../../lib/db";

export const runtime = "nodejs";

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
    const country =
      request.headers.get("x-vercel-ip-country") ||
      request.headers.get("cf-ipcountry") ||
      "unknown";

    // Look up creator_id for FK reference
    let creatorId: string | null = null;
    try {
      const creator = await getCreatorBySlug(body.creator);
      creatorId = creator?.id ?? null;
    } catch {
      // Non-fatal
    }

    await recordEvent({
      type: "pageview",
      creator_id: creatorId,
      creator_slug: body.creator,
      session_id: body.sessionId || generateId(),
      user_agent: ua,
      referer: request.headers.get("referer") || "",
      country,
      device: parseDeviceType(ua),
      is_bot: body.isBot || false,
      is_instagram: body.isInstagram || false,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
