import { NextRequest, NextResponse } from "next/server";
import { getCreatorByDomain } from "../../../lib/db";
import { verifyInternal } from "../../../lib/internal-token";

export const runtime = "nodejs";

// Internal-only route: middleware calls this to resolve domain → slug.
// Must not be publicly accessible — a scraper could map any domain to its
// slug and learn cloak_enabled, undercutting the decoy moat.
//
// Auth: HMAC (lib/internal-token) of the domain using
// CHARMLINK_LINK_TOKEN_SECRET, sent by the middleware as `x-internal-token`.
export async function GET(request: NextRequest) {
  const domain = new URL(request.url).searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ slug: null });
  }

  const token = request.headers.get("x-internal-token");
  if (!(await verifyInternal(`resolve-domain|${domain}`, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const creator = await getCreatorByDomain(domain);
    return NextResponse.json({ slug: creator?.slug ?? null });
  } catch {
    return NextResponse.json({ slug: null });
  }
}
