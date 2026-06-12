# Charmlink — State of the Repo (Resume Doc, 2026-05-13)

This is the "pick it up cold weeks later" doc. Reads top-to-bottom and assumes
no prior context. For deep history per phase, see `memory/` daily logs
referenced inline. **Last updated:** 2026-06-03 (Phase 7.7 — 11 live domains; self-serve Heal button shipped + auto-heal on domain add; `cf-heal` VERCEL_TEAM_ID auto-resolve).

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
- **Live domains (verified, as of 2026-06-02):** 11 total. Source of truth = `charmlink_creator_domains` join table.
  - `https://charmlink.vercel.app` (canonical, but origin-locked for slug paths)
  - `https://hollysworld.club` → `holly`
  - `https://hannazuki.com` → `waifuzukii`
  - `https://getmysocials.club` → `lookhere`
  - `https://sweetlinks.club` → `righthere`
  - `https://hiddensecret.me` → `hereitis`
  - `https://peekhere.club` → `myplatforms`
  - `https://sweetstuff.club` → `mysocials`
  - `https://sweet-site.com` → `lookheree`
  - `https://only-links.com` → `getmysocialss`
  - `https://its-here.com` → `foryou`
  - `https://bouncedat.club` → `kai`  *(added 2026-06-02; 525 stuck → healed manually because operator forgot `cf-heal`; see Phase 7.6 below)*
- **Built by:** Vela (engineering) + Cepheus (ops/CF) + Aquila (sec review).
  Commits authored as `KnifeOfPi <nate@mindstar.space>`; real authorship lives
  in `Co-authored-by:` trailers.

---

## 2. Current Production Status

All Phases 1–5 are **shipped + live**. Last sweep: 2026-05-11 evening PDT.
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
| 8 | **2026-06-06** **Spotlight template** — second, per-creator selectable landing-page design (link.me-style warm dark: full-bleed hero, gradient social pills, follower count, "EXCLUSIVE CONTENT" featured card, scrollable thumbnail gallery), alongside the existing **Glass** template. Fully data-driven per creator; tint/glow derived from `theme_accent`. New admin **Spotlight** tab. Shares age-gate, interaction-gated premium fetch, decoy SSR branch, and per-link overrides with Glass. Migration `20260606000000_add_spotlight_template.sql` (8 non-breaking columns). Also fixed a site-wide missing `viewport` meta (mobile desktop-width fallback). Manager guide: `docs/SOP-spotlight-landing-page.md`. Live demo: `/demo-spotlight`. | PR #13 (`feat/spotlight-template`) |

See `memory/archive-2026-05-10.md` for Phase 1–3 ship-day notes and
`memory/2026-05-11.md` for everything Phase 4 + 5 day-of.

---

## 3. Repo Layout (the parts that matter)

```
charmlink/
├─ app/
│  ├─ [creator]/                  ← public creator page (CreatorPage.tsx + AgeGate*, page.tsx)
│  ├─ admin/                      ← admin dashboard (6-tab shadcn UI: +Spotlight)
│  ├─ api/
│  │  ├─ links/[creator]/route.ts ← HMAC-locked premium links API
│  │  ├─ resolve-creator-meta/    ← (Phase 5) creator meta lookup for decoy
│  │  ├─ age-confirm/             ← sets cl_age cookie (legacy, still wired for /r/[linkId])
│  │  ├─ honeypot/                ← bot capture
│  │  └─ redirect/[linkId]/       ← click-through tracking
│  ├─ r/[linkId]/page.tsx         ← Phase 4 per-link sensitive interstitial
│  └─ robots.ts                   ← noindex everywhere
├─ lib/
│  ├─ bot-detect.ts               ← layered detection (isbot + ASN + Meta UA + Sec-Fetch)
│  ├─ datacenter-asns.ts          ← 13 hosting ASN list
│  ├─ scraper-detect.ts           ← 12 link-preview UA patterns
│  ├─ rate-limit.ts               ← Vercel KV-based limiter
│  ├─ kv-ban.ts                   ← bad-IP ban list
│  ├─ link-token.ts               ← HMAC token mint/verify (links API + /r interstitial)
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
│  └─ db.ts, analytics.ts, types.ts, utils.ts
├─ middleware.ts                  ← host → creator rewrite, scraper decoy injection, isbot UA check
├─ next.config.ts                 ← image remotePatterns (incl. public.onlyfans.com, imgur)
├─ scripts/
│  ├─ migrate.ts, migrate-v2.ts, migrate-v3.ts ← schema migrations
│  └─ cf-backfill.ts              ← provision/repair CF state across all creators
├─ supabase/migrations/
│  ├─ 20260508000000_create_honeypot_logs.sql ← Phase 2 honeypot logging
│  └─ 20260511000000_add_cloak_enabled.sql   ← Phase 5 toggle column
└─ docs/
   ├─ PHASE-3-CLOUDFLARE.md       ← CF wiring deep-dive (canonical)
   ├─ CharmLink-Admin-SOP.pdf     ← admin SOP for KOPi
   ├─ charmlink-sop.py            ← SOP source
   └─ CHARMLINK-STATE-2026-05-13.md ← (this file)
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
     `x-is-bot`; killed in `d7c1be0`)
3. **`/api/links/[creator]` route** (Phase 1 → Phase 5 polish):
   - Sec-Fetch-Site check: permits `same-origin`, `none`, missing; rejects
     `cross-site` / `same-site` (Sec-Fetch-Site `none` was added in `f2aaac9`
     for iOS `instagram://extbrowser/` → Safari handoff)
   - Origin === Host strict check (real anti-CSRF guard)
   - HMAC link token verify
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
| `CHARMLINK_LINK_HMAC_SECRET` | Signs link tokens | yes |
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
  `template` (`glass`|`spotlight`, default glass) + Spotlight fields
  `hero_image_url`, `hero_enabled`, `username`, `show_follower_count`,
  `follower_count_label`, `featured_card` (JSONB), `gallery_thumbnails` (JSONB) — Phase 8, etc.
