-- ============================================================================
-- Migration: backfill charmlink_events.creator_id from creator_slug
-- Date: 2026-09-18
--
-- Step 1 of moving analytics off creator_slug and onto creator_id.
--
-- WHY THE MOVE. Events record creator_slug, and 59 analytics queries filter or
-- join on it, so renaming a creator's slug silently detaches that site's whole
-- history. It is not theoretical and it is not new:
--
--   * 'kai' was renamed to 'reynaa' and stranded 1,224 events — 845 pageviews
--     and 379 premium clicks between 2 Jun and 31 Aug 2026. Her dashboard has
--     since shown 502 views / 334 premium clicks against a true 1,347 / 713,
--     so bouncedat.club has read as less than half its real performance for
--     three months and nobody noticed.
--   * 'lloyd' was renamed to 'wylde' on 2026-09-17, an hour after the creator
--     was added, reported as "I changed Sarah's name and it broke her link".
--
-- creator_id survives a rename, which is why the history above is recoverable
-- rather than lost. But it has to be populated on every row first, or rekeying
-- the queries would drop whatever it is missing from.
--
-- WHAT THIS DOES. Nothing but fill the gap: 66 of the 68 null rows have a
-- creator_slug that still matches a live creator. Slug is unique in
-- charmlink_creators (verified), so the mapping is unambiguous.
--
-- The 2 rows left null afterwards are 'demo-spotlight' pageviews from
-- 2026-06-06, a creator that no longer exists — test data, deliberately left
-- alone rather than invented a parent for.
--
-- NO METRIC CHANGES HERE. Every query still keys on creator_slug, so the
-- dashboard reads exactly the same before and after. This only makes the
-- rekey safe to do next.
-- ============================================================================

UPDATE charmlink_events e
   SET creator_id = c.id
  FROM charmlink_creators c
 WHERE e.creator_id IS NULL
   AND c.slug = e.creator_slug;

-- ============================================================================
-- Rollback: these rows held NULL before, and only these rows are touched, so
-- the reversal is exact for anything this statement changed:
--   UPDATE charmlink_events SET creator_id = NULL
--    WHERE id IN (<ids captured from the verification query below>);
-- In practice there is no reason to revert — a populated foreign key is
-- strictly more information than a null one, and nothing reads it yet.
-- ============================================================================
