import { NextRequest, NextResponse } from "next/server";
import { addDomain, removeDomain } from "../../../../lib/vercel-domains";
import { addVercelDnsRecord, removeVercelDnsRecord } from "../../../../lib/cloudflare-dns";

export const runtime = "nodejs";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return true;
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

    const results: { vercel?: unknown; cloudflare?: unknown; errors: string[] } = { errors: [] };

    // Step 1: Add domain to Vercel
    try {
      results.vercel = await addDomain(domain);
    } catch (err) {
      results.errors.push(`Vercel: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Step 2: Add DNS record on Cloudflare (if CLOUDFLARE_API_TOKEN is configured)
    if (process.env.CLOUDFLARE_API_TOKEN) {
      const cfResult = await addVercelDnsRecord(domain);
      results.cloudflare = cfResult;
      if (!cfResult.success && cfResult.error) {
        results.errors.push(`Cloudflare: ${cfResult.error}`);
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

    // Step 2: Remove DNS record from Cloudflare
    if (process.env.CLOUDFLARE_API_TOKEN) {
      const cfResult = await removeVercelDnsRecord(domain);
      if (!cfResult.success && cfResult.error) {
        errors.push(`Cloudflare: ${cfResult.error}`);
      }
    }

    return NextResponse.json({ ok: true, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
