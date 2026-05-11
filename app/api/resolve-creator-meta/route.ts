import { NextRequest, NextResponse } from "next/server";
import { getCreatorBySlug, getCreatorByDomain } from "../../../lib/db";

export const runtime = "nodejs";

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
