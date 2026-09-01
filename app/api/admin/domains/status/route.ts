import { NextRequest, NextResponse } from "next/server";
import { getDomainStatus, listDomains } from "../../../../../lib/vercel-domains";
import { checkDnsStatus } from "../../../../../lib/cloudflare-dns";

export const runtime = "nodejs";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${adminKey}`;
}

/**
 * Server-side TLS/HTTP health probe. Runs in the Node runtime (no browser CORS
 * constraints), so unlike the old client-side fetch it only reports "broken" on a
 * real TLS/525/network failure — not on cross-origin policy errors.
 * Healthy = any sub-500 response (incl. 3xx/4xx). 525 / TLS / network => broken.
 */
async function probeHealth(domain: string): Promise<{ health: "healthy" | "broken"; healthStatus: number | null }> {
  try {
    const res = await fetch(`https://${domain}/`, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "Mozilla/5.0 charmlink-admin-healthprobe" },
    });
    return { health: res.status < 500 ? "healthy" : "broken", healthStatus: res.status };
  } catch {
    return { health: "broken", healthStatus: null };
  }
}

/**
 * Is Cloudflare actually in front of this domain?
 *
 * Deliberately separate from `health`: a gray-cloud domain serves a flawless 200
 * straight from Vercel, so every health probe we have calls it healthy while it
 * sits outside the WAF, Turnstile and origin hiding entirely. Reporting only
 * `health` is what let six domains run unproxied for two months under an all-green
 * dashboard. null = we couldn't tell (no CF token, or the zone lookup failed).
 */
function deriveProxied(
  cloudflare: { zoneFound?: boolean; records: Array<{ type: string; proxied: boolean }> } | null
): boolean | null {
  if (!cloudflare || cloudflare.records.length === 0) return null;
  const routable = cloudflare.records.filter((r) =>
    ["A", "AAAA", "CNAME"].includes(r.type)
  );
  if (routable.length === 0) return null;
  return routable.some((r) => r.proxied);
}

/**
 * Is this domain in a Cloudflare zone we control at all?
 *
 * The state one level worse than gray-cloud, and it hid the same way: a domain
 * on foreign nameservers (never onboarded to CF) has no zone to inspect, so
 * checkDnsStatus returns zoneFound:false with an empty record list — which
 * deriveProxied reports as `null` ("couldn't tell"), i.e. no badge at all. Four
 * of the fleet's highest-traffic domains sat on GoDaddy nameservers, fully
 * origin-exposed, rendering as healthy-and-green the whole time. This surfaces
 * that as its own explicit state. null = CF token missing, so genuinely unknown.
 */
function deriveOnCloudflare(
  cloudflare: { zoneFound?: boolean } | null,
  cfEnabled: boolean
): boolean | null {
  if (!cfEnabled) return null; // no token — we truly can't say
  if (!cloudflare) return false; // lookup ran and found no zone
  return cloudflare.zoneFound === true;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const domain = new URL(request.url).searchParams.get("domain");

  try {
    if (domain) {
      const cfEnabled = !!process.env.CLOUDFLARE_API_TOKEN;
      const vercelStatus = await getDomainStatus(domain);
      let cloudflareStatus = null;
      if (cfEnabled) {
        cloudflareStatus = await checkDnsStatus(domain);
      }
      const probe = await probeHealth(domain);
      return NextResponse.json({
        vercel: vercelStatus,
        cloudflare: cloudflareStatus,
        proxied: deriveProxied(cloudflareStatus),
        onCloudflare: deriveOnCloudflare(cloudflareStatus, cfEnabled),
        ...probe,
      });
    } else {
      const domains = await listDomains();
      const cfEnabled = !!process.env.CLOUDFLARE_API_TOKEN;

      // Enrich each domain with a real server-side health probe (+ CF DNS status
      // when available). Probing here instead of in the browser fixes the false
      // "SSL broken" badge that cross-origin fetch errors used to trigger.
      const enriched = await Promise.all(
        domains.map(async (d) => {
          const probe = await probeHealth(d.name);
          let cloudflare = null;
          if (cfEnabled) {
            try {
              cloudflare = await checkDnsStatus(d.name);
            } catch {
              cloudflare = null;
            }
          }
          return {
            ...d,
            ...probe,
            cloudflare,
            proxied: deriveProxied(cloudflare),
            onCloudflare: deriveOnCloudflare(cloudflare, cfEnabled),
          };
        })
      );
      return NextResponse.json(enriched);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
