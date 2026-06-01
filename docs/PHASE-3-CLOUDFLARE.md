# Phase 3: Cloudflare Orange-Cloud + Turnstile Escalation + Origin Lock

## What This Phase Does and Why

Phase 3 hardens CharmLink's custom-domain infrastructure against scrapers, headless browsers, and
data-harvesting bots that were previously able to bypass per-creator link protections.

| Area | Change | Reason |
|---|---|---|
| CF DNS | CNAME → `cname.vercel-dns.com`, **proxied=true** (orange cloud) | Routes traffic through CF WAF/CDN before it hits Vercel origin |
| CF WAF | 6 custom rules (empty UA, Meta ASN, bad-UA list, datacenter ASNs, CF bot flag, Tor) via legacy `/firewall/rules` API | Blocks/challenges low-quality traffic at the edge — Free-plan compatible |
| CF Bot Fight Mode | `fight_mode: true` + `enable_js: true` on every provisioned zone | CF's built-in bot heuristic challenge (Free plan); requires JS challenge support enabled |
| CF Advanced Bot Protection | `ai_bots_protection: "block"` + `content_bots_protection: "block"` | Blocks GPTBot/ClaudeBot/Bytespider and content scrapers (Free plan) |
| Turnstile escalation | `/api/links/[creator]` returns `turnstile_required` when bot confidence is low | Gives benefit-of-doubt to suspicious-but-unconfirmed visitors rather than blocking them |
| Origin lock | `proxy.ts` returns 403 for creator slug paths on `*.vercel.app` | Forces real traffic through CF-proxied custom domain |

---

## Required Environment Variables

Set these in **Vercel → Settings → Environment Variables** (production + preview):

| Variable | Required | Description |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Optional* | CF token with Zone:DNS:Edit + Zone:Settings:Edit + Zone:Firewall Services:Edit on all CharmLink zones. If unset, CF provisioning is skipped silently. |
| `TURNSTILE_SECRET_KEY` | Optional* | Server-side Turnstile verification secret. Get from CF Dashboard → Turnstile. If unset, Turnstile gate is skipped safely. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Optional* | Public site key for the frontend Turnstile widget. If unset, Turnstile gate is skipped. |

*Optional means the code degrades gracefully — domains still get added to Vercel, Turnstile just
isn't shown. Set both Turnstile keys together or neither.

### Cloudflare API Token Permissions

Create a token at <https://dash.cloudflare.com/profile/api-tokens> with these zone-level permissions for every CharmLink zone:

| Permission | Why |
|---|---|
| Zone:DNS:Edit | Manage proxied CNAME records |
| Zone:Settings:Edit | Apply SSL/HTTPS/TLS standard settings |
| Zone:Firewall Services:Edit | Create legacy `/firewall/rules` + `/filters` (WAF custom rules) |
| Zone:Bot Management:Edit | Toggle Bot Fight Mode + AI/content bot protections |
| Zone:Zone:Read | Look up zones by domain name |

The newer **Zone:Rulesets:Edit** scope is _not_ needed and not granted on Free plan: see Free-Tier Limitations below.

---

## How to Provision Turnstile Site Key + Secret

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com) → **Turnstile** (left sidebar)
2. Click **Add site**
3. Site name: `CharmLink`; Widget Mode: **Managed** (CF chooses challenge/pass automatically)
4. Add your domain(s) or use `*` for all
5. Copy:
   - **Site Key** → `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   - **Secret Key** → `TURNSTILE_SECRET_KEY`
6. Add both to Vercel env vars and redeploy

---

## Adding a New Creator Domain (Normal Flow)

The admin API handles everything automatically:

```bash
curl -X POST https://charmlink.vercel.app/api/admin/domains \
  -H "Authorization: Bearer $CHARMLINK_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain": "creatorname.com"}'
