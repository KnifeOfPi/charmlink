import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCreatorBySlug, getCreatorLinks } from "../../../../lib/db";
import { detectBot } from "../../../../lib/bot-detect";
import { verifyLinkToken } from "../../../../lib/link-token";
import { rateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

// Identical-shape decoy response — same status, same structure, decoy URL
function decoyResponse() {
  return NextResponse.json(
    {
      links: [
        {
          id: "d1",
          label: "Loading…",
          url: "/api/honeypot?ref=d1",
          icon: "circle",
          subtitle: null,
          badge: null,
          sensitive: false,
          image_url: null,
          deeplink_enabled: false,
          recovery_url: null,
          redirect_url: null,
          show_text_glow: false,
          text_glow_color: null,
          text_glow_intensity: null,
          hover_animation: null,
          border_color: null,
          show_border: false,
          title_color: null,
          title_font_size: null,
        },
      ],
    },
    { status: 200 }
  );
}

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ creator: string }> }
) {
  const { creator: slug } = await params;

  // 0. Rate limit: 30 requests/min per IP
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await rateLimit(ip, "links", 30, 60);
  if (!allowed) return decoyResponse();

  // 1. Require age cookie
  const cookieStore = await cookies();
  const ageConfirmed = cookieStore.get("cl_age")?.value === "1";
  if (!ageConfirmed) {
    return decoyResponse();
  }

  // 2. Require same-origin Sec-Fetch-Site
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite !== "same-origin") {
    return decoyResponse();
  }

  // 3. Origin must match host
  const originHeader = request.headers.get("origin");
  const hostHeader = request.headers.get("host");
  if (!originHeader || !hostHeader) {
    return decoyResponse();
  }
  try {
    const originHostname = new URL(originHeader).hostname;
    const hostHostname = hostHeader.split(":")[0];
    if (originHostname !== hostHostname) {
      return decoyResponse();
    }
  } catch {
    return decoyResponse();
  }

  // 4. HMAC token validation
  let body: { token?: string };
  try {
    body = (await request.json()) as { token?: string };
  } catch {
    return decoyResponse();
  }
  const token = body?.token ?? "";
  if (!verifyLinkToken(token, slug, ip, ageConfirmed)) {
    return decoyResponse();
  }

  // 5. Bot detection (belt-and-suspenders)
  const { isBot: botDetected } = detectBot(request);
  if (botDetected) {
    return decoyResponse();
  }

  // ── Serve real premium links ───────────────────────────────────────────────
  try {
    const creator = await getCreatorBySlug(slug);
    if (!creator) {
      return decoyResponse();
    }

    const links = await getCreatorLinks(creator.id);
    const premiumLinks = links
      .filter((l) => l.link_type === "premium")
      .map((l) => ({
        id: l.id,
        label: l.label,
        url: l.url,
        icon: l.icon,
        subtitle: l.subtitle,
        badge: l.badge,
        sensitive: l.sensitive,
        image_url: l.image_url,
        deeplink_enabled: l.deeplink_enabled,
        recovery_url: l.recovery_url,
        redirect_url: l.redirect_url,
        // v3
        show_text_glow: l.show_text_glow,
        text_glow_color: l.text_glow_color,
        text_glow_intensity: l.text_glow_intensity,
        hover_animation: l.hover_animation,
        border_color: l.border_color,
        show_border: l.show_border,
        title_color: l.title_color,
        title_font_size: l.title_font_size,
      }));

    return NextResponse.json({ links: premiumLinks });
  } catch (err) {
    console.error("[links:post] DB error", err);
    return decoyResponse();
  }
}
