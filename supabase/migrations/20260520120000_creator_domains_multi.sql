-- Multi-domain support for creators (one creator can own N domains)
CREATE TABLE IF NOT EXISTS charmlink_creator_domains (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  UUID NOT NULL REFERENCES charmlink_creators(id) ON DELETE CASCADE,
  domain      TEXT NOT NULL UNIQUE,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_domains_creator_id
  ON charmlink_creator_domains(creator_id);

-- Only one primary per creator
CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_domains_one_primary
  ON charmlink_creator_domains(creator_id) WHERE is_primary;

-- Backfill: every non-null custom_domain becomes a primary row
INSERT INTO charmlink_creator_domains (creator_id, domain, is_primary)
SELECT id, custom_domain, true
FROM charmlink_creators
WHERE custom_domain IS NOT NULL AND custom_domain <> ''
ON CONFLICT (domain) DO NOTHING;

-- Trigger: keep charmlink_creators.custom_domain in sync with the primary row.
-- This lets legacy code paths (provisioning scripts, getCreatorByDomain fallback) keep working.
CREATE OR REPLACE FUNCTION sync_creator_primary_domain() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    IF OLD.is_primary THEN
      UPDATE charmlink_creators
        SET custom_domain = (
          SELECT domain FROM charmlink_creator_domains
          WHERE creator_id = OLD.creator_id AND is_primary
          LIMIT 1
        )
      WHERE id = OLD.creator_id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.is_primary THEN
    UPDATE charmlink_creators
      SET custom_domain = NEW.domain
    WHERE id = NEW.creator_id;
  ELSIF (TG_OP = 'UPDATE' AND OLD.is_primary AND NOT NEW.is_primary) THEN
    -- Demoted: pick another primary if exists, else null
    UPDATE charmlink_creators
      SET custom_domain = (
        SELECT domain FROM charmlink_creator_domains
        WHERE creator_id = NEW.creator_id AND is_primary AND id <> NEW.id
        LIMIT 1
      )
    WHERE id = NEW.creator_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_creator_primary_domain ON charmlink_creator_domains;
CREATE TRIGGER trg_sync_creator_primary_domain
AFTER INSERT OR UPDATE OR DELETE ON charmlink_creator_domains
FOR EACH ROW EXECUTE FUNCTION sync_creator_primary_domain();
