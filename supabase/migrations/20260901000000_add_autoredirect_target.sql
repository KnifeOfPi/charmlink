-- ============================================================================
-- Migration: auto-redirect sites
-- Date: 2026-09-01
--
-- Adds `charmlink_creators.autoredirect_link_id`. When it is NOT NULL, that
-- creator row stops being a landing page and becomes an AUTO-REDIRECT site: a
-- visitor hitting its domain gets the in-app-browser escape cascade aimed
-- straight at the named link, with no page to read and nothing to tap.
--
-- Why a creator row rather than a new table: a creator row already IS a site
-- (slug + one custom_domain — which is why one person has ten of them). Reusing
-- it means auto-redirect domains inherit, with no new code, the Cloudflare and
-- Vercel provisioning flow, the model grouping that makes them show up under
-- the right person in analytics, the per-site link rows (so each redirect
-- domain can carry its OWN OnlyFans tracking code), and — most importantly —
-- the decoy cloaking, since extractDecoyCandidateSlug already covers the root
-- of any custom domain. A crawler gets the wholesome blog; only a real visitor
-- gets the redirect. That protection is the whole reason this is safe to run.
--
-- ON DELETE SET NULL, deliberately: deleting the target link must degrade the
-- site back to a normal landing page, never orphan it pointing at nothing or
-- cascade into deleting the site itself.
-- ============================================================================

ALTER TABLE charmlink_creators
  ADD COLUMN IF NOT EXISTS autoredirect_link_id uuid
  REFERENCES charmlink_links(id) ON DELETE SET NULL;

COMMENT ON COLUMN charmlink_creators.autoredirect_link_id IS
  'When set, this site auto-redirects to that link instead of rendering a landing page. The link must belong to this same creator row.';

-- Partial index: the lookup is always "is this site a redirect site", and the
-- overwhelming majority of rows are NULL landing pages.
CREATE INDEX IF NOT EXISTS idx_charmlink_creators_autoredirect
  ON charmlink_creators (autoredirect_link_id)
  WHERE autoredirect_link_id IS NOT NULL;

-- ============================================================================
-- Rollback:
--   DROP INDEX IF EXISTS idx_charmlink_creators_autoredirect;
--   ALTER TABLE charmlink_creators DROP COLUMN IF EXISTS autoredirect_link_id;
-- ============================================================================
