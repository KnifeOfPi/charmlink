import { NextRequest, NextResponse } from "next/server";
import { parseDeviceType, generateId } from "../../../lib/analytics";
import { recordEvent, getCreatorBySlug } from "../../../lib/db";

export const runtime = "nodejs";

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
      is_bot: false,
      is_instagram: body.isInstagram || false,
    });

    console.log("[charmlink:click]", body.creator, body.linkLabel, body.linkType);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
