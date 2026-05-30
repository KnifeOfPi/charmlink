#!/usr/bin/env tsx
/**
 * cf-backfill.ts — Idempotent Cloudflare zone provisioning for all creators with custom domains.
 *
 * Usage:
 *   npm run cf-backfill
 *   npm run cf-backfill -- --dry-run
 *
 * Requires:
 *   - DATABASE_URL env var (or source ~/.openclaw/charmasutra-db)
 *   - CLOUDFLARE_API_TOKEN env var (or ~/.openclaw/cloudflare-token fallback for local use)
 *   - VERCEL_API_TOKEN env var (or ~/.openclaw/vercel-token fallback) — needed for cert issuance
 *   - VERCEL_TEAM_ID env var — required for /v4/certs; without it the API silently 403s
 */

import { Pool } from "pg";
import path from "path";
import fs from "fs";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// ── Token resolution (script-only: env first, then local file) ────────────────

function resolveCloudflareToken(): string {
  if (process.env.CLOUDFLARE_API_TOKEN) {
    return process.env.CLOUDFLARE_API_TOKEN;
  }
  // Local fallback for development — never used in lib/ code
  const filePath = path.join(os.homedir(), ".openclaw", "cloudflare-token");
  try {
    const token = fs.readFileSync(filePath, "utf-8").trim();
    if (token) {
      process.env.CLOUDFLARE_API_TOKEN = token;
      return token;
    }
  } catch {
    // File not found or unreadable
  }
  throw new Error(
    "CLOUDFLARE_API_TOKEN is not set and ~/.openclaw/cloudflare-token not found"
  );
}

function resolveVercelToken(): string | null {
  if (process.env.VERCEL_API_TOKEN) {
    return process.env.VERCEL_API_TOKEN;
  }
  const filePath = path.join(os.homedir(), ".openclaw", "vercel-token");
  try {
    const token = fs.readFileSync(filePath, "utf-8").trim();
    if (token) {
      process.env.VERCEL_API_TOKEN = token;
      return token;
    }
  } catch {
    // File not found or unreadable
  }
  return null;
}

