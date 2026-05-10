# Phase 3: Cloudflare Orange-Cloud + Turnstile Escalation + Origin Lock

## What This Phase Does and Why

Phase 3 hardens CharmLink's custom-domain infrastructure against scrapers, headless browsers, and
data-harvesting bots that were previously able to bypass per-creator link protections.

| Area | Change | Reason |
|---|---|---|
| CF DNS | CNAME → `cname.vercel-dns.com`, **proxied=true** (orange cloud) | Routes traffic through CF WAF/CDN before it hits Vercel origin |
| CF WAF | 6 custom rules (empty UA, bot flag, threat score, datacenter ASNs, bad UAs) | Blocks/challenges low-quality traffic at the edge |
| CF Response Transform | Strips `server`, `x-vercel-*`, `x-nextjs-*` headers | Hides infrastructure fingerprints; previous proxy.ts approach didn't work (Vercel re-adds headers post-middleware) |
| CF Bot Fight Mode | Enabled on every provisioned zone | CF's built-in bot heuristic challenge (Free plan) |
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
   - Creates/updates a proxied CNAME → `cname.vercel-dns.com` (orange cloud)
   - Applies standard security settings (SSL strict, HTTPS-always, TLS 1.2+, etc.)
   - Enables Bot Fight Mode
   - Applies 6 WAF custom rules (tagged `charmlink:`)
   - Applies response header transform rule (strips Vercel headers)

Response includes per-step status in `cloudflare.steps` so you can see what succeeded or failed.

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
- `✅ ok` — all 6 steps succeeded for this domain
- `⚠️ zoneNotFound` — zone not in CF account (see above for fix)
- `❌ error` — CF API error (check CF token permissions, check CF zone status)

The script exits 0 even if some zones are not found (warnings). Exits 1 only on hard errors (auth
failure, DB failure).

---

## Troubleshooting

### SSL/TLS Errors

| CF Error Code | Meaning | Fix |
|---|---|---|
| 525 | SSL handshake failed between CF and Vercel origin | Ensure SSL mode is "Full (Strict)" — this is set by `applyStandardSettings`. Check Vercel domain is verified. |
| 526 | Invalid SSL certificate at origin | Vercel cert SAN provisioning in progress — wait 5–15 min after adding domain |
| 1016 | Origin DNS error | CNAME record not found or not pointing to `cname.vercel-dns.com`. Re-run provisioning. |

### Cert SAN Limits

Vercel tops out around **100 SANs per cert**. If you have >100 custom domains, you'll need to split
them across multiple Vercel projects. Contact Vercel support if approaching this limit.

### SSL Provisioning Lag

After adding a domain, Vercel needs a few minutes to provision the TLS cert. During this window:
- CF may show a 525/526 error — this is expected
- The CNAME must be proxied (orange cloud) for Vercel cert provisioning to work via CNAME
  flattening
- Wait 5–15 minutes and retry

### Orange-Cloud + Vercel Headers

Even with CF orange-cloud, Vercel injects infrastructure headers (`x-vercel-cache`, `server`,
etc.) at the origin layer. The CF Response Transform rule (`charmlink: strip vercel headers`)
removes these before the response reaches the visitor. To verify:

```bash
curl -sI https://yourcreator.com | grep -E "server|x-vercel|x-nextjs"
# Should return nothing if CF transform rule is active
```

---

## Free-Tier Limitations

This implementation targets CF Free plan zones. The following Enterprise features are **NOT** used:

| Feature | Free Limitation | Substitute |
|---|---|---|
| `cf.bot_management.ja3_hash` | Enterprise only | CF built-in bot heuristics (`cf.client.bot`) + Bot Fight Mode |
| `ip.src.country == "T1"` (Tor flag) | Enterprise only | `cf.threat_score gt 30` (scores Tor exit nodes high) |
| Advanced Bot Score | Enterprise only | UA pattern matching + datacenter ASN list + Bot Fight Mode |
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

All WAF and transform rules are prefixed with `charmlink:` in their `description` field.

On each `provisionZone()` call or admin POST:
1. GET existing ruleset for the phase
2. Remove all rules with description starting `charmlink:`
3. Insert the current set of charmlink rules
4. PUT the merged ruleset back

This means re-running is always safe — rules are replaced, not duplicated.

To see current rules in CF Dashboard: Zone → Security → WAF → Custom Rules.

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
