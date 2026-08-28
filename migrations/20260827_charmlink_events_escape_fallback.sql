-- ============================================================================
-- Migration: allow type = 'escape_fallback' on charmlink_events
-- Date: 2026-08-27
--
-- ⚠️  UNCERTAINTY — VERIFY BEFORE RUNNING ⚠️
-- At authoring time the charmlink database could not be reached, so it is NOT
-- known whether charmlink_events.type has a CHECK constraint at all. If it does
-- NOT (the likely case), the DB write for 'escape_fallback' already succeeds and
-- this migration is a NO-OP. If it DOES, that constraint would silently reject
-- the new type — hence console.log is the primary analytics sink, not the DB.
--
-- This script is written to be idempotent and safe to run in EITHER case:
--   * No CHECK constraint present  -> does nothing (no error).
--   * A CHECK constraint present   -> drops it and recreates it including
--                                     'escape_fallback' alongside the existing
--                                     'pageview' and 'click' values.
--
-- Before running, VERIFY the live constraint definition. Inspect it with:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'charmlink_events'::regclass AND contype = 'c';
-- and confirm the recreated definition below matches the real allowed set
-- (this script assumes the only checked column is `type`).
-- ============================================================================

DO $$
DECLARE
  v_conname text;
BEGIN
  -- Find a CHECK constraint on charmlink_events whose definition references the
  -- `type` column. There should be at most one; take the first if several.
  SELECT c.conname
    INTO v_conname
  FROM pg_constraint c
  WHERE c.conrelid = 'charmlink_events'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%type%'
  LIMIT 1;

  IF v_conname IS NULL THEN
    -- No matching CHECK constraint — nothing to migrate. No-op.
    RAISE NOTICE 'No CHECK constraint on charmlink_events.type found; nothing to do.';
  ELSE
    -- Drop the existing constraint and recreate it with 'escape_fallback' added.
    EXECUTE format(
      'ALTER TABLE charmlink_events DROP CONSTRAINT %I',
      v_conname
    );
    EXECUTE format(
      'ALTER TABLE charmlink_events ADD CONSTRAINT %I CHECK (type IN (%L, %L, %L))',
      v_conname, 'pageview', 'click', 'escape_fallback'
    );
    RAISE NOTICE 'Recreated CHECK constraint % to include escape_fallback.', v_conname;
  END IF;
END $$;

-- ============================================================================
-- Rollback (commented out — verify the constraint name and allowed set first):
--
-- DO $$
-- DECLARE
--   v_conname text;
-- BEGIN
--   SELECT c.conname INTO v_conname
--   FROM pg_constraint c
--   WHERE c.conrelid = 'charmlink_events'::regclass
--     AND c.contype = 'c'
--     AND pg_get_constraintdef(c.oid) ILIKE '%type%'
--   LIMIT 1;
--   IF v_conname IS NOT NULL THEN
--     EXECUTE format('ALTER TABLE charmlink_events DROP CONSTRAINT %I', v_conname);
--     EXECUTE format(
--       'ALTER TABLE charmlink_events ADD CONSTRAINT %I CHECK (type IN (%L, %L))',
--       v_conname, 'pageview', 'click'
--     );
--   END IF;
-- END $$;
-- ============================================================================
