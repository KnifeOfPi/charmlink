import { NextRequest, NextResponse } from "next/server";
import { getCreatorBySlug, getCreatorByDomain, getDecoyLinksBySlug } from "../../../lib/db";
import { verifyInternal } from "../../../lib/internal-token";

export const runtime = "nodejs";

/** Internal-only metadata lookup for middleware-side bot-decoy decisions.
 *
 *  Accepts `?slug=...` or `?domain=...` (slug wins if both are present).
 *  Returns the full creator profile needed to build a branded decoy page
 *  (name, tagline, avatar, theme colors) plus social links with
 *  show_in_decoy=true. Premium links are never included.
 *
 *  Auth: HMAC (lib/internal-token) of the lookup key using
 *  CHARMLINK_LINK_TOKEN_SECRET, sent by lib/decoy/cloak.ts as x-internal-token. */
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const slug = sp.get("slug");
  const domain = sp.get("domain");

  const kind = slug ? "slug" : "domain";
  const value = slug ?? domain ?? "";

  const token = request.headers.get("x-internal-token");
  if (!(await verifyInternal(`resolve-creator-meta|${kind}|${value}`, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    let creator = null;
    if (slug) {
      creator = await getCreatorBySlug(slug);
    } else if (domain) {
      creator = await getCreatorByDomain(domain);
    }

    if (!creator) {
      return NextResponse.json({ exists: false, slug: null, cloak_enabled: false });
    }

    const rec = creator as unknown as Record<string, unknown>;
    const raw = rec.cloak_enabled;
    const cloakEnabled = raw === undefined || raw === null ? true : Boolean(raw);

    // Fetch decoy links for this creator (social + show_in_decoy=true only)
    const decoyLinks = await getDecoyLinksBySlug(creator.slug);

    return NextResponse.json({
      exists: true,
      slug: creator.slug,
      cloak_enabled: cloakEnabled,
      // Full profile for decoy page rendering
      name: creator.name,
      tagline: creator.tagline,
      avatar_url: creator.avatar_url,
      theme_bg: creator.theme_bg,
      theme_accent: creator.theme_accent,
      theme_text: creator.theme_text,
      bg_type: creator.bg_type,
      bg_color_2: creator.bg_color_2,
      bg_color_3: creator.bg_color_3,
      // Decoy links (social, show_in_decoy=true only — never premium)
      decoy_links: decoyLinks,
    });
  } catch {
    return NextResponse.json({ exists: false, slug: null, cloak_enabled: false });
  }
}