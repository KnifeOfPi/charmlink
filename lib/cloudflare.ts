// Cloudflare Phase 3 module — orange-cloud CNAME, WAF, bot protections.
// Env: CLOUDFLARE_API_TOKEN (lib code — no filesystem fallback; see scripts/cf-backfill.ts).
//
// Free-tier compatibility note:
// - WAF rules use the LEGACY /firewall/rules + /filters API. The newer Rulesets API
//   (PUT /zones/{id}/rulesets/phases/.../entrypoint) returns "request is not authorized"
//   on Free plan tokens regardless of declared scopes. Verified working: legacy endpoints.
// - Response Header Transform Rules also require the Rulesets engine on Free, so they
//   are intentionally skipped here. Vercel infra headers (x-vercel-*, x-nextjs-*) will
//   leak — known and accepted Free-tier limitation.
// - Bot Fight Mode requires `enable_js: true` to be sent alongside `fight_mode: true`,
//   otherwise CF rejects with "cannot enable Fight_Mode while EnableJS is disabled".

import { execFile } from "child_process";
import { promisify } from "util";
import { issueCert } from "./vercel-domains";

const execFileAsync = promisify(execFile);

const CF_BASE = "https://api.cloudflare.com/client/v4";
const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";

// ── Token ─────────────────────────────────────────────────────────────────────

