import { NextRequest, NextResponse } from "next/server";
import { getCreatorBySlug, getCreatorLinks } from "../../../../lib/db";
import { isBot } from "../../../../lib/bot-detect";

export const runtime = "nodejs";

// Simple in-memory rate limiter — per IP, max 30 requests per minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT) return true;
  return false;
}

// Clean up stale entries every 5 minutes
if (typeof globalThis !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
      if (now > entry.resetAt) rateLimitMap.delete(ip);
    }
  }, 300_000);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ creator: string }> }
) {
  const { creator: slug } = await params;
  const userAgent = request.headers.get("user-agent");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  // Block bots — return empty array
  if (isBot(userAgent)) {
    return NextResponse.json({ links: [] });
  }

  // Rate limit — flag IPs hitting multiple creators rapidly
  if (isRateLimited(ip)) {
    console.warn(`[links:ratelimit] IP ${ip} exceeded rate limit`);
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