// ── Chrome UA for verify step ─────────────────────────────────────────────────

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function verifyDomain(domain: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-s", "-o", "/dev/null", "-w", "%{http_code}",
      "--max-time", "15",
      "-A", CHROME_UA,
      `https://${domain}/`,
    ]);
    const status = parseInt(stdout.trim(), 10);
    return { ok: status === 200, status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  if (dryRun) {
    console.log("🔍 DRY RUN — no writes will be made to Cloudflare\n");
  }

  // 1. Set up CF token
  let token: string;
  try {
    token = resolveCloudflareToken();
    console.log(`✅ CF token resolved (${token.slice(0, 8)}...)\n`);
  } catch (err) {
    console.error(`❌ Token error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // 2. Set up Vercel token (needed for cert issuance inside provisionZone)
  const vercelToken = resolveVercelToken();
  if (vercelToken) {
    console.log(`✅ Vercel token resolved (${vercelToken.slice(0, 8)}...)`);
  } else {
    console.log("ℹ️  VERCEL_API_TOKEN not set — cert issuance will be skipped in provisionZone");
  }

  // 3. Ensure VERCEL_TEAM_ID is set — required for /v4/certs (account-scoped calls silently 403)
  if (!process.env.VERCEL_TEAM_ID) {
    console.log("⚠️  VERCEL_TEAM_ID not set — cert issuance may silently 403. Set it in your .env.local.");
  } else {
    console.log(`✅ VERCEL_TEAM_ID set (${process.env.VERCEL_TEAM_ID.slice(0, 10)}...)\n`);
  }

  // 4. Verify CF token with API
  // Import after token is set so env var is available
  const { verifyToken, provisionZone, setRecordProxied } = await import("../lib/cloudflare");

  console.log("Verifying Cloudflare token...");
  const verify = await verifyToken();
  if (!verify.ok) {
    console.error(`❌ CF token verification failed: ${verify.error}`);
    process.exit(1);
  }
  console.log(`✅ Token OK — ${verify.zonesAccessible} zone(s) accessible\n`);

  // 5. Connect to DB
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL is not set");
    console.error("   Source it with: export DATABASE_URL=$(cat ~/.openclaw/charmasutra-db)");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    max: 3,
    connectionTimeoutMillis: 15000,
  });

  // Query charmlink_creator_domains (Phase 6 join table — authoritative source)
  let rows: Array<{ slug: string; domain: string }>;
  try {
    const result = await pool.query<{ slug: string; domain: string }>(
      `SELECT c.slug, d.domain
       FROM charmlink_creator_domains d
       JOIN charmlink_creators c ON c.id = d.creator_id
       ORDER BY c.slug, d.domain`
    );
    rows = result.rows;
    console.log(`📋 Found ${rows.length} domain(s) in charmlink_creator_domains\n`);
  } catch (err) {
    console.error(`❌ DB query failed: ${err instanceof Error ? err.message : err}`);
    await pool.end();
    process.exit(1);
  } finally {
    await pool.end();
  }

  if (rows.length === 0) {
    console.log("Nothing to provision. Done.");
    process.exit(0);
  }

  // 6. Provision each domain
  const { addHostnameToWidget } = await import("../lib/turnstile-admin");
  const tsSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const tsAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const tsSyncEnabled = !!tsSiteKey && !!tsAccountId;
  if (!tsSyncEnabled) {
    console.log(
      `ℹ️  Turnstile widget sync DISABLED (missing ${
        !tsSiteKey ? "NEXT_PUBLIC_TURNSTILE_SITE_KEY" : ""
      }${!tsSiteKey && !tsAccountId ? " + " : ""}${
        !tsAccountId ? "CLOUDFLARE_ACCOUNT_ID" : ""
      })\n`
    );
  } else {
    console.log(`ℹ️  Turnstile widget sync ENABLED (sitekey ${tsSiteKey!.slice(0, 12)}…)\n`);
  }

  let okCount = 0;
  let zoneNotFoundCount = 0;
  let errorCount = 0;
  let tsAddedCount = 0;
  let tsErrorCount = 0;
  let verifyPassCount = 0;
  let verifyFailCount = 0;

  for (const row of rows) {
    const domain = row.domain;
    const slug = row.slug;
    process.stdout.write(`  ${slug} → ${domain} ... `);

    if (dryRun) {
      console.log("(dry run — skipped)");
      continue;
    }

    try {
      const result = await provisionZone(domain);

      if (!result.zoneFound) {
        console.log("⚠️  zone not in CF account");
        zoneNotFoundCount++;
        continue;
      }

      if (result.ok) {
        const stepSummary = result.steps
          .map((s) => `${s.ok ? "✓" : "✗"} ${s.name}`)
          .join(", ");
        console.log(`✅  [${stepSummary}]`);
        okCount++;
      } else {
        const failed = result.steps
          .filter((s) => !s.ok)
          .map((s) => `${s.name}: ${s.detail ?? "failed"}`)
          .join("; ");
        console.log(`⚠️  partial: ${failed}`);
        errorCount++;
      }

      // Gray→orange repair: if flipToProxied didn't succeed during provisionZone
      // (e.g. cert wasn't ready in time), try once more with a short wait.
      if (result.zoneFound && result.zone) {
        const flipOk = result.steps.find((s) => s.name === "flipToProxied")?.ok === true;
        if (!flipOk && vercelToken) {
          const { issueCert } = await import("../lib/vercel-domains");
          try {
            await issueCert(domain);
            const flip = await setRecordProxied(result.zone.id, domain, true);
            if (flip.updated) {
              process.stdout.write(`     ↳ orange-cloud flip (repair): ✓\n`);
            } else if (!flip.error) {
              process.stdout.write(`     ↳ orange-cloud: already proxied\n`);
            } else {
              process.stdout.write(`     ↳ orange-cloud flip error: ${flip.error}\n`);
            }
          } catch (err) {
            process.stdout.write(
              `     ↳ orange-cloud flip skipped: ${err instanceof Error ? err.message : String(err)}\n`
            );
          }
        }
      }

      // Turnstile widget allow-list sync (idempotent)
      if (tsSyncEnabled) {
        try {
          await addHostnameToWidget(tsSiteKey!, domain);
          process.stdout.write(`     ↳ turnstile widget: ✓ ${domain}\n`);
          tsAddedCount++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stdout.write(`     ↳ turnstile widget: ❌ ${msg}\n`);
          tsErrorCount++;
        }
      }

      // Verify step: Chrome UA HEAD — confirm the domain serves HTTP 200
      process.stdout.write(`     ↳ verify (Chrome UA): `);
      const verifyResult = await verifyDomain(domain);
      if (verifyResult.ok) {
        process.stdout.write(`✅ HTTP ${verifyResult.status}\n`);
        verifyPassCount++;
      } else {
        process.stdout.write(
          `❌ HTTP ${verifyResult.status ?? "err"} ${verifyResult.error ?? ""}\n`
        );
        verifyFailCount++;
      }
    } catch (err) {
      console.log(`❌  ${err instanceof Error ? err.message : err}`);
      errorCount++;
    }
  }

  // 7. Summary
  console.log("\n── Summary ──────────────────────────────────────────");
  if (dryRun) {
    console.log(`   Would have processed: ${rows.length} domain(s)`);
  } else {
    console.log(`   ✅ ok:                ${okCount}`);
    console.log(`   ⚠️  zoneNotFound:      ${zoneNotFoundCount}`);
    console.log(`   ❌ errors:             ${errorCount}`);
    if (tsSyncEnabled) {
      console.log(`   🔐 turnstile synced:   ${tsAddedCount}`);
      console.log(`   🔐 turnstile errors:   ${tsErrorCount}`);
    }
    console.log(`   🌐 verify pass:        ${verifyPassCount}`);
    console.log(`   🌐 verify fail:        ${verifyFailCount}`);
  }

  if (zoneNotFoundCount > 0) {
    console.log(
      "\n   For zones not found: add the domain to Cloudflare, update registrar NSes, wait for active, then re-run."
    );
  }

  // Exit 0 on success (zoneNotFound is a warning, not failure). Exit 1 on hard errors.
  const exitCode = errorCount > 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
