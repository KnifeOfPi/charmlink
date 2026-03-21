import { NextRequest, NextResponse } from "next/server";
import creatorsData from "../../../../creators.json";
import { CreatorsConfig } from "../../../../lib/types";
import { isBot } from "../../../../lib/bot-detect";

const creators: CreatorsConfig = creatorsData as CreatorsConfig;

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

  const creator = creators[slug];
  if (!creator) {
    return NextResponse.json({ links: [] }, { status: 404 });
  }

  return NextResponse.json({ links: creator.premiumLinks });
}
