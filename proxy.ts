import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { detectBot } from "./lib/bot-detect";

// ── Custom domain cache (edge-compatible, in-process) ────────────────────────
interface DomainCacheEntry {
  slug: string | null;
  expiresAt: number;
}

const domainCache = new Map<string, DomainCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function resolveCustomDomain(
  hostname: string,
  request: NextRequest
): Promise<string | null> {
  const now = Date.now();
  const cached = domainCache.get(hostname);
  if (cached && cached.expiresAt > now) {
    return cached.slug;
  }

  try {
    // Call internal API route to resolve domain → slug
    const url = new URL("/api/resolve-domain", request.url);
    url.searchParams.set("domain", hostname);

    const res = await fetch(url.toString(), {
      headers: { "x-internal-resolve": "1" },
    });

    if (res.ok) {
      const data = (await res.json()) as { slug: string | null };
      domainCache.set(hostname, { slug: data.slug, expiresAt: now + CACHE_TTL_MS });
      return data.slug;
    }
  } catch {
    // Silently fail — fall through to normal routing
  }

  domainCache.set(hostname, { slug: null, expiresAt: now + CACHE_TTL_MS });
  return null;
}

// ── Known app hostnames (don't treat as custom domains) ──────────────────────
const APP_HOSTS = new Set([
  "localhost",
  "charmlink.vercel.app",
  // Add any other known app domains here
]);

function isAppHost(hostname: string): boolean {
  if (APP_HOSTS.has(hostname)) return true;
  if (hostname.endsWith(".vercel.app")) return true;
  if (hostname === "127.0.0.1") return true;
  return false;
}

// ── Security headers ──────────────────────────────────────────────────────────
// ipapi.co is used client-side in LocationPill; include in connect-src.
const CSP =
  "default-src 'self'; " +
  "img-src 'self' data: https:; " +
  "style-src 'self' 'unsafe-inline'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com; " +
  "connect-src 'self' https://*.supabase.co https://va.vercel-scripts.com https://ipapi.co; " +
  "font-src 'self' data:; " +
  "frame-ancestors 'none'";

function applySecurityHeaders(response: NextResponse, isApiRoute: boolean): void {
  response.headers.set("Content-Security-Policy", CSP);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (isApiRoute) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
}

// ── Strip Vercel infrastructure headers from every response ───────────────────
const VERCEL_HEADERS_TO_STRIP = [
  "x-vercel-id",
  "x-vercel-cache",
  "x-matched-path",
  "x-nextjs-prerender",
  "x-nextjs-stale-time",
  "server",
];

function stripVercelHeaders(response: NextResponse): void {
  for (const h of VERCEL_HEADERS_TO_STRIP) {
    response.headers.delete(h);
  }
  response.headers.set("server", "nginx");
}

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const hostname = host.split(":")[0]; // strip port
  const pathname = request.nextUrl.pathname;
  const isApiRoute = pathname.startsWith("/api/");

  // ── Origin protection: block *.vercel.app for creator slug paths ──────────
  // Real traffic must arrive via a CF-proxied custom domain or the canonical
  // charmlink.vercel.app root. Direct hits to *.vercel.app on non-admin paths
  // are rejected to prevent domain-shopping scrapers from bypassing CF WAF.
  if (hostname.endsWith(".vercel.app")) {
    const isExempt =
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      pathname === "/" ||
      pathname === "/robots.txt" ||
      pathname === "/favicon.ico";

    if (!isExempt) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  // ── Bot detection ──────────────────────────────────────────────────────────
  const { isBot: isBotResult, reason } = await detectBot(request);

  // Inject bot signals on REQUEST headers only — never expose on response
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-is-bot", isBotResult ? "true" : "false");
  requestHeaders.set("x-bot-reason", reason);

  // ── Custom domain routing ──────────────────────────────────────────────────
  if (!isAppHost(hostname) && !isApiRoute) {
    // Only rewrite the root path to the creator page
    if (pathname === "/" || pathname === "") {
      const slug = await resolveCustomDomain(hostname, request);
      if (slug) {
        const url = request.nextUrl.clone();
        url.pathname = `/${slug}`;
        // Pass custom domain via request headers only
        requestHeaders.set("x-custom-domain", hostname);
        const response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
        applySecurityHeaders(response, false);
        stripVercelHeaders(response);
        return response;
      }
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response, isApiRoute);
  stripVercelHeaders(response);
  return response;
}

export const config = {
  // Run on all routes including /api/ so we can apply security headers.
  // Still excludes static assets and image optimizer.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
