/**
 * CharmLink Migration Script
 * Usage:
 *   npx tsx scripts/migrate.ts            # run schema only
 *   npx tsx scripts/migrate.ts --seed     # run schema + import creators.json
 *
 * Requires: DATABASE_URL env var
 */

import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS charmlink_creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  tagline TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  custom_domain VARCHAR(255) UNIQUE,
  theme_bg VARCHAR(20) DEFAULT '#0a0a0a',
  theme_accent VARCHAR(20) DEFAULT '#e91e8a',
  theme_text VARCHAR(20) DEFAULT '#ffffff',
  is_active BOOLEAN DEFAULT true,
  show_location BOOLEAN DEFAULT false,
  location_type VARCHAR(20) DEFAULT 'ip_auto',
  sensitive_default BOOLEAN DEFAULT false,
  -- v3: background
  bg_type VARCHAR(20) DEFAULT 'solid',
  bg_gradient_type VARCHAR(20) DEFAULT 'linear',
  bg_gradient_direction VARCHAR(30) DEFAULT 'to bottom',
  bg_color_2 VARCHAR(20) DEFAULT '#1a1a2e',
  bg_color_3 VARCHAR(20) DEFAULT NULL,
  -- v3: floating icons
  show_floating_icons BOOLEAN DEFAULT false,
  floating_icon VARCHAR(10) DEFAULT '💫',
  floating_icon_count INT DEFAULT 8,
  -- v3: stars
  show_stars BOOLEAN DEFAULT false,
  stars_count INT DEFAULT 50,
  stars_color VARCHAR(20) DEFAULT '#ffffff',
  animation_speed INT DEFAULT 10,
  -- v3: avatar border
  avatar_border_style VARCHAR(20) DEFAULT 'solid',
  avatar_border_color_1 VARCHAR(20) DEFAULT '#ffffff',
  avatar_border_color_2 VARCHAR(20) DEFAULT '#f472b6',
  avatar_border_color_3 VARCHAR(20) DEFAULT '#fda4af',
  -- v3: misc
  is_verified BOOLEAN DEFAULT false,
  font VARCHAR(30) DEFAULT 'inter',
  location_pill_color VARCHAR(20) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS charmlink_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES charmlink_creators(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  icon VARCHAR(50) DEFAULT 'link',
  link_type VARCHAR(20) NOT NULL CHECK (link_type IN ('social', 'premium')),
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  subtitle TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  deeplink_enabled BOOLEAN DEFAULT false,
  recovery_url TEXT DEFAULT '',
  redirect_url TEXT DEFAULT '',
  sensitive BOOLEAN DEFAULT false,
  badge VARCHAR(20) DEFAULT NULL,
  notes TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  -- v3: text glow
  show_text_glow BOOLEAN DEFAULT false,
  text_glow_color VARCHAR(20) DEFAULT '#ffffff',
  text_glow_intensity INT DEFAULT 5,
  -- v3: hover & border
  hover_animation VARCHAR(20) DEFAULT NULL,
  border_color VARCHAR(20) DEFAULT NULL,
  show_border BOOLEAN DEFAULT false,
  -- v3: per-link overrides
  title_color VARCHAR(20) DEFAULT NULL,
  title_font_size VARCHAR(10) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS charmlink_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('pageview', 'click')),
  creator_id UUID REFERENCES charmlink_creators(id) ON DELETE SET NULL,
  creator_slug VARCHAR(100),
  link_label VARCHAR(255),
  link_url TEXT,
  link_type VARCHAR(20),
  session_id VARCHAR(100),
  user_agent TEXT,
  referer TEXT,
  country VARCHAR(10),
  device VARCHAR(20),
  is_bot BOOLEAN DEFAULT false,
  is_instagram BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_charmlink_events_creator ON charmlink_events(creator_slug);
CREATE INDEX IF NOT EXISTS idx_charmlink_events_created ON charmlink_events(created_at);
CREATE INDEX IF NOT EXISTS idx_charmlink_creators_domain ON charmlink_creators(custom_domain);
CREATE INDEX IF NOT EXISTS idx_charmlink_creators_slug ON charmlink_creators(slug);
`;

interface JsonCreator {
  name: string;
  tagline: string;
  avatar: string;
  socialLinks: Array<{ label: string; url: string; icon: string }>;
  premiumLinks: Array<{ label: string; url: string; icon: string }>;
  theme: { bgColor: string; accentColor: string; textColor: string };
}

interface CreatorsJson {
  [slug: string]: JsonCreator;
}

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log("🔄 Running schema migration...");
    await client.query(SCHEMA_SQL);
    console.log("✅ Schema created/verified");

    const shouldSeed = process.argv.includes("--seed");
    if (!shouldSeed) {
      console.log("\n💡 Tip: Run with --seed to import creators.json data");
      return;
    }

    const creatorsPath = path.join(process.cwd(), "creators.json");
    if (!fs.existsSync(creatorsPath)) {
      console.log("⚠️  creators.json not found, skipping seed");
      return;
    }

    const creatorsData: CreatorsJson = JSON.parse(fs.readFileSync(creatorsPath, "utf8"));
    const slugs = Object.keys(creatorsData);

    console.log(`\n🌱 Seeding ${slugs.length} creators from creators.json...`);

    for (const slug of slugs) {
      const c = creatorsData[slug];

      // Check if already exists
      const existing = await client.query(
        "SELECT id FROM charmlink_creators WHERE slug = $1",
        [slug]
      );

      let creatorId: string;

      if (existing.rows.length > 0) {
        creatorId = existing.rows[0].id as string;
        console.log(`  ⏭  ${slug} already exists, updating...`);
        await client.query(
          `UPDATE charmlink_creators SET
            name = $2, tagline = $3, avatar_url = $4,
            theme_bg = $5, theme_accent = $6, theme_text = $7,
            updated_at = NOW()
           WHERE id = $1`,
          [
            creatorId,
            c.name,
            c.tagline,
            c.avatar,
            c.theme.bgColor,
            c.theme.accentColor,
            c.theme.textColor,
          ]
        );
      } else {
        const res = await client.query(
          `INSERT INTO charmlink_creators
            (slug, name, tagline, avatar_url, theme_bg, theme_accent, theme_text)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [
            slug,
            c.name,
            c.tagline,
            c.avatar,
            c.theme.bgColor,
            c.theme.accentColor,
            c.theme.textColor,
          ]
        );
        creatorId = res.rows[0].id as string;
        console.log(`  ✅ Created ${slug} (${c.name})`);
      }

      // Delete existing links for this creator (re-seed fresh)
      await client.query("DELETE FROM charmlink_links WHERE creator_id = $1", [creatorId]);

      // Insert social links
      for (let i = 0; i < c.socialLinks.length; i++) {
        const l = c.socialLinks[i];
        await client.query(
          `INSERT INTO charmlink_links (creator_id, label, url, icon, link_type, sort_order)
           VALUES ($1,$2,$3,$4,'social',$5)`,
          [creatorId, l.label, l.url, l.icon, i]
        );
      }

      // Insert premium links
      for (let i = 0; i < c.premiumLinks.length; i++) {
        const l = c.premiumLinks[i];
        await client.query(
          `INSERT INTO charmlink_links (creator_id, label, url, icon, link_type, sort_order)
           VALUES ($1,$2,$3,$4,'premium',$5)`,
          [creatorId, l.label, l.url, l.icon, i]
        );
      }

      console.log(
        `     → ${c.socialLinks.length} social + ${c.premiumLinks.length} premium links`
      );
    }

    console.log("\n🎉 Seed complete!");
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
