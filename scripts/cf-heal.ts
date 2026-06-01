#!/usr/bin/env tsx
/**
 * cf-heal.ts — Heal broken CharmLink custom domains (525 SSL race + gray-cloud stuck).
 *
 * Usage:
 *   npm run cf-heal -- example.com          # heal a single domain
 *   npm run cf-heal -- --all                # heal every unhealthy domain in charmlink_creator_domains
 *
 * Behavior per domain:
 *   1. HEAD https://${domain}/ — if < 500, log "healthy, no-op" and skip.
 *   2. If 5xx (especially 525): call provisionZone (idempotent gray→cert→orange fix).
 *   3. Log result.
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
  provisionZone: (d: string) => Promise<{ ok: boolean; zoneFound: boolean; steps: Array<{ name: string; ok: boolean; detail?: string }> }>
): Promise<{ healed: boolean; wasHealthy: boolean; error?: string }> {
  const check = await isHealthy(domain);

  if (check.healthy) {
    console.log(`  [cf-heal] ${domain}: healthy (HTTP ${check.status}), no-op`);
    return { healed: true, wasHealthy: true };
  }

  console.log(`  [cf-heal] ${domain}: unhealthy (HTTP ${check.status ?? "err"}), healing...`);

  try {
    const result = await provisionZone(domain);

    if (!result.zoneFound) {
      console.log(`  [cf-heal] ${domain}: ❌ CF zone not found — add zone to Cloudflare first`);
      return { healed: false, wasHealthy: false, error: "CF zone not found" };
    }

    const failedSteps = result.steps.filter((s) => !s.ok);
    if (result.ok) {
      console.log(`  [cf-heal] ${domain}: ✅ healed`);
      return { healed: true, wasHealthy: false };
    } else {
      const detail = failedSteps.map((s) => `${s.name}: ${s.detail ?? "failed"}`).join("; ");
      console.log(`  [cf-heal] ${domain}: ⚠️  partial heal — ${detail}`);
      // Check health after attempt
      const recheck = await isHealthy(domain);
      if (recheck.healthy) {
        console.log(`  [cf-heal] ${domain}: ✅ domain is now healthy (HTTP ${recheck.status})`);
        return { healed: true, wasHealthy: false };
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
  const singleDomain = args.find((a) => !a.startsWith("--"));

  if (!healAll && !singleDomain) {
    console.error("Usage: npm run cf-heal -- <domain>  OR  npm run cf-heal -- --all");
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

  if (singleDomain && !healAll) {
    domains = [singleDomain];
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
    const result = await healDomain(domain, provisionZone);
    if (result.wasHealthy) {
      noopCount++;
    } else if (result.healed) {
      healedCount++;
    } else {
      failCount++;
    }
  }

  console.log("\n── Summary ──────────────────────────────────────────");
  console.log(`   ✅ already healthy (no-op): ${noopCount}`);
  console.log(`   ✅ healed:                  ${healedCount}`);
  console.log(`   ❌ failed:                  ${failCount}`);

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
