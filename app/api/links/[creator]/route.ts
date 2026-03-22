import { NextRequest, NextResponse } from "next/server";
import { getCreatorBySlug, getCreatorLinks } from "../../../../lib/db";
import { isBot } from "../../../../lib/bot-detect";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ creator: string }> }
) {
  const { creator: slug } = await params;
  const userAgent = request.headers.get("user-agent");

  // Block bots — return empty array
  if (isBot(userAgent)) {
    return NextResponse.json({ links: [] });
  }

  try {
    const creator = await getCreatorBySlug(slug);
    if (!creator) {
      return NextResponse.json({ links: [] }, { status: 404 });
    }

    const links = await getCreatorLinks(creator.id);
    const premiumLinks = links
      .filter((l) => l.link_type === "premium")
      .map((l) => ({ label: l.label, url: l.url, icon: l.icon }));

    return NextResponse.json({ links: premiumLinks });
  } catch (err) {
    console.error("[links:get] DB error", err);
    return NextResponse.json({ links: [] }, { status: 500 });
  }
}
