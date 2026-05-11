-- Migration: add per-creator cloak_enabled kill switch
--
-- When true (default), bot/scraper traffic to this creator's domain is served
-- a fingerprint-free decoy HTML response by the edge middleware. When false,
-- the creator falls through to normal Next.js rendering with sparse OG metadata.
--
-- This is the per-domain isolation lever: if Meta clamps down on one creator,
-- we flip her flag to false rather than blast-radiusing every other creator.

ALTER TABLE charmlink_creators
  ADD COLUMN IF NOT EXISTS cloak_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN charmlink_creators.cloak_enabled IS
  'When true, link-preview scrapers receive a fingerprint-free decoy HTML response. Flip to false to exempt a creator from the decoy and serve normal sparse OG metadata.';
