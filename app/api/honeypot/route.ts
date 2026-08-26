import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../../../lib/rate-limit";
import { banIp } from "../../../lib/kv-ban";
import { isBot } from "../../../lib/bot-detect";
import { logHoneypotHit } from "../../../lib/db";

// Honeypot endpoint. The legitimate trap is the off-screen, aria-hidden,
// tabIndex=-1 anchor in CreatorPage, which a real user cannot see or tab to.
//
// A hit is NOT sufficient grounds to ban on its own. Until 2026-08 this route
// banned every caller for 24h, and because middleware serves a banned IP the
// decoy page, each false positive locked a real visitor — and everyone behind
// their carrier NAT address — out for a day. Measured over 33,517 hits:
// 86.6% carried mobile browser UAs, 0.12% carried bot UAs, and the same IPs
// reappeared 3.85 times on average, i.e. banned users kept getting re-banned.
// The dominant source was a visible "Loading…" link that the links API used to
// return on rejection (now removed — see app/api/links/[creator]/route.ts).
//
// Bans are therefore gated on the request actually looking automated. Every
// hit is still logged, so the honeypot keeps its monitoring value either way.

/**
 * True when a request carries no evidence of being a real browser navigation.
 *
 * A browser following a link sends Sec-Fetch-* metadata (or, on older/in-app
 * WebViews that omit it, at least an `Accept` that asks for HTML). A scripted
 * fetcher typically sends neither, whatever it claims in its UA.
 */
function looksAutomated(request: NextRequest): boolean {
  const ua = request.headers.get("user-agent") ?? "";
  if (!ua.trim()) return true;
  if (isBot(ua)) return true;

  const secFetchMode = request.headers.get("sec-fetch-mode");
  const secFetchDest = request.headers.get("sec-fetch-dest");
  const accept = request.headers.get("accept") ?? "";
  return !secFetchMode && !secFetchDest && !accept.includes("text/html");
}

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
    // Arrivals carrying ref=d1 came from the old rejection payload's visible
    // "Loading…" link, i.e. a human tapping the only thing on their screen.
    // The link is gone, but never ban on it — stragglers may still be cached.
    const fromRejectionPayload =
      new URL(request.url).searchParams.get("ref") === "d1";
    const shouldBan = !fromRejectionPayload && looksAutomated(request);

    console.warn(
      `[honeypot] hit — banned: ${shouldBan} | UA: ${ua.slice(0, 200)} | IP: ${ip} | Referer: ${referer}`
    );
    // Fire-and-forget: ban IP + log to DB (errors are non-fatal)
    if (shouldBan) void banIp(ip);
    void logHoneypotHit(ip, ua, referer).catch((e) => {
      console.error("[honeypot] DB write failed:", e instanceof Error ? e.message : e);
    });
  }

  return new NextResponse(LOADING_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
