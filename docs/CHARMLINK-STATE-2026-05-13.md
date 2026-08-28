# Charmlink — State of the Repo (Resume Doc, 2026-05-13)

This is the "pick it up cold weeks later" doc. Reads top-to-bottom and assumes
no prior context. For deep history per phase, see `memory/` daily logs
referenced inline. **Last updated:** 2026-08-28 (Phase 9 — model grouping: a creator row was
really a site, not a person, so a model with several domains had her avatars
uploaded and her stats read N times over; also the avatar carousel A/B test
feature, and two production outages in the analytics endpoint this same
phase introduced and then fixed. See §2 Phase 9 row and §7.11–7.14 for the
full story. The Phase 8 honeypot fix's 24h checkpoint also landed: zero
trapped clicks confirmed, but the predicted conversion uplift did **not**
materialize — see §7.15).

---

## 1. What Charmlink is

Instagram-safe link-in-bio platform for OF / Fanvue creators. One Next.js app
serves N custom domains; each creator gets a domain that looks like a personal
site, hides premium links from scrapers, and survives IG's bot crawl + IG
in-app WebView.

- **Repo:** `git@github.com:KnifeOfPi/charmlink.git` (branch: `main`)
- **Work dir (local):** `/Users/cepheus/.openclaw/workspace/agents/vela/charmlink`
- **Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui ·
  Supabase (Postgres) · Vercel · Cloudflare (orange-cloud + Turnstile)
- **Live domains (verified via `SELECT count(*) FROM charmlink_creator_domains`,
  2026-08-26):** 53 total, all `is_primary = true` (one domain per creator so
  far — nobody has used the multi-domain capability yet). `https://charmlink.vercel.app`
  is also live but canonical/origin-locked for slug paths, not in that count.
  The per-domain list grew too long to hand-maintain here; query the join
  table or check `/admin/domains` for the current roster rather than trusting
  a static list in this doc.
- **Built by:** Vela (engineering) + Cepheus (ops/CF) + Aquila (sec review).
  Commits authored as `KnifeOfPi <nate@mindstar.space>`; real authorship lives
  in `Co-authored-by:` trailers.

---

## 2. Current Production Status

Phases 1–9 are **shipped + live**. Last sweep: 2026-08-28, verified against
production DB queries and live Vercel deployment/runtime-log checks (not just
"the commit merged") — see §7.9 for how that verification worked.
Branch `main` clean, no pending PRs.

