import { NextRequest, NextResponse } from "next/server";
import { getCreatorByDomain } from "../../../lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const domain = new URL(request.url).searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ slug: null });
  }

  try {
    const creator = await getCreatorByDomain(domain);
    return NextResponse.json({ slug: creator?.slug ?? null });
  } catch {
    return NextResponse.json({ slug: null });
  }
}
