/**
 * CharmLink Migration v3
 * Adds new columns for visual upgrades: gradients, floating icons, stars,
 * avatar border styles, verified badge, font selection, location pill,
 * link text glow, hover animations, border styling, per-link overrides.
 *
 * Usage:
 *   DATABASE_URL="..." npx tsx scripts/migrate-v3.ts
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
  // ── charmlink_creators: background ────────────────────────────────────────
  {
    name: "creators.bg_type",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS bg_type VARCHAR(20) DEFAULT 'solid'`,
  },
  {
    name: "creators.bg_gradient_type",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS bg_gradient_type VARCHAR(20) DEFAULT 'linear'`,
  },
  {
    name: "creators.bg_gradient_direction",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS bg_gradient_direction VARCHAR(30) DEFAULT 'to bottom'`,
  },
  {
    name: "creators.bg_color_2",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS bg_color_2 VARCHAR(20) DEFAULT '#1a1a2e'`,
  },
  {
    name: "creators.bg_color_3",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS bg_color_3 VARCHAR(20) DEFAULT NULL`,
  },
  // ── charmlink_creators: floating icons ────────────────────────────────────
  {
    name: "creators.show_floating_icons",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS show_floating_icons BOOLEAN DEFAULT false`,
  },
  {
    name: "creators.floating_icon",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS floating_icon VARCHAR(10) DEFAULT '💫'`,
  },
  {
    name: "creators.floating_icon_count",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS floating_icon_count INT DEFAULT 8`,
  },
  // ── charmlink_creators: stars ─────────────────────────────────────────────
  {
    name: "creators.show_stars",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS show_stars BOOLEAN DEFAULT false`,
  },
  {
    name: "creators.stars_count",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS stars_count INT DEFAULT 50`,
  },
  {
    name: "creators.stars_color",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS stars_color VARCHAR(20) DEFAULT '#ffffff'`,
  },
  {
    name: "creators.animation_speed",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS animation_speed INT DEFAULT 10`,
  },
  // ── charmlink_creators: avatar border ─────────────────────────────────────
  {
    name: "creators.avatar_border_style",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS avatar_border_style VARCHAR(20) DEFAULT 'solid'`,
  },
  {
    name: "creators.avatar_border_color_1",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS avatar_border_color_1 VARCHAR(20) DEFAULT '#ffffff'`,
  },
  {
    name: "creators.avatar_border_color_2",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS avatar_border_color_2 VARCHAR(20) DEFAULT '#f472b6'`,
  },
  {
    name: "creators.avatar_border_color_3",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS avatar_border_color_3 VARCHAR(20) DEFAULT '#fda4af'`,
  },
  // ── charmlink_creators: misc ──────────────────────────────────────────────
  {
    name: "creators.is_verified",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false`,
  },
  {
    name: "creators.font",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS font VARCHAR(30) DEFAULT 'inter'`,
  },
  {
    name: "creators.location_pill_color",
    sql: `ALTER TABLE charmlink_creators ADD COLUMN IF NOT EXISTS location_pill_color VARCHAR(20) DEFAULT NULL`,
  },
  // ── charmlink_links: text glow ────────────────────────────────────────────
  {
    name: "links.show_text_glow",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS show_text_glow BOOLEAN DEFAULT false`,
  },
  {
    name: "links.text_glow_color",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS text_glow_color VARCHAR(20) DEFAULT '#ffffff'`,
  },
  {
    name: "links.text_glow_intensity",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS text_glow_intensity INT DEFAULT 5`,
  },
  // ── charmlink_links: hover & border ──────────────────────────────────────
  {
    name: "links.hover_animation",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS hover_animation VARCHAR(20) DEFAULT NULL`,
  },
  {
    name: "links.border_color",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS border_color VARCHAR(20) DEFAULT NULL`,
  },
  {
    name: "links.show_border",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS show_border BOOLEAN DEFAULT false`,
  },
  // ── charmlink_links: per-link overrides ───────────────────────────────────
  {
    name: "links.title_color",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS title_color VARCHAR(20) DEFAULT NULL`,
  },
  {
    name: "links.title_font_size",
    sql: `ALTER TABLE charmlink_links ADD COLUMN IF NOT EXISTS title_font_size VARCHAR(10) DEFAULT NULL`,
  },
];

async function runMigrationV3() {
  const client = await pool.connect();
  try {
    console.log("🔄 Running CharmLink v3 schema migration...\n");

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

    console.log("\n🎉 Migration v3 complete!");
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrationV3().catch((err) => {
  console.error("❌ Migration v3 failed:", err);
  process.exit(1);
});