function getToken(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set");
  return token;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

interface CFResponse<T> {
  success: boolean;
  result: T;
  errors: Array<{ message: string; code?: number }>;
}

async function cfFetch<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<CFResponse<T>> {
  const res = await fetch(`${CF_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data: CFResponse<T>;
  try {
    data = (await res.json()) as CFResponse<T>;
  } catch {
    throw new Error(`CF API ${res.status}: non-JSON response`);
  }

  if (!data.success) {
    const msg =
      data.errors?.map((e) => e.message).join(", ") || `HTTP ${res.status}`;
    throw new Error(`Cloudflare API error: ${msg}`);
  }

  return data;
}

/** Safe fetch — returns {ok, data?, error?} instead of throwing. */
async function cfFetchSafe<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const resp = await cfFetch<T>(method, path, body);
    return { ok: true, data: resp.result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ZoneInfo {
  id: string;
  name: string;
  plan: string;
  status: string;
}

interface CFZoneRaw {
  id: string;
  name: string;
  status: string;
  plan?: { name?: string };
}

interface CFDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

interface CFFilter {
  id: string;
  expression: string;
  description?: string;
}

interface CFFirewallRule {
  id: string;
  filter: { id: string; expression?: string; description?: string };
  action: string;
  description?: string;
  paused?: boolean;
}

interface CFBotManagement {
  fight_mode?: boolean;
  enable_js?: boolean;
  ai_bots_protection?: string;
  content_bots_protection?: string;
  crawler_protection?: string;
  using_latest_model?: boolean;
}

// ── Token verification ────────────────────────────────────────────────────────

export async function verifyToken(): Promise<{
  ok: boolean;
  error?: string;
  zonesAccessible: number;
}> {
  const result = await cfFetchSafe<CFZoneRaw[]>("GET", "/zones?per_page=1");
  if (!result.ok) return { ok: false, error: result.error, zonesAccessible: 0 };
  return { ok: true, zonesAccessible: result.data?.length ?? 0 };
}

// ── Zone lookup ───────────────────────────────────────────────────────────────

/**
 * Find zone for a domain, trying the domain as-is then stripping subdomains.
 * e.g. "www.hollyxo.com" → finds zone for "hollyxo.com"
 */
export async function findZoneByDomain(domain: string): Promise<ZoneInfo | null> {
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    const res = await cfFetchSafe<CFZoneRaw[]>(
      "GET",
      `/zones?name=${encodeURIComponent(candidate)}&per_page=1`
    );
    if (res.ok && res.data && res.data.length > 0) {
      const z = res.data[0];
      return {
        id: z.id,
        name: z.name,
        plan: z.plan?.name ?? "free",
        status: z.status,
      };
    }
  }
  return null;
}

// ── DNS record management ─────────────────────────────────────────────────────

/**
 * Ensure a CNAME → cname.vercel-dns.com exists for the domain.
 * For apex domains (name == zone apex), CF uses CNAME flattening automatically.
 * Removes conflicting A/AAAA/CNAME records first.
 *
 * The optional `proxied` parameter (default true) controls whether the CNAME is
 * orange-cloud (proxied) or gray-cloud (DNS-only). Pass false during initial
 * provisioning so Vercel can complete the ACME HTTP-01 challenge before CF
 * starts proxying; flip to true afterward via setRecordProxied / goOrangeAfterCertReady.
 *
 * If an existing CNAME to the right target is already orange-cloud, it is treated
 * as "already correct or better" regardless of the requested proxied value — we
 * never downgrade a working domain on re-provision.
 */
export async function ensureProxiedDnsRecord(
  zoneId: string,
  domain: string,
  proxied = true
): Promise<{ created: boolean; updated: boolean; recordId: string }> {
  // Fetch existing records for this name
  const listRes = await cfFetch<CFDnsRecord[]>(
    "GET",
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(domain)}&per_page=100`
  );
  const existing = listRes.result;

  // Check if already correctly set. Orange-cloud is treated as "≥ gray" so we
  // never downgrade an already-working domain when provisionZone is re-run.
  const existing_cname = existing.find(
    (r) =>
      r.type === "CNAME" &&
      r.content === VERCEL_CNAME_TARGET &&
      (r.proxied === proxied || r.proxied)
  );
  if (existing_cname) {
    return { created: false, updated: false, recordId: existing_cname.id };
  }

  // Remove conflicting records (A, AAAA, any CNAME for this name)
  for (const record of existing) {
    if (["A", "AAAA", "CNAME"].includes(record.type)) {
      await cfFetch<unknown>("DELETE", `/zones/${zoneId}/dns_records/${record.id}`);
    }
  }

  // Create CNAME with the requested proxied state
  const createRes = await cfFetch<CFDnsRecord>(
    "POST",
    `/zones/${zoneId}/dns_records`,
    {
      type: "CNAME",
      name: domain,
      content: VERCEL_CNAME_TARGET,
      ttl: 1, // Auto TTL
      proxied,
    }
  );

  const wasExisting = existing.some((r) => ["A", "AAAA", "CNAME"].includes(r.type));
  return {
    created: !wasExisting,
    updated: wasExisting,
    recordId: createRes.result.id,
  };
}

/**
 * Flip the proxied flag on the existing CNAME record for a domain.
 * Looks up the record by name, then PATCHes /zones/$zoneId/dns_records/$recordId.
 * Returns { updated: false } if the record is already in the desired state.
 */
export async function setRecordProxied(
  zoneId: string,
  domain: string,
  proxied: boolean
): Promise<{ updated: boolean; recordId?: string; error?: string }> {
  const listRes = await cfFetchSafe<CFDnsRecord[]>(
    "GET",
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(domain)}&per_page=100`
  );
  if (!listRes.ok) return { updated: false, error: listRes.error };

  const cname = listRes.data?.find(
    (r) => r.type === "CNAME" && r.content === VERCEL_CNAME_TARGET
  );
  if (!cname) return { updated: false, error: "CNAME record not found" };
  if (cname.proxied === proxied) return { updated: false, recordId: cname.id };

  const patchRes = await cfFetchSafe<CFDnsRecord>(
    "PATCH",
    `/zones/${zoneId}/dns_records/${cname.id}`,
    { proxied }
  );
  if (!patchRes.ok) return { updated: false, error: patchRes.error };
  return { updated: true, recordId: cname.id };
}

/** Remove our CNAME record for a domain. Leaves zone settings and WAF intact. */
export async function removeProxiedDnsRecord(
  zoneId: string,
  domain: string
): Promise<{ removed: number }> {
  const listRes = await cfFetch<CFDnsRecord[]>(
    "GET",
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(domain)}&per_page=100`
  );
  const toRemove = listRes.result.filter(
    (r) => r.type === "CNAME" && r.content === VERCEL_CNAME_TARGET
  );
  for (const record of toRemove) {
    await cfFetch<unknown>("DELETE", `/zones/${zoneId}/dns_records/${record.id}`);
  }
  return { removed: toRemove.length };
}

// ── Zone settings ─────────────────────────────────────────────────────────────