```

The endpoint:
1. Adds the domain to the Vercel project (triggers SSL cert provisioning)
2. Calls `provisionZone(domain)` which:
   - Finds the CF zone for the domain
   - Creates a **gray-cloud** (DNS-only) CNAME → `cname.vercel-dns.com` initially
   - Applies standard security settings (SSL strict, HTTPS-always, TLS 1.2+, etc.)
   - Enables Bot Fight Mode and advanced bot protections
   - Applies 6 WAF custom rules (tagged `charmlink:`)
   - **Waits up to 180s** for Vercel to verify the domain and issue the TLS cert
   - Once verified, **flips the CNAME to orange-cloud** (proxied=true)

Response includes per-step status in `cloudflare.steps` so you can see what succeeded or failed.

What actually gets applied per zone (in order):

1. `findZone` — zone lookup by domain.
2. `ensureProxiedDnsRecord` — gray-cloud (DNS-only) CNAME → `cname.vercel-dns.com` initially (replaces conflicting A/AAAA/CNAME records). If an orange-cloud CNAME already exists (re-provision), it is left unchanged.
3. `applyStandardSettings` — SSL=strict, always_use_https, min_tls=1.2, opportunistic_encryption, browser_check, security_level=medium, automatic_https_rewrites.
4. `enableBotFightMode` — `{ fight_mode: true, enable_js: true }` (both required together by CF).
5. `enableAdvancedBotProtection` — `{ ai_bots_protection: "block", content_bots_protection: "block" }` (Crawler protection is intentionally **NOT** enabled — would block Google indexing.)
6. `applyWafRules` — 6 charmlink-tagged rules via legacy `/firewall/rules` + `/filters`.
7. `waitForVercelCert` — polls `GET /v10/projects/$projectId/domains/$domain` every 5s up to 180s until `verified === true` and no ACME challenges are pending. Gray-cloud lets the ACME HTTP-01 challenge reach Vercel unproxied.
8. `flipToProxied` — PATCHes the CNAME record to `proxied=true` (orange-cloud) once the cert is confirmed. If step 7 times out, this step is skipped and the CNAME is left gray-cloud (see Troubleshooting below).

Transform Rules (response header rewriting) are intentionally not applied; see the Free-Tier Limitations section.

#### Why gray-cloud first?

Cloudflare's orange-cloud proxy intercepts all HTTP traffic — including Vercel's ACME HTTP-01
challenge used to issue the Let's Encrypt cert. If CF is proxying before the cert exists, Vercel
can't complete the challenge and the domain stays unverified, causing a 525/526 SSL handshake
error. Starting gray-cloud lets the ACME challenge flow through directly to Vercel, then flipping
to orange-cloud after the cert is issued avoids the chicken-and-egg problem entirely.

---

## Adding a Domain Whose Zone Isn't in Cloudflare Yet

If `cloudflare.zoneFound: false` in the POST response, the zone isn't on the CF account.

Steps to fix:
1. **Add the zone to Cloudflare**: CF Dashboard → Add a Site → enter the domain → Free plan
2. **Update registrar nameservers**: CF will show you the NS records to set at your registrar
3. **Wait for zone to become active**: Usually 5–60 minutes; CF dashboard shows "Active" when done
4. **Re-run provisioning** (choose one):
   - Re-POST to `/api/admin/domains` with the same domain
   - Or run the backfill script: `npm run cf-backfill`

---

## Backfill Existing Creator Domains

Run this once after deploying Phase 3 to provision all existing custom domains:

```bash
# Pull production env (includes DATABASE_URL)
vercel env pull .env.local
source .env.local

# Dry run first to see what would happen
npm run cf-backfill -- --dry-run

