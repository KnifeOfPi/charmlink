-- ============================================================================
-- Migration: allow 'autoredirect' (and reconcile 'escape_fallback') on
--            charmlink_events.type
-- Date: 2026-09-03
--
-- lib/db.ts has declared the event union as
--     'pageview' | 'click' | 'escape_fallback' | 'autoredirect'
-- since the auto-redirect feature shipped (5c76576), but no migration in this
-- repo has ever touched charmlink_events_type_check. Production was still
-- CHECK (type IN ('pageview','click','escape_fallback')), so every write from
-- POST /api/autoredirect was rejected by Postgres with 23514 and swallowed by
-- recordEvent's catch — 68 lost events in the seven days to 2026-09-03, and
-- every auto-redirect visitor before that. It reads as "those sites have no
-- traffic" rather than as an error, which is how it went unnoticed.
--
-- 'escape_fallback' is in the constraint above only because it was added to
-- production by hand, out of band, with no migration to match: the same 23514
-- rejected ~697 escape-failure beacons from 2026-08-28 until someone widened it
-- live. This migration therefore restates the WHOLE allowed set rather than
-- appending one value, so the repo finally describes the deployed schema. Same
-- class of drift as the cloak_enabled column that sat unapplied for months
-- (§7.14 of docs/CHARMLINK-STATE-2026-05-13.md).
--
-- Lost rows are not recoverable — the insert never happened. Analytics figures
-- for auto-redirect sites (and pre-2026-08-28 escape-failure counts) start from
-- this migration, not from when the features shipped.
--
-- NOT VALID + VALIDATE, deliberately: charmlink_events is ~750k rows, and
-- ADD CONSTRAINT normally holds ACCESS EXCLUSIVE while it scans every one of
-- them, blocking the beacon writes this table exists to receive. Adding it
-- NOT VALID is a catalogue-only change and takes no scan; VALIDATE then runs
-- under SHARE UPDATE EXCLUSIVE, which readers and writers do not queue behind.
-- The new set is a strict superset of the old, so no existing row can fail it.
-- ============================================================================

ALTER TABLE charmlink_events
  DROP CONSTRAINT IF EXISTS charmlink_events_type_check;

ALTER TABLE charmlink_events
  ADD CONSTRAINT charmlink_events_type_check
  CHECK (type IN ('pageview', 'click', 'escape_fallback', 'autoredirect'))
  NOT VALID;

ALTER TABLE charmlink_events
  VALIDATE CONSTRAINT charmlink_events_type_check;

COMMENT ON COLUMN charmlink_events.type IS
  'pageview | click | escape_fallback | autoredirect. Keep in step with RecordEventInput in lib/db.ts — a value present there but absent here is rejected at 23514 and silently dropped by recordEvent''s catch.';

-- ============================================================================
-- Rollback (restores the pre-migration set; any 'autoredirect' rows written
-- since must be deleted first or the VALIDATE will fail):
--   DELETE FROM charmlink_events WHERE type = 'autoredirect';
--   ALTER TABLE charmlink_events DROP CONSTRAINT IF EXISTS charmlink_events_type_check;
--   ALTER TABLE charmlink_events ADD CONSTRAINT charmlink_events_type_check
--     CHECK (type IN ('pageview', 'click', 'escape_fallback'));
-- ============================================================================
