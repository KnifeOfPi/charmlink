import { NextRequest, NextResponse } from "next/server";
import { provisionDomain, deprovisionDomain } from "../../../../lib/provisioning";

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

    const results = await provisionDomain(domain);
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

    const result = await deprovisionDomain(domain);
    return NextResponse.json({ ok: result.ok, errors: result.errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
