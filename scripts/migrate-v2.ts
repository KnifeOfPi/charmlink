/**
 * CharmLink Migration v2
 * Adds new columns for subtitle, badges, sensitive content, tags, notes,
 * image button links, deeplinking, redirect, and location display features.
 *
 * Usage:
 *   npx tsx scripts/migrate-v2.ts
 *
 * Requires: DATABASE_URL env var
 */

import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  // ── charmlink_links columns ────────────────────────────────────────────────
  {
    name: "links.subtitle",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS subtitle TEXT DEFAULT ''`,
  },
  {
    name: "links.image_url",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT ''`,
  },
  {
    name: "links.deeplink_enabled",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS deeplink_enabled BOOLEAN DEFAULT false`,
  },
  {
    name: "links.recovery_url",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS recovery_url TEXT DEFAULT ''`,
  },
  {
    name: "links.redirect_url",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS redirect_url TEXT DEFAULT ''`,
  },
  {
    name: "links.sensitive",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS sensitive BOOLEAN DEFAULT false`,
  },
  {
    name: "links.badge",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS badge VARCHAR(20) DEFAULT NULL`,
  },
  {
    name: "links.notes",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`,
  },
  {
    name: "links.tags",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'`,
  },
  // ── charmlink_creators columns ─────────────────────────────────────────────
  {
    name: "creators.show_location",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS show_location BOOLEAN DEFAULT false`,
  },
  {
    name: "creators.location_type",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS location_type VARCHAR(20) DEFAULT 'ip_auto'`,
  },
  {
    name: "creators.sensitive_default",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS sensitive_default BOOLEAN DEFAULT false`,
  },
];

async function runMigrationV2() {
  const client = await pool.connect();
  try {
    console.log("🔄 Running CharmLink v2 schema migration...\n");

    for (const migration of MIGRATIONS) {
      try {
        await client.query(migration.sql);
        console.log(`  ✅ ${migration.name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ❌ ${migration.name}: ${msg}`);
        throw err;
      }
    }

    console.log("\n🎉 Migration v2 complete!");
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrationV2().catch((err) => {
  console.error("❌ Migration v2 failed:", err);
  process.exit(1);
});