# Run for real
npm run cf-backfill
```

Output:
- `✅ ok` — all critical steps succeeded for this domain
- `⚠️ zoneNotFound` — zone not in CF account (see above for fix)
- `❌ error` — CF API error (check CF token permissions, check CF zone status)

The script exits 0 even if some zones are not found (warnings). Exits 1 only on hard errors (auth
failure, DB failure).

---

## Troubleshooting

> **⚠️ For the recurring "new domain stuck on CF 525" symptom** (Kayla's report 2026-06-01), the one-command fix and full diagnostic flow live in **[NEW-DOMAIN-TROUBLESHOOTING.md](./NEW-DOMAIN-TROUBLESHOOTING.md)**. The rest of this section covers other failure modes.

### SSL/TLS Errors

| CF Error Code | Meaning | Fix |
|---|---|---|
| 525 | SSL handshake failed between CF and Vercel origin | Ensure SSL mode is "Full (Strict)" — this is set by `applyStandardSettings`. Check Vercel domain is verified. |
| 526 | Invalid SSL certificate at origin | Vercel cert SAN provisioning in progress — wait 5–15 min after adding domain |
| 1016 | Origin DNS error | CNAME record not found or not pointing to `cname.vercel-dns.com`. Re-run provisioning. |

### Cert SAN Limits

Vercel tops out around **100 SANs per cert**. If you have >100 custom domains, you'll need to split
them across multiple Vercel projects. Contact Vercel support if approaching this limit.

### SSL Provisioning Lag / Stuck Gray-Cloud

`provisionZone` waits up to 180s for Vercel to verify the cert before flipping to orange-cloud.
If the cert takes longer (unusual but possible), the `waitForVercelCert` step will show `ok: false`
and the CNAME is left gray-cloud. Fix options:

1. **Re-run provisioning** — re-POST to `/api/admin/domains` or run `npm run cf-backfill`. Both
   will attempt the cert-wait + orange-flip again. The backfill also does a quick 30s re-check
   after `provisionZone` returns, so a second run usually recovers.
2. **Manual flip** — once `verified: true` appears in Vercel dashboard, flip the CNAME to
   orange-cloud via CF Dashboard → DNS, or call `setRecordProxied(zoneId, domain, true)` directly.

### Orange-Cloud + Vercel Headers (Free-Tier Limitation)

Vercel injects infrastructure headers (`server`, `x-vercel-cache`, `x-vercel-id`,
`x-vercel-execution-region`, `x-nextjs-cache`, `x-nextjs-prerender`, `x-matched-path`) at the
origin layer. Stripping them requires CF **Transform Rules**, which are written via the
Rulesets engine (`PUT /zones/{id}/rulesets/phases/.../entrypoint`). Free-plan API tokens cannot
write to that endpoint — CF returns `request is not authorized` regardless of declared scopes.

This means the listed Vercel/Next.js headers will leak through to the client. This is a
**known and accepted Free-tier limitation**. Mitigations if you need the headers gone:

- Upgrade affected zones to CF Pro (~$20/mo) and re-introduce `applyTransformRules()`.
- Add a CF Worker route on the zone that strips the headers (paid Worker plan typically required).
- Note: stripping headers via `next.config.headers` or `proxy.ts` does **not** work — Vercel
  re-adds them after middleware runs.

To confirm what's leaking on a given creator domain:

```bash
curl -sI https://yourcreator.com | grep -iE "server|x-vercel|x-nextjs|x-matched-path"
```

---

## Free-Tier Limitations

This implementation targets CF Free plan zones. The following features are **NOT** available on
Free and have substitutes (or are accepted limitations):

| Feature | Free Limitation | Substitute / Status |
|---|---|---|
| Rulesets engine writes (Custom Rules + Transform Rules) | Free-plan API tokens get `request is not authorized` regardless of scope | WAF rules use the legacy `/firewall/rules` + `/filters` API. Transform Rules are skipped — Vercel headers leak (accepted limitation). |
| `cf.bot_management.ja3_hash` | Enterprise only | CF built-in bot heuristics (`cf.client.bot`) + Bot Fight Mode + Advanced Bot Protection (AI + content bot blocking) |
| Advanced Bot Score | Enterprise only | UA pattern matching + datacenter ASN list + Bot Fight Mode + AI/content bot protection |
| Rate Limiting (advanced) | Paid | Server-side KV rate limiter in `lib/rate-limit.ts` |

---

## Rolling Back a Zone (Per-Domain)

To disable CF proxying for a specific zone without touching WAF or settings:

1. CF Dashboard → the zone → DNS → find the `CNAME` record for the creator domain
2. Click the orange cloud icon to toggle to grey (DNS-only)
3. Or via API: `removeProxiedDnsRecord(zoneId, domain)` from `lib/cloudflare.ts`

Full domain removal (also removes from Vercel):

```bash
curl -X DELETE https://charmlink.vercel.app/api/admin/domains \
  -H "Authorization: Bearer $CHARMLINK_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain": "creatorname.com"}'
