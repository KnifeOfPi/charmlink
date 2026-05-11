import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCreatorBySlug, getCreatorLinks } from "../../../../lib/db";
import { detectBot } from "../../../../lib/bot-detect";
import { verifyLinkToken } from "../../../../lib/link-token";
import { rateLimit } from "../../../../lib/rate-limit";
import { verifyTurnstile } from "../../../../lib/turnstile";

export const runtime = "nodejs";

const NOINDEX = { "X-Robots-Tag": "noindex" };

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
    { status: 200, headers: NOINDEX }
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

  // 1. Read age confirmation state (Phase 4: no longer a hard gate).
  //    We still bind the link-token HMAC to ageConfirmed so an attacker can't
  //    reuse a non-age token to fetch the age-confirmed payload (or vice versa).
  const cookieStore = await cookies();
  const ageConfirmed = cookieStore.get("cl_age")?.value === "1";

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

  // 5. Bot detection + Turnstile escalation for uncertain cases
  const { isBot, confidence } = await detectBot(request);
  if (isBot) {
    return decoyResponse();
  }

  // Turnstile escalation for suspicious-but-unconfirmed visitors.
  // confidence reflects certainty of the isBot determination:
  //   "high" on non-bot  = definitively clean → suspicion 0.1 (no Turnstile)
  //   "low"  on non-bot  = uncertain verdict   → suspicion 0.7 (Turnstile)
  // Currently bot-detect only returns {isBot:false, confidence:"high"}, so this
  // path is inactive until bot-detect emits lower-confidence non-bot signals.
  // If TURNSTILE_SECRET_KEY is not set, skip entirely (safe to deploy before key is provisioned).
  const suspicionScore = confidence === "low" ? 0.7 : 0.1;
  if (suspicionScore > 0.6) {
    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey) {
      // Log once; treat as legit to avoid blocking users before key is provisioned.
      console.warn("[links] TURNSTILE_SECRET_KEY not set — skipping Turnstile gate (confidence=low path)");
    } else {
      const turnstileToken = request.headers.get("x-turnstile-token");
      if (!turnstileToken) {
        // Prompt frontend to show the widget.
        return NextResponse.json(
          {
            links: [],
            turnstile_required: true,
            site_key: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null,
          },
          { status: 200, headers: { ...NOINDEX } }
        );
      }
      // Verify the submitted token.
      const tsResult = await verifyTurnstile(turnstileToken, ip);
      if (!tsResult.success) {
        return decoyResponse();
      }
      // Token verified — fall through to real payload.
    }
  }
  // TODO: frontend CreatorPage.tsx should handle turnstile_required response by
  // rendering the CF Turnstile widget (NEXT_PUBLIC_TURNSTILE_SITE_KEY) and re-POSTing
  // with x-turnstile-token header. Wire-up is a follow-up PR.

  // ── Serve real premium links ───────────────────────────────────────────────
  try {
    const creator = await getCreatorBySlug(slug);
    if (!creator) {
      return decoyResponse();
    }

    const links = await getCreatorLinks(creator.id);
    // Resolve per-link sensitivity, honoring the creator's `sensitive_default`.
    const creatorSensitiveDefault = Boolean(creator.sensitive_default);

    const premiumLinks = links
      .filter((l) => l.link_type === "premium")
      .map((l) => {
        const isSensitive = Boolean(l.sensitive) || creatorSensitiveDefault;
        // Sensitive links: never expose the real destination URL until the
        // visitor has confirmed age. Even with age confirmed we route through
        // the `/r/[linkId]` interstitial so the redirect is uniform and
        // server-side (the click never lands the URL in client HTML).
        //
        // Special-case: "countdown:..." entries are not URLs, they're a UI
        // hint for the CountdownTimer component. Leave them untouched.
        const isCountdown = typeof l.url === "string" && l.url.startsWith("countdown:");
        let outboundUrl = l.url;
        if (isSensitive && !isCountdown) {
          outboundUrl = `/r/${l.id}`;
        }
        return {
          id: l.id,
          label: l.label,
          url: outboundUrl,
          icon: l.icon,
          subtitle: l.subtitle,
          badge: l.badge,
          sensitive: isSensitive,
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
        };
      });

    return NextResponse.json({ links: premiumLinks }, { headers: NOINDEX });
  } catch (err) {
    console.error("[links:post] DB error", err);
    return decoyResponse();
  }
}
