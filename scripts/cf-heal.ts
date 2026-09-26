#!/usr/bin/env tsx
/**
 * cf-heal.ts — Heal broken CharmLink custom domains (525 SSL race + gray-cloud stuck).
 *
 * Usage:
 *   npm run cf-heal -- example.com          # heal a single domain
 *   npm run cf-heal -- --all                # heal every unhealthy domain in charmlink_creator_domains
 *   npm run cf-heal -- example.com --force  # also proactively re-issue the origin cert on an
 *                                           # already-healthy domain (used by the domain monitor
 *                                           # when a cert expires within 14 days)
 *
 * Behavior per domain:
 *   1. HEAD https://${domain}/ — if < 500, log "healthy, no-op" and skip.
 *   2. If 5xx (especially 525): call provisionZone (idempotent gray→cert→orange fix).
 *   3. With --force, a healthy domain additionally gets a proactive Vercel cert reissue
 *      (proxy state untouched). A failed forced reissue is logged but is NOT a heal failure.
 *   4. Log result.
 *
 * Exit code: 0 if all domains healed (or already healthy), 1 if any domain failed.
 *
 * Requires:
 *   - CLOUDFLARE_API_TOKEN (or ~/.openclaw/cloudflare-token)
 *   - VERCEL_API_TOKEN (or ~/.openclaw/vercel-token)
 *   - VERCEL_TEAM_ID — required for /v4/certs. Auto-resolved in order:
 *       1. env var
 *       2. ~/.openclaw/vercel-team-id file
 *       3. Auto-discovered via Vercel /v2/teams (single-team accounts only)
 *   - DATABASE_URL (only needed for --all mode)
 */

import path from "path";
import fs from "fs";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { Pool } from "pg";

const execFileAsync = promisify(execFile);

// ── Token resolution ──────────────────────────────────────────────────────────

function resolveToken(envVar: string, filePath: string): string | null {
  if (process.env[envVar]) return process.env[envVar]!;
  const fullPath = path.join(os.homedir(), ".openclaw", filePath);
  try {
    const token = fs.readFileSync(fullPath, "utf-8").trim();
    if (token) {
      process.env[envVar] = token;
      return token;
    }
  } catch {
    // File not found or unreadable
  }
  return null;
}

// ── Health check ──────────────────────────────────────────────────────────────

async function isHealthy(domain: string): Promise<{ healthy: boolean; status?: number }> {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-s", "-o", "/dev/null", "-w", "%{http_code}",
      "--max-time", "10",
      "--location",
      `https://${domain}/`,
    ]);
    const status = parseInt(stdout.trim(), 10);
    return { healthy: status > 0 && status < 500, status };
  } catch {
    return { healthy: false };
  }
}

// ── Heal one domain ───────────────────────────────────────────────────────────