```

This removes the CNAME record but leaves WAF rules and zone settings intact (zone may be reused).

---

## Vercel Trusted IPs / Origin Protection Note

Vercel Pro plan does not include Trusted IPs (Enterprise feature). Origin protection is therefore
enforced by `proxy.ts` rejecting `*.vercel.app` for creator slug paths (HTTP 403). 

Hostname-shopping attackers can still hit `charmlink.vercel.app/admin` etc. — the admin route is
`CHARMLINK_ADMIN_KEY`-gated, so this is acceptable.

For full origin lockdown (ensuring Vercel origin only accepts requests from CF IPs), Vercel
Enterprise "Trusted IPs" or a shared secret header (`CF-Worker-Token`) would be required. This is
a known limitation of the current plan tier.

---

## How WAF Rules Are Applied (Idempotency)

All WAF rules are prefixed with `charmlink:` in their `description` field. The rules live in CF
Dashboard → the zone → **Security → WAF → Tools → Firewall rules** (legacy view).

On each `provisionZone()` call or admin POST:

1. `GET /zones/{id}/firewall/rules?per_page=100`
2. Build a description→rule index from the response.
3. For each desired rule:
   - If a rule with the matching description already exists, **skip** (no-op).
   - Otherwise: `POST /filters` (with the expression), then `POST /firewall/rules` (referencing
     the new filter id and the desired action).

This means re-running is always safe — duplicates are never created. The current rule set:

| description | expression | action |
|---|---|---|
| `charmlink:block-empty-ua` | `(http.user_agent eq "")` | `block` |
| `charmlink:block-meta-asn` | `(ip.geoip.asnum eq 32934)` | `managed_challenge` |
| `charmlink:block-bad-uas` | UA-contains list (facebookexternalhit, Twitterbot, Slackbot, TelegramBot, WhatsApp, LinkedInBot, Discordbot) | `block` |
| `charmlink:challenge-datacenter-asns` | `(ip.geoip.asnum in {16509 14618 396982 32934 13335 14061 8075 15169})` | `managed_challenge` |
| `charmlink:challenge-cf-bot` | `(cf.client.bot)` | `managed_challenge` |
| `charmlink:block-tor` | `(ip.geoip.country eq "T1")` | `block` |

Note: ASN 32934 (Meta) is intentionally referenced in two rules — the `block-bad-uas` rule blocks
Meta scrapers via UA, and `block-meta-asn` challenges any other Meta-originated request as
defense-in-depth.

### Rotating rule content

Because idempotency is keyed on `description`, changing a rule's expression or action without
changing its description will be **silently skipped** on the next run. To roll out a new version
of a rule, change its description (e.g. add `-v2`) so the new rule is created — then delete the
old one in the CF dashboard.

---

## Turnstile Escalation Logic

The `/api/links/[creator]` endpoint now has a graduated response for bot detection:

```
isBot=true, confidence=high  →  decoy response (confirmed bot)
isBot=true, confidence=low   →  decoy response (probable bot, low certainty)
isBot=false, confidence=low  →  Turnstile challenge (suspicious, benefit of doubt)
isBot=false, confidence=high →  real payload (clean visitor)
```

The Turnstile path is currently inactive (bot-detect only returns `{isBot:false, confidence:"high"}`
for clean visitors) but is wired and ready for when bot-detect gains lower-confidence non-bot signals.

Frontend note: `CreatorPage.tsx` must handle `{ turnstile_required: true, site_key: "..." }` by
rendering the CF Turnstile widget and re-POSTing with the solved token in `x-turnstile-token` header.
This frontend wiring is a follow-up task.

---

## Phase 3.2 — Turnstile Widget Auto-Sync + Frontend Render

Phase 3.2 closes two gaps in the Turnstile escalation path so it actually works end-to-end
when bot-detect starts emitting low-confidence non-bot signals.

### Part A — Widget hostname auto-sync

Cloudflare Turnstile widgets only render on **explicitly allow-listed hostnames**
(`domains` field on the widget config). When a creator adds a custom domain via the admin UI
or the CF backfill script, that domain must also be added to the widget's allow-list — otherwise
the challenge would refuse to render and the user would be silently stuck.

**New module:** `lib/turnstile-admin.ts`

```ts
listTurnstileWidgets(): Promise<TurnstileWidget[]>
getTurnstileWidget(siteKey): Promise<TurnstileWidget>
addHostnameToWidget(siteKey, hostname): Promise<TurnstileWidget>      // idempotent
removeHostnameFromWidget(siteKey, hostname): Promise<TurnstileWidget> // idempotent
```

Endpoints (verified working with the project's "Account: Turnstile Edit" token):

```
GET  /accounts/{acct}/challenges/widgets
GET  /accounts/{acct}/challenges/widgets/{sitekey}
PUT  /accounts/{acct}/challenges/widgets/{sitekey}
```

The `PUT` is a **full-document replace** — `addHostnameToWidget` and `removeHostnameFromWidget`
fetch the widget first, mutate the `domains` array, then PUT the full body back. Idempotent
guards short-circuit when the hostname is already present / already absent.

**Wired into:**

- `app/api/admin/domains/route.ts` — POST and DELETE handlers call add/remove after Vercel + CF
  zone provisioning succeeds. Wrapped in try/catch — Turnstile sync failures are **logged but
  do not fail the admin request** (defense-in-depth: the WAF rules are the primary protection,
  the widget allow-list only matters if/when escalation actually fires).
- `scripts/cf-backfill.ts` — after WAF + bot protection for each domain, calls
  `addHostnameToWidget`. Idempotent (fetch-first-then-PUT guarantees no duplicate writes).

### Part B — Frontend Turnstile widget render

`/api/links/[creator]` already returns `{ turnstile_required: true, site_key: "..." }` when the
server-side gate decides escalation is warranted. Phase 3.2 wires the frontend to actually show
the widget when this happens.

- Added dependency: **`@marsidev/react-turnstile`** (lightweight React wrapper, lazy-loads CF JS).
- `app/[creator]/CreatorPage.tsx`:
  - New `turnstileChallenge` state — set when the API response includes `turnstile_required`.
  - When set, renders a `<Turnstile />` widget above the premium-links section.
  - On `onSuccess(token)`, re-calls `fetchPremiumLinks(token)`, which re-POSTs to
    `/api/links/[creator]` with the solved token in the `x-turnstile-token` header.
  - Server verifies via `verifyTurnstile(token, ip)` — on success, falls through to the real payload.

### Env required for sync

```
NEXT_PUBLIC_TURNSTILE_SITE_KEY  — public site key (already in Vercel)
TURNSTILE_SECRET_KEY            — server secret (already in Vercel, encrypted)
CLOUDFLARE_API_TOKEN            — needs Account: Turnstile Edit scope
CLOUDFLARE_ACCOUNT_ID           — required for widget endpoints
```

If any of `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `CLOUDFLARE_API_TOKEN`, or `CLOUDFLARE_ACCOUNT_ID`
are unset, widget sync is silently skipped (graceful degradation).
