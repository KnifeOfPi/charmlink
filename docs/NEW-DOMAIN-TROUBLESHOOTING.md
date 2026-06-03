# CharmLink New-Domain Troubleshooting

*Last reviewed: 2026-06-01*

## TL;DR for non-engineers (Kayla)

When you add a new domain and the link page **errors with "SSL handshake failed", CF 525, or "We can't connect to the server"** for more than ~15 minutes:

1. **Wait until the **error has persisted ≥15 minutes** from when you first hit the page.** Anything sooner is normal cert-provisioning lag.
2. **Tell the engineer on call**: paste the **domain name** + a screenshot of the CF 525 error page (matches the one in this doc). Don't worry about codes / details.
3. The engineer runs one command (`npm run cf-heal -- yourdomain.com`) and the domain is fixed within 2–3 minutes.

That's it. You don't need to do anything else. **The fix is well-known, automated, and idempotent** — re-running can never break a working domain.

---

## What's actually happening (engineer-level)

### The error

![CF 525 SSL handshake failed](https://developers.cloudflare.com/_astro/error-525.123.png)
*Cloudflare 525 — "SSL handshake failed" between Cloudflare and the Vercel origin.*

### Why it happens

CharmLink provisions each new domain in this order (see [PHASE-3-CLOUDFLARE.md](./PHASE-3-CLOUDFLARE.md) §"Adding a New Creator Domain"):

```
Vercel.addDomain(domain)
  → CF.findZone
  → CF.ensureProxiedDnsRecord (gray-cloud / DNS-only initially)
  → CF.applyStandardSettings (SSL=strict, always_use_https, …)
  → CF.enableBotFightMode
  → CF.enableAdvancedBotProtection
  → CF.applyWafRules (6 rules)
  → CF.waitForVercelCert (≤180s polling)
  → CF.flipToProxied (gray → orange-cloud)
```

The 525 hits when **one** of three things races:

| Race | What's happening | How `cf-heal` fixes it |
|---|---|---|
| **A. Cert race** | `waitForVercelCert` timed out at 180s but Vercel issued the cert at ~190s. CNAME stayed gray, OR was flipped orange while Vercel was still presenting a stale SAN. | Re-runs full `gray → cert-issuance retry (6× backoff) → HEAD via Vercel IP → orange flip`. |
| **B. SSL=strict pre-cert** | Standard settings get applied (SSL=Full Strict) *before* Vercel's cert is live for that hostname. CF tries to TLS-handshake with origin, fails, returns 525. | Skips re-applying settings if zone is already configured (idempotent); waits for cert; flips orange. |
| **C. Already-orange stuck** | A previous provision attempt flipped to orange but the cert never validated. Subsequent ACME challenges can't reach Vercel through CF proxy → cert stays unverified forever. | Detects unhealthy domain via HEAD probe, **flips orange→gray**, re-triggers cert, then **flips back to orange**. |

`provisionZone()` is **idempotent** — running it again is always safe.

---

## Step-by-step fix (engineer)

### 0. Confirm the symptom

```bash
curl -sI https://yourdomain.com/ -o /dev/null -w "%{http_code}\n"
```

- `200`, `307`, `308` → already healthy, no-op
- `525`, `526`, `1016`, `522`, no response → unhealthy, proceed

### 1. Run cf-heal

From the `charmlink` repo:

```bash
npm run cf-heal -- yourdomain.com
```

The script will:
1. HEAD the domain. If healthy (<500), log "no-op" and exit 0.
2. If unhealthy: full `gray → cert-issuance (with 6× backoff) → orange` cycle.
3. Log every step to stdout so you can see what happened.

**Exit codes**:
- `0` — domain is healthy at end (either was, or was healed)
- `1` — heal attempted but final HEAD still failed (see "When `cf-heal` fails" below)

### 2. Verify

Wait 60s after the script finishes, then:

```bash
curl -sI https://yourdomain.com/ -o /dev/null -w "%{http_code}\n"
```

Should be 200/307/308. If you want the full handshake info:

```bash
curl -sI https://yourdomain.com/ | head -20
```

You should see `cf-ray:` and `server: cloudflare` in the headers (= orange-cloud is active).

### 3. Heal ALL stuck domains at once

If multiple domains are stuck (e.g. after a CF API outage):

```bash
npm run cf-heal -- --all
```

Iterates every row in `charmlink_creator_domains`, HEADs each, heals only the unhealthy ones. Healthy domains are skipped fast.

---

## When `cf-heal` fails

If `cf-heal` exits 1, check the script log output (it shows every step). Most common root causes:

| Symptom in log | Real cause | Fix |
|---|---|---|
| `findZone failed: no zone matched` | Domain's nameservers don't point to Cloudflare yet | Have the registrar update NS records to CF, wait for propagation (up to 24h, usually <1h), retry. |
| `cert attempt 6/6 failed: domain not verified` | Vercel's ACME challenge can't reach origin. Usually the CNAME is wrong, or CF is intercepting the challenge. | Manually verify CF Dashboard → DNS → record for domain points to `cname.vercel-dns.com`, **proxied=DNS-only (gray)**. Then re-run heal. |
| `cert attempt N/6 failed: too many certificates` | Vercel rate limit (Let's Encrypt) — usually 50 certs/week/domain | Wait 1 hour; the rate limit slides off. Then retry. |
| `setRecordProxied(true) failed: insufficient permissions` | Stale `CLOUDFLARE_API_TOKEN` env | Rotate token; redeploy worker / re-export env. |
| `SAN limit exceeded` from Vercel | Vercel cert tops out around 100 SANs | Add domain to a 2nd Vercel project, or contact Vercel support. |

If none of those match, screenshot the log + tell Cepheus / Vela. Don't keep retrying — one or two heal attempts is enough to surface any non-race cause.

---

## Required environment for cf-heal

All auto-resolved on the dev machine — listed here as the on-call cheatsheet.

| Var | Resolution order |
|---|---|
| `CLOUDFLARE_API_TOKEN` | env → `~/.openclaw/cloudflare-token` |
| `VERCEL_API_TOKEN` | env → `~/.openclaw/vercel-token` |
| `VERCEL_TEAM_ID` | env → `~/.openclaw/vercel-team-id` → auto-discovered via Vercel `/v2/teams` (single-team accounts) |
| `DATABASE_URL` | `.env.local` (only needed for `--all` mode) |

> **Historical note (2026-06-01):** Missing `VERCEL_TEAM_ID` was the silent root cause of most "525 stuck forever" reports. The cert issuance API returns 403 "You don't have permissions to access X" without the team id, the script logged a warning that was easy to miss, and the heal silently failed. Now the script resolves it from file or auto-discovers — no manual export required.

---

## Why you shouldn't manually toggle the orange cloud in CF dashboard

It's tempting to fix this by logging into Cloudflare and toggling the cloud icon. **Don't** — here's why:

- If you flip orange → gray *while a real visitor is on the page*, they get a redirect loop until DNS propagates (~30s).
- If you flip gray → orange *before* the Vercel cert is verified, you re-trigger the 525.
- The CF dashboard **doesn't run the cert-issuance retry** — only `cf-heal` does that via Vercel's `/v4/certs` API with backoff.

`cf-heal` orchestrates the ordering correctly every time.

---

## Why this keeps happening (root cause)

The 525 race exists because:

1. **Vercel cert issuance is non-deterministic** — typically 30–60s, but P95 is 3–8min and P99 can hit 15min.
2. **`waitForVercelCert` has a 180s timeout** — chosen to keep the admin POST under HTTP/Vercel's response budget. Raising it just shifts the failure to "admin POST times out".
3. **Vercel + CF talk on different schedules** — there's no webhook from Vercel saying "cert is live for hostname X". We poll.

**Permanent fixes that would eliminate the race**:

- Move provisioning to a background job (BullMQ / Vercel Cron) so it can wait 15min without timing out → planned, [issue TBD].
- Push a "Heal Domain" button into `/admin/domains` so Kayla can re-run heal herself without engineer involvement → ✅ **SHIPPED 2026-06-02 (PR #12)** ([see Self-serve Heal button below](#self-serve-heal-button-shipped)).
- Auto-heal on domain add so most new domains never hit 525 in the first place → ✅ **SHIPPED 2026-06-02 (PR #12)**.
- Subscribe to Vercel deployment hook + ACME success events → out of scope for current Vercel plan.

Until then: **heal-on-symptom is the workflow**.

---

## Self-serve Heal button (SHIPPED)

**Shipped 2026-06-02 in PR #12.** No engineer required.

Each domain row in `/admin/domains` has a **Heal** button:

```
⚠️  yourdomain.com — SSL handshake failed   [ Heal domain ]
```

Clicking it:
1. POSTs to `/api/admin/domains/heal` with `{ domain }`
2. Server **pre-probes** health via HEAD — if already healthy (<500), returns
   `{ok:true, noop:true}` immediately (safe to click anytime, no-op when fine)
3. If unhealthy, invokes the same idempotent `provisionZone()` the `cf-heal`
   CLI uses: **gray → wait for Vercel cert (6× backoff) → re-orange**
4. Returns `{ok, noop, preStatus, postStatus, steps}`; row goes green ✅ on success

The route auto-resolves `VERCEL_TEAM_ID` (env → file → `/v2/teams`), so it never
silently 403s on cert issuance — the historical root cause of "stuck" domains.

**Auto-heal on add:** adding a new domain triggers the heal flow automatically,
so the gray→orange race is handled at creation time and most domains never 525.

The `cf-heal` CLI still exists and is the fastest path from a terminal for
engineers. The button is the supported path for everyone else.

---

## Quick reference card

```
Symptom: new CharmLink domain shows 525 SSL handshake failed for >15min

  Engineer:
  ┌──────────────────────────────────────────┐
  │  cd ~/.openclaw/workspace/agents/vela/   │
  │     charmlink                            │
  │  npm run cf-heal -- yourdomain.com       │
  │                                          │
  │  # then verify:                          │
  │  curl -sI https://yourdomain.com/        │
  └──────────────────────────────────────────┘

  Non-engineer (Kayla, KOPi):
  ┌──────────────────────────────────────────┐
  │  Open /admin/domains.                    │
  │  Find the domain row (⚠️ if unhealthy).   │
  │  Click [ Heal domain ]. Wait ~3 min.     │
  │  Row goes green ✅. No engineer needed.   │
  └──────────────────────────────────────────┘
```

---

## See also

- [PHASE-3-CLOUDFLARE.md](./PHASE-3-CLOUDFLARE.md) — full Phase 3 architecture (gray→orange flow, WAF rules, Turnstile escalation).
- [CHARMLINK-STATE-2026-05-13.md](./CHARMLINK-STATE-2026-05-13.md) — phase history; Phase 7 (2026-05-29) introduced the `cf-heal` CLI.
- `lib/cloudflare.ts` — `provisionZone()`, `setRecordProxied()`, `ensureProxiedDnsRecord()`.
- `scripts/cf-heal.ts` — the heal CLI.
- `scripts/cf-backfill.ts` — bulk re-provision (more aggressive than heal; rewrites WAF + settings).
