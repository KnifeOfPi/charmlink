-- Per-photo crop focal point.
--
-- The avatar is a circle, so a portrait photo loses its top and bottom to the
-- crop. CSS `object-position` defaults to 50% 50%, which on a typical 3:4
-- selfie centres on the torso and cuts the face off entirely.
--
-- focal_y defaults to 25 rather than 50 because these are overwhelmingly
-- selfies, where the face sits in the upper portion of the frame. The value is
-- a percentage of the *cropped-away slack*, not of the image, so it
-- self-adjusts with aspect ratio: a taller source has more slack, and the same
-- 25% moves proportionally further down it. A square photo has no vertical
-- slack at all, so the value is simply inert there.
ALTER TABLE charmlink_creator_avatars
  ADD COLUMN IF NOT EXISTS focal_x SMALLINT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS focal_y SMALLINT NOT NULL DEFAULT 25;

ALTER TABLE charmlink_creator_avatars
  DROP CONSTRAINT IF EXISTS charmlink_creator_avatars_focal_range;

ALTER TABLE charmlink_creator_avatars
  ADD CONSTRAINT charmlink_creator_avatars_focal_range
  CHECK (focal_x BETWEEN 0 AND 100 AND focal_y BETWEEN 0 AND 100);
