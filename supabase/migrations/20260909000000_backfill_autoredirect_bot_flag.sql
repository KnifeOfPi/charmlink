-- ============================================================================
-- Migration: reclassify auto-redirect arrivals that were recorded as human
-- Date: 2026-09-09
--
-- The `is_bot` flag on charmlink_events comes from middleware's x-is-bot
-- header. On the auto-redirect path that verdict is false for essentially
-- every request, because middleware's checks cannot see this traffic:
-- `isbot` matches only self-declared crawlers, and the datacenter-ASN rule in
-- lib/bot-detect.ts step 3 never fires at all, since Vercel does not emit
-- x-vercel-ip-asn.
--
-- Measured over 5-9 Sep 2026 on the three redirect domains, 707 of 869
-- recorded arrivals (81.4%) are automated, and not one carried is_bot = true:
--
--   * 464 desktop hits, on domains that exist only as Instagram bio links and
--     whose live audience is ~100% mobile.
--   * 266 hits sharing a single 2019 iOS build ("OS 13_2_3"), against a real
--     population spread across iOS 17/18/26.
--   * Dalvik/okhttp client libraries, an "Android 1.5" from 2009, and 8 empty
--     user agents.
--
-- Uncorrected, this inflated arrivals ~5x and made the Instagram->OnlyFans
-- handoff read as 34% when the human figure is ~93% (162 human arrivals
-- against 151 OnlyFans clicks over those five days).
--
-- The predicate below mirrors looksSynthetic() in lib/synthetic-traffic.ts
-- with mobileOnlyAudience set. Keep the two in step: the TypeScript version
-- classifies new rows at write time, this one fixes the existing history.
--
-- SCOPE: type = 'autoredirect' only. Ordinary pageviews very likely carry the
-- same contamination, but the desktop rule is only safe on surfaces whose
-- audience is mobile by construction, and changing pageviews would restate
-- every view and CTR figure in the dashboard. That is a separate decision.
-- ============================================================================

UPDATE charmlink_events
   SET is_bot = true
 WHERE type = 'autoredirect'
   AND is_bot = false
   AND (
        -- 1. absent user agent
        user_agent IS NULL OR btrim(user_agent) = ''
        -- 2. HTTP client libraries
     OR user_agent ~* '(dalvik|okhttp|python-requests|python-urllib|curl/|wget|go-http-client|java/|apache-httpclient|node-fetch|axios|libwww|guzzle|postman)'
        -- 3. structurally impossible: Chrome token with no AppleWebKit
     OR (user_agent ~* 'chrome/' AND user_agent !~* 'applewebkit')
        -- 4. implausibly old mobile OS for a 2026 audience
     OR (user_agent ~* 'iphone|ipad|ipod'
         AND (substring(user_agent from 'OS ([0-9]+)[._]'))::int < 15)
     OR (user_agent ~* 'android'
         AND (substring(user_agent from 'Android ([0-9]+)'))::int < 5)
        -- 5. desktop on a mobile-only surface
     OR user_agent !~* '(iphone|ipad|ipod|android)'
   );

-- ============================================================================
-- Rollback: every auto-redirect row carried is_bot = false before this ran,
-- so the reversal is exact.
--   UPDATE charmlink_events SET is_bot = false WHERE type = 'autoredirect';
-- ============================================================================
