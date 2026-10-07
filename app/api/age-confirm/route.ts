import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../../../lib/rate-limit";
import { clientIp } from "../../../lib/client-ip";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Trusted only when the request really came through Cloudflare (lib/client-ip).
  const ip = clientIp(request.headers);
  const { allowed } = await rateLimit(ip, "age-confirm", 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const isProd = process.env.NODE_ENV === "production";

  const response = NextResponse.json({ ok: true });
  response.cookies.set("cl_age", "1", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
    secure: isProd,
  });
  return response;
}
