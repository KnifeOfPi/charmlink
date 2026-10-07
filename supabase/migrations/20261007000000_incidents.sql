-- ============================================================================
-- Migration: charmlink_incidents — platform enforcement log
-- Date: 2026-10-07
--
-- WHY. The question that drives most bot-defence work here is "what makes
-- Meta ban or restrict an account or block a link?" — and nothing records the
-- answer. Every theory so far (datacenter ASNs, link-preview crawlers,
-- residential proxies) has been argued without a single logged incident to
-- test it against. A few rows with dates, domains and what changed just before
-- turn that into a question the data can answer: do incidents follow a
-- domain, a creator, a content change, a deploy, a traffic spike?
--
-- One row per enforcement event, entered by hand from /admin/incidents.
-- RLS on with no policies, like every other charmlink table that has it: the
-- app reads/writes through its privileged connection; Supabase's public API
-- gets nothing.
-- ============================================================================

CREATE TABLE IF NOT EXISTS charmlink_incidents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- When it happened (or was first noticed), not when it was logged.
  occurred_at     TIMESTAMPTZ NOT NULL,
  platform        TEXT NOT NULL DEFAULT 'instagram'
                  CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'threads', 'x', 'other')),
  kind            TEXT NOT NULL
                  CHECK (kind IN ('account_banned', 'account_restricted', 'link_blocked',
                                  'link_warning', 'shadowban', 'content_removed', 'other')),
  creator_id      UUID REFERENCES charmlink_creators(id) ON DELETE SET NULL,
  -- The domain that was in the bio / blocked, if any.
  domain          TEXT,
  -- The platform account handle affected, if any.
  account_handle  TEXT,
  -- What the platform said (notice text, appeal outcome…).
  details         TEXT,
  -- What changed shortly before: new domain, new photos, posting spike,
  -- bio edit, a deploy… The column that makes the log useful.
  recent_changes  TEXT,
  resolved_at     TIMESTAMPTZ,
  resolution      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_occurred_at ON charmlink_incidents (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_creator ON charmlink_incidents (creator_id);

ALTER TABLE charmlink_incidents ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE charmlink_incidents IS
  'Hand-entered platform enforcement events (bans, restrictions, link blocks). The outcome measure for bot-defence decisions — see docs/CHARMLINK-STATE-2026-05-13.md §10.';