const STANDARD_SETTINGS: Array<{ id: string; value: string }> = [
  { id: "ssl", value: "strict" },                    // Full (strict) SSL
  { id: "always_use_https", value: "on" },
  { id: "min_tls_version", value: "1.2" },
  { id: "opportunistic_encryption", value: "on" },
  { id: "browser_check", value: "on" },
  { id: "security_level", value: "medium" },
  { id: "automatic_https_rewrites", value: "on" },
];

export async function applyStandardSettings(
  zoneId: string
): Promise<{ applied: string[]; errors: string[] }> {
  const applied: string[] = [];
  const errors: string[] = [];

  for (const setting of STANDARD_SETTINGS) {
    const res = await cfFetchSafe<unknown>(
      "PATCH",
      `/zones/${zoneId}/settings/${setting.id}`,
      { value: setting.value }
    );
    if (res.ok) {
      applied.push(setting.id);
    } else {
      errors.push(`${setting.id}: ${res.error}`);
    }
  }

  return { applied, errors };
}

// ── Bot Fight Mode ────────────────────────────────────────────────────────────

/**
 * Enable Bot Fight Mode (Free plan).
 * CF requires `enable_js: true` to coexist with `fight_mode: true`; sending fight_mode
 * alone fails with "cannot enable Fight_Mode while EnableJS is disabled".
 *
 * Idempotent: GETs current settings first; only PUTs if a relevant flag isn't already set.
 */
export async function enableBotFightMode(
  zoneId: string
): Promise<{ enabled: boolean; alreadyEnabled?: boolean; error?: string }> {
  const cur = await cfFetchSafe<CFBotManagement>(
    "GET",
    `/zones/${zoneId}/bot_management`
  );
  if (cur.ok && cur.data?.fight_mode === true && cur.data?.enable_js === true) {
    return { enabled: true, alreadyEnabled: true };
  }

  const res = await cfFetchSafe<unknown>(
    "PUT",
    `/zones/${zoneId}/bot_management`,
    { fight_mode: true, enable_js: true }
  );
  return res.ok ? { enabled: true } : { enabled: false, error: res.error };
}

/**
 * Enable advanced bot protections beyond basic Bot Fight Mode (Free plan).
 *
 * - `ai_bots_protection: "block"` — blocks GPTBot, ClaudeBot, Bytespider etc.
 * - `content_bots_protection: "block"` — blocks content-scraping bots.
 * - `crawler_protection` is intentionally NOT enabled (would block Google search indexing).
 *
 * Sends the full bot_management body since CF treats this as a single object PUT.
 * Idempotent: GETs current settings first; only PUTs if any flag differs.
 */
export async function enableAdvancedBotProtection(
  zoneId: string
): Promise<{
  enabled: boolean;
  alreadyEnabled?: boolean;
  applied?: string[];
  error?: string;
}> {
  const target = {
    fight_mode: true,
    enable_js: true,
    ai_bots_protection: "block",
    content_bots_protection: "block",
  };

  const cur = await cfFetchSafe<CFBotManagement>(
    "GET",
    `/zones/${zoneId}/bot_management`
  );
  if (
    cur.ok &&
    cur.data?.fight_mode === true &&
    cur.data?.enable_js === true &&
    cur.data?.ai_bots_protection === "block" &&
    cur.data?.content_bots_protection === "block"
  ) {
    return { enabled: true, alreadyEnabled: true, applied: Object.keys(target) };
  }

  const res = await cfFetchSafe<CFBotManagement>(
    "PUT",
    `/zones/${zoneId}/bot_management`,
    target
  );
  if (!res.ok) return { enabled: false, error: res.error };
  return { enabled: true, applied: Object.keys(target) };
}

// ── WAF custom rules (legacy /firewall/rules + /filters API) ──────────────────
//
// The Rulesets engine (PUT /zones/{id}/rulesets/phases/.../entrypoint) is unavailable
// to Free-plan API tokens regardless of declared scopes (returns "request is not
// authorized"). The legacy firewall rules API still works on Free and is what we use.
//
// Idempotency model: each rule has a unique `description` starting with "charmlink:".
// Before creating, we GET /firewall/rules and skip any whose description already exists.

