import type { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Edge-side lookup for the per-creator `cloak_enabled` flag.
//
// Middleware runs in the edge runtime where we can't open a `pg` connection
// directly, so we delegate to an internal Node.js API route the same way
// `resolveCustomDomain` does. Results are cached in-process for 5 minutes.
//
// Failure mode: if the lookup fails (timeout, network, DB down) we return
// `null` and the middleware falls through to normal rendering. We do NOT
// serve a decoy on lookup failure — that could brick real users.
// ─────────────────────────────────────────────────────────────────────────────

interface CloakCacheEntry {
  exists: boolean;
  slug: string | null;
  cloakEnabled: boolean;
  expiresAt: number;
}

const cache = new Map<string, CloakCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_BUDGET_MS = 1500; // strict: must not stall real users

export interface CreatorMeta {
  exists: boolean;
  slug: string | null;
  cloakEnabled: boolean;
}

function cacheKey(kind: "slug" | "domain", value: string): string {
  return `${kind}:${value.toLowerCase()}`;
}

async function fetchMeta(
  kind: "slug" | "domain",
  value: string,
  request: NextRequest
): Promise<CreatorMeta | null> {
  // Prefer the Vercel canonical hostname so this stays inside the platform
  // (same rationale as resolveCustomDomain in middleware.ts).
  const internalHost = process.env.VERCEL_URL ?? request.nextUrl.host;
  const internalOrigin = internalHost.startsWith("http")
    ? internalHost
    : `https://${internalHost}`;
  const url = new URL("/api/resolve-creator-meta", internalOrigin);
  url.searchParams.set(kind, value);

  try {
    const res = await fetch(url.toString(), {
      headers: { "x-internal-resolve": "1" },
      signal: AbortSignal.timeout(FETCH_BUDGET_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      exists?: boolean;
      slug?: string | null;
      cloak_enabled?: boolean;
    };
    return {
      exists: Boolean(data.exists),
      slug: data.slug ?? null,
      cloakEnabled: Boolean(data.cloak_enabled),
    };
  } catch {
    return null;
  }
}

export async function getCreatorMeta(
  kind: "slug" | "domain",
  value: string,
  request: NextRequest
): Promise<CreatorMeta | null> {
  const key = cacheKey(kind, value);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return { exists: hit.exists, slug: hit.slug, cloakEnabled: hit.cloakEnabled };
  }

  const meta = await fetchMeta(kind, value, request);
  if (!meta) return null;

  cache.set(key, {
    exists: meta.exists,
    slug: meta.slug,
    cloakEnabled: meta.cloakEnabled,
    expiresAt: now + CACHE_TTL_MS,
  });
  return meta;
}
