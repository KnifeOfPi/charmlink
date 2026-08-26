import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../../../lib/rate-limit";
import { banIp } from "../../../lib/kv-ban";
import { logHoneypotHit } from "../../../lib/db";

// Honeypot endpoint — only bots follow invisible links.
// Real users never see or click this link.

// Benign "Loading…" HTML that doesn't look like a trap
const LOADING_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Loading…</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}
.spinner{width:40px;height:40px;border:4px solid #ddd;border-top-color:#555;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}</style>
</head>
<body><div class="spinner"></div></body>
</html>`;

export async function GET(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const ua = request.headers.get("user-agent") ?? "unknown";
  const referer = request.headers.get("referer") ?? "none";

  // Rate limit: 10 req/min
  const { allowed } = await rateLimit(ip, "honeypot", 10, 60);

  if (allowed) {
    console.warn(
      `[honeypot] hit — UA: ${ua.slice(0, 200)} | IP: ${ip} | Referer: ${referer}`
    );
    // Fire-and-forget: ban IP + log to DB (errors are non-fatal)
    void banIp(ip);
    void logHoneypotHit(ip, ua, referer).catch((e) => {
      console.error("[honeypot] DB write failed:", e instanceof Error ? e.message : e);
    });
  }

  return new NextResponse(LOADING_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
