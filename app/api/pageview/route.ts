import { NextRequest, NextResponse } from "next/server";
import { parseDeviceType, generateId } from "../../../lib/analytics";
import { recordEvent, getCreatorBySlug } from "../../../lib/db";
import { resolveIsBot } from "../../../lib/event-bot-flag";

export const runtime = "nodejs";

interface PageViewPayload {
  creator: string;
  sessionId: string;
  isInstagram: boolean;
  // NOTE: the client also sends `isBot`, but it is deliberately ignored — it
  // is hard-coded `false` there and a bot would never self-report anyway.
  // The flag is resolved server-side; see lib/event-bot-flag.ts.
  //
  // avatarId is echoed back from the server-rendered page. It is validated as a
  // UUID and FK-checked on insert, so a forged value can at worst attribute a
  // view to another real avatar of the same creator — not corrupt the table.
  avatarId?: string | null;
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
      is_bot: resolveIsBot(request),
      is_instagram: body.isInstagram || false,
      avatar_id: body.avatarId ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
