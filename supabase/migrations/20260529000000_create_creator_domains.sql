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
--
-- PROVENANCE: this table was originally applied out-of-band and had no
-- migration in-repo. The definition below was transcribed from the live
-- Charmasutra database (project ref vhdgfcrjjscnhcdsqsgs) — table, indexes,
-- constraints, RLS state, and trigger function body all match production
-- exactly, so running this against the existing DB is a no-op. Keep it that
-- way: if you change this file, change production to match, not the reverse.

CREATE TABLE IF NOT EXISTS charmlink_creator_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES charmlink_creators(id) ON DELETE CASCADE,
  domain TEXT UNIQUE NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_domains_creator_id
  ON charmlink_creator_domains(creator_id);

-- At most one primary domain per creator.
CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_domains_one_primary
  ON charmlink_creator_domains(creator_id)
  WHERE is_primary;

-- Matches the other charmlink_* tables: RLS on with no policies, so the
-- anon/authenticated roles have no access at all. The app reaches this table
-- through DATABASE_URL (service role), which bypasses RLS.
ALTER TABLE charmlink_creator_domains ENABLE ROW LEVEL SECURITY;

-- Keep charmlink_creators.custom_domain mirroring whichever row is primary.
CREATE OR REPLACE FUNCTION public.sync_creator_primary_domain()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
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
$function$;

DROP TRIGGER IF EXISTS trg_sync_creator_primary_domain ON charmlink_creator_domains;
CREATE TRIGGER trg_sync_creator_primary_domain
  AFTER INSERT OR DELETE OR UPDATE ON charmlink_creator_domains
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_creator_primary_domain();
