import { NextRequest, NextResponse } from "next/server";
import { getLinkById, getCreatorById, recordEvent } from "../../../../lib/db";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  const { linkId } = await params;

  try {
    const link = await getLinkById(linkId);

    if (!link || !link.is_active) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Determine destination — redirect_url if set, else original url
    const destination = link.redirect_url || link.url;

    // Record click event asynchronously (don't block redirect)
    const creator = await getCreatorById(link.creator_id);
    if (creator) {
      const userAgent = request.headers.get("user-agent") ?? "";
      const referer = request.headers.get("referer") ?? "";
      const country = request.headers.get("x-vercel-ip-country") ?? "unknown";
      const sessionId = request.cookies.get("charmlink_sid")?.value ?? "redirect";

      recordEvent({
        type: "click",
        creator_id: creator.id,
        creator_slug: creator.slug,
        link_label: link.label,
        link_url: link.url,
        link_type: link.link_type,
        session_id: sessionId,
        user_agent: userAgent,
        referer,
        country,
      }).catch(() => {
        // Fire and forget
      });
    }

    // Validate URL - only allow http/https
    try {
      const parsed = new URL(destination);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return NextResponse.json({ error: "Invalid redirect" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid redirect" }, { status: 400 });
    }

    return NextResponse.redirect(destination, { status: 302 });
  } catch (err) {
    console.error("[redirect:get]", err);
    return NextResponse.redirect(new URL("/", request.url));
  }
}
