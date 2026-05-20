import { NextRequest, NextResponse } from "next/server";
import { removeCreatorDomain, setPrimaryDomain, getCreatorDomains } from "../../../../../../../lib/db";
import { deprovisionDomain } from "../../../../../../../lib/provisioning";

export const runtime = "nodejs";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${adminKey}`;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; domainId: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, domainId } = await params;
  try {
    // Fetch the domain row to get the domain string for deprovisioning
    const domains = await getCreatorDomains(id);
    const target = domains.find((d) => d.id === domainId);
    if (!target) return NextResponse.json({ error: "Domain not found" }, { status: 404 });

    await removeCreatorDomain(domainId);

    // Deprovision Vercel + Cloudflare + Turnstile
    const deprovision = await deprovisionDomain(target.domain);
    return NextResponse.json({ ok: true, deprovision });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; domainId: string }> }
) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, domainId } = await params;
  try {
    const body = (await request.json()) as { is_primary?: boolean };
    if (!body.is_primary) {
      return NextResponse.json({ error: "is_primary: true required" }, { status: 400 });
    }
    await setPrimaryDomain(id, domainId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "DB error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
