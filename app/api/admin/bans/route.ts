import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Admin maintenance for the honeypot IP ban list.
//
//   GET  /api/admin/bans  → count currently-banned IPs (read-only, safe)
//   POST /api/admin/bans  → delete every ban key, unblocking everyone now
//
// Why this exists: a ban written by lib/kv-ban.ts lasts 24h, and middleware
// serves a banned IP the decoy page instead of the creator page. The honeypot
// used to ban indiscriminately — of 33,517 hits, 86.6% carried mobile browser
// UAs and only 0.12% carried bot UAs — so thousands of real visitors are
// locked out and would otherwise stay locked out until their TTL expires.
// Fixing the honeypot stops NEW bans; it does not clear the backlog. This does.
//
// Scope is deliberately narrow: only keys under `cl:banned:` are touched.
// Rate-limit counters (`cl:rl:*`) and everything else in the store are left
// alone. Un-banning genuine bots is acceptable — the honeypot re-bans anything
// that still looks automated on its next hit.

const BAN_KEY_PREFIX = "cl:banned:";
const SCAN_BATCH = 200;
const MAX_ITERATIONS = 2000; // backstop; 200 * 2000 = 400k keys

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  const authHeader = request.headers.get("authorization");
  const customHeader = request.headers.get("x-admin-key");
  return authHeader === `Bearer ${adminKey}` || customHeader === adminKey;
}

function kvConfigured(): boolean {
  return !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;
}

/**
 * Walk every `cl:banned:*` key via SCAN. Returns the keys found.
 *
 * SCAN is used rather than KEYS because KEYS blocks the server; SCAN is
 * cursor-based and safe against a live store. The cursor comes back as either
 * a number or a string depending on client version, so it is normalised.
 */
async function collectBanKeys(
  kv: { scan: (cursor: number, opts: { match: string; count: number }) => Promise<[string | number, string[]]> }
): Promise<string[]> {
  const found: string[] = [];
  let cursor = 0;
  let iterations = 0;

  do {
    const [next, keys] = await kv.scan(cursor, {
      match: `${BAN_KEY_PREFIX}*`,
      count: SCAN_BATCH,
    });
    if (keys?.length) found.push(...keys);
    cursor = typeof next === "string" ? parseInt(next, 10) : next;
    if (!Number.isFinite(cursor)) cursor = 0;
  } while (cursor !== 0 && ++iterations < MAX_ITERATIONS);

  return found;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!kvConfigured()) {
    return NextResponse.json(
      { error: "KV is not configured — nothing to count." },
      { status: 503 }
    );
  }

  try {
    const { kv } = await import("@vercel/kv");
    const keys = await collectBanKeys(kv as never);
    return NextResponse.json({
      banned: keys.length,
      sample: keys.slice(0, 10).map((k) => k.slice(BAN_KEY_PREFIX.length)),
      hint: "POST to this same URL to clear them.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin:bans:get]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!kvConfigured()) {
    return NextResponse.json(
      { error: "KV is not configured — nothing to flush." },
      { status: 503 }
    );
  }

  try {
    const { kv } = await import("@vercel/kv");
    const keys = await collectBanKeys(kv as never);

    if (keys.length === 0) {
      return NextResponse.json({ flushed: 0, message: "No bans were in place." });
    }

    // Delete in chunks so one oversized command can't fail the whole flush.
    let flushed = 0;
    for (let i = 0; i < keys.length; i += SCAN_BATCH) {
      const chunk = keys.slice(i, i + SCAN_BATCH);
      await (kv as unknown as { del: (...k: string[]) => Promise<number> }).del(...chunk);
      flushed += chunk.length;
    }

    console.warn(`[admin:bans] flushed ${flushed} honeypot IP ban(s)`);
    return NextResponse.json({
      flushed,
      message: `Cleared ${flushed} banned IP(s). Affected visitors get the real page on their next request.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin:bans:post]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
