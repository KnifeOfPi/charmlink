import { NextRequest, NextResponse } from "next/server";
import { parseDeviceType, generateId } from "../../../lib/analytics";
import { recordEvent, getCreatorBySlug } from "../../../lib/db";
import { resolveIsBot } from "../../../lib/event-bot-flag";

export const runtime = "nodejs";

interface AutoRedirectPayload {
  creator: string;
  sessionId: string;
  /** Which link the visitor is being sent to. */
  linkId: string;
  linkLabel: string;
  isInstagram: boolean;
}

/**
 * One visitor arriving at an auto-redirect site.
 *
 * Written as its own event type so it cannot leak into CTR — see the comment on
 * RecordEventInput.type. There is no click to pair it with: the visitor never
 * saw a page, so the redirect IS the interaction.
 */
export async function POST(request: NextRequest) {
  try {
    const body: AutoRedirectPayload = await request.json();
    const ua = request.headers.get("user-agent") || "";
    const country =
      request.headers.get("x-vercel-ip-country") ||
      request.headers.get("cf-ipcountry") ||
      "unknown";

    let creatorId: string | null = null;
    try {
      const creator = await getCreatorBySlug(body.creator);
      creatorId = creator?.id ?? null;
    } catch {
      // Non-fatal — the event is still worth recording against the slug.
    }

    await recordEvent({
      type: "autoredirect",
      creator_id: creatorId,
      creator_slug: body.creator,
      link_label: body.linkLabel,
      link_url: body.linkId,
      link_type: "premium",
      session_id: body.sessionId || generateId(),
      user_agent: ua,
      referer: request.headers.get("referer") || "",
      country,
      device: parseDeviceType(ua),
      // Resolved server-side from middleware's header, never the client — the
      // same rule as /api/pageview and /api/track (see lib/event-bot-flag.ts).
      is_bot: resolveIsBot(request),
      is_instagram: body.isInstagram || false,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