const WAF_RULES: Array<{ description: string; expression: string; action: string }> = [
  {
    description: "charmlink:block-empty-ua",
    expression: '(http.user_agent eq "")',
    action: "block",
  },
  {
    description: "charmlink:block-meta-asn",
    expression: "(ip.geoip.asnum eq 32934)",
    action: "managed_challenge",
  },
  {
    description: "charmlink:block-bad-uas",
    expression:
      '(http.user_agent contains "facebookexternalhit") or ' +
      '(http.user_agent contains "Twitterbot") or ' +
      '(http.user_agent contains "Slackbot") or ' +
      '(http.user_agent contains "TelegramBot") or ' +
      '(http.user_agent contains "WhatsApp") or ' +
      '(http.user_agent contains "LinkedInBot") or ' +
      '(http.user_agent contains "Discordbot")',
    action: "block",
  },
  {
    description: "charmlink:challenge-datacenter-asns",
    // ASNs: AWS(16509), Hetzner(24940→see set), DO(14061), GCP(15169), Azure(8075),
    // Linode(63949), OVH(16276), Meta(32934), Cloudflare(13335), AWS GovCloud(14618),
    // Tencent(396982), etc. The set below mirrors the original Phase 3 spec list.
    expression: "(ip.geoip.asnum in {16509 14618 396982 32934 13335 14061 8075 15169})",
    action: "managed_challenge",
  },
  {
    description: "charmlink:challenge-cf-bot",
    expression: "(cf.client.bot)",
    action: "managed_challenge",
  },
  {
    description: "charmlink:block-tor",
    expression: '(ip.geoip.country eq "T1")',
    action: "block",
  },
];

/**
 * Idempotently apply WAF custom rules to the zone using the legacy firewall API.
 *
 * Strategy:
 *   1. GET /zones/{id}/firewall/rules
 *   2. For each WAF_RULES entry, if a rule with matching `description` exists, skip.
 *      Otherwise create a filter then a firewall rule referencing it.
 *
 * NOTE: this never deletes existing charmlink rules (unlike the previous Rulesets
 * implementation) — it's purely additive on a per-description basis. To rotate rule
 * content, change the `description` (e.g. add a version suffix) so the new rule is
 * created and you delete the old one manually in the dashboard.
 */
export async function applyWafRules(
  zoneId: string
): Promise<{
  rulesApplied: number;
  rulesSkipped: number;
  errors: string[];
  ruleIds: string[];
}> {
  const errors: string[] = [];
  const ruleIds: string[] = [];
  let applied = 0;
  let skipped = 0;

  // 1. Pull existing firewall rules (paginated, but 100/page is plenty for our use)
  const listRes = await cfFetchSafe<CFFirewallRule[]>(
    "GET",
    `/zones/${zoneId}/firewall/rules?per_page=100`
  );
  if (!listRes.ok) {
    errors.push(`list firewall rules: ${listRes.error}`);
    return { rulesApplied: 0, rulesSkipped: 0, errors, ruleIds };
  }

  const existingByDescription = new Map<string, CFFirewallRule>();
  for (const r of listRes.data ?? []) {
    if (r.description) existingByDescription.set(r.description, r);
  }

  // 2. Create each rule that doesn't exist yet
  for (const rule of WAF_RULES) {
    const existing = existingByDescription.get(rule.description);
    if (existing) {
      skipped++;
      ruleIds.push(existing.id);
      continue;
    }

    // 2a. Create filter
    const filterRes = await cfFetchSafe<CFFilter[]>(
      "POST",
      `/zones/${zoneId}/filters`,
      [{ expression: rule.expression, description: rule.description }]
    );
    if (!filterRes.ok || !filterRes.data || filterRes.data.length === 0) {
      errors.push(`${rule.description}: filter create failed: ${filterRes.error ?? "no data"}`);
      continue;
    }
    const filterId = filterRes.data[0].id;

    // 2b. Create firewall rule referencing the filter
    const ruleRes = await cfFetchSafe<CFFirewallRule[]>(
      "POST",
      `/zones/${zoneId}/firewall/rules`,
      [
        {
          filter: { id: filterId },
          action: rule.action,
          description: rule.description,
        },
      ]
    );
    if (!ruleRes.ok || !ruleRes.data || ruleRes.data.length === 0) {
      errors.push(`${rule.description}: rule create failed: ${ruleRes.error ?? "no data"}`);
      // Try to clean up the orphaned filter so we don't accumulate cruft
      await cfFetchSafe<unknown>("DELETE", `/zones/${zoneId}/filters/${filterId}`);
      continue;
    }

    applied++;
    ruleIds.push(ruleRes.data[0].id);
  }

  return { rulesApplied: applied, rulesSkipped: skipped, errors, ruleIds };
}

