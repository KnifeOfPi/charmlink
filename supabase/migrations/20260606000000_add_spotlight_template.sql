-- Migration: add spotlight template fields to charmlink_creators
--
-- Introduces the per-creator template selector (glass vs spotlight) and
-- all spotlight-specific display fields: hero image, username handle,
-- follower count, featured card, and gallery thumbnails.
--
-- All new columns are non-breaking: existing rows default to the glass
-- template and NULL for optional spotlight fields.

ALTER TABLE charmlink_creators
  ADD COLUMN IF NOT EXISTS template TEXT NOT NULL DEFAULT 'glass';

ALTER TABLE charmlink_creators
  ADD COLUMN IF NOT EXISTS hero_image_url TEXT;

ALTER TABLE charmlink_creators
  ADD COLUMN IF NOT EXISTS hero_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE charmlink_creators
  ADD COLUMN IF NOT EXISTS username TEXT;

ALTER TABLE charmlink_creators
  ADD COLUMN IF NOT EXISTS show_follower_count BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE charmlink_creators
  ADD COLUMN IF NOT EXISTS follower_count_label TEXT;

ALTER TABLE charmlink_creators
  ADD COLUMN IF NOT EXISTS featured_card JSONB;

ALTER TABLE charmlink_creators
  ADD COLUMN IF NOT EXISTS gallery_thumbnails JSONB;

COMMENT ON COLUMN charmlink_creators.template IS
  'Landing page template: "glass" (default aurora glassmorphism) or "spotlight" (link.me-style warm dark design).';

COMMENT ON COLUMN charmlink_creators.hero_image_url IS
  'Spotlight template: full-bleed hero image URL shown at the top of the page.';

COMMENT ON COLUMN charmlink_creators.hero_enabled IS
  'Spotlight template: when false, the hero image is hidden even if hero_image_url is set.';

COMMENT ON COLUMN charmlink_creators.username IS
  'Spotlight template: @handle shown under the display name (e.g. "previewspotlight").';

COMMENT ON COLUMN charmlink_creators.show_follower_count IS
  'Spotlight template: whether to display the follower count block.';

COMMENT ON COLUMN charmlink_creators.follower_count_label IS
  'Spotlight template: formatted follower count string to display (e.g. "2.6K").';

COMMENT ON COLUMN charmlink_creators.featured_card IS
  'Spotlight template: JSON object {image_url, label?, link_id?, url?, sensitive?} for the large featured card.';

COMMENT ON COLUMN charmlink_creators.gallery_thumbnails IS
  'Spotlight template: JSON array of {image_url, link_id?, url?} objects for the horizontal thumbnail scroll row.';
