import { NextRequest, NextResponse } from "next/server";
import { getCreatorByDomain } from "../../../lib/db";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

// Internal-only route: middleware calls this to resolve domain → slug.
// Must not be publicly accessible — a scraper could map any domain to its
// slug and learn cloak_enabled, undercutting the decoy moat.
//
// Auth: HMAC of the domain name using CHARMLINK_LINK_TOKEN_SECRET, passed
// as `x-internal-token` header. The middleware computes the same HMAC and
// sends it; we verify with timingSafeEqual.
function verifyInternalToken(domain: string, token: string | null): boolean {
  if (!token) return false;
  const secret = process.env.CHARMLINK_LINK_TOKEN_SECRET;
  if (!secret) {
    // In dev without the secret, allow through (same pattern as link-token.ts).
    return process.env.NODE_ENV !== "production";
  }
  const expected = createHmac("sha256", secret).update(`resolve-domain|${domain}`).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const domain = new URL(request.url).searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ slug: null });
  }

  const token = request.headers.get("x-internal-token");
  if (!verifyInternalToken(domain, token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const creator = await getCreatorByDomain(domain);
    return NextResponse.json({ slug: creator?.slug ?? null });
  } catch {
    return NextResponse.json({ slug: null });
  }
}
