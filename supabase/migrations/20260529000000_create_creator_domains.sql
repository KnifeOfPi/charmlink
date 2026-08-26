-- Migration: creator_domains join table (Phase 6/7 — multi-domain support)
--
-- A creator can have more than one custom domain; exactly one is "primary"
-- at a time. `charmlink_creators.custom_domain` stays as a denormalized
-- read-optimization for the hot path (middleware domain resolution) and is
-- kept in sync with the primary row here via trigger — never write
-- `charmlink_creators.custom_domain` directly from application code.
--
-- Consumed by: app/api/admin/domains/route.ts, scripts/cf-backfill.ts,
-- scripts/cf-heal.ts.

CREATE TABLE IF NOT EXISTS charmlink_creator_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES charmlink_creators(id) ON DELETE CASCADE,
  domain VARCHAR(255) UNIQUE NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_charmlink_creator_domains_creator
  ON charmlink_creator_domains(creator_id);

-- At most one primary domain per creator.
CREATE UNIQUE INDEX IF NOT EXISTS idx_charmlink_creator_domains_one_primary
  ON charmlink_creator_domains(creator_id)
  WHERE is_primary;

-- Keep charmlink_creators.custom_domain mirroring whichever row is primary
-- (or NULL if the creator currently has none). Fires on insert/update/delete
-- of the join table so app code never has to write custom_domain itself.
CREATE OR REPLACE FUNCTION charmlink_sync_creator_primary_domain()
RETURNS TRIGGER AS $$
DECLARE
  affected_creator_id UUID;
BEGIN
  affected_creator_id := COALESCE(NEW.creator_id, OLD.creator_id);

  UPDATE charmlink_creators
  SET custom_domain = (
    SELECT domain FROM charmlink_creator_domains
    WHERE creator_id = affected_creator_id AND is_primary = true
    LIMIT 1
  )
  WHERE id = affected_creator_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_creator_primary_domain ON charmlink_creator_domains;
CREATE TRIGGER trg_sync_creator_primary_domain
  AFTER INSERT OR UPDATE OR DELETE ON charmlink_creator_domains
  FOR EACH ROW
  EXECUTE FUNCTION charmlink_sync_creator_primary_domain();
