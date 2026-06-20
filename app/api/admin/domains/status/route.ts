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

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const domain = new URL(request.url).searchParams.get("domain");

  try {
    if (domain) {
      const vercelStatus = await getDomainStatus(domain);
      let cloudflareStatus = null;
      if (process.env.CLOUDFLARE_API_TOKEN) {
        cloudflareStatus = await checkDnsStatus(domain);
      }
      const probe = await probeHealth(domain);
      return NextResponse.json({ vercel: vercelStatus, cloudflare: cloudflareStatus, ...probe });
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
          return { ...d, ...probe, cloudflare };
        })
      );
      return NextResponse.json(enriched);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