- `charmlink_links` — creator_id, label, subtitle, url, image_url,
  `deeplink_enabled`, `recovery_url`, `redirect_url`, `sensitive`, `badge`,
  `notes`, `tags`, visual override fields, ordering
- `charmlink_events` — pageviews + clicks + honeypot hits (used by analytics
  dashboard)
- `kv_*` (Vercel KV) — rate limit counters, ban list

Migrations live in `supabase/migrations/`. Two so far: honeypot logs
(`20260508000000_create_honeypot_logs.sql`) and Phase-5 cloak toggle
(`20260511000000_add_cloak_enabled.sql`, most recent). Run via Vercel-deployed migration
script or feed SQL to Nate (no local DATABASE_URL on Cepheus machine).

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

### 7.6 Operator skipped `cf-heal` on bouncedat.club regression (2026-06-02)

- **What happened:** Domain `bouncedat.club` (creator `kai`) sat at CF 525 for hours. Operator (Cepheus) manually unproxied → removed from Vercel project → re-added → waited for cert → re-proxied. Took ~12 min wallclock plus loop confusion with the human.
- **Should have been:** `cd ~/.openclaw/workspace/agents/vela/charmlink && npm run cf-heal -- bouncedat.club` — ~3 min, idempotent, already documented in `NEW-DOMAIN-TROUBLESHOOTING.md`.
- **Why it was skipped:** Cepheus's MEMORY.md + AGENTS.md didn't mention `cf-heal`. The runbook only lives in the charmlink repo. When the domain monitor alerts, the on-call session doesn't naturally land on the runbook.
- **Lesson locked in:** Added pointer in `cepheus/MEMORY.md` under "Key Infrastructure". Next CharmLink domain alert MUST start with `cf-heal --` before any manual CF/Vercel API calls.
- **Secondary lesson:** Domain `bouncedat.club` was attached to Vercel charmlink project but never added to `charmlink_creator_domains`. That's why the 6h health monitor never alarmed when SSL first broke. Row now inserted; future regressions will alarm.
- **Open work item (NOW SHIPPED — see 7.7):** the self-serve "Heal domain" button in `/admin/domains` was bumped to the top of TODO after this regression and shipped same-day as PR #12. With it, Kayla heals her own domains and no operator needs to remember `cf-heal`.

---

### 7.7 Self-serve Heal button + auto-heal shipped (2026-06-02, PR #12)

Direct outcome of the 7.6 regression. The manual unproxy/remove/re-add loop is
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
  `/v4/certs` (the 7.6 + PR #11 root cause).
- **Operator note:** the `cf-heal` CLI still exists and is still the fastest
  path from a terminal. For non-engineers (Kayla et al.), the button is the
  supported path — no repo checkout, no env vars, no memorized command.
- **Net effect:** the "operator forgot `cf-heal`" failure mode from 7.6 is
  structurally gone. A broken domain is fixable by anyone with admin access in
  one click, and most new domains never break in the first place.

---

## 8. Recent Commit Sequence (2026-05-11 → 2026-06-02)

In reverse chronological order. All on `main`.

```
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
