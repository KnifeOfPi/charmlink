-- Avatar frame shape.
--
-- A circle is a square window, so a 3:4 phone photo loses roughly a quarter of
-- its height to the crop no matter where the focal point aims — the subject's
-- face and body cannot both survive. A portrait frame matches the source
-- aspect, so almost nothing is cropped and no letterboxing appears either.
--
-- Defaults to 'circle' so the ~70 existing creator pages are untouched; the
-- shape is opted into per creator from the admin Avatar tab.
ALTER TABLE charmlink_creators
  ADD COLUMN IF NOT EXISTS avatar_shape TEXT NOT NULL DEFAULT 'circle';

ALTER TABLE charmlink_creators
  DROP CONSTRAINT IF EXISTS charmlink_creators_avatar_shape_valid;

ALTER TABLE charmlink_creators
  ADD CONSTRAINT charmlink_creators_avatar_shape_valid
  CHECK (avatar_shape IN ('circle', 'portrait', 'square'));
