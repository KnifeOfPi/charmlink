-- ============================================================================
-- Migration: record whether a pageview was actually on screen
-- Date: 2026-09-17
--
-- 33.7% of non-bot pageviews (14,803 sessions in 14 days) come from the
-- Facebook in-app browser, and 95.5% of them click nothing at all. For
-- comparison, Instagram sessions click nothing 38.6% of the time and ordinary
-- browsers 58.1%. Facebook in-app converts at 4.5% against 42.5% for ordinary
-- browsers — despite taking the identical code path, since our escape logic
-- only recognises Meta's Instagram/Threads user agents.
--
-- It is not bot traffic: the user agents spread realistically across iOS
-- 26_6_2 / 26_6_1 / 18_7 and Facebook app builds 575-578, with 644 distinct
-- strings. And it is not a rendering bug: iOS and Android are identical to the
-- decimal (4.5% each), which two different webview engines would not be.
--
-- The leading hypothesis is Meta's in-app link prefetch — the app pre-renders
-- pages a user scrolls past in feed. That executes our JavaScript and fires the
-- pageview beacon with a genuine browser user agent, while no human ever looks
-- at the page. It explains the platform independence and the near-total
-- absence of clicks.
--
-- A prefetched or pre-rendered page renders HIDDEN, so document.visibilityState
-- at beacon time separates the two cases cleanly. Nothing in the table records
-- it today, which is why the question cannot be settled from existing data.
--
-- DELIBERATELY MEASUREMENT ONLY. This column changes no metric and no query.
-- Suppressing hidden pageviews from the counts would immediately restate every
-- view and CTR figure in the dashboard, and this session has already learned
-- what it costs to change a number before understanding it. Measure first,
-- decide once the data is in.
--
-- NULL means "not reported": every row written before this shipped, plus any
-- client still running a cached bundle.
-- ============================================================================

ALTER TABLE charmlink_events
  ADD COLUMN IF NOT EXISTS was_visible BOOLEAN;

COMMENT ON COLUMN charmlink_events.was_visible IS
  'document.visibilityState === "visible" when the pageview beacon fired. FALSE indicates the page was never on screen — the signature of an in-app link prefetch rather than a human visit. NULL = not reported (pre-2026-09-17 rows, or a stale client bundle). Measurement only: no dashboard metric reads this.';

-- Partial index: the only question asked of this column is "how much of a
-- surface was never seen", and NULL rows are the uninteresting majority.
CREATE INDEX IF NOT EXISTS idx_events_was_visible
  ON charmlink_events (created_at DESC)
  WHERE was_visible IS NOT NULL;

-- ============================================================================
-- Rollback:
--   DROP INDEX IF EXISTS idx_events_was_visible;
--   ALTER TABLE charmlink_events DROP COLUMN IF EXISTS was_visible;
-- ============================================================================