// ── Transform rules — REMOVED ────────────────────────────────────────────────
//
// The Rulesets engine required by Transform Rules (http_response_headers_transform phase)
// is not writable by Free-plan API tokens. This means Vercel infrastructure headers
// (server, x-vercel-cache, x-vercel-id, x-vercel-execution-region, x-nextjs-cache,
// x-nextjs-prerender, x-matched-path) will leak through to the client.
//
// This is a known and accepted Free-tier limitation. Mitigations:
//   - Upgrade the relevant zone to CF Pro (~$20/mo) and re-introduce applyTransformRules().
//   - Use a Cloudflare Worker on the route to strip headers (also requires paid tier for
//     custom domains routes via Workers Routes on most setups).
//   - Hide most of the fingerprint at the Next.js layer via next.config headers (does NOT
//     remove the Vercel-injected headers — Vercel re-adds them after middleware).

// ── Zone provisioning orchestrator ────────────────────────────────────────────

interface ProvisionStep {
  name: string;
  ok: boolean;
  detail?: string;
}

// ── Cert + health helpers (used by provisionZone and cf-heal) ─────────────────

/**
 * HEAD https://${domain}/ — returns true if the domain responds with HTTP < 500.
 * Used for idempotency checks: if already healthy, skip the gray→cert→orange ceremony.
 */
async function checkDomainHealthy(domain: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("curl", [
      "-s", "-o", "/dev/null", "-w", "%{http_code}",
      "--max-time", "10",
      "--location",
      `https://${domain}/`,
    ]);
    const status = parseInt(stdout.trim(), 10);
    return status > 0 && status < 500;
  } catch {
    return false;
  }
}

/**
 * HEAD https://${domain}/ pinned to Vercel's canonical IP (76.76.21.21).
 * Belt-and-suspenders check before flipping orange: verifies Vercel is actually
 * serving the domain correctly (TLS + HTTP) before we let CF start proxying.
 * Retries up to maxAttempts with intervalMs between attempts.
 */
