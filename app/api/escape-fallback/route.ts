import { NextRequest, NextResponse } from "next/server";
import { parseDeviceType, generateId } from "../../../lib/analytics";
import { recordEvent, getCreatorBySlug } from "../../../lib/db";

export const runtime = "nodejs";

interface EscapeFallbackPayload {
  creator: string;
  sessionId: string;
  platform: "ios" | "android" | "other";
  surface: string;
  userAgent: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: EscapeFallbackPayload = await request.json();
    const ua = body.userAgent || request.headers.get("user-agent") || "";
    const country =
      request.headers.get("x-vercel-ip-country") ||
      request.headers.get("cf-ipcountry") ||
      "unknown";
    const platform = body.platform || "other";
    const surface = body.surface || "instagram";

    // PRIMARY sink — must always run, zero schema dependency, greppable in logs.
    console.log("[charmlink:escape-fail]", body.creator, platform, surface, country);

    // Best-effort DB write — non-fatal. A rejected write must not 500 the route
    // or lose the console line above (schema/CHECK-constraint uncertainty).
    try {
      let creatorId: string | null = null;
      try {
        const creator = await getCreatorBySlug(body.creator);
        creatorId = creator?.id ?? null;
      } catch {
        // Non-fatal
      }

      await recordEvent({
        type: "escape_fallback",
        creator_id: creatorId,
        creator_slug: body.creator,
        link_label: platform,
        link_type: surface,
        session_id: body.sessionId || generateId(),
        user_agent: ua,
        country,
        device: parseDeviceType(ua),
        is_instagram: true,
      });
    } catch {
      // Best-effort — never fatal
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