| Phase | What it added | Commit / PR |
|---|---|---|
| 1 | `isbot` v5.1.40, datacenter ASN list, Sec-Fetch heuristics, scraper UA list, HMAC-locked links API, server-side `cl_age` cookie | `b6605a7` (PR #1) |
| 2 | KV rate limiter (30/min links, 10/min age), honeypot DB writes, diag, 12-item cleanup | `cb550c8` (PR #2) |
| 3 | Cloudflare orange-cloud, 6 WAF custom rules via legacy `/firewall/rules` API, Turnstile escalation, origin lock on `*.vercel.app` | `5771b4c` (PR #3) + `3fac2de` + `49c7898` |
| 3.3 | Gated Bot Fight Mode behind `CHARMLINK_ENABLE_BFM` (default off — Free-tier BFM blocks real Chrome) | `e96d91b` (PR #6) |
| 4 | Killed site-wide age gate; per-link `/r/[linkId]` interstitial for `sensitive=true` links only; non-sensitive links redirect with no friction | `cfaae9e` (PR #7) |
| 4 hotfixes | Bare custom-domain root rewrite + dropped CF `x-is-bot` cloaking false-positive + IG WebView escape rewrites + load-on-mount fix | `fa23217`, `d7c1b0`, `7570c09`, `1458de8` |
| 5 | Per-creator themed decoy cloaking — link-preview scrapers get a wholesome themed blog HTML with **zero** Next/Vercel/Charmlink fingerprints | `452b572` |
| 5 polish | IG-banner color, chooser UI, iOS-only IG extbrowser scheme, Sec-Fetch-Site `none` allowance, `next.config` image whitelist | `947e009`, `faaff0c`, `9706029`, `85c17dc`, `f2aaac9`, `910f445` |
| 7 | **2026-05-29** Gray→cert→orange race fix: `provisionZone` now triggers `POST /v4/certs?teamId=` with 6× backoff + HEAD via Vercel IP before flipping orange; idempotency check skips ceremony for healthy domains. `cf-heal` CLI added. Admin route uses `charmlink_creator_domains` join table. `cf-backfill` iterates join table + adds verify step. | PR `fix/domains-525-ssl-race-heal-teamid` |
| 7.6 | **2026-06-01** `cf-heal` auto-resolves `VERCEL_TEAM_ID` in 3 tiers (env → file → `/v2/teams`). Missing team id was the silent root cause of `/v4/certs` 403s that made `cf-heal` "fail" on every domain. | `5cfb2e9` (PR #11) |
| 7.7 | **2026-06-02** Self-serve **Heal button** in `/admin/domains` + **auto-heal on domain add**. Button POSTs `/api/admin/domains/heal` → runs the same idempotent `provisionZone()` flow as the `cf-heal` CLI (pre-probe → gray → Vercel cert → re-orange). Returns `{ok, noop, preStatus, postStatus, steps}`. Eliminates the manual unproxy/remove/re-add loop and lets creators/VAs heal their own domains with no engineer. | `d596f62` (PR #12) |
| 8 | **2026-08-26** The conversion-funnel incident. Measured against production: 12.6% of "premium clicks" since 2026-05-10 were taps on a dead honeypot link the links API handed out on rejection, which then banned the visitor's IP for 24h — 86.6% of those bans hit ordinary mobile UAs, 0.12% hit actual bots. Root cause of the false rejections: link tokens were bound to client IP, which drifts on mobile between page render and the links fetch. Fixed all three (rejection payload is now inert, tokens no longer IP-bound, honeypot only bans requests that look automated), added a self-serve ban-flush (`/api/admin/bans` + dashboard card), fixed three analytics-correctness bugs found along the way (double-counted clicks, `is_bot` hardcoded false, 404s logged as DB errors), and verified the fix live via an accidental revert/restore that doubled as a natural experiment. See §7.9–§7.10 for the full incident writeup. | `c7460a7`, `8109fa3`, `f3e0c7f`, `ee524cb`, `84b57c9` (+ `deb8ee7`/`ebb505a` — a deliberate temporary revert and restore for on-device testing, see §7.9) |
| 9 | **2026-08-28** Model grouping + avatar A/B testing. A creator row was really a *site*, not a *person* — Hanna Zuki alone had 6 rows for one model. New `charmlink_models` table is the person; sites overlay her shared identity (name/tagline/theme/avatar frame) and share one 10-photo carousel, Thompson-sampled per visit with per-photo conversion tracking, attributed via `avatar_id` on events. 70 sites merged down to 30 models (49 by exact-name backfill, then 12 more by hand-reviewed fuzzy match — see §7.11). Also: per-photo focal point + 3 frame shapes (circle/portrait/square) fixing a circle-crop-loses-the-face complaint; inline link editing; hero-sized avatar; tab shows the creator's name (cloaking re-verified safe, see §7.13); analytics grouped per model with a searchable sidebar; admin dark mode fixed at the root. **Shipped two production outages in the same phase** — an N+1 pool-exhaustion 500 (§7.12) and a pg `Date`-vs-`string` type crash (§7.14) — both on `/api/analytics/overview`, both caught by the user within minutes, both fixed same-session. | `940e174`, `365ae8c`, `d902017`, `6f4827c`, `30f2b9f`, `4f5e605`, `012f07f`, `49fa104`, `4036915`, `6b1f0ed` (+ the merge/backfill was data-only SQL against prod, no migration commit) |

See `memory/archive-2026-05-10.md` for Phase 1–3 ship-day notes and
`memory/2026-05-11.md` for everything Phase 4 + 5 day-of.

---

## 3. Repo Layout (the parts that matter)

```
charmlink/
├─ app/
│  ├─ [creator]/                  ← public creator page (CreatorPage.tsx + AgeGate*, page.tsx)
│  ├─ admin/                      ← admin dashboard (5-tab shadcn UI)
│  │  └─ dashboard/page.tsx       ← (Phase 8) Blocked Visitors card — count + flush honeypot bans
│  ├─ api/
│  │  ├─ links/[creator]/route.ts ← HMAC-locked premium links API (token NOT IP-bound as of Phase 8)
│  │  ├─ resolve-creator-meta/    ← (Phase 5) creator meta lookup for decoy
│  │  ├─ age-confirm/             ← sets cl_age cookie (legacy, still wired for /r/[linkId])
│  │  ├─ honeypot/                ← bot capture — bans only requests that look automated (Phase 8)
│  │  ├─ redirect/[linkId]/       ← click-through tracking (session id sentinel, excluded from click counts)
│  │  └─ admin/bans/              ← (Phase 8) GET count / POST flush the honeypot ban list
│  ├─ r/[linkId]/page.tsx         ← Phase 4 per-link sensitive interstitial
│  └─ robots.ts                   ← noindex everywhere
├─ lib/
│  ├─ bot-detect.ts               ← layered detection (isbot + ASN + Meta UA + Sec-Fetch)
│  ├─ datacenter-asns.ts          ← 13 hosting ASN list
│  ├─ scraper-detect.ts           ← 12 link-preview UA patterns
│  ├─ event-bot-flag.ts           ← (Phase 8) resolves is_bot for events from middleware's x-is-bot header
│  ├─ rate-limit.ts               ← Vercel KV-based limiter
│  ├─ kv-ban.ts                   ← bad-IP ban list (24h TTL; flushed via /api/admin/bans)
│  ├─ link-token.ts               ← HMAC token mint/verify — NOT IP-bound (Phase 8); throws in prod if
│  │                                 CHARMLINK_LINK_TOKEN_SECRET is unset instead of using the dev fallback
│  ├─ turnstile.ts                ← server verify
│  ├─ turnstile-admin.ts          ← widget hostname auto-sync to CF
│  ├─ cloudflare.ts               ← zone provisioning (WAF rules, settings)
│  ├─ cloudflare-dns.ts           ← CNAME + orange-cloud
│  ├─ vercel-domains.ts           ← add/remove on Vercel project
│  ├─ decoy/
│  │  ├─ themes.ts                ← 8–10 wholesome decoy themes (Phase 5)
│  │  └─ cloak.ts                 ← scraper bypass renderer
│  ├─ themes.ts                   ← 13 visual themes for real creators
│  ├─ fonts.ts                    ← Google Fonts dynamic loader
│  ├─ db.ts                       ← DEDUPED_CLICKS predicate (Phase 8) excludes redirect-sourced rows
│  └─ analytics.ts, types.ts, utils.ts
├─ middleware.ts                  ← host → creator rewrite, scraper decoy injection, isbot UA check
├─ next.config.ts                 ← image remotePatterns (incl. public.onlyfans.com, imgur)
├─ scripts/
│  ├─ migrate.ts, migrate-v2.ts, migrate-v3.ts ← schema migrations
│  ├─ cf-backfill.ts              ← provision/repair CF state across all creators
│  └─ cf-heal.ts                  ← CLI: heal a single stuck domain (or --all)
├─ supabase/migrations/
│  ├─ 20260508000000_create_honeypot_logs.sql       ← Phase 2 honeypot logging
│  ├─ 20260511000000_add_cloak_enabled.sql          ← Phase 5 toggle column
│  └─ 20260529000000_create_creator_domains.sql     ← charmlink_creator_domains + sync trigger.
│      Backfilled in Phase 8 from the live schema (the table existed in prod since
│      Phase 6/7 but had no migration file); verify against prod before trusting it
│      if you ever change it — see the file's own provenance comment.
└─ docs/
   ├─ PHASE-3-CLOUDFLARE.md              ← CF wiring deep-dive (canonical)
   ├─ CharmLink-Admin-SOP.pdf            ← admin SOP for KOPi (+ charmlink-sop.py source)
   ├─ CLICK-CONVERSION-ANALYSIS-2026-08-26.pdf  ← Phase 8 incident report (+ .py source)
   ├─ NEW-DOMAIN-TROUBLESHOOTING.md      ← 525/stuck-domain runbook
   ├─ COMPETITOR-INTEL.md
   └─ CHARMLINK-STATE-2026-05-13.md      ← (this file)
```

---

## 4. The Detection / Cloaking Stack (top → bottom)

When a request hits `hannazuki.com/waifuzukii`:

1. **Cloudflare edge** (Phase 3) — orange-cloud proxies through:
   - **Active WAF rules per zone (6 rules via legacy `/firewall/rules` — Free-plan compatible):**
     - `charmlink:block-empty-ua` — empty UA → block
     - `charmlink:block-meta-asn` — Meta ASN 32934 → managed-challenge
     - `charmlink:block-bad-uas` — bad UA list (curl/python-requests/wget/etc.) → block
     - `charmlink:challenge-datacenter-asns` — 8 hosting ASNs `{16509, 14618, 396982, 32934, 13335, 14061, 8075, 15169}` (AWS, AWS-GovCloud, Tencent, Meta, CF, DO, Azure, GCP) → managed-challenge
     - `charmlink:challenge-cf-bot` — CF's own `cf.client.bot` flag → managed-challenge
     - `charmlink:block-tor` — Tor exit nodes (country `T1`) → block
   - **Note:** `lib/datacenter-asns.ts` carries a wider 15-ASN list (used for app-side scoring in `lib/bot-detect.ts`), but only the 8 above are blocked at the CF edge — Free-plan rule expression length limits us.
   - **Bot Fight Mode:** OFF by default (`CHARMLINK_ENABLE_BFM` flag) — Free
     tier BFM nukes real Chrome users
   - **AI Bots + Content Bots:** blocked (GPTBot, ClaudeBot, Bytespider)
   - **NOT BLOCKED at edge:** known social link-preview UAs (facebookexternalhit,
     Telegrambot, Discordbot, Slackbot, WhatsApp, LinkedInBot, Twitterbot) —
     we want them to reach origin so Phase 5 decoy fires
2. **Next.js middleware** (`middleware.ts`):
   - Host → creator slug rewrite (`hannazuki.com/` → `/waifuzukii`)
   - Detect link-preview scrapers via UA → render Phase-5 themed decoy
     (`lib/decoy/cloak.ts`) inline, zero Next chrome, theme deterministic by
     creator slug
   - All other bots flagged via local UA `isbot()` check; `x-is-bot` header
     forwarded internally **only when we trust it** (we no longer trust CF's
     `x-is-bot`; killed in `d7c1be0`). As of Phase 8 this same header is also
     what `/api/track` and `/api/pageview` read to set `is_bot` on analytics
     events — before that it was hardcoded `false` on every event ever
     recorded, so "Bot Views" in the dashboard had never shown a real number.
3. **`/api/links/[creator]` route** (Phase 1 → Phase 5 polish):
   - Sec-Fetch-Site check: permits `same-origin`, `none`, missing; rejects
     `cross-site` / `same-site` (Sec-Fetch-Site `none` was added in `f2aaac9`
     for iOS `instagram://extbrowser/` → Safari handoff)
   - Origin === Host strict check (real anti-CSRF guard)
   - HMAC link token verify — bound to slug + time bucket + age state; **not**
     bound to client IP as of Phase 8 (it was, and that's what was silently
     rejecting real mobile visitors — see §7.9)
   - Rate limit (30/min)
   - Returns `turnstile_required` for low-confidence visitors → frontend renders
     CF Turnstile widget; on solve, replays request
4. **`<CreatorPage>` (client)**:
   - Loads premium links on mount (`1458de8` — interaction gate removed; the
     other layers are sufficient, and the gate was blanking iOS users who
     never scrolled)
   - Sensitive links route to `/r/[linkId]` interstitial; non-sensitive
     redirect directly
   - IG WebView banner: hot-pink, two-button chooser (Chrome / Copy for Safari)
   - iOS auto-fires `instagram://extbrowser/?url=<current>` on mount to nudge
     IG into popping default browser. **iOS only** — Android skips this since
     `intent://` already handles it
5. **`/r/[linkId]` interstitial** (Phase 4):
   - Age gate lives here, not on landing
   - Real URL only injected after age confirm
   - Link token still binds to age state

---

## 5. Environment Variables (Vercel — prod + preview)

| Var | Purpose | Required |
|---|---|---|
| `DATABASE_URL` | Supabase pooled connection | yes |
| `CHARMLINK_ADMIN_KEY` | Admin route bearer auth | yes |
| `CHARMLINK_LINK_TOKEN_SECRET` | Signs link tokens. As of Phase 8, `lib/link-token.ts` **throws on startup in production** if this is unset instead of falling back to the dev secret hardcoded in that file — a misconfigured deploy fails loudly instead of signing every token with a value that's public in this repo. | yes |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV — backs the links-API rate limiter (30/min), the age-confirm rate limiter (10/min), and the honeypot ban list. Unset = rate limiting silently disabled and the honeypot can't ban at all (both fail open, not closed). Confirmed provisioned as of Phase 8 — the `/api/admin/bans` endpoint depends on it. | yes (prod) |
| `CLOUDFLARE_API_TOKEN` | CF provisioning (DNS + WAF + Settings) | optional, but unset = no auto-provision |
| `VERCEL_API_TOKEN` | Adds domains to Vercel project | yes for domain adds |
| `TURNSTILE_SECRET_KEY` | Server-side Turnstile verify | optional (gracefully skipped) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public widget key (`Charmlink` widget) | optional (gracefully skipped) |
| `CHARMLINK_ENABLE_BFM` | Set `1` to flip CF Bot Fight Mode on — **leave unset** | no |
| `BLOB_READ_WRITE_TOKEN` | Auto-injected by Vercel when a Blob store is connected to the project. Required at runtime for `/api/admin/avatar` uploads. **Currently enabled** — store `charmlink-blob` (id `store_fmeJquaTvcKmJHZU`, public, iad1) connected 2026-05-13 via API. If you ever add Blob to a fresh project, **force a redeploy afterwards** — builds that completed before the env var was injected won't have access to the token. | yes (prod) |

Token / secret storage off-repo:
- CF token: `~/.openclaw/cloudflare-token` (currently `cfat_sUuTw...` — **lacks
  `cache:purge` scope**; refresh if you need bulk edge flush). CF Account ID
  `1a52ed006170bc939725fbff79827c23`.

---

## 6. Database Schema (Supabase)

Shared instance with CharmaSutra. Tables:

- `charmlink_creators` — slug, name, avatar_url, custom_domain, theme JSON,
  effects JSON, `show_location`, `location_type`, `sensitive_default`,
  `cloak_enabled` (Phase 5, default true), `active`, `verified`, `font`,
  `avatar_shape` (Phase 9), `model_id` (Phase 9, FK → `charmlink_models`,
  nullable, `SET NULL` on delete) etc.
- `charmlink_links` — creator_id, label, subtitle, url, image_url,
  `deeplink_enabled`, `recovery_url`, `redirect_url`, `sensitive`, `badge`,
  `notes`, `tags`, visual override fields, ordering
- `charmlink_events` — pageviews + clicks + honeypot hits (used by analytics
  dashboard). Phase 9 adds `avatar_id` (FK → `charmlink_creator_avatars`,
  nullable, `SET NULL` on delete) — which carousel photo was on screen for
  this event; null on every historical row.
- `charmlink_creator_domains` — join table for multi-domain creators
  (`creator_id`, `domain`, `is_primary`); a trigger syncs the primary row back
  to `charmlink_creators.custom_domain` — never write that column directly
- `charmlink_models` (Phase 9) — the person behind one or more
  `charmlink_creators` rows. Owns `name`, `tagline`, theme colors,
  `avatar_shape`, avatar border config, `is_verified`, `font` — these
  **overlay** the attached creator row's own columns (which are left intact
  underneath) rather than replacing them, so detaching a site restores its
  own identity. See §7.11 for how the 70→30 backfill/merge was done.
- `charmlink_creator_avatars` (Phase 9) — carousel candidate photos. Owned by
  exactly one of `model_id` or `creator_id` (`CHECK (num_nonnulls(...)=1)`,
  never both) — `model_id` is the shared-pool path every current row uses,
  `creator_id` is a legacy single-site path. `is_active`, `is_pinned`
  (max 3, locks rotation), `sort_order`, `focal_x`/`focal_y` (0–100, crop
  focal point, default 50/25).
- `kv_*` (Vercel KV) — rate limit counters, ban list

Migrations live in `supabase/migrations/`: honeypot logs
(`20260508000000_create_honeypot_logs.sql`), Phase-5 cloak toggle
(`20260511000000_add_cloak_enabled.sql`), the Phase-6/7
`charmlink_creator_domains` table + sync trigger
(`20260529000000_create_creator_domains.sql` — this table had been applied
out-of-band and was undocumented in-repo until that migration was added),
and three Phase-9 migrations dated 2026-08-27/28: `create_creator_avatars`,
`add_avatar_focal_point`, `add_avatar_shape`, `create_models_grouping`. The
Phase-9 **data** migration (backfilling `charmlink_models` and merging
duplicate models) was executed as raw SQL directly against production and is
**not** captured in a migration file — see §7.11 for why and what ran. Run
schema migrations via Vercel-deployed migration script or the Supabase MCP
`apply_migration` tool.

---

## 7. The Hard-Earned Lessons (lock these in)

These cost us hours; future-me should not re-learn them.

### 7.1 iOS Safari cannot be launched from a WebView. Period.
- Apple killed `x-safari-https://` in iOS 14.5 (2021), never replaced it
- No JS API exists to "open default browser"
- Working escape tools from inside IG WebView:
  1. **App schemes for non-default browsers** (`googlechrome://`, `firefox://`,
     `microsoft-edge-https://`, `brave://`) — deterministic launch if installed
  2. **`instagram://extbrowser/?url=<current>`** — undocumented but works on
     iOS; triggers IG's native "Open in External Browser" handoff
  3. **Clipboard copy + toast** — always works, requires manual paste
  4. **Helper text → IG's ⋯ menu** — works when nothing else does
- `window.open` / `window.location.href` to `https://` from inside any in-app
  WebView (IG, FB, TikTok, LinkedIn) are intercepted and stay inside
- **Current shipped flow:** auto-fire `instagram://extbrowser/` on iOS load
  (handoff to Safari), plus a chooser button (Open in Chrome | Copy for Safari)
- **Don't re-add** chained scheme fallbacks (`googlechromes://` after IG
  extbrowser) — see `85c17dc`; they rip the user out of Safari and into Chrome
  ~1.5s after handoff

### 7.2 Cloudflare-injected `x-is-bot` lies when BFM is off
- CF still emits `x-is-bot: true` on every request even with BFM disabled
- We read it once → cloaked everyone → blank pages everywhere (commit `d7c1be0`)
- **Rule:** never trust CF-injected headers in app logic. Verify with `curl -v`
  and use local `isbot` package against the UA instead.

### 7.3 Custom-domain bare root needs middleware, not Vercel rewrites
- Vercel `rewrites.json` can't see the Host header in time to dynamic-map
  `hannazuki.com/` → `/waifuzukii`
- Has to happen in Next.js middleware (`fa23217`)
- Path-stripping IG sometimes does made this user-visible

### 7.4 Vercel storage integrations need a forced redeploy
- When you add a Blob/KV/Postgres store to a Vercel project AFTER its latest
  build, the env var (e.g. `BLOB_READ_WRITE_TOKEN`) is injected but the
  already-built deployment doesn't have it. Routes that read it will throw at
  runtime.
- **Fix:** force a fresh redeploy via
  `POST /v13/deployments?forceNew=1` with `deploymentId` of the last good build,
  OR push an empty commit, OR click "Redeploy" in the dashboard.
- Confirmed 2026-05-13 with the avatar Blob migration — commit `3cd5ce3`
  initially built without the token, redeploy `dpl_DiYmsvx6CJyiLA7nKJk2gXZgg2bX`
  baked it in.

### 7.5 CF orange-cloud during cert issuance kills new domains (gray→orange flip required)
- Symptom: visiting a freshly-added custom domain returns `SSL handshake failed` (or CF `525`) for the first ~3 minutes.
- Root cause: chicken-and-egg between Vercel's ACME challenge and CF's edge cert
  - `addDomain()` triggers Vercel → Let's Encrypt HTTP-01 challenge
  - If CF CNAME is already proxied (orange) when the challenge fires, CF intercepts the validation request and answers with its own edge cert — which doesn't exist for this hostname yet → handshake fails
  - Vercel never finishes issuance, browser sees a TLS error forever
- **Fix (shipped `757569d` on 2026-05-14):** provisioning now creates CNAME `proxied=false` (gray) first, polls Vercel `/v10/projects/.../domains/<d>` until `verified=true` and no pending verification challenges (max 180s), then `setRecordProxied(zone, domain, true)` flips it to orange.
- New `provisionZone` step order: findZone → ensureProxiedDnsRecord(`proxied=false`) → settings → BFM (gated) → ABP → WAF → **waitForVercelCert** → **flipToProxied**.
- `scripts/cf-backfill.ts` also repairs existing gray-stuck zones — re-run if a domain was added during the broken-flow window.
- Manual rescue (if waitForVercelCert times out): in CF dashboard, set the CNAME to DNS-only, wait ~30s for `curl -sI https://<domain>` to return 200 with a valid LE cert, then flip back to proxied. Or: `curl -X PATCH "https://api.cloudflare.com/client/v4/zones/<zone>/dns_records/<rec>" -H "Authorization: Bearer $CF_TOKEN" -d '{"proxied":true}'`.

### 7.6 Don't delegate engineering work to ACP subagent loops
- ACP subagent runs that loop tsc/eslint/build hit context overflow and time
  out (~4 min, ~46k tokens). Vela has timed out this way twice on the same task.
- **Fix:** for any engineering delegation, use a single fat
  `claude -p --dangerously-skip-permissions` CLI call inside `exec`. Sub-tool
  output stays in the CLI's own context, not the orchestrator's. See CODING.md
  in the agent root.
- This is an OpenClaw orchestration rule, not a Charmlink rule, but it bit us
  on the Blob migration so worth noting.

---

### 7.7 Operator skipped `cf-heal` on bouncedat.club regression (2026-06-02)

*(Renumbered from a duplicate "7.6" during the Phase 8 docs sweep — this and
the ACP-subagent lesson above it were both mislabeled 7.6. No content changed,
only the numbers, so any external link to "7.7 Self-serve Heal button" below
needed updating to 7.8 too.)*

- **What happened:** Domain `bouncedat.club` (creator `kai`) sat at CF 525 for hours. Operator (Cepheus) manually unproxied → removed from Vercel project → re-added → waited for cert → re-proxied. Took ~12 min wallclock plus loop confusion with the human.
- **Should have been:** `cd ~/.openclaw/workspace/agents/vela/charmlink && npm run cf-heal -- bouncedat.club` — ~3 min, idempotent, already documented in `NEW-DOMAIN-TROUBLESHOOTING.md`.
- **Why it was skipped:** Cepheus's MEMORY.md + AGENTS.md didn't mention `cf-heal`. The runbook only lives in the charmlink repo. When the domain monitor alerts, the on-call session doesn't naturally land on the runbook.
- **Lesson locked in:** Added pointer in `cepheus/MEMORY.md` under "Key Infrastructure". Next CharmLink domain alert MUST start with `cf-heal --` before any manual CF/Vercel API calls.
- **Secondary lesson:** Domain `bouncedat.club` was attached to Vercel charmlink project but never added to `charmlink_creator_domains`. That's why the 6h health monitor never alarmed when SSL first broke. Row now inserted; future regressions will alarm.
- **Open work item (NOW SHIPPED — see 7.8):** the self-serve "Heal domain" button in `/admin/domains` was bumped to the top of TODO after this regression and shipped same-day as PR #12. With it, Kayla heals her own domains and no operator needs to remember `cf-heal`.

---

### 7.8 Self-serve Heal button + auto-heal shipped (2026-06-02, PR #12)

Direct outcome of the 7.7 regression. The manual unproxy/remove/re-add loop is
now a one-click (or zero-click) operation.

- **Heal button** (`/admin/domains`): each domain row gets a **Heal** action.
  It POSTs `{domain}` to `app/api/admin/domains/heal/route.ts`, which:
  1. Pre-probes domain health via HEAD. If already healthy (<500), returns
     `{ok:true, noop:true}` and exits fast — safe to click anytime.
  2. If unhealthy, runs the same idempotent `provisionZone()` cycle as the
     `cf-heal` CLI: **gray → wait for Vercel cert (6× backoff) → re-orange**.
  3. Returns `{ok, noop, preStatus, postStatus, steps}` so the UI shows what
     happened.
- **Auto-heal on add:** adding a new domain now triggers the heal flow
  automatically, so the gray→orange race is handled at creation time instead
  of surfacing as a 525 later.
- **VERCEL_TEAM_ID:** the route auto-resolves the team id the same 3-tier way
  `cf-heal` does (env → file → `/v2/teams`), so it never silently 403s on
  `/v4/certs` (the 7.7 + PR #11 root cause).
- **Operator note:** the `cf-heal` CLI still exists and is still the fastest
  path from a terminal. For non-engineers (Kayla et al.), the button is the
  supported path — no repo checkout, no env vars, no memorized command.
- **Net effect:** the "operator forgot `cf-heal`" failure mode from 7.7 is
  structurally gone. A broken domain is fixable by anyone with admin access in
  one click, and most new domains never break in the first place.

---

### 7.9 The honeypot was banning humans, not bots (2026-08-26)

KOPi asked "clicks are up but subs aren't — is there a technical barrier?"
The instinct was to suspect the destination page. It wasn't.

**The mechanism.** `POST /api/links/[creator]` rejects a request that fails
any of its gates (bad HMAC token, rate limit, high-confidence bot). The
rejection payload used to be a single *visible* link labelled "Loading…"
pointing at `/api/honeypot`. A real visitor who was falsely rejected saw a
page with exactly one tappable thing on it and tapped it. `/api/honeypot`
then banned that IP for 24h unconditionally — and because a banned IP gets
served the decoy page by middleware, their very next attempt produced
*another* rejection, another "Loading…" link, and another ban. Self-reinforcing.

**Why real visitors were being rejected in the first place.** The link token
was minted server-side using the request's IP, then verified against the IP
of the browser's follow-up POST moments later. On mobile those two addresses
routinely differ — WiFi/cellular handoff, carrier NAT rotation, IPv6 privacy
addressing. Every mismatch triggered the trap above.

**Measured against production** (`charmlink_events` + `honeypot_logs`,
2026-05-10 → 2026-08-26, care of Supabase MCP access to the Charmasutra
project — `vhdgfcrjjscnhcdsqsgs`):
- 25,522 clicks — **12.6% of every recorded premium click** — were taps on
  the dead honeypot link. None of them could reach OnlyFans.
- 33,517 honeypot hits total; **86.6% carried ordinary mobile browser
  User-Agents, 0.12% carried a bot signature.** The trap's true positive
  rate was near zero.
- 8,712 distinct IPs banned, each hit ~3.85 times on average — the
  re-ban loop, visible in the data.
- Reported premium clicks were also ~19% inflated from an unrelated bug
  (see 7.10) stacked on top of the above.

**The fix (three changes, one commit each):**
1. `c7460a7` — rejection payload is now `{ links: [] }`. Nothing to follow, nothing to ban on.
2. `c7460a7` — link token dropped the IP term entirely (`lib/link-token.ts`).
   Verified server-minted origin + creator scope + ~5-10min freshness + age
   state are still enough; Origin===Host and rate limiting are unaffected.
   Old IP-bound tokens still verify for a grace window so pages open at
   deploy time don't break.
3. `c7460a7` — the honeypot now bans only when the *request itself* looks
   automated (empty/bot UA, or missing both `Sec-Fetch-*` and an HTML
   `Accept`), and never on the `ref=d1` parameter the old payload used to
   tag its link. Every hit is still logged either way.

**Self-serve backlog cleanup:** fixing the honeypot stops *new* bans but does
nothing about the ~8,712 already in KV with up to 24h left on their TTL.
`ee524cb` added `GET/POST /api/admin/bans` (count / flush, scoped to
`cl:banned:*` only); `84b57c9` surfaced it as a **Blocked Visitors** card on
`/admin/dashboard` with a one-click flush, since KOPi couldn't run curl
commands from where they were. Read that card, don't assume — it's the
fastest way to check whether the ban list is climbing again after any future
honeypot change.

**How the fix was verified live — a natural experiment.** After shipping,
KOPi reported real phones weren't rendering premium links from Instagram at
all. Suspecting the fix, they asked for a temporary full revert (`deb8ee7`)
to compare against pre-fix behavior, then a restore (`ebb505a`) once satisfied.
Querying `charmlink_events` across that window gave an accidental
before/during/after control:

| Window | Trapped clicks |
|---|---|
| Before first fix | 21 |
| **Fix live (~25 min)** | **0** |
| Revert window (~24 min) | 22 |
| **Since restore** | **0** |

The trap switched off, back on, and off again exactly in step with each
deploy — causal, not correlational, proof the fix works. **Keep this
pattern in mind**: an accidental or deliberate revert/restore round-trip
around a live metric is a cheap, strong verification method when you have
event-level data to query. Don't waste it by failing to check the metric
during the revert window.

**Important negative result, worth not re-investigating:** the Instagram
"this webpage is trying to open [App]" confirmation dialog KOPi saw during
testing is **unrelated to any of this**. `git log -S "extbrowser"` across the
whole incident shows the IG auto-escape code (`instagram://extbrowser/` on
mount, `CreatorPage.tsx`) was untouched by every commit in this phase — it
predates it by months (`9706029`, `85c17dc`). It also turned out to be
isolated to KOPi's own device; other phones weren't seeing it. Leading
theory: they were reaching the real (JS-executing) page for the first time
in this test — previously banned, they'd have been served the no-JS decoy,
where the escape code never runs — so the prompt was always latent, just
newly reachable. Not conclusively confirmed; if it resurfaces, don't
re-blame Phase 8 code without checking that theory first.

### 7.10 Three analytics-correctness bugs found while investigating 7.9

Not revenue-affecting on their own, but they were making the incident harder
to diagnose and would keep corrupting every CTR/CVR number computed from
this data going forward. Fixed alongside the main fix (`8109fa3`, `f3e0c7f`):

- **Clicks double-counted.** A journey through `/api/redirect/[linkId]`
  wrote two click rows: the client beacon at tap time, plus a server-side
  row when the redirect was actually served. Measured at 6,358 duplicated
  journeys. Fix: the server-side row now carries a sentinel session id
  (`REDIRECT_EVENT_SESSION_ID`, exported from `lib/db.ts`) and analytics
  queries exclude it via a `DEDUPED_CLICKS` predicate — but the row itself
  is **kept**, not deleted, because the gap between "beacon fired" and
  "redirect served" is exactly the funnel signal that let us measure
  age-gate completion at 98.8% during the same investigation. Don't delete
  those rows chasing a cleaner schema; the redundancy is the point.
- **`is_bot` was hardcoded `false`** on every event ever recorded — `/api/track`
  literally wrote the literal `false`, and `/api/pageview` read it from the
  client-sent body, which the client also always sent as `false`. All
  708,845 rows in the table (at time of discovery) carried `is_bot=false`.
  "Bot Views" in the admin dashboard had never shown a nonzero number.
  Fix: both routes now resolve it server-side from the `x-is-bot` header
  middleware stamps on the forwarded request (`lib/event-bot-flag.ts`) —
  that header reflects full detection (isbot + Meta-2026 UAs + ASN + honeypot
  ban list) and can't be spoofed by the client, since middleware overwrites
  whatever the caller sent.
- **Every creator-page 404 was logged as a database error.** `app/[creator]/page.tsx`
  called `notFound()` — which signals by *throwing* — inside a `try` whose
  `catch` logged `"[creator:page] DB error"`. The page still rendered the
  404 correctly, but a bad slug and a real DB outage were indistinguishable
  in the logs (14 occurrences / 12 users since 2026-06-16 by the time this
  was caught — the only error group Vercel's runtime-error aggregation had
  for the whole project). Fix (`f3e0c7f`): the `try` now wraps only the two
  DB calls; the missing-creator case is a silent guard after it.

---

### 7.11 Grouping duplicate rows by name needs a human, not a regex
- 70 creator rows, ~half of them duplicate people (one per domain). Exact-name
  backfill got 49 models cleanly, but the data also had `Hanna Zuki` (6 sites)
  next to `Hanna` (2 sites) next to `Hanna ♥` (1 site) — same person, three
  names — and separately `Kai` (3 sites) next to `Kaia` (2 sites) — **different
  people**, where `kai` is just a string-prefix of `kaia`.
- Naive fuzzy matching (edit distance, prefix match) would have merged Kai
  into Kaia. A wrong merge blends two people's photos and stats
  irreversibly — there's no clean undo once the avatar pool and event
  attribution have mixed.
- **What worked:** generate candidates via normalised-name equality/prefix
  overlap, but require independent evidence (a slug or domain that literally
  spells the fuller name — `hannazuki`, `moreofivyem`) before treating a pair
  as safe. Present every candidate pair to the human with the evidence
  visible; merge only what's confirmed, tier by tier (exact-normalized-match
  first, evidence-backed second, "plausible but unproven" last and only on
  explicit request).
- One name (`Holly`) turned out to have **four** duplicate rows, not the two
  originally spotted — a first pass undercounted it. Always re-run the
  candidate query right before executing a merge, not from memory of an
  earlier pass.
- "Fullest name wins" as a canonicalization rule needs a sanity check too —
  it would have elected `Hollys World` (a site name) over `Holly` (her name)
  purely on string length. Applied the naive rule everywhere except where a
  human said otherwise.

### 7.12 Fan-out-per-creator breaks the moment query count grows (production outage #1)
- `/api/analytics/overview` called `getAnalytics()` once per creator inside a
  `Promise.all`. This was flagged as an N+1 risk *before* it was made worse,
  then made worse anyway: adding the clicks-over-time chart and per-photo
  performance took the per-creator query count from ~5 to ~7. At 70 creators
  that's ~490 simultaneous queries against a pool capped at `max: 3`
  (deliberate — see the pool comment in `lib/db.ts`, Supabase-pooler
  fan-out safety). They queued past `connectionTimeoutMillis` and the whole
  endpoint 500'd.
- **User-visible symptom looked exactly like data loss** — the dashboard
  rendered every stat as 0. It wasn't; 716k events were still recording the
  whole time. A failed-fetch zero and an empty-dataset zero are visually
  identical to a non-technical user, so **always check the data before
  explaining the UI** when someone reports "everything is gone."
- **Fix:** `getAnalyticsBatch()` (`lib/db.ts`) does the same aggregation
  grouped by `creator_slug` in a fixed 8 queries total, using
  `ROW_NUMBER() OVER (PARTITION BY creator_slug ...)` windows to keep the
  existing top-10 limits on referrers/countries. Cost is now flat in
  creator count instead of linear.
- **Rule going forward:** any endpoint that loops `Promise.all(creators.map(...))`
  calling a multi-query function is a future outage waiting on either more
  creators or more queries per creator. Group by the loop key in SQL instead.

### 7.13 Re-verify a cloaking change against the actual code path, not the last analysis
- Loosening title visibility (showing the creator's name in `<title>` for
  non-scraper visitors) was initially defended by re-explaining the same
  reasoning from memory on a second question. The honest answer required
  re-reading `middleware.ts`'s `shouldCloak` logic and `CreatorPage.tsx`'s
  render output *again*, which surfaced a correction: the earlier framing
  ("this opens a small gap") overstated it — any UA that reaches
  `generateMetadata` at all was already being served the creator's name in
  the page `<h1>` and footer, since it survived every upstream bot gate. The
  title is a third copy of a signal the page already leaked, not a new one.
- **Rule:** when re-asked "are you sure," re-verify against the code, don't
  restate the prior conclusion with more confidence.

### 7.14 pg returns `timestamptz` as a JS `Date`, not a string (production outage #2)
- `date_trunc()` results were typed as `string` in `AnalyticsSummary`, and
  that lie was harmless for months because the value only ever got
  `JSON.stringify`'d, where a `Date` silently serializes to an ISO string. The
  model-rollup fold was the first code to actually *treat* the value as a
  string (`.localeCompare()`), which threw — `/api/analytics/overview` 500'd
  a second time in the same session, right after the pool-exhaustion fix
  shipped.
- It was also hiding a second, quieter bug: the fold keyed a `Map` on
  `bucket`, and two distinct `Date` objects for the same instant are never
  `===` and never the same Map key — so even without the crash, a model's
  per-site timeseries would never have merged; every bucket would have
  appeared once per site instead of summed.
- **Fix:** coerce with `new Date(r.bucket).toISOString()` at the query
  boundary in `lib/db.ts`, so the declared `string` type is actually true by
  the time it leaves the DB layer, rather than defending every downstream
  consumer against the driver's real type.
- **Test gap that let this ship:** the pre-deploy check for the rollup fed
  synthetic **string** buckets — it exercised the assumption, not the
  driver's actual behavior. `pg`'s real output should have been the fixture,
  not a plausible-looking stand-in. Fixed the test to use realistic values
  and assert cross-site merging actually happens, not just that it doesn't
  crash.
- **Pattern across both outages:** this repo cannot execute
  `/api/analytics/overview` from the coding sandbox (admin-key gated, DB
  reachable only via the Supabase MCP tool, and the proxy blocks live
  custom domains) — typecheck/lint/build/deploy-health all passed both times
  while the actual route logic was broken. Any change to that endpoint's
  data shape needs either a synthetic-payload smoke test that matches the
  driver's real types, or a live post-deploy log check for that specific
  path before calling it done — not just "build succeeded."

### 7.15 Phase 8 24h checkpoint: the fix worked, the predicted uplift didn't
- Scheduled 24h checkpoint (trigger `trig_012yLy9neEWbjN6HRzqnW5qj`) fired and
  was run against production: **trapped clicks are confirmed 0** across
  7,109 views / 28.8h post-restore — the honeypot bug is dead, no regression.
- **The predicted headline number did not show up.** Baseline reached-OF-per-
  100-views was 32.48–32.97 (two slightly different measurement windows);
  post-fix it's 32.80 — statistically flat, not the ~38 predicted rise.
- **Why the prediction was wrong:** it assumed every trapped click was a real
  customer who would otherwise have converted. The flat result says that's
  false — the ~5.4/100 clicks that used to hit the honeypot were mostly
  automated/curiosity traffic, not lost revenue. Reported premium clicks
  dropping from 37.86 to 32.80 per 100 views is exactly that phantom-click
  removal (37.86 − 5.38 ≈ 32.48), and matches.
- **Correction, not a regression:** the real, measured value of the fix is
  "your analytics stopped counting ~14% phantom premium clicks," not "you
  gained X% more subscribers." Don't let the earlier "clicks saved" framing
  stand uncorrected if it resurfaces.
- 72h checkpoint not yet re-armed as of this doc's last edit — if picking
  this up, re-arm it with the corrected expectation (track phantom-click
  removal, not conversion uplift) rather than the original prediction.

---

## 8. Recent Commit Sequence (2026-05-11 → 2026-08-28)

In reverse chronological order. All on `main`. The 2026-08-26 block includes
a deliberate revert (`deb8ee7`) and restore (`ebb505a`) — see §7.9 for why;
they're kept in history rather than squashed so the round-trip stays
auditable. The 2026-08-28 (Phase 9) merge/backfill was executed as raw SQL
directly against production, not a migration commit — see §7.11.

```
6b1f0ed feat(admin): dark mode fixed at the root, searchable analytics roster, drop dead avatar card  ← Phase 9
4036915 fix(analytics): bucket is a Date from pg, not a string — 2nd outage same phase, see §7.14      ← Phase 9
49fa104 feat(analytics): report per model, not per domain (rollup, weighted rates not averaged)        ← Phase 9
012f07f fix(analytics): overview exhausted the connection pool and 500'd — 1st outage, see §7.12       ← Phase 9
365ae8c feat(charmlink): group a model's domains under one identity (charmlink_models + overlay)       ← Phase 9
d902017 feat(charmlink): portrait and rounded-square avatar frames                                     ← Phase 9
6f4827c feat(charmlink): aim the avatar crop at the face instead of the centre (focal_x/y)              ← Phase 9
30f2b9f feat(charmlink): show the creator's name in the browser tab — see §7.13                        ← Phase 9
4f5e605 feat(charmlink): size the creator avatar as a hero element                                      ← Phase 9
940e174 feat(charmlink): avatar carousel A/B testing, bigger avatar, inline link editing                ← Phase 9
0a110b1 feat(analytics): clicks-over-time chart per creator, total vs premium
ab0e3e4 fix(charmlink): Top Referrers grouped the raw referer string, not the source
d544e7d docs(charmlink): comprehensive sweep — README, resume doc, and admin SOP catch up to Phase 8
84b57c9 feat(admin): Blocked Visitors card — see/clear honeypot bans from the dashboard  ← Phase 8
ee524cb feat(admin): GET/POST /api/admin/bans — count + flush the honeypot ban list      ← Phase 8
ebb505a Revert "revert: TEMPORARY rollback ... for Instagram testing" — restores the fix  ← Phase 8
deb8ee7 revert: TEMPORARY rollback of all 2026-08-26 changes for Instagram testing        ← Phase 8 (deliberate, see §7.9)
f3e0c7f fix(charmlink): stop 404s being logged as database errors on creator pages        ← Phase 8, §7.10
8109fa3 fix(charmlink): dedupe click counting, resolve is_bot server-side, drop dead iOS scheme  ← Phase 8, §7.10
dc8121b docs(charmlink): click-conversion funnel analysis report (PDF)                     ← Phase 8
c7460a7 fix(charmlink): stop the links-API rejection path from banning real users          ← Phase 8, §7.9 (the main fix)
ba79e6d fix(charmlink): make creator_domains migration match production exactly
6029c5f fix(charmlink-admin): analytics period selector didn't refetch stats
378b9f9 fix(charmlink): repair README drift, missing domains migration, env example, dev-secret fallback
d596f62 feat(admin): self-serve Heal button + auto-heal on domain add (#12)            ← Phase 7.7
5cfb2e9 fix(cf-heal): auto-resolve VERCEL_TEAM_ID — silent root cause of stuck domains (#11)  ← Phase 7.6
5240cce docs(charmlink): definitive new-domain troubleshooting (525 SSL race) (#10)
d927aa4 fix(domains): eliminate 525 SSL race + heal-on-detect + cert teamId (#9)
26e3c15 docs(state): fix WAF rule count + ASN list + add gray->orange lesson (7.5)
757569d fix(domains): gray→orange CF flip after Vercel cert issues (fixes SSL handshake on new domains)
3cd5ce3 feat(admin): Vercel Blob storage for avatar uploads (drop data-URL hack)   ← Avatar upload fix
57a7c19 docs: comprehensive state-of-repo doc for cold resume
910f445 fix(images): whitelist public.onlyfans.com + imgur for Next.js image optimizer
f2aaac9 fix(links-api): allow sec-fetch-site=none for iOS extbrowser handoff
85c17dc fix(ig-escape): iOS-only IG scheme, skip Chrome/Firefox/Brave chain
9706029 feat(ig-escape): auto-fire instagram://extbrowser/ on page load
452b572 feat(stealth): per-creator decoy theme bundles + bot-only cloak bypass   ← Phase 5
faaff0c style(ig-banner): switch banner from yellow to hot pink
947e009 feat(ig-banner): split escape button into Chrome + Copy-for-Safari chooser
1458de8 fix(ux): load premium links on mount; remove interaction gate
7570c09 fix(ig-webview): replace dead x-safari-https scheme with googlechrome:// + clipboard fallback
d7c1be0 fix(middleware,bot): stop cloaking real users; harden domain rewrite
fa23217 fix(middleware): rewrite custom domain root to creator slug (hotfix)
cfaae9e feat(age-gate): move from site-wide to per-link sensitive gate (Phase 4) (#7)
e96d91b fix(cf): gate Bot Fight Mode behind CHARMLINK_ENABLE_BFM (default off) (#6)
49c7898 feat(turnstile): auto-sync widget hostnames + render frontend challenge (#5)
3fac2de fix(cf): use legacy firewall API for Free tier compatibility (#4)
5771b4c Hardening Phase 3: Cloudflare orange-cloud + Turnstile escalation + origin lock (#3)
b00548c diag: surface honeypot DB write errors to logs
cb550c8 Hardening Phase 2: cleanup sweep (12 changes) (#2)
b6605a7 Hardening Phase 1: kill cloaking signals (5 changes) (#1)
```

---

## 9. Verified Working (last checked 2026-05-13 ~15:15 PDT)

- `curl -A facebookexternalhit hannazuki.com/waifuzukii` → 200, decoy title
  "Composting in a small flat: a slightly tedious how-to"
- `curl -A TelegramBot hannazuki.com/waifuzukii` → same composting decoy
  (slug-deterministic)
- `curl -A facebookexternalhit hollysworld.club/` → 200, different decoy theme
  ("What grew, what didn't, and what the slugs ate this year")
- iPhone Safari → real Charmlink page with premium links loaded on mount
- Decoy responses contain zero `dpl_|_next/static|cl-token|charmlink`
  fingerprints
- IG iOS WebView → page paints, auto extbrowser handoff to Safari, premium
  links load (sec-fetch-site `none` allowance is what made this work)
- `https://charmlink.vercel.app` HTTP 200 after Blob redeploy `dpl_DiYmsvx6CJyiLA7nKJk2gXZgg2bX`
- Avatar upload endpoint live on commit `3cd5ce3` with `BLOB_READ_WRITE_TOKEN` injected

### 9.1 Verified Working (2026-08-26, Phase 8)

No local shell access to the production domains this round (sandboxed
session, egress-blocked to the live hostnames) — everything below is Vercel
API + Supabase MCP telemetry, not a manual `curl`. Worth a human loading a
creator page from an actual phone to close that gap.

- Deployment `dpl_5VL8YoKfwF8UvMyhzvFJtVgmjVib` (commit `84b57c9`) — `READY`,
  `aliasError: null`, all 74 aliased hostnames (73 custom domains +
  `charmlink.vercel.app`) resolved to it.
- Runtime logs on that deployment: 150× `200`, 2× `404` (expected — bad
  slugs, no longer logged as DB errors per §7.10), **zero `500`s** — this
  also incidentally confirms `CHARMLINK_LINK_TOKEN_SECRET` really is set in
  prod, since the Phase 8 fail-closed change would 500 every creator page if
  it weren't.
- The revert/restore natural experiment in §7.9 — trapped-click count went
  21 → 0 → 22 → 0 in lockstep with deploy/revert/restore, verified via
  direct `charmlink_events` queries against Supabase project
  `vhdgfcrjjscnhcdsqsgs` (org `aqnhdkqzvbpblquwyhci`, the shared instance
  with Charmasutra — see §6).
- `git diff <build-sha> --name-only` used repeatedly during the revert
  round-trip to confirm the working tree was byte-identical to a specific
  prior commit before pushing — cheap insurance against a partial or
  mis-scoped revert.
- A 24h and 72h follow-up check on the real-world effect (reached-OF-per-100-
  views should rise from a measured baseline of 32.97) was scheduled via
  `send_later` (trigger `trig_012yLy9neEWbjN6HRzqnW5qj`, fires
  2026-08-27T23:57Z) rather than left for a human to remember. If you're
  reading this after that fired, check whether it actually got reported and
  re-arm the 72h one if not.

### 9.2 Verified Working (2026-08-28, Phase 9)

Same caveat as §9.1 — no shell access to live production domains from this
session; Vercel API + Supabase MCP telemetry only.

- Final deployment `dpl_FGk3wXxhPCEw7JVgKhTyAUoc3FD6`-and-later (through
  `6b1f0ed`) — `READY`, `aliasError: null`, all domains aliased.
- Runtime logs post-fix: sustained `200`s on `/`, `/api/pageview`,
  `/api/track`, `/api/resolve-domain`, `/api/links/[creator]` throughout —
  **public traffic was never interrupted by either outage** (§7.12, §7.14);
  both were isolated to `/api/analytics/overview`, an admin-only route.
- Direct `charmlink_events` query confirmed data was never lost during
  either outage — 716,841 events, most recent within seconds of the check,
  the whole time the dashboard was rendering zeros. Confirmed *before*
  responding to the "did we just wipe our analytics" question, not after.
- Model-rollup math verified against synthetic fixtures before shipping
  (not just typecheck/build): weighted-CTR-not-averaged, photo-pool
  deduplication (not multiplied by site count), and cross-site timeseries
  bucket merging using realistic `pg`-shaped values — see §7.14 for why the
  first version of that test wasn't enough.
- Post-merge integrity check on the model backfill: 70 sites / 0 orphaned,
  8 photos / 0 orphaned, 0 duplicate model names, 0 stray-whitespace names,
  Kai/Kaia and Ivy Eros/Ivy Ember confirmed still separate models after the
  fuzzy-merge pass (§7.11).
- User-facing confirmation via screenshot: Hanna Zuki's model card showing
  654 views / 73 premium clicks / 11.16% CTR combined across her (then) 10
  sites, matching what direct SQL against `charmlink_events` for the same
  window independently computed.

---

## 10. Known Open / Future Items

These were on the radar but not done. Pick up as needed.

- **CF token refresh** with `cache:purge` scope (current token can't bulk flush
  edge). Not blocking — most responses are `cf-cache-status: DYNAMIC` — but
  needed if a stale decoy ever gets cached at the edge.
- **Per-agent git identities** so commits show "Vela" / "Cepheus" / "Aquila"
  attribution directly instead of via `Co-authored-by:`. KOPi hasn't decided.
- **Decoy themes expansion** — currently 8–10 wholesome blogs in
  `lib/decoy/themes.ts`. Could add more variety to reduce repeat patterns
  across creators.
- **Avatar data-URL migration** — existing creators may still have
  `data:image/...` URLs in `avatar_url`. They render fine but bloat DB rows.
  Not blocking. Will age out organically as creators re-upload. Could write a
  one-shot migration to extract + push to Blob if it becomes a problem.
- **Phase 6 candidate ideas (not spec'd):**
  - Per-link click telemetry rollup in admin
  - Auto-detect IG-blocked domains via Charmlink's own analytics → flag for
    rotation
  - A/B testing per link
- **Hannazuki avatar** — pointing at `public.onlyfans.com`; verified working
  post-`910f445`. If OF rotates that CDN host, whitelist update needed.
- **Phase 8 24h check — resolved, see §7.15.** Zero trapped clicks confirmed
  sustained. Reached-OF-per-100-views did **not** rise toward ~38 as
  predicted — it's flat at ~32.8, essentially unchanged from baseline.
  Reported premium clicks dropped ~13% as predicted (phantom clicks leaving
  the count — that part of the prediction held). Net: the fix's real value
  is analytics-correctness (stop counting phantom clicks), not a
  conversion lift. **72h checkpoint not yet re-armed** — do that with the
  corrected expectation before trusting a future "it worked" from this
  thread.
- **The Instagram "open an app outside" dialog** — unresolved, and per
  §7.9's negative result, not attributable to any Phase 8 code. If it
  recurs and is confirmed to affect more than one device, the next lever to
  pull is moving `instagram://extbrowser/` from an on-mount auto-fire to a
  first-gesture-triggered one — platforms are generally more permissive
  about scheme handoffs following a user gesture than one fired
  unprompted on load. Not built; would need its own testing pass before
  shipping given how load-bearing the current auto-escape is for premium
  clicks arriving from Instagram at all.
- **Two Tier-3 merge review pairs were resolved this session, none left
  pending** — all Tier-1/2/3 candidate models the user asked to merge (§7.11)
  are merged as of Phase 9. If new duplicate-looking models show up later
  (a slug fragment, an emoji variant), re-run the candidate query in §7.11
  rather than eyeballing the list — it caught a 4-way duplicate (`Holly`)
  that a first manual pass had only counted as 2.
- **`getAnalyticsBatch` and `rollupByModel` are a second implementation of
  the per-creator aggregation rules** (dedup predicate, hostname grouping,
  bot exclusion) alongside the older per-creator `getAnalytics()`, which
  the legacy per-creator analytics API route (`/api/analytics/[creator]`)
  still calls directly. Both were checked against production for identical
  output before shipping, but two readers of one rule set is a drift risk —
  worth consolidating if `getAnalytics()` and `getAnalyticsBatch()` are ever
  edited separately and start disagreeing.
- **Real face detection for the avatar focal point** was considered and
  explicitly not built — the `focal_x`/`focal_y` columns exist and the admin
  has a manual click-to-set picker, but the default is a heuristic (top-25%
  bias, adaptive to aspect ratio) not a detector. If manual tuning across
  many photos becomes a real time cost, a detection model at upload time
  could write to the same columns with no other changes needed.
- **`.claude/settings.json` allowlists `mcp__Supabase__execute_sql`** to stop
  per-query permission prompts. That tool can run arbitrary SQL, including
  writes — broader than "read-only," even though every actual use this
  session was read/verify/one-off-fix. Deny rules cover the destructive
  Supabase project operations and force-pushes as a backstop. Revisit if the
  scope ever feels too wide.

- **Historical trapped clicks are not backfilled.** The ~25,522 pre-fix
  honeypot-trap clicks and the ~6,358 pre-fix double-counted redirect clicks
  (§7.9, §7.10) remain in `charmlink_events` as real rows — correctly, since
  they were real taps — but any CTR/CVR figure computed over a date range
  spanning 2026-05-10 through the Phase 8 fix will be inflated versus one
  computed entirely after it. Nobody has written a "pre/post Phase 8"
  annotation into the events table or the analytics queries; if this trips
  someone up, that's the fix (a boundary timestamp constant, not a
  backfill/delete of the old rows).

---

## 11. How to Resume Cold

1. `cd ~/.openclaw/workspace/agents/vela/charmlink && git pull && git log --oneline -20`
2. Read this file + `docs/PHASE-3-CLOUDFLARE.md`
3. For history: `memory/archive-2026-05-10.md` (Phases 1–3),
   `memory/2026-05-11.md` (Phase 4 + 5 + IG WebView saga)
4. If shipping new code: spawn Vela with a **single fat CLI call** (per the
   ACP-vs-CLI rule in `CODING.md`). KOPi prefers "just deploy yourself" — no
   "merge first or test preview?" check-ins. Verify diff, sanity-check, push,
   verify live.
5. Anything CF-related: check both legacy `/zones/<id>/firewall/rules` AND
   modern `/zones/<id>/rulesets` — edge rules can silently block what app code
   expects to handle.
6. **Phase 9 provenance note:** the 2026-08-27/28 work (avatar carousel,
   model grouping, analytics fixes) was done from a different tool/session
   context than the OpenClaw Vela/Cepheus/Aquila setup steps 1–5 describe —
   no local `~/.openclaw/...` checkout, direct git push to `main` instead of
   a PR, and Supabase access via an MCP tool rather than a local
   `DATABASE_URL`. The resulting code, schema, and this doc are the same
   artifacts either way; steps 1–5 above are still the right way to resume
   if you're operating as Vela specifically.

---

## 12. Pointers to Authoritative Memory

- `MEMORY.md` — Charmlink one-liner under `### Projects`
- `memory/archive-2026-05-10.md` — Phase 1–3 ship history
- `memory/2026-05-09.md` — Phase 1 + 2 + Phase 3.3 BFM gating
- `memory/2026-05-11.md` — Phase 4 ship + 3 hotfix saga + IG WebView lessons +
  Phase 5 decoy cloaking + CF firewall-rules teardown that fixed empty link
  previews
- `docs/PHASE-3-CLOUDFLARE.md` — canonical CF wiring deep-dive
- `docs/CharmLink-Admin-SOP.pdf` — admin-side SOP for KOPi (creating creators,
  attaching domains, managing links)
