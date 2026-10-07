import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCreatorBySlug, getCreatorLinks } from "../../../../lib/db";
import { detectBot } from "../../../../lib/bot-detect";
import { verifyLinkToken } from "../../../../lib/link-token";
import { rateLimit } from "../../../../lib/rate-limit";
import { verifyTurnstile } from "../../../../lib/turnstile";
import { checkFingerprintRotation } from "../../../../lib/fingerprint-rotation";
import { assessClientSignals } from "../../../../lib/client-signals";
import { clientIp } from "../../../../lib/client-ip";

export const runtime = "nodejs";

const NOINDEX = { "X-Robots-Tag": "noindex" };

// Rejection response for any request that fails the gates below.
//
// This used to return a single visible link labelled "Loading…" pointing at
// `/api/honeypot?ref=d1`, on the theory that only a scraper would follow it.
// Production data says otherwise: between 2026-05-10 and 2026-08-26 that link
// was tapped 25,522 times — 12.6% of ALL recorded premium clicks — and the
// honeypot behind it banned 8,712 distinct IPs for 24h each. Of the 33,517
// honeypot hits, 86.6% carried mobile browser UAs and 0.12% carried bot UAs.
// It was catching humans, not scrapers, and because a banned IP is then served
// the decoy page by middleware, each false positive locked a real visitor (and
// everyone sharing their carrier NAT address) out for a day.
//
// A rejected caller now gets an empty list: a scraper still learns nothing,
// and a falsely-rejected human gets a page with no premium links rather than
// a trap that bans them. Never put a followable honeypot URL in this payload.
// The genuine trap is the off-screen aria-hidden link in CreatorPage, which a
// real user cannot see or tab to.
function decoyResponse() {
  return NextResponse.json({ links: [] }, { status: 200, headers: NOINDEX });
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
  // Trusted only when the request really came through Cloudflare (lib/client-ip).
  const ip = clientIp(request.headers);
  const { allowed } = await rateLimit(ip, "links", 30, 60);
  if (!allowed) return decoyResponse();

  // 1. Read age confirmation state (Phase 4: no longer a hard gate).
  //    We still bind the link-token HMAC to ageConfirmed so an attacker can't
  //    reuse a non-age token to fetch the age-confirmed payload (or vice versa).
  const cookieStore = await cookies();
  const ageConfirmed = cookieStore.get("cl_age")?.value === "1";

  // 2. Sec-Fetch-Site check.
  //   - "same-origin"  → normal browser XHR from same page (allow)
  //   - "none"         → top-level navigation, address bar, or app-launched
  //                       fresh tab (allow — happens on iOS Safari opened via
  //                       instagram://extbrowser/ handoff)
  //   - missing         → Safari/older browsers, also allow
  //   - "cross-site" / "same-site" → reject (real cross-origin scrape)
  // We require Origin === Host below at step 3 anyway, which is the stronger
  // anti-CSRF check; sec-fetch-site adds defense in depth without nuking
  // legit iOS handoff flows.
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (
    secFetchSite !== null &&
    secFetchSite !== "same-origin" &&
    secFetchSite !== "none"
  ) {
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
  let body: {
    token?: string;
    fingerprint?: string;
    fp_signals?: Record<string, unknown>;
    fp_suspicious?: boolean;
    fp_reasons?: string[];
    behavior?: {
      mouseMoves: number;
      mouseDistance: number;
      mouseEntropy: number;
      touchStarts: number;
      scrolls: number;
      maxScrollDepth: number;
      timeToFirstInteraction: number;
      keyPresses: number;
      clickTimestamps: number[];
      isSuspicious: boolean;
      reasons: string[];
    };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return decoyResponse();
  }
  const token = body?.token ?? "";
  // `ip` is passed only to keep accepting tokens minted by the previous
  // IP-bound scheme during the deploy window; it is not required to verify.
  if (!verifyLinkToken(token, slug, ageConfirmed, ip)) {
    return decoyResponse();
  }

  // 4b. Client-reported fingerprint/behaviour signals — see
  // lib/client-signals.ts for why only strong automation tells are enforced
  // and everything else is shadow-logged.
  const client = assessClientSignals(body);
  if (client.decoy) {
    console.warn(`[links] decoy: automation fingerprint ${client.strong.join(",")}`);
    return decoyResponse();
  }

  // 4c. Fingerprint rotation — shadow only. Carrier NAT puts many real
  // visitors behind one IP, so a per-IP hash count is not proof of a bot.
  if (typeof body.fingerprint === "string" && body.fingerprint) {
    const rotation = await checkFingerprintRotation(ip, body.fingerprint);
    if (rotation.isSuspicious) client.shadow.push(`rotation:${rotation.distinctCount}`);
  }
  if (client.shadow.length > 0) {
    console.info(`[links] shadow ${slug}: ${client.shadow.join(",")} (not enforced)`);
  }

  // 5. Bot detection + Turnstile escalation for uncertain cases.
  // Only decoy on HIGH confidence; LOW confidence (e.g. missing Sec-Fetch on
  // page routes) misfires on iOS in-app WebViews and other legit clients
  // and is handled below via Turnstile escalation instead of an outright
  // decoy response.
  // IPQS is not used as a gate (2026-10-07 decision): its residential/VPN
  // verdicts overlap real visitors, the free tier ran out in a day, and the
  // only near-certain signal it adds (Tor) is blocked at the Cloudflare edge.
  // lib/ipqs.ts and detectBot's opts.ipqs stay for an offline analytics use.
  const { isBot, confidence } = await detectBot(request);
  if (isBot && confidence === "high") {
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
