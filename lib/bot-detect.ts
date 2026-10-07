import type { NextRequest } from "next/server";
import { isbot } from "isbot";
import { isDatacenterAsn } from "./datacenter-asns";
import { isIpBanned } from "./kv-ban";
import { checkIPQS, classifyIPQS } from "./ipqs";

// Meta-2026 patterns not yet in isbot's list
const META_2026_PATTERNS = [
  "meta-externalagent",
  "meta-externalfetcher",
  "meta-webindexer",
  "metaaibot",
  "meta-quest",
  "metainspector",
];

// Page-route paths that browsers always accompany with Sec-Fetch-* headers
function isPageRoute(pathname: string): boolean {
  return (
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next/") &&
    !pathname.startsWith("/favicon")
  );
}

export async function detectBot(
  request: NextRequest,
  // IPQS is a paid network lookup (up to its timeout per uncached IP). Only
  // the links API opts in; middleware runs on every request and must not.
  opts: { ipqs?: boolean } = {}
): Promise<{ isBot: boolean; reason: string; confidence: "low" | "high" }> {
  const ua = request.headers.get("user-agent") ?? "";

  // 0. KV honeypot ban list (highest priority)
  // Prefer cf-connecting-ip (set by Cloudflare, unspoofable) over
  // x-forwarded-for (client-influenced). Fall back to x-forwarded-for
  // for non-CF environments (local dev, direct Vercel hits).
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "";
  if (ip && (await isIpBanned(ip))) {
    return { isBot: true, reason: "honeypot", confidence: "high" };
  }

  // 1. isbot baseline (1700+ patterns)
  if (isbot(ua)) {
    return { isBot: true, reason: "ua:isbot", confidence: "high" };
  }

  // 2. Meta-2026 explicit patterns
  const uaLower = ua.toLowerCase();
  if (META_2026_PATTERNS.some((p) => uaLower.includes(p))) {
    return { isBot: true, reason: "ua:meta-2026", confidence: "high" };
  }

  // 3. Datacenter ASN check — "uncertain", not "bot".
  //
  // Cloudflare Transform Rule `charmlink:inject-asn` sets `x-client-asn` =
  // `ip.src.asnum` (not yet on every zone — see docs). `x-vercel-ip-asn` is
  // kept as a fallback should Vercel ever emit it.
  //
  // Low confidence on purpose: real people do browse from these networks
  // (VPNs, corporate egress). Middleware only decoys on "high", so the page
  // renders normally and the links API answers "low" with a Turnstile
  // challenge — a human passes it in about a second, a scraper doesn't.
  // CDN networks that carry iCloud Private Relay / WARP users are excluded
  // from the list entirely (lib/datacenter-asns.ts).
  const asn =
    request.headers.get("x-client-asn") ??
    request.headers.get("x-vercel-ip-asn") ??
    "";
  if (isDatacenterAsn(asn)) {
    return { isBot: false, reason: "asn:datacenter", confidence: "low" };
  }

  // 3b. IPQualityScore — links API only (opts.ipqs), never per request.
  //
  // Only near-certain verdicts decoy: Tor, IPQS's own bot flag, or fraud
  // score >= 90. VPN/proxy/residential-proxy users are often real visitors,
  // so those verdicts are logged (shadow mode) until measured.
  if (opts.ipqs && ip) {
    const ipqsResult = await checkIPQS(ip, ua);
    if (ipqsResult) {
      const verdict = classifyIPQS(ipqsResult);
      if (verdict.block) {
        return { isBot: true, reason: `ipqs:${verdict.reasons.join(",")}`, confidence: "high" };
      }
      if (verdict.reasons.length > 0) {
        console.info(`[bot-detect] shadow ipqs:${verdict.reasons.join(",")} (not enforced)`);
      }
    }
  }

  // 4. Missing Sec-Fetch-* on page routes (low confidence)
  const pathname = request.nextUrl?.pathname ?? "";
  if (isPageRoute(pathname)) {
    const secFetchMode = request.headers.get("sec-fetch-mode");
    const secFetchDest = request.headers.get("sec-fetch-dest");
    const accept = request.headers.get("accept") ?? "";
    if (!secFetchMode && !secFetchDest && !accept.includes("text/html")) {
      return { isBot: true, reason: "missing-sec-fetch", confidence: "low" };
    }
  }

  // 5. Missing Sec-Fetch-* on API routes (low confidence — Turnstile candidate)
  // API routes called by browser fetch() always carry Sec-Fetch-* headers.
  // A missing set on an API route suggests a non-browser client (curl, python,
  // wget) or a headless browser that strips them. Not enough to block — but
  // enough to challenge with Turnstile.
  if (pathname.startsWith("/api/")) {
    const secFetchMode = request.headers.get("sec-fetch-mode");
    const secFetchDest = request.headers.get("sec-fetch-dest");
    const accept = request.headers.get("accept") ?? "";
    // Only flag when ALL signals are missing — a partial set means a real
    // browser with an odd config (privacy extensions stripping some headers).
    if (!secFetchMode && !secFetchDest && !accept) {
      return { isBot: false, reason: "api-missing-sec-fetch", confidence: "low" };
    }
  }

  // 6. Suspicious Accept header on API routes
  // Real browsers send Accept: */* or application/json for fetch() calls.
  // Anything with Accept: text/html on an API route is a browser navigating
  // directly to the endpoint — which is unusual and worth challenging.
  if (pathname.startsWith("/api/")) {
    const accept = request.headers.get("accept") ?? "";
    if (accept.includes("text/html")) {
      return { isBot: false, reason: "api-accept-html", confidence: "low" };
    }
  }

  return { isBot: false, reason: "pass", confidence: "high" };
}

// Backwards-compat: files that still call isBot(userAgent)
export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  if (isbot(userAgent)) return true;
  if (META_2026_PATTERNS.some((p) => ua.includes(p))) return true;
  return false;
}

export function isInstagramBrowser(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return userAgent.toLowerCase().includes("instagram");
}
