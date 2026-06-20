import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { detectBot } from "./lib/bot-detect";
import { isLinkPreviewScraper } from "./lib/scraper-detect";
import { decoyHtml } from "./lib/decoy/themes";
import { getCreatorMeta } from "./lib/decoy/cloak";

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
    // Call internal API route to resolve domain → slug.
    // IMPORTANT: prefer the Vercel canonical hostname (VERCEL_URL) so the
    // request stays inside the platform and skips Cloudflare → public DNS
    // → origin (which can hang, hit Bot Fight Mode, or get blocked by the
    // origin lock on non-root paths). request.nextUrl.origin on a custom
    // domain points back at hannazuki.com, defeating the purpose.
    const internalHost =
      process.env.VERCEL_URL ?? request.nextUrl.host;
    const internalOrigin = internalHost.startsWith("http")
      ? internalHost
      : `https://${internalHost}`;
    const url = new URL("/api/resolve-domain", internalOrigin);
    url.searchParams.set("domain", hostname);

    const res = await fetch(url.toString(), {
      headers: { "x-internal-resolve": "1" },
      // 3s budget: middleware must not block real users on a slow DB.
      signal: AbortSignal.timeout(3000),
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
// blob.vercel-storage.com + *.public.blob.vercel-storage.com are required for
// the admin client-direct avatar upload (the browser PUTs straight to Blob);
// without them CSP silently blocks the upload and the UI hangs on "Uploading…".
const CSP =
  "default-src 'self'; " +
  "img-src 'self' data: https:; " +
  "style-src 'self' 'unsafe-inline'; " +
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com; " +
  "connect-src 'self' https://*.supabase.co https://va.vercel-scripts.com https://ipapi.co https://vercel.com https://blob.vercel-storage.com https://*.public.blob.vercel-storage.com; " +
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
  "x-powered-by",
  "server",
];

function stripVercelHeaders(response: NextResponse): void {
  for (const h of VERCEL_HEADERS_TO_STRIP) {
    response.headers.delete(h);
  }
  response.headers.set("server", "nginx");
}

// ── Decoy response builder (bot-only) ─────────────────────────────────────────
// Returns an inline HTML response with NO Charmlink/Vercel/Next.js fingerprints.
// Caller is responsible for deciding whether to invoke this; we just build the
// response and scrub every header we can.
function buildDecoyResponse(slug: string): Response {
  const html = decoyHtml(slug);
  const res = new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "server": "nginx",
    },
  });
  // Best-effort: remove any framework headers the runtime may have attached.
  for (const h of VERCEL_HEADERS_TO_STRIP) {
    res.headers.delete(h);
  }
  res.headers.set("server", "nginx");
  return res;
}

// ── Page-route detection for decoy bypass ─────────────────────────────────────
// We only serve the decoy on top-level creator page routes. Static assets, API
// endpoints, admin, the /r/[linkId] interstitial, and root-level utility paths
// stay on the normal pipeline.
function extractDecoyCandidateSlug(
  hostname: string,
  pathname: string,
  customDomainSlug: string | null
): string | null {
  if (pathname.startsWith("/api/")) return null;
  if (pathname.startsWith("/_next/")) return null;
  if (pathname.startsWith("/admin")) return null;
  if (pathname.startsWith("/r/")) return null;
  if (pathname === "/favicon.ico") return null;
  if (pathname === "/robots.txt") return null;
  if (pathname === "/sitemap.xml") return null;

  // Custom domain root → slug already resolved.
  if (!isAppHost(hostname) && (pathname === "/" || pathname === "")) {
    return customDomainSlug;
  }

  // /[slug] on the app host: slug is the first path segment, only if there's
  // exactly one segment (no nested /admin, /api etc., already filtered above).
  if (pathname === "/" || pathname === "") return null;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length !== 1) return null;
  const slug = parts[0];
  // Slug shape: lowercase alphanumeric + dashes/underscores. Anything else is
  // probably a Next.js system path we don't want to cloak.
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(slug)) return null;
  return slug;
}

export async function middleware(request: NextRequest) {
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
  // Only flip the SSR cloaking flag (x-is-bot=true) for HIGH confidence
  // signals. Low-confidence heuristics (e.g. missing Sec-Fetch-* on page
  // routes) misfire on real iOS in-app WebViews (Instagram/Facebook),
  // older mobile browsers, and any client that doesn't send those headers —
  // which previously rendered the hidden bot-decoy page for real humans.
  const ua = request.headers.get("user-agent") ?? "";
  const { isBot: isBotResult, reason, confidence } = await detectBot(request);
  const isBotFinal = isBotResult && confidence === "high";
  // Explicit link-preview scrapers (FB, Twitter, Slack, Telegram, Discord, ...)
  // always get the decoy regardless of detectBot() confidence — these are the
  // exact UAs Meta uses for the OG fingerprint sweep.
  const isLinkPreview = isLinkPreviewScraper(ua);
  const shouldCloak = isBotFinal || isLinkPreview;

  // Inject bot signals on REQUEST headers only — never expose on response
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-is-bot", isBotFinal ? "true" : "false");
  requestHeaders.set("x-bot-reason", reason);
  requestHeaders.set("x-bot-confidence", confidence);

  // ── Custom domain resolution (needed for both decoy + normal routing) ─────
  let customDomainSlug: string | null = null;
  if (!isAppHost(hostname) && !isApiRoute) {
    if (pathname === "/" || pathname === "") {
      customDomainSlug = await resolveCustomDomain(hostname, request);
    }
  }

  // ── Bot decoy bypass ──────────────────────────────────────────────────────
  // For confirmed scrapers/bots, short-circuit with an inline HTML response
  // that has none of the Next.js/Vercel/Charmlink fingerprints. Per-creator
  // kill switch: `cloak_enabled = false` falls through to normal rendering.
  if (shouldCloak) {
    const candidateSlug = extractDecoyCandidateSlug(
      hostname,
      pathname,
      customDomainSlug
    );
    if (candidateSlug) {
      const meta = await getCreatorMeta("slug", candidateSlug, request);
      // Serve decoy only when the creator exists AND cloak_enabled is true.
      // If lookup fails (meta === null) we fall through to normal rendering
      // rather than risk decoying a real user.
      if (meta && meta.exists && meta.cloakEnabled) {
        return buildDecoyResponse(meta.slug ?? candidateSlug);
      }
    }
  }

  // ── Custom domain routing ──────────────────────────────────────────────────
  if (!isAppHost(hostname) && !isApiRoute) {
    if (pathname === "/" || pathname === "") {
      if (customDomainSlug) {
        const url = request.nextUrl.clone();
        url.pathname = `/${customDomainSlug}`;
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
