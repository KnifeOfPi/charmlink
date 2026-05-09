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

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const hostname = host.split(":")[0]; // strip port

  // ── Bot detection ──────────────────────────────────────────────────────────
  const { isBot: isBotResult, reason } = detectBot(request);

  // Inject bot signals on REQUEST headers only — never expose on response
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-is-bot", isBotResult ? "true" : "false");
  requestHeaders.set("x-bot-reason", reason);

  // ── Custom domain routing ──────────────────────────────────────────────────
  if (!isAppHost(hostname)) {
    const pathname = request.nextUrl.pathname;

    // Only rewrite the root path to the creator page
    if (pathname === "/" || pathname === "") {
      const slug = await resolveCustomDomain(hostname, request);
      if (slug) {
        const url = request.nextUrl.clone();
        url.pathname = `/${slug}`;
        // Pass custom domain via request headers only
        requestHeaders.set("x-custom-domain", hostname);
        return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
      }
    }
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
