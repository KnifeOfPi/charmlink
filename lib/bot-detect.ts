import type { NextRequest } from "next/server";
import { isbot } from "isbot";
import { isDatacenterAsn } from "./datacenter-asns";

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

export function detectBot(
  request: NextRequest
): { isBot: boolean; reason: string; confidence: "low" | "high" } {
  const ua = request.headers.get("user-agent") ?? "";

  // 1. isbot baseline (1700+ patterns)
  if (isbot(ua)) {
    return { isBot: true, reason: "ua:isbot", confidence: "high" };
  }

  // 2. Meta-2026 explicit patterns
  const uaLower = ua.toLowerCase();
  if (META_2026_PATTERNS.some((p) => uaLower.includes(p))) {
    return { isBot: true, reason: "ua:meta-2026", confidence: "high" };
  }

  // 3. Datacenter ASN check
  const asn = request.headers.get("x-vercel-ip-asn");
  if (isDatacenterAsn(asn)) {
    return { isBot: true, reason: "asn:datacenter", confidence: "high" };
  }

  // 4. Missing Sec-Fetch-* on page routes (low confidence)
  const pathname = request.nextUrl?.pathname ?? "";
  if (isPageRoute(pathname)) {
    const secFetchMode = request.headers.get("sec-fetch-mode");
    const secFetchDest = request.headers.get("sec-fetch-dest");
    const accept = request.headers.get("accept") ?? "";
    if (!secFetchMode && !secFetchDest && !accept.includes("text/html")) {
      return { isBot: true, reason: "sec-fetch:missing", confidence: "low" };
    }
  }

  return { isBot: false, reason: "none", confidence: "high" };
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