async function healDomain(
  domain: string,
  provisionZone: (d: string, opts?: { force?: boolean }) => Promise<{ ok: boolean; zoneFound: boolean; lookupError?: string; steps: Array<{ name: string; ok: boolean; detail?: string }> }>,
  force: boolean
): Promise<{ healed: boolean; wasHealthy: boolean; error?: string }> {
  const check = await isHealthy(domain);

  // A healthy domain still goes through provisionZone. It used to return here,
  // which meant a domain that was serving 200 while sitting GRAY-CLOUD (outside
  // Cloudflare entirely — no WAF, no Turnstile, origin exposed) could never be
  // detected or repaired by this script: "healthy" and "proxied" are different
  // questions and only one of them was being asked. provisionZone is idempotent
  // and, for a healthy domain, now does nothing but correct the proxy flag.
  if (check.healthy) {
    console.log(`  [cf-heal] ${domain}: serving OK (HTTP ${check.status}) — checking proxy state...`);
  } else {
    console.log(`  [cf-heal] ${domain}: unhealthy (HTTP ${check.status ?? "err"}), healing...`);
  }

  try {
    const result = await provisionZone(domain, { force });

    if (result.lookupError) {
      console.log(`  [cf-heal] ${domain}: ❌ CF zone lookup failed — ${result.lookupError}`);
      return { healed: false, wasHealthy: false, error: result.lookupError };
    }
    if (!result.zoneFound) {
      console.log(`  [cf-heal] ${domain}: ❌ CF zone not found — add zone to Cloudflare first`);
      return { healed: false, wasHealthy: false, error: "CF zone not found" };
    }

    const failedSteps = result.steps.filter((s) => !s.ok);
    const proxyStep = result.steps.find((s) => s.name === "proxyStateRepair");

    // --force: provisionZone only adds this step on its already-healthy branch
    // (the unhealthy path issues a cert as part of the normal heal). Surface it
    // here so a proactive reissue — or its failure — is visible in the log; it
    // never changes the healed/failed outcome below.
    if (force && check.healthy) {
      const forceStep = result.steps.find((s) => s.name === "forceCertReissue");
      console.log(`  [cf-heal] ${domain}: 🔄 forced cert reissue requested`);
      if (forceStep?.ok && forceStep.detail?.includes("already-exists")) {
        // Vercel 409 no-op: the existing cert is still valid, nothing was renewed.
        console.log(`  [cf-heal] ${domain}: ℹ️  cert still valid — Vercel returned no-op (autoRenew will handle renewal)`);
      } else if (forceStep) {
        console.log(`  [cf-heal] ${domain}: ${forceStep.ok ? "✅" : "⚠️ "} forceCertReissue — ${forceStep.detail ?? (forceStep.ok ? "ok" : "failed")}`);
      } else {
        console.log(`  [cf-heal] ${domain}: ⚠️  forceCertReissue did not run (domain went unhealthy before provisioning — normal heal path applies)`);
      }
    }

    if (result.ok) {
      // Distinguish "nothing needed doing" from "was silently unproxied and is
      // now behind Cloudflare again" — the whole point of not returning early.
      if (check.healthy && proxyStep?.detail === "already orange-cloud") {
        console.log(`  [cf-heal] ${domain}: ✅ healthy and proxied, no-op`);
        return { healed: true, wasHealthy: true };
      }
      if (proxyStep?.detail?.startsWith("flipped gray→orange")) {
        console.log(`  [cf-heal] ${domain}: ✅ was GRAY-CLOUD — flipped to orange and verified`);
        return { healed: true, wasHealthy: false };
      }
      console.log(`  [cf-heal] ${domain}: ✅ healed`);
      return { healed: true, wasHealthy: false };
    } else {
      const detail = failedSteps.map((s) => `${s.name}: ${s.detail ?? "failed"}`).join("; ");
      console.log(`  [cf-heal] ${domain}: ⚠️  partial heal — ${detail}`);
      // Check health after attempt. A serving domain is NOT enough on its own:
      // an unproxied one serves perfectly, so a failed proxy repair must still
      // count as a failure rather than being masked by a 200.
      const recheck = await isHealthy(domain);
      if (recheck.healthy && proxyStep?.ok !== false) {
        console.log(`  [cf-heal] ${domain}: ✅ domain is now healthy (HTTP ${recheck.status})`);
        return { healed: true, wasHealthy: false };
      }
      if (recheck.healthy && proxyStep?.ok === false) {
        console.log(`  [cf-heal] ${domain}: ❌ serving (HTTP ${recheck.status}) but NOT proxied — ${proxyStep.detail}`);
      }
      return { healed: false, wasHealthy: false, error: detail };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  [cf-heal] ${domain}: ❌ ${msg}`);
    return { healed: false, wasHealthy: false, error: msg };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const healAll = args.includes("--all");
  // filter, not find: the CLI accepts several domains and used to silently drop
  // every one after the first, so a batch invocation reported a clean run having
  // never touched most of what was passed to it.
  const namedDomains = args.filter((a) => !a.startsWith("--"));
  // --force used to be swallowed by the filter above and never acted on, so the
  // monitor's "reissue this expiring cert" call silently did nothing. It now
  // requests a proactive cert reissue on domains that are already healthy.
  const force = args.includes("--force");

  if (!healAll && namedDomains.length === 0) {
    console.error("Usage: npm run cf-heal -- <domain> [domain...] [--force]  OR  npm run cf-heal -- --all [--force]");
    console.error("  --force  proactively re-issue the origin cert on an already-healthy domain");
    process.exit(1);
  }

  // Resolve tokens
  const cfToken = resolveToken("CLOUDFLARE_API_TOKEN", "cloudflare-token");
  if (!cfToken) {
    console.error("❌ CLOUDFLARE_API_TOKEN is not set and ~/.openclaw/cloudflare-token not found");
    process.exit(1);
  }
  console.log(`✅ CF token resolved (${cfToken.slice(0, 8)}...)`);

  const vercelToken = resolveToken("VERCEL_API_TOKEN", "vercel-token");
  if (vercelToken) {
    console.log(`✅ Vercel token resolved (${vercelToken.slice(0, 8)}...)`);
  } else {
    console.log("⚠️  VERCEL_API_TOKEN not set — cert issuance will be skipped");
  }

  // VERCEL_TEAM_ID is required by /v4/certs. Resolve in order:
  //   1. env var (already set)
  //   2. ~/.openclaw/vercel-team-id file
  //   3. Auto-discover via Vercel API /v2/teams (uses first team if only one)
  if (!process.env.VERCEL_TEAM_ID) {
    const fromFile = resolveToken("VERCEL_TEAM_ID", "vercel-team-id");
    if (fromFile) {
      console.log(`✅ Vercel team id resolved from file (${fromFile.slice(0, 12)}...)`);
    } else if (vercelToken) {
      try {
        const { stdout } = await execFileAsync("curl", [
          "-s", "--max-time", "10",
          "-H", `Authorization: Bearer ${vercelToken}`,
          "https://api.vercel.com/v2/teams",
        ]);
        const data = JSON.parse(stdout) as { teams?: Array<{ id: string }> };
        if (data.teams && data.teams.length === 1) {
          process.env.VERCEL_TEAM_ID = data.teams[0].id;
          console.log(`✅ Vercel team id auto-discovered (${data.teams[0].id.slice(0, 12)}...)`);
        } else if (data.teams && data.teams.length > 1) {
          console.log(`⚠️  Multiple Vercel teams found (${data.teams.length}). Set VERCEL_TEAM_ID env var or write ~/.openclaw/vercel-team-id explicitly.`);
        } else {
          console.log("⚠️  No Vercel teams returned by API — cert issuance may silently 403");
        }
      } catch (err) {
        console.log(`⚠️  Vercel team auto-discovery failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      console.log("⚠️  VERCEL_TEAM_ID not set and no Vercel token to auto-discover — cert issuance may silently 403");
    }
  } else {
    console.log(`✅ Vercel team id resolved from env (${process.env.VERCEL_TEAM_ID.slice(0, 12)}...)`);
  }

  // Import provisioning after env vars are set
  const { provisionZone } = await import("../lib/cloudflare");

  let domains: string[];

  if (namedDomains.length > 0 && !healAll) {
    domains = namedDomains;
  } else {
    // --all: fetch every domain from charmlink_creator_domains
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error("❌ DATABASE_URL is not set (required for --all)");
      console.error("   Source it with: export DATABASE_URL=$(cat ~/.openclaw/charmasutra-db)");
      process.exit(1);
    }

    const pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      max: 2,
      connectionTimeoutMillis: 15000,
    });

    try {
      const result = await pool.query<{ domain: string }>(
        `SELECT domain FROM charmlink_creator_domains ORDER BY domain`
      );
      domains = result.rows.map((r) => r.domain);
      console.log(`\n📋 Found ${domains.length} domain(s) in charmlink_creator_domains`);
    } finally {
      await pool.end();
    }
  }

  console.log(`\n🔧 Healing ${domains.length} domain(s)...\n`);

  let failCount = 0;
  let noopCount = 0;
  let healedCount = 0;

  for (const domain of domains) {
    const result = await healDomain(domain, provisionZone, force);
    if (result.wasHealthy) {
      noopCount++;
    } else if (result.healed) {
      healedCount++;
    } else {
      failCount++;
    }
  }

  console.log("\n── Summary ──────────────────────────────────────────");
  console.log(`   checked: ${domains.length} domain(s): ${domains.join(", ")}`);
  // Wording is deliberate: the old summary said "already healthy", which was
  // true of a gray-cloud domain serving 200 from Vercel and read as all-clear
  // while it sat outside Cloudflare. Serving is not the claim being made here.
  console.log(`   ✅ healthy AND proxied (no-op): ${noopCount}`);
  console.log(`   ✅ repaired:                    ${healedCount}`);
  console.log(`   ❌ failed:                      ${failCount}`);

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
