import { NextRequest, NextResponse } from "next/server";
import { parseDeviceType, generateId } from "../../../lib/analytics";
import { recordEvent, getCreatorBySlug } from "../../../lib/db";
import { resolveIsBot } from "../../../lib/event-bot-flag";
import { rateLimit } from "../../../lib/rate-limit";
import { clientIp } from "../../../lib/client-ip";

export const runtime = "nodejs";

interface TrackPayload {
  creator: string;
  linkLabel: string;
  linkUrl: string;
  linkType: "social" | "premium";
  sessionId: string;
  isInstagram: boolean;
  /** Carousel avatar on screen when this link was tapped. See /api/pageview. */
  avatarId?: string | null;
}

export async function POST(request: NextRequest) {
  // Rate limit: 60 requests/min per IP (beacons can fire multiple times per page)
  // Trusted only when the request really came through Cloudflare (lib/client-ip).
  const ip = clientIp(request.headers);
  const { allowed } = await rateLimit(ip, "track", 60, 60);
  if (!allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  try {
    const body: TrackPayload = await request.json();
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
      type: "click",
      creator_id: creatorId,
      creator_slug: body.creator,
      link_label: body.linkLabel,
      link_url: body.linkUrl,
      link_type: body.linkType || "social",
      session_id: body.sessionId || generateId(),
      user_agent: ua,
      referer: request.headers.get("referer") || "",
      country,
      device: parseDeviceType(ua),
      // Resolved server-side — never taken from the client. See lib/event-bot-flag.ts.
      is_bot: resolveIsBot(request),
      is_instagram: body.isInstagram || false,
      avatar_id: body.avatarId ?? null,
    });

    console.log("[charmlink:click]", body.creator, body.linkLabel, body.linkType);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
