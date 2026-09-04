-- ============================================================================
-- Migration: durable log of dropped analytics events
-- Date: 2026-09-04
--
-- recordEvent() wraps its INSERT in try/catch and console.errors on failure, so
-- a rejected write leaves no trace in any table. Every consumer of the data
-- then reads the absence as "no traffic", because a row that was never written
-- is indistinguishable from a visitor who never came. That is not theoretical:
--
--   * ~697 escape_fallback beacons were rejected from 2026-08-28 until the
--     type constraint was widened by hand, with no migration to match.
--   * EVERY /api/autoredirect write was rejected until 2026-09-03, so three
--     live redirect domains read as zero-traffic while OnlyFans recorded 152
--     clicks against the same links. It was reported as "those sites are dead".
--   * 56 logged "Connection terminated due to connection timeout" failures on
--     /api/pageview and /api/track — a pool capped at max=3 under fan-out.
--
-- This table makes that failure mode countable. A constraint violation or a
-- type error still reaches the database, so the failure row lands even when the
-- event row cannot. A total outage takes both, but that is loud by other means.
--
-- Deliberately not a foreign key to anything and deliberately lossy-tolerant:
-- it must never be able to fail in a way that breaks the request it describes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS charmlink_event_write_failures (
  id           BIGSERIAL PRIMARY KEY,
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type   TEXT,
  creator_slug TEXT,
  -- Postgres SQLSTATE, e.g. 23514 check_violation, 23503 fk_violation.
  error_code   TEXT,
  error_message TEXT
);

-- The only query this table serves is "what has been failing lately", so the
-- index is on time. Kept small by the retention note below rather than by
-- narrowing the index.
CREATE INDEX IF NOT EXISTS idx_event_write_failures_ts
  ON charmlink_event_write_failures (ts DESC);

COMMENT ON TABLE charmlink_event_write_failures IS
  'Analytics events that could not be inserted. A non-empty recent window means charmlink_events is undercounting and every dashboard figure derived from it is low. Prune periodically; nothing reads rows older than a few weeks.';

-- ============================================================================
-- Rollback:
--   DROP TABLE IF EXISTS charmlink_event_write_failures;
-- ============================================================================
