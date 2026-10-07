// Cloudflare Phase 3 module — orange-cloud CNAME, WAF, bot protections.
// Env: CLOUDFLARE_API_TOKEN (lib code — no filesystem fallback; see scripts/cf-backfill.ts).
//
// Free-tier compatibility note:
// - WAF rules and the x-client-asn header use the Rulesets API (custom + late
//   transform phases). The legacy /firewall/rules API is shut down (2026-10).
// - Response Header Transform Rules also require the Rulesets engine on Free, so they
//   are intentionally skipped here. Vercel infra headers (x-vercel-*, x-nextjs-*) will
//   leak — known and accepted Free-tier limitation.
// - Bot Fight Mode requires `enable_js: true` to be sent alongside `fight_mode: true`,
//   otherwise CF rejects with "cannot enable Fight_Mode while EnableJS is disabled".

import { execFile } from "child_process";
import { promisify } from "util";
import { issueCert } from "./vercel-domains";
import { cfRequest } from "./cf-http";

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
  const res = await cfRequest(`${CF_BASE}${path}`, {
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
 *
 * Returns null ONLY when CF answered and has no such zone. An API failure
 * (rate limit, bad/expired token) throws — it used to be swallowed as null,
 * which reported real zones as missing and made domain-add skip provisioning.
 */
export async function findZoneByDomain(domain: string): Promise<ZoneInfo | null> {
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    const res = await cfFetch<CFZoneRaw[]>(
      "GET",
      `/zones?name=${encodeURIComponent(candidate)}&per_page=1`
    );
    if (res.result.length > 0) {
      const z = res.result[0];
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

/**
 * Read the orange/gray state of the record we manage for a domain.
 *
 * `proxied: false` on a domain that still answers 200 is the failure mode this
 * exists to surface: Vercel serves it directly, with a valid cert, indistinguishable
 * from a correctly proxied domain in every HTTP response — while sitting entirely
 * outside Cloudflare. No WAF rules, no Turnstile, no origin hiding. Nothing about
 * the response says so, which is exactly why it can go unnoticed for months.
 */
export async function getRecordProxyState(
  zoneId: string,
  domain: string
): Promise<{ found: boolean; proxied: boolean; recordId?: string; type?: string }> {
  const listRes = await cfFetchSafe<CFDnsRecord[]>(
    "GET",
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(domain)}&per_page=100`
  );
  if (!listRes.ok || !listRes.data) return { found: false, proxied: false };

  // Prefer our canonical CNAME; fall back to any A/AAAA/CNAME on the name, since
  // a hand-added A record is one of the ways a domain ends up unproxied at all.
  const record =
    listRes.data.find((r) => r.type === "CNAME" && r.content === VERCEL_CNAME_TARGET) ??
    listRes.data.find((r) => ["A", "AAAA", "CNAME"].includes(r.type));

  if (!record) return { found: false, proxied: false };
  return {
    found: true,
    proxied: record.proxied === true,
    recordId: record.id,
    type: record.type,
  };
}

/**
 * Put a healthy-but-unproxied domain back behind Cloudflare, and undo it if that
 * breaks the domain.
 *
 * Flipping a live domain is only safe here *because* it is already healthy: that
 * tells us Vercel is serving valid TLS, so the cert dance the unhealthy path does
 * is the one thing we don't need. What can still go wrong is zone-level — an SSL
 * mode that has CF talk plaintext to an HTTPS-only origin, say — and that surfaces
 * immediately as a 5xx. So verify after the flip and revert rather than leaving a
 * domain that was working worse off than we found it.
 */
async function repairProxyState(
  zoneId: string,
  domain: string,
  log: (msg: string) => void
): Promise<ProvisionStep> {
  const state = await getRecordProxyState(zoneId, domain);

  if (!state.found) {
    return {
      name: "proxyStateRepair",
      ok: false,
      detail: "no A/AAAA/CNAME record found for this name",
    };
  }
  if (state.proxied) {
    return { name: "proxyStateRepair", ok: true, detail: "already orange-cloud" };
  }

  log("Domain is healthy but GRAY-CLOUD — flipping to orange...");
  const flip = await setRecordProxied(zoneId, domain, true);
  if (flip.error) {
    // A record that isn't our canonical CNAME can't be patched — recreate it.
    if (flip.error === "CNAME record not found") {
      log(`No canonical CNAME (found ${state.type}) — recreating as proxied...`);
      try {
        await ensureProxiedDnsRecord(zoneId, domain, true);
      } catch (err) {
        return {
          name: "proxyStateRepair",
          ok: false,
          detail: `recreate as proxied failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    } else {
      return { name: "proxyStateRepair", ok: false, detail: `flip failed: ${flip.error}` };
    }
  }

  // Verify the flip didn't break a domain that was working a moment ago.
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((r) => setTimeout(r, 5000));
    if (await checkDomainHealthy(domain)) {
      log("Orange-cloud flip verified healthy.");
      return {
        name: "proxyStateRepair",
        ok: true,
        detail: "flipped gray→orange, verified healthy",
      };
    }
    log(`Post-flip health check ${i + 1}/5 not healthy yet...`);
  }

  log("Domain unhealthy after orange flip — REVERTING to gray-cloud.");
  const revert = await setRecordProxied(zoneId, domain, false);
  return {
    name: "proxyStateRepair",
    ok: false,
    detail: revert.error
      ? `flip broke the domain AND revert failed (${revert.error}) — needs manual attention`
      : "flip broke the domain; reverted to gray-cloud (zone SSL mode is the usual cause)",
  };
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
  // AI/content-bot blocking ONLY. This used to also send fight_mode: true,
  // and since 2026-10-06 it runs on every provision and Heal — so any heal
  // would have switched on Bot Fight Mode, which challenges real Chrome users
  // on Free and is deliberately gated behind CHARMLINK_ENABLE_BFM
  // (enableBotFightMode). Caught on the 2026-10-07 canary before the fleet
  // backfill. fight_mode is set explicitly so a zone it was left on is fixed.
  const target = {
    fight_mode: process.env.CHARMLINK_ENABLE_BFM === "1",
    ai_bots_protection: "block",
    content_bots_protection: "block",
  };

  const cur = await cfFetchSafe<CFBotManagement>(
    "GET",
    `/zones/${zoneId}/bot_management`
  );
  if (
    cur.ok &&
    cur.data?.fight_mode === target.fight_mode &&
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

// ── WAF custom rules + ASN header (Rulesets API) ─────────────────────────────
//
// Cloudflare shut the legacy /firewall/rules + /filters API (10020
// "firewallrules.api.deprecated"), and it had been failing quietly long
// before: on 2026-10-06, 66 of 78 live zones carried no charmlink rules at
// all. Rulesets writes DO work with our token (the 2026-09-22 ACME fix and
// the inject-asn rollout both used them), whatever the old note here said.
//
// Rule set = the layout live on hannazuki.com, which is the documented
// design (link-preview crawlers are NOT blocked at the edge, so the origin
// can serve them the decoy), with two corrections:
//   - Cloudflare's own ASN (13335) is not "datacenter": iCloud Private Relay
//     and WARP users exit through it. Meta (32934) has its own rule.
//   - the 5th Free-plan slot blocks Tor.
// The ACME bypass is FIRST: custom rules evaluate in order, and a challenge
// on /.well-known/acme-challenge/ silently breaks certificate renewal (it did,
// on 12 domains, for four months — docs/PHASE-3-CLOUDFLARE.md).
//
// Zones that already carry any `charmlink:` firewall rule are left untouched:
// changing a live zone's policy is a deliberate decision, not a side effect
// of provisioning. Non-charmlink rules are always preserved.

interface CFRule {
  description?: string;
  expression: string;
  action: string;
  action_parameters?: unknown;
  enabled?: boolean;
}

const ACME_BYPASS_PARAMS = {
  ruleset: "current",
  phases: ["http_request_firewall_managed"],
  products: ["bic", "hot", "securityLevel", "uaBlock", "waf", "zoneLockdown"],
};

export const WAF_RULES: CFRule[] = [
  {
    description: "charmlink:acme-http01-bypass",
    expression: '(http.request.uri.path contains "/.well-known/acme-challenge/")',
    action: "skip",
    action_parameters: ACME_BYPASS_PARAMS,
  },
  {
    description: "charmlink:block-meta-asn",
    expression: "(ip.src.asnum eq 32934)",
    action: "managed_challenge",
  },
  {
    description: "charmlink:challenge-datacenter-asns",
    // AMAZON-02, AMAZON-AES, GOOGLE-CLOUD-PLATFORM, DIGITALOCEAN, MICROSOFT, GOOGLE
    expression: "(ip.src.asnum in {16509 14618 396982 14061 8075 15169})",
    action: "managed_challenge",
  },
  {
    description: "charmlink:block-empty-ua",
    expression: '(http.user_agent eq "")',
    action: "block",
  },
  {
    description: "charmlink:block-tor",
    expression: '(ip.src.country eq "T1")',
    action: "block",
  },
];

export const ASN_TRANSFORM_RULE: CFRule = {
  description: "charmlink:inject-asn",
  expression: "true",
  action: "rewrite",
  action_parameters: {
    headers: { "x-client-asn": { operation: "set", expression: "ip.src.asnum" } },
  },
};

const isCharmlink = (r: CFRule) => (r.description ?? "").startsWith("charmlink:");
const strip = (r: CFRule): CFRule => ({
  description: r.description,
  expression: r.expression,
  action: r.action,
  ...(r.action_parameters !== undefined ? { action_parameters: r.action_parameters } : {}),
  ...(r.enabled !== undefined ? { enabled: r.enabled } : {}),
});

async function getEntrypointRules(
  zoneId: string,
  phase: string
): Promise<{ ok: boolean; rules: CFRule[]; error?: string }> {
  const res = await cfFetchSafe<{ rules?: CFRule[] }>(
    "GET",
    `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`
  );
  if (res.ok) return { ok: true, rules: res.data?.rules ?? [] };
  // No entrypoint ruleset yet is normal for a fresh zone.
  if (/could not find entrypoint|10003/i.test(res.error ?? "")) return { ok: true, rules: [] };
  return { ok: false, rules: [], error: res.error };
}

async function putEntrypointRules(zoneId: string, phase: string, rules: CFRule[]) {
  return cfFetchSafe<unknown>("PUT", `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`, {
    rules: rules.map(strip),
  });
}

/**
 * Idempotently give a zone the charmlink WAF rules (Rulesets API).
 * Return shape kept from the legacy implementation for provisionZone.
 */
export async function applyWafRules(
  zoneId: string,
  opts: { dryRun?: boolean } = {}
): Promise<{ rulesApplied: number; rulesSkipped: number; errors: string[]; ruleIds: string[] }> {
  const phase = "http_request_firewall_custom";
  const current = await getEntrypointRules(zoneId, phase);
  if (!current.ok) {
    return { rulesApplied: 0, rulesSkipped: 0, errors: [`read rules: ${current.error}`], ruleIds: [] };
  }
  if (current.rules.some(isCharmlink)) {
    // Existing charmlink policy: leave it alone (see header comment).
    return { rulesApplied: 0, rulesSkipped: WAF_RULES.length, errors: [], ruleIds: [] };
  }
  if (opts.dryRun) {
    return { rulesApplied: WAF_RULES.length, rulesSkipped: 0, errors: [], ruleIds: [] };
  }
  const res = await putEntrypointRules(zoneId, phase, [...WAF_RULES, ...current.rules]);
  if (!res.ok) {
    return { rulesApplied: 0, rulesSkipped: 0, errors: [`write rules: ${res.error}`], ruleIds: [] };
  }
  return { rulesApplied: WAF_RULES.length, rulesSkipped: 0, errors: [], ruleIds: [] };
}

/**
 * Idempotently add the `x-client-asn` request header (= ip.src.asnum) that
 * lib/bot-detect.ts reads. Preserves any other late-transform rules.
 */
export async function applyAsnTransform(
  zoneId: string,
  opts: { dryRun?: boolean } = {}
): Promise<{ applied: boolean; alreadyPresent: boolean; error?: string }> {
  const phase = "http_request_late_transform";
  const current = await getEntrypointRules(zoneId, phase);
  if (!current.ok) return { applied: false, alreadyPresent: false, error: `read rules: ${current.error}` };
  if (current.rules.some((r) => r.description === ASN_TRANSFORM_RULE.description)) {
    return { applied: false, alreadyPresent: true };
  }
  if (opts.dryRun) return { applied: true, alreadyPresent: false };
  const res = await putEntrypointRules(zoneId, phase, [...current.rules, ASN_TRANSFORM_RULE]);
  if (!res.ok) return { applied: false, alreadyPresent: false, error: `write rules: ${res.error}` };
  return { applied: true, alreadyPresent: false };
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
 * Vercel's HTTP pretest failed: it fetched the domain and did not get a
 * Vercel-served response, so it refuses to attempt issuance (HTTP 449).
 *
 * On a NEW domain this is usually just DNS propagation and retrying is right.
 * On an ALREADY-HEALTHY domain (the --force path) it never is: it means
 * something in front of the origin is answering instead of us, and no number of
 * retries changes that. hannazuki.com burned 6 attempts and ~3.5 minutes on it
 * on 2026-09-22 — the zone was serving a Cloudflare managed challenge to
 * datacenter IPs, which is also why Let's Encrypt could not renew the cert.
 */
const PRETEST_FAILURE = "http_pretest_domain_not_resolving_to_vercel_error";

/**
 * Trigger Vercel cert issuance for a domain, retrying with exponential backoff.
 * Delays: 5s, 10s, 20s, 40s, 60s, 90s (6 attempts, worst case ~3.5 min).
 * HTTP 409 "already exists" counts as success.
 *
 * `stopOnPretestFailure` gives up immediately on PRETEST_FAILURE — set it on the
 * proactive/--force path, where the condition is structural rather than timing.
 *
 * Returns the uid on success, or the last error so the caller can report WHY.
 * Returning a bare null here is what left the operator staring at "failed after
 * 6 attempts" with no cause attached.
 */
async function issueCertWithRetry(
  domain: string,
  opts: { stopOnPretestFailure?: boolean } = {}
): Promise<{ uid: string; error?: undefined } | { uid: null; error: string }> {
  const DELAYS = [5000, 10000, 20000, 40000, 60000, 90000];
  let lastError = "no attempt made";
  for (let i = 0; i < 6; i++) {
    console.log(`[provisionZone ${domain}] cert issuance attempt ${i + 1}/6`);
    try {
      const result = await issueCert(domain);
      console.log(`[provisionZone ${domain}] cert issued: uid=${result.uid}`);
      return { uid: result.uid };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.log(`[provisionZone ${domain}] cert attempt ${i + 1}/6 failed: ${lastError}`);
      if (opts.stopOnPretestFailure && lastError.includes(PRETEST_FAILURE)) {
        console.log(`[provisionZone ${domain}] pretest failure is structural — not retrying`);
        return { uid: null, error: lastError };
      }
    }
    if (i < 5) {
      console.log(`[provisionZone ${domain}] waiting ${DELAYS[i] / 1000}s before retry...`);
      await new Promise<void>((r) => setTimeout(r, DELAYS[i]));
    }
  }
  return { uid: null, error: lastError };
}

export async function provisionZone(
  domain: string,
  opts: { force?: boolean } = {}
): Promise<{
  ok: boolean;
  zoneFound: boolean;
  /** Set when the zone lookup itself failed (rate limit, bad token). zoneFound
   *  is false then, but that means "couldn't check", NOT "no zone". */
  lookupError?: string;
  zone?: ZoneInfo;
  steps: ProvisionStep[];
}> {
  // force: proactively re-issue the origin cert on an ALREADY-HEALTHY domain
  // (e.g. the monitor sees it expiring within 14 days). No effect on the
  // unhealthy path, which always issues a cert anyway.
  const { force = false } = opts;
  const steps: ProvisionStep[] = [];
  const log = (msg: string) => console.log(`[provisionZone ${domain}] ${msg}`);

  // Step 1: find zone
  let zone: ZoneInfo | null = null;
  try {
    zone = await findZoneByDomain(domain);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    steps.push({ name: "findZone", ok: false, detail });
    return { ok: false, zoneFound: false, lookupError: detail, steps };
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

    // Healthy is NOT the same as provisioned. A gray-cloud record serves a
    // perfect 200 straight from Vercel, so this check passing told us nothing
    // about whether Cloudflare is in front of it — and because the orange flip
    // used to live only in the else-branch below, every healing path (cf-heal,
    // the admin Heal button, auto-heal on add) skipped such a domain and
    // reported success. Six domains sat unproxied for two months that way.
    steps.push(await repairProxyState(zone.id, domain, log));

    // Forced cert reissue. Without this, a healthy domain never reached cert
    // issuance at all (it lives only in the else-branch below), so the monitor's
    // `cf-heal <domain> --force` on an expiring cert was a no-op and Vercel's
    // autoRenew was the only thing standing between the domain and a 526.
    // Deliberately does NOT touch the proxy state — the domain is already orange
    // and serving; we only want a fresh cert. This is proactive maintenance, not
    // a heal, so "forceCertReissue" is intentionally absent from criticalSteps
    // and a failure here never flips the overall ok.
    if (force) {
      if (process.env.VERCEL_API_TOKEN) {
        log("Force flag set — triggering proactive Vercel cert reissue...");
        const cert = await issueCertWithRetry(domain, { stopOnPretestFailure: true });
        steps.push(
          cert.uid
            ? { name: "forceCertReissue", ok: true, detail: `cert reissue uid=${cert.uid}` }
            : {
                name: "forceCertReissue",
                ok: false,
                detail: `forced cert reissue failed — ${cert.error}`,
              }
        );
      } else {
        log("Force flag set but VERCEL_API_TOKEN not set — skipping cert reissue");
        steps.push({
          name: "forceCertReissue",
          ok: false,
          detail: "skipped — VERCEL_API_TOKEN not set",
        });
      }
    }
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

    // Step 4: Trigger Vercel cert issuance (POST /v8/certs?teamId=...).
    // Account-scoped token silently 403s without teamId — must pass it.
    // Retry 6× with exponential backoff; 409 = already issued = success.
    if (process.env.VERCEL_API_TOKEN) {
      log("Triggering Vercel cert issuance...");
      const { uid: certUid, error: certError } = await issueCertWithRetry(domain);
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
          detail: `Cert issuance failed after 6 attempts — ${certError}`,
        });
        steps.push({
          name: "flipToProxied",
          ok: false,
          detail: `skipped — cert issuance failed. Run: npm run cf-heal -- ${domain}`,
        });
        throw new Error(
          `Cert issuance failed for ${domain} after 6 attempts (${certError}). Run: npm run cf-heal -- ${domain}`
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
  } else {
    steps.push({
      name: "enableBotFightMode",
      ok: true,
      detail: "skipped (set CHARMLINK_ENABLE_BFM=1 to enable; Free tier blocks real browsers)",
    });
  }

  // Step 8b: Advanced Bot Protection (non-fatal, ALWAYS ON)
  // ABP blocks GPTBot, ClaudeBot, Bytespider, and other AI/content scrapers
  // WITHOUT challenging real users. This is separate from BFM — BFM blocks
  // real Chrome users on Free tier, but ABP does not. Always apply ABP
  // regardless of the BFM flag.
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

  // Step 10: x-client-asn header for the app-side datacenter check (non-fatal)
  try {
    const asn = await applyAsnTransform(zone.id);
    steps.push({
      name: "applyAsnTransform",
      ok: !asn.error,
      detail: asn.error ?? (asn.alreadyPresent ? "already present" : "added"),
    });
  } catch (err) {
    steps.push({
      name: "applyAsnTransform",
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
