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
  /**
   * document.referrer, captured in the browser. Must come from the client:
   * the Referer header on this request is the page that issued the fetch —
   * always our own domain — which made every Top Referrers row self-
   * referential. Untrusted display-only text; truncated on the way in.
   */
  referrer?: string;
  /** See RecordEventInput.was_visible. Absent from stale client bundles. */
  visible?: boolean;
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
      // Client value only, with no fallback to the header: the header is the
      // known-bad self-referential value, so falling back to it would quietly
      // reintroduce the very bug this replaces. An empty string means the
      // referrer was genuinely absent (Instagram strips it) and renders as
      // "direct" — an honest unknown beats a confident wrong answer.
      referer: (body.referrer ?? "").slice(0, 512),
      country,
      device: parseDeviceType(ua),
      is_bot: resolveIsBot(request),
      is_instagram: body.isInstagram || false,
      // Only forwarded when the client actually reported it; a stale bundle
      // sends nothing and must record NULL rather than a made-up false.
      was_visible: typeof body.visible === "boolean" ? body.visible : undefined,
      avatar_id: body.avatarId ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
