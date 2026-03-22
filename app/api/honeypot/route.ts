import { NextRequest, NextResponse } from "next/server";

// Honeypot endpoint — only bots follow invisible links.
// Real users never see or click this link.
// Log the access for monitoring, return a boring 200.

export async function GET(request: NextRequest) {
  const ua = request.headers.get("user-agent") || "unknown";
  const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
  const referer = request.headers.get("referer") || "none";

  console.warn(
    `[honeypot] Bot detected — UA: ${ua.slice(0, 200)} | IP: ${ip} | Referer: ${referer}`
  );

  // Return a clean, boring page — don't tip off the bot
  return new NextResponse(
    "<html><body><p>Page not found.</p></body></html>",
    {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }
  );
}
