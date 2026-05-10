#!/usr/bin/env tsx
/**
 * cf-backfill.ts — Idempotent Cloudflare zone provisioning for all creators with custom domains.
 *
 * Usage:
 *   npm run cf-backfill
 *   npm run cf-backfill -- --dry-run
 *
 * Requires:
 *   - DATABASE_URL env var (pull from Vercel: `vercel env pull .env.local`)
 *   - CLOUDFLARE_API_TOKEN env var (or ~/.openclaw/cloudflare-token fallback for local use)
 */

import { Pool } from "pg";
import path from "path";
import fs from "fs";
import os from "os";

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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  if (dryRun) {
    console.log("🔍 DRY RUN — no writes will be made to Cloudflare\n");
  }

  // 1. Set up token
  let token: string;
  try {
    token = resolveCloudflareToken();
    console.log(`✅ CF token resolved (${token.slice(0, 8)}...)\n`);
  } catch (err) {
    console.error(`❌ Token error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // 2. Verify token with CF API
  // Import after token is set so env var is available
  const { verifyToken, provisionZone } = await import("../lib/cloudflare");

  console.log("Verifying Cloudflare token...");
  const verify = await verifyToken();
  if (!verify.ok) {
    console.error(`❌ CF token verification failed: ${verify.error}`);
    process.exit(1);
  }
  console.log(`✅ Token OK — ${verify.zonesAccessible} zone(s) accessible\n`);

  // 3. Connect to DB
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL is not set");
    console.error(
      "   Pull from Vercel with: vercel env pull .env.local && source .env.local"
    );
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    max: 3,
    connectionTimeoutMillis: 15000,
  });

  let rows: Array<{ slug: string; custom_domain: string }>;
  try {
    const result = await pool.query<{ slug: string; custom_domain: string }>(
      `SELECT slug, custom_domain FROM charmlink_creators
       WHERE custom_domain IS NOT NULL AND custom_domain <> ''
       ORDER BY slug`
    );
    rows = result.rows;
    console.log(`📋 Found ${rows.length} creator(s) with custom domains\n`);
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

  // 4. Provision each domain
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

  for (const row of rows) {
    const domain = row.custom_domain;
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

      // Defense-in-depth: sync widget allow-list. Idempotent — addHostnameToWidget
      // fetches the widget first and only PUTs when the hostname is missing.
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
    } catch (err) {
      console.log(`❌  ${err instanceof Error ? err.message : err}`);
      errorCount++;
    }
  }

  // 5. Summary
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
