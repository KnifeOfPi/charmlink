import { NextRequest, NextResponse } from "next/server";
import { getCreatorBySlug, getCreatorByDomain } from "../../../lib/db";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

// Internal-only route: middleware calls this to check cloak_enabled.
// Must not be publicly accessible — a scraper could map any slug to its
// cloak status and learn which creators have decoy protection.
//
// Auth: HMAC of the lookup key using CHARMLINK_LINK_TOKEN_SECRET, passed
// as `x-internal-token` header. The middleware (cloak.ts) computes the same
// HMAC and sends it; we verify with timingSafeEqual.
function verifyInternalToken(kind: string, value: string, token: string | null): boolean {
  if (!token) return false;
  const secret = process.env.CHARMLINK_LINK_TOKEN_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const expected = createHmac("sha256", secret).update(`resolve-creator-meta|${kind}|${value}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Internal-only metadata lookup for middleware-side bot-decoy decisions.
 *
 * Accepts `?slug=...` or `?domain=...` (slug wins if both are present).
 * Returns `{ slug, cloak_enabled, exists }` so the edge middleware can decide
 * whether to short-circuit with the decoy HTML response or fall through to
 * normal rendering.
 *
 * The response intentionally contains no creator identity (no name, tagline,
 * avatar, etc.) so it is safe to cache for short periods.
 */
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const slug = sp.get("slug");
  const domain = sp.get("domain");

  // Determine lookup key for token verification
  const kind = slug ? "slug" : "domain";
  const value = slug ?? domain ?? "";

  const token = request.headers.get("x-internal-token");
  if (!verifyInternalToken(kind, value, token)) {
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

    // Default cloak_enabled to true when the column is missing (back-compat
    // with envs where the migration hasn't been applied yet).
    const rec = creator as unknown as Record<string, unknown>;
    const raw = rec.cloak_enabled;
    const cloakEnabled = raw === undefined || raw === null ? true : Boolean(raw);

    return NextResponse.json({
      exists: true,
      slug: creator.slug,
      cloak_enabled: cloakEnabled,
    });
  } catch {
    // On DB error, default to NOT cloaking — failing closed on the decoy means
    // real users keep working, which is the safer choice.
    return NextResponse.json({ exists: false, slug: null, cloak_enabled: false });
  }
}