async function headCheckViaVercelIP(
  domain: string,
  maxAttempts = 5,
  intervalMs = 5000
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const VERCEL_IP = "76.76.21.21";
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await new Promise<void>((r) => setTimeout(r, intervalMs));
    try {
      const { stdout } = await execFileAsync("curl", [
        "-s", "-o", "/dev/null", "-w", "%{http_code}",
        "--max-time", "10",
        "--resolve", `${domain}:443:${VERCEL_IP}`,
        `https://${domain}/`,
      ]);
      const status = parseInt(stdout.trim(), 10);
      if (status > 0 && status < 500) {
        return { ok: true, status };
      }
      console.log(`[cloudflare] headCheckViaVercelIP ${domain} attempt ${i + 1}/${maxAttempts}: HTTP ${status}`);
    } catch (err) {
      console.log(`[cloudflare] headCheckViaVercelIP ${domain} attempt ${i + 1}/${maxAttempts}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { ok: false, error: `Vercel origin check failed after ${maxAttempts} attempts` };
}

/**
 * Trigger Vercel cert issuance for a domain, retrying with exponential backoff.
 * Delays: 5s, 10s, 20s, 40s, 60s, 90s (6 attempts, worst case ~3.5 min).
 * HTTP 409 "already exists" counts as success.
 *
 * Throws if VERCEL_API_TOKEN is unset (cert issuance is only possible with Vercel creds).
 * Returns uid on success, null after all retries exhausted.
 */
async function issueCertWithRetry(domain: string): Promise<string | null> {
  const DELAYS = [5000, 10000, 20000, 40000, 60000, 90000];
  for (let i = 0; i < 6; i++) {
    console.log(`[provisionZone ${domain}] cert issuance attempt ${i + 1}/6`);
    try {
      const result = await issueCert(domain);
      console.log(`[provisionZone ${domain}] cert issued: uid=${result.uid}`);
      return result.uid;
    } catch (err) {
      console.log(`[provisionZone ${domain}] cert attempt ${i + 1}/6 failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (i < 5) {
      console.log(`[provisionZone ${domain}] waiting ${DELAYS[i] / 1000}s before retry...`);
      await new Promise<void>((r) => setTimeout(r, DELAYS[i]));
    }
  }
  return null;
}

export async function provisionZone(domain: string): Promise<{
  ok: boolean;
  zoneFound: boolean;
  zone?: ZoneInfo;
  steps: ProvisionStep[];
}> {
  const steps: ProvisionStep[] = [];
  const log = (msg: string) => console.log(`[provisionZone ${domain}] ${msg}`);

  // Step 1: find zone
  let zone: ZoneInfo | null = null;
  try {
    zone = await findZoneByDomain(domain);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    steps.push({ name: "findZone", ok: false, detail });
    return { ok: false, zoneFound: false, steps };
  }

  if (!zone) {
    return { ok: false, zoneFound: false, steps };
  }

  steps.push({ name: "findZone", ok: true, detail: `zone ${zone.id} (${zone.name})` });

  // Step 2: Idempotency check — if the domain is already serving HTTPS, skip
  // the gray→cert→orange ceremony entirely (no downtime risk).
  log("Checking if domain is already healthy...");
  const alreadyHealthy = await checkDomainHealthy(domain);

  if (alreadyHealthy) {
    log("Domain already healthy, skipping gray flip.");
    steps.push({
      name: "idempotencyCheck",
      ok: true,
      detail: "Domain already healthy, skipping gray flip",
    });
  } else {
    steps.push({
      name: "idempotencyCheck",
      ok: true,
      detail: "Domain unhealthy (likely 525 or no response), proceeding with gray→cert→orange",
    });

    // Step 3: Ensure CNAME is gray-cloud so Vercel ACME HTTP-01 challenge can reach origin.
    // If a record exists as orange (proxied=true), patch it to gray first.
    log("Ensuring CNAME is gray-cloud (proxied=false)...");
    try {
      const grayFlip = await setRecordProxied(zone.id, domain, false);
      if (grayFlip.error === "CNAME record not found") {
        // No CNAME at all — create it as gray
        const dns = await ensureProxiedDnsRecord(zone.id, domain, false);
        steps.push({
          name: "ensureProxiedDnsRecord",
          ok: true,
          detail: `recordId=${dns.recordId} created=${dns.created} updated=${dns.updated} proxied=false (gray-cloud, created)`,
        });
      } else if (grayFlip.error) {
        steps.push({
          name: "ensureProxiedDnsRecord",
          ok: false,
          detail: `setRecordProxied(false) failed: ${grayFlip.error}`,
        });
      } else {
        steps.push({
          name: "ensureProxiedDnsRecord",
          ok: true,
          detail: `recordId=${grayFlip.recordId} proxied=false (gray-cloud${grayFlip.updated ? ", patched from orange" : ", already gray"})`,
        });
      }
    } catch (err) {
      steps.push({
        name: "ensureProxiedDnsRecord",
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    // Step 4: Trigger Vercel cert issuance (POST /v4/certs?teamId=...).
    // Account-scoped token silently 403s on /v4/certs without teamId — must pass it.
    // Retry 6× with exponential backoff; 409 = already issued = success.
    if (process.env.VERCEL_API_TOKEN) {
      log("Triggering Vercel cert issuance...");
      const certUid = await issueCertWithRetry(domain);
      if (certUid) {
        steps.push({
          name: "issueCert",
          ok: true,
          detail: `cert uid=${certUid}`,
        });

        // Step 5: Belt-and-suspenders: HEAD the domain via Vercel canonical IP before
        // flipping orange, so we know Vercel is actually serving it over TLS.
        log("HEAD check via Vercel canonical IP (76.76.21.21)...");
        const headCheck = await headCheckViaVercelIP(domain);
        steps.push({
          name: "headCheckViaVercelIP",
          ok: headCheck.ok,
          detail: headCheck.ok
            ? `HTTP ${headCheck.status} via Vercel IP — origin healthy`
            : headCheck.error ?? `HTTP ${headCheck.status} — origin not ready`,
        });

        if (headCheck.ok) {
          // Step 6: Flip to orange-cloud now that cert is valid and origin is serving.
          log("Flipping CNAME to orange-cloud (proxied=true)...");
          const flip = await setRecordProxied(zone.id, domain, true);
          steps.push({
            name: "flipToProxied",
            ok: flip.updated || (!flip.error && flip.recordId !== undefined),
            detail: flip.updated
              ? `record ${flip.recordId} flipped to proxied=true`
              : flip.error ?? "already proxied",
          });
        } else {
          steps.push({
            name: "flipToProxied",
            ok: false,
            detail: "skipped — Vercel origin HEAD check failed; CNAME left gray-cloud",
          });
        }
      } else {
        steps.push({
          name: "issueCert",
          ok: false,
          detail: "Cert issuance failed after 6 attempts",
        });
        steps.push({
          name: "flipToProxied",
          ok: false,
          detail: `skipped — cert issuance failed. Run: npm run cf-heal -- ${domain}`,
        });
        throw new Error(
          `Cert issuance failed for ${domain} after 6 attempts. Run: npm run cf-heal -- ${domain}`
        );
      }
    } else {
      log("VERCEL_API_TOKEN not set — skipping cert issuance and orange flip");
      steps.push({
        name: "issueCert",
        ok: false,
        detail: "skipped — VERCEL_API_TOKEN not set",
      });
    }
  }

  // Steps 7–9: zone settings + BFM + WAF (always applied; idempotent zone-level config).

  // Step 7: standard settings (non-fatal)
  try {
    const settings = await applyStandardSettings(zone.id);
    const ok = settings.errors.length === 0;
    steps.push({
      name: "applyStandardSettings",
      ok,
      detail: ok
        ? `applied: ${settings.applied.join(", ")}`
        : `applied: ${settings.applied.join(", ")} | errors: ${settings.errors.join("; ")}`,
    });
  } catch (err) {
    steps.push({
      name: "applyStandardSettings",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // Step 8: bot fight mode (non-fatal, OPT-IN)
  // ⚠️ CF Free tier Bot Fight Mode is too aggressive — it blocks real Chrome
  // browsers (and headless Chromium) with HTTP 403 "Your request was blocked."
  // Verified breakage on hollysworld.club + hannazuki.com 2026-05-09. The
  // targeted firewall rules (Step 9) catch the same threats with no false
  // positives. Only enable BFM on Pro+ plans where the JS challenge actually
  // serves correctly. Set CHARMLINK_ENABLE_BFM=1 to opt back in.
  if (process.env.CHARMLINK_ENABLE_BFM === "1") {
    try {
      const bfm = await enableBotFightMode(zone.id);
      steps.push({
        name: "enableBotFightMode",
        ok: bfm.enabled,
        detail: bfm.alreadyEnabled ? "already enabled" : bfm.error,
      });
    } catch (err) {
      steps.push({
        name: "enableBotFightMode",
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      const adv = await enableAdvancedBotProtection(zone.id);
      steps.push({
        name: "enableAdvancedBotProtection",
        ok: adv.enabled,
        detail: adv.alreadyEnabled
          ? "already enabled"
          : adv.applied
          ? `applied: ${adv.applied.join(", ")}`
          : adv.error,
      });
    } catch (err) {
      steps.push({
        name: "enableAdvancedBotProtection",
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    steps.push({
      name: "enableBotFightMode",
      ok: true,
      detail: "skipped (set CHARMLINK_ENABLE_BFM=1 to enable; Free tier blocks real browsers)",
    });
  }

  // Step 9: WAF rules (non-fatal)
  try {
    const waf = await applyWafRules(zone.id);
    const ok = waf.errors.length === 0;
    steps.push({
      name: "applyWafRules",
      ok,
      detail: ok
        ? `applied=${waf.rulesApplied} skipped=${waf.rulesSkipped}`
        : `applied=${waf.rulesApplied} skipped=${waf.rulesSkipped} errors: ${waf.errors.join("; ")}`,
    });
  } catch (err) {
    steps.push({
      name: "applyWafRules",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const criticalSteps = steps.filter((s) =>
    ["findZone", "ensureProxiedDnsRecord"].includes(s.name)
  );
  const ok = criticalSteps.every((s) => s.ok);

  return { ok, zoneFound: true, zone, steps };
}
