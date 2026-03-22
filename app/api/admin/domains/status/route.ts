import { NextRequest, NextResponse } from "next/server";
import { getDomainStatus, listDomains } from "../../../../../lib/vercel-domains";

export const runtime = "nodejs";

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return true;
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
      const status = await getDomainStatus(domain);
      return NextResponse.json(status);
    } else {
      const domains = await listDomains();
      return NextResponse.json(domains);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
