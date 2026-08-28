-- Model grouping: one person, many sites.
--
-- A creator row is really a SITE (slug + custom domain), not a person. Nearly
-- half the table was duplicate people — Hanna Zuki alone had 6 rows — which
-- meant her avatars had to be uploaded and tuned six times and her photo
-- experiment ran six separate, slow-converging tests.
--
-- charmlink_models is the person. Creators point at one, and the model owns the
-- shared identity (name, tagline, theme, avatar frame) plus the avatar pool.
-- Links stay per-creator: each domain keeps its own premium tracking link.
--
-- Grouping is by EXACT name only. It deliberately does not fuzzy-match, because
-- the live data contains both "Hanna Zuki"/"Hanna" and "Kaia"/"Kaia ♡" — pairs
-- that are probably the same person but cannot be proven so from the data.
-- Those are left split for a human to merge in the admin.

CREATE TABLE IF NOT EXISTS charmlink_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  theme_bg TEXT NOT NULL DEFAULT '#0a0a0a',
  theme_accent TEXT NOT NULL DEFAULT '#e91e8a',
  theme_text TEXT NOT NULL DEFAULT '#ffffff',
  bg_type TEXT NOT NULL DEFAULT 'solid',
  bg_gradient_type TEXT NOT NULL DEFAULT 'linear',
  bg_gradient_direction TEXT NOT NULL DEFAULT 'to bottom',
  bg_color_2 TEXT NOT NULL DEFAULT '#1a1a2e',
  bg_color_3 TEXT,
  avatar_shape TEXT NOT NULL DEFAULT 'circle',
  avatar_border_style TEXT NOT NULL DEFAULT 'solid',
  avatar_border_color_1 TEXT NOT NULL DEFAULT '#ffffff',
  avatar_border_color_2 TEXT NOT NULL DEFAULT '#f472b6',
  avatar_border_color_3 TEXT NOT NULL DEFAULT '#fda4af',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  font TEXT NOT NULL DEFAULT 'inter',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE charmlink_models DROP CONSTRAINT IF EXISTS charmlink_models_avatar_shape_valid;
ALTER TABLE charmlink_models ADD CONSTRAINT charmlink_models_avatar_shape_valid
  CHECK (avatar_shape IN ('circle','portrait','square'));

-- ON DELETE SET NULL: deleting a model must never take live sites down with it;
-- they fall back to their own columns.
ALTER TABLE charmlink_creators
  ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES charmlink_models(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_charmlink_creators_model ON charmlink_creators (model_id);

ALTER TABLE charmlink_creator_avatars
  ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES charmlink_models(id) ON DELETE CASCADE;
ALTER TABLE charmlink_creator_avatars ALTER COLUMN creator_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_charmlink_creator_avatars_model
  ON charmlink_creator_avatars (model_id, is_active, is_pinned);

-- Exactly one owner, or the rotation would find the same photo twice.
ALTER TABLE charmlink_creator_avatars DROP CONSTRAINT IF EXISTS charmlink_creator_avatars_one_owner;
ALTER TABLE charmlink_creator_avatars ADD CONSTRAINT charmlink_creator_avatars_one_owner
  CHECK (num_nonnulls(creator_id, model_id) = 1);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Shared look is copied from each name's highest-traffic site, so the most
-- established presentation becomes canonical rather than the oldest row.
WITH views AS (
  SELECT creator_slug, COUNT(*) AS v FROM charmlink_events WHERE type='pageview' GROUP BY creator_slug
),
canon AS (
  SELECT DISTINCT ON (c.name) c.* FROM charmlink_creators c
  LEFT JOIN views v ON v.creator_slug = c.slug
  ORDER BY c.name, COALESCE(v.v,0) DESC, c.created_at ASC
),
ins AS (
  INSERT INTO charmlink_models
    (name, tagline, theme_bg, theme_accent, theme_text, bg_type, bg_gradient_type,
     bg_gradient_direction, bg_color_2, bg_color_3, avatar_shape, avatar_border_style,
     avatar_border_color_1, avatar_border_color_2, avatar_border_color_3, is_verified, font)
  SELECT name, COALESCE(tagline,''), COALESCE(theme_bg,'#0a0a0a'), COALESCE(theme_accent,'#e91e8a'),
         COALESCE(theme_text,'#ffffff'), COALESCE(bg_type,'solid'), COALESCE(bg_gradient_type,'linear'),
         COALESCE(bg_gradient_direction,'to bottom'), COALESCE(bg_color_2,'#1a1a2e'), bg_color_3,
         COALESCE(avatar_shape,'circle'), COALESCE(avatar_border_style,'solid'),
         COALESCE(avatar_border_color_1,'#ffffff'), COALESCE(avatar_border_color_2,'#f472b6'),
         COALESCE(avatar_border_color_3,'#fda4af'), COALESCE(is_verified,false), COALESCE(font,'inter')
  FROM canon RETURNING id, name
)
UPDATE charmlink_creators c SET model_id = ins.id FROM ins WHERE c.name = ins.name;

-- Existing avatars become the model's shared pool.
UPDATE charmlink_creator_avatars a
SET model_id = c.model_id, creator_id = NULL
FROM charmlink_creators c
WHERE a.creator_id = c.id AND c.model_id IS NOT NULL;
