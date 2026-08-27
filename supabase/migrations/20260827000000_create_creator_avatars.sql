-- Avatar carousel / A-B testing.
--
-- Each creator may hold up to 10 candidate avatars. One is chosen per page
-- render and its id is stamped on the resulting pageview and on every click in
-- that session, so a conversion rate can be attributed back to the photo that
-- was actually on screen.
--
-- The 10-per-creator cap is enforced in the application layer (createCreatorAvatar),
-- not by a constraint, so an admin gets a clean error message instead of a
-- raw constraint violation.

CREATE TABLE IF NOT EXISTS charmlink_creator_avatars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES charmlink_creators(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  -- Included in the rotation. A paused avatar keeps its history but stops
  -- being served.
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Pinned = a proven winner. When a creator has any pinned avatars the
  -- rotation is restricted to that set (the "permanent default" the admin
  -- locks in, 1-3 photos); when none are pinned every active avatar competes.
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_charmlink_creator_avatars_creator
  ON charmlink_creator_avatars (creator_id);

CREATE INDEX IF NOT EXISTS idx_charmlink_creator_avatars_rotation
  ON charmlink_creator_avatars (creator_id, is_active, is_pinned);

ALTER TABLE charmlink_creator_avatars ENABLE ROW LEVEL SECURITY;

-- Which avatar was on screen for this event. NULL for every historical row and
-- for any creator not using the carousel, so all per-avatar stats must filter
-- `avatar_id IS NOT NULL` rather than treating NULL as a variant.
-- ON DELETE SET NULL: deleting a losing avatar must not delete the click
-- history it produced (that would silently rewrite past totals).
ALTER TABLE charmlink_events
  ADD COLUMN IF NOT EXISTS avatar_id UUID
  REFERENCES charmlink_creator_avatars(id) ON DELETE SET NULL;

-- Partial index: per-avatar aggregation only ever scans attributed rows, which
-- are a small slice of a table that is mostly historical NULLs.
CREATE INDEX IF NOT EXISTS idx_charmlink_events_avatar
  ON charmlink_events (avatar_id, type)
  WHERE avatar_id IS NOT NULL;
