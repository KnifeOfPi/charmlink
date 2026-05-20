import { NextRequest, NextResponse } from "next/server";
import { getCreatorDomains, addCreatorDomain } from "../../../../../../lib/db";
import { provisionDomain } from "../../../../../../lib/provisioning";

export const runtime = "nodejs";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${adminKey}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const domains = await getCreatorDomains(id);
    return NextResponse.json(domains);
  } catch (err) {
    console.error("[admin:creator:domains:get]", err);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const body = (await request.json()) as { domain?: string; is_primary?: boolean };
    const { domain, is_primary } = body;
    if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

    const domainRow = await addCreatorDomain(id, domain, is_primary);

    // Run Vercel + Cloudflare + Turnstile provisioning
    const provision = await provisionDomain(domain);
    const status = provision.errors.length > 0 ? 207 : 201;
    return NextResponse.json({ domain: domainRow, provision }, { status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
