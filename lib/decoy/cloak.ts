import type { NextRequest } from "next/server";
import { signInternal } from "../internal-token";

// ─────────────────────────────────────────────────────────────────────────────
// Edge-side lookup for the per-creator `cloak_enabled` flag and decoy profile.
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
  // Decoy profile fields (for building the branded decoy page)
  name?: string;
  tagline?: string;
  avatar_url?: string;
  theme_bg?: string;
  theme_accent?: string;
  theme_text?: string;
  bg_type?: string;
  bg_color_2?: string;
  bg_color_3?: string | null;
  decoy_links?: Array<{ label: string; url: string; icon: string }>;
  expiresAt: number;
}

const cache = new Map<string, CloakCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_BUDGET_MS = 1500; // strict: must not stall real users

export interface CreatorMeta {
  exists: boolean;
  slug: string | null;
  cloakEnabled: boolean;
  // Decoy profile fields
  name?: string;
  tagline?: string;
  avatar_url?: string;
  theme_bg?: string;
  theme_accent?: string;
  theme_text?: string;
  bg_type?: string;
  bg_color_2?: string;
  bg_color_3?: string | null;
  decoy_links?: Array<{ label: string; url: string; icon: string }>;
}

function cacheKey(kind: "slug" | "domain", value: string): string {
  return `${kind}:${value.toLowerCase()}`;
}

async function fetchMeta(
  kind: "slug" | "domain",
  value: string,
  request: NextRequest
): Promise<CreatorMeta | null> {
  const internalHost = process.env.VERCEL_URL ?? request.nextUrl.host;
  const internalOrigin = internalHost.startsWith("http")
    ? internalHost
    : `https://${internalHost}`;
  const url = new URL("/api/resolve-creator-meta", internalOrigin);
  url.searchParams.set(kind, value);

  try {
    const internalToken = await signInternal(`resolve-creator-meta|${kind}|${value}`);
    const res = await fetch(url.toString(), {
      headers: {
        "x-internal-resolve": "1",
        "x-internal-token": internalToken,
      },
      signal: AbortSignal.timeout(FETCH_BUDGET_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return {
      exists: Boolean(data.exists),
      slug: (data.slug as string) ?? null,
      cloakEnabled: Boolean(data.cloak_enabled),
      name: data.name as string | undefined,
      tagline: data.tagline as string | undefined,
      avatar_url: data.avatar_url as string | undefined,
      theme_bg: data.theme_bg as string | undefined,
      theme_accent: data.theme_accent as string | undefined,
      theme_text: data.theme_text as string | undefined,
      bg_type: data.bg_type as string | undefined,
      bg_color_2: data.bg_color_2 as string | undefined,
      bg_color_3: data.bg_color_3 as string | null | undefined,
      decoy_links: data.decoy_links as Array<{ label: string; url: string; icon: string }> | undefined,
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
    return {
      exists: hit.exists, slug: hit.slug, cloakEnabled: hit.cloakEnabled,
      name: hit.name, tagline: hit.tagline, avatar_url: hit.avatar_url,
      theme_bg: hit.theme_bg, theme_accent: hit.theme_accent, theme_text: hit.theme_text,
      bg_type: hit.bg_type, bg_color_2: hit.bg_color_2, bg_color_3: hit.bg_color_3,
      decoy_links: hit.decoy_links,
    };
  }

  const meta = await fetchMeta(kind, value, request);
  if (!meta) return null;

  cache.set(key, {
    exists: meta.exists,
    slug: meta.slug,
    cloakEnabled: meta.cloakEnabled,
    name: meta.name,
    tagline: meta.tagline,
    avatar_url: meta.avatar_url,
    theme_bg: meta.theme_bg,
    theme_accent: meta.theme_accent,
    theme_text: meta.theme_text,
    bg_type: meta.bg_type,
    bg_color_2: meta.bg_color_2,
    bg_color_3: meta.bg_color_3,
    decoy_links: meta.decoy_links,
    expiresAt: now + CACHE_TTL_MS,
  });
  return meta;
}