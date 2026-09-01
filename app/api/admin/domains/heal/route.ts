import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { provisionZone } from "../../../../../lib/cloudflare";

export const runtime = "nodejs";
export const maxDuration = 300;

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${adminKey}`;
}

/**
 * Resolve VERCEL_TEAM_ID before provisionZone runs.
 *
 * cf-heal.ts CLI auto-resolves in this order:
 *   1. env var (already set in Vercel dashboard for prod)
 *   2. ~/.openclaw/vercel-team-id file (only useful on dev box)
 *   3. /v2/teams auto-discover for single-team accounts
 *
 * On Vercel prod the env var should already be set; this fallback is a safety
 * net so the heal button works on first deploy without a manual env push.
 */
async function ensureVercelTeamId(): Promise<void> {
  if (process.env.VERCEL_TEAM_ID) return;

  // Local file (dev box only)
  try {
    const filePath = path.join(os.homedir(), ".openclaw", "vercel-team-id");
    const value = fs.readFileSync(filePath, "utf8").trim();
    if (value) {
      process.env.VERCEL_TEAM_ID = value;
      return;
    }
  } catch {
    // file not present — fall through to API discovery
  }

  // Auto-discover via Vercel /v2/teams
  const vercelToken = process.env.VERCEL_API_TOKEN;
  if (!vercelToken) return;
  try {
    const res = await fetch("https://api.vercel.com/v2/teams", {
      headers: { Authorization: `Bearer ${vercelToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { teams?: Array<{ id: string }> };
    if (data.teams && data.teams.length === 1) {
      process.env.VERCEL_TEAM_ID = data.teams[0].id;
    }
  } catch {
    // best-effort — provisionZone will still attempt without team id
  }
}

async function probeHealth(domain: string): Promise<{ status: number | null; healthy: boolean }> {
  try {
    const res = await fetch(`https://${domain}/`, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Mozilla/5.0 charmlink-heal-probe" },
    });
    return { status: res.status, healthy: res.status < 500 };
  } catch {
    return { status: null, healthy: false };
  }
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { domain?: string };
  try {
    body = (await request.json()) as { domain?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const domain = body.domain?.trim().toLowerCase();
  if (!domain) {
    return NextResponse.json({ error: "domain required" }, { status: 400 });
  }
  // Basic shape check — no http://, no paths, no spaces
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
    return NextResponse.json({ error: "domain must be a bare hostname" }, { status: 400 });
  }

  // Pre-probe for reporting only. This used to return early on a healthy domain,
  // which made the Heal button incapable of fixing the one failure it couldn't
  // see: a gray-cloud domain serves a flawless 200 from Vercel, so "healthy"
  // short-circuited the repair and reported success while the domain sat outside
  // Cloudflare. provisionZone is idempotent and, for a healthy domain, does
  // nothing but correct the proxy flag — so it is always safe to let it run.
  const pre = await probeHealth(domain);

  // Make sure team id is set for /v4/certs (silent root cause of stuck domains)
  await ensureVercelTeamId();

  // Run the same idempotent fix the CLI runs: gray→cert→orange race recovery
  let provisionResult: Awaited<ReturnType<typeof provisionZone>>;
  try {
    provisionResult = await provisionZone(domain);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { domain, ok: false, error: `provisionZone threw: ${msg}` },
      { status: 500 }
    );
  }

  // Re-probe after heal
  const post = await probeHealth(domain);

  const proxyStep = provisionResult.steps.find((s) => s.name === "proxyStateRepair");
  const nothingToDo =
    pre.healthy && post.healthy && proxyStep?.detail === "already orange-cloud";

  return NextResponse.json({
    domain,
    noop: nothingToDo,
    message: nothingToDo
      ? `already healthy and proxied (HTTP ${post.status})`
      : proxyStep?.detail?.startsWith("flipped gray→orange")
        ? `was gray-cloud — flipped to orange and verified (HTTP ${post.status})`
        : undefined,
    // A serving domain is not enough: if the proxy repair failed, this is not ok.
    ok: provisionResult.ok && post.healthy && proxyStep?.ok !== false,
    preStatus: pre.status,
    postStatus: post.status,
    healthy: post.healthy,
    zoneFound: provisionResult.zoneFound,
    steps: provisionResult.steps.map((s) => ({
      name: s.name,
      ok: s.ok,
      detail: s.detail,
    })),
  });
}
