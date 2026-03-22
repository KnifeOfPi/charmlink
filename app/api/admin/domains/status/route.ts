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
      return NextResponse.json({ vercel: vercelStatus, cloudflare: cloudflareStatus });
    } else {
      const domains = await listDomains();

      // Enrich with Cloudflare DNS status if available
      if (process.env.CLOUDFLARE_API_TOKEN) {
        const enriched = await Promise.all(
          domains.map(async (d) => {
            try {
              const cfStatus = await checkDnsStatus(d.name);
              return { ...d, cloudflare: cfStatus };
            } catch {
              return { ...d, cloudflare: null };
            }
          })
        );
        return NextResponse.json(enriched);
      }

      return NextResponse.json(domains);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
