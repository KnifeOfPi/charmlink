import { NextRequest, NextResponse } from "next/server";
import { addDomain, removeDomain } from "../../../../lib/vercel-domains";
import { provisionZone, removeProxiedDnsRecord, findZoneByDomain } from "../../../../lib/cloudflare";

export const runtime = "nodejs";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${adminKey}`;
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { domain } = (await request.json()) as { domain: string };
    if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

    const results: {
      vercel?: unknown;
      cloudflare?: {
        zoneFound: boolean;
        message?: string;
        steps?: unknown[];
        ok?: boolean;
      };
      errors: string[];
    } = { errors: [] };

    // Step 1: Add domain to Vercel
    try {
      results.vercel = await addDomain(domain);
    } catch (err) {
      results.errors.push(`Vercel: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Step 2: Provision Cloudflare zone (orange-cloud CNAME + WAF + transform rules)
    if (process.env.CLOUDFLARE_API_TOKEN) {
      try {
        const cfResult = await provisionZone(domain);
        if (!cfResult.zoneFound) {
          console.warn(
            `[admin/domains] CF zone not found for ${domain} — manual setup required`
          );
          results.cloudflare = {
            zoneFound: false,
            message:
              "Zone not in CF account — add the zone in Cloudflare first, then re-run this or use npm run cf-backfill",
          };
        } else {
          results.cloudflare = {
            zoneFound: true,
            ok: cfResult.ok,
            steps: cfResult.steps,
          };
          if (!cfResult.ok) {
            const failedSteps = cfResult.steps
              .filter((s) => !s.ok)
              .map((s) => `${s.name}: ${s.detail ?? "failed"}`);
            results.errors.push(`Cloudflare: ${failedSteps.join("; ")}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`Cloudflare: ${msg}`);
        results.cloudflare = { zoneFound: false, message: msg };
      }
    }

    const status = results.errors.length > 0 ? 207 : 201;
    return NextResponse.json(results, { status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { domain } = (await request.json()) as { domain: string };
    if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

    const errors: string[] = [];

    // Step 1: Remove from Vercel
    try {
      await removeDomain(domain);
    } catch (err) {
      errors.push(`Vercel: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Step 2: Remove proxied DNS record from Cloudflare (leave WAF/settings intact)
    if (process.env.CLOUDFLARE_API_TOKEN) {
      try {
        const zone = await findZoneByDomain(domain);
        if (zone) {
          const removed = await removeProxiedDnsRecord(zone.id, domain);
          if (removed.removed === 0) {
            console.warn(`[admin/domains] No CNAME found to remove for ${domain}`);
          }
        } else {
          console.warn(`[admin/domains] CF zone not found for ${domain} during DELETE`);
        }
      } catch (err) {
        errors.push(`Cloudflare: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({ ok: true, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
