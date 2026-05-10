// Cloudflare Phase 3 module — orange-cloud CNAME, WAF, transform rules, bot fight mode.
// Env: CLOUDFLARE_API_TOKEN (lib code — no filesystem fallback; see scripts/cf-backfill.ts).

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

interface CFRuleset {
  id: string;
  name: string;
  description?: string;
  kind: string;
  phase: string;
  rules: CFRule[];
}

interface CFRule {
  id?: string;
  action: string;
  expression: string;
  description?: string;
  enabled?: boolean;
  action_parameters?: Record<string, unknown>;
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
 * Ensure an orange-cloud proxied CNAME → cname.vercel-dns.com exists for the domain.
 * For apex domains (name == zone apex), CF uses CNAME flattening automatically.
 * Removes conflicting A/AAAA/CNAME records first.
 */
export async function ensureProxiedDnsRecord(
  zoneId: string,
  domain: string
): Promise<{ created: boolean; updated: boolean; recordId: string }> {
  // Fetch existing records for this name
  const listRes = await cfFetch<CFDnsRecord[]>(
    "GET",
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(domain)}&per_page=100`
  );
  const existing = listRes.result;

  // Check if already correctly set
  const existing_cname = existing.find(
    (r) => r.type === "CNAME" && r.content === VERCEL_CNAME_TARGET && r.proxied
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

  // Create proxied CNAME
  const createRes = await cfFetch<CFDnsRecord>(
    "POST",
    `/zones/${zoneId}/dns_records`,
    {
      type: "CNAME",
      name: domain,
      content: VERCEL_CNAME_TARGET,
      ttl: 1, // Auto TTL
      proxied: true,
    }
  );

  const wasExisting = existing.some((r) => ["A", "AAAA", "CNAME"].includes(r.type));
  return {
    created: !wasExisting,
    updated: wasExisting,
    recordId: createRes.result.id,
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
 * Enable Bot Fight Mode (Free plan supported via /bot_management endpoint).
 * Provides basic bot heuristic blocking; on Free tier this is Super Bot Fight Mode Lite.
 */
export async function enableBotFightMode(
  zoneId: string
): Promise<{ enabled: boolean; error?: string }> {
  const res = await cfFetchSafe<unknown>(
    "PUT",
    `/zones/${zoneId}/bot_management`,
    { fight_mode: true }
  );
  return res.ok ? { enabled: true } : { enabled: false, error: res.error };
}

// ── WAF custom rules ──────────────────────────────────────────────────────────

// ASNs imported from bot-detect so the WAF stays in sync with server-side detection.
import { DATACENTER_ASNS } from "./datacenter-asns";

function buildAsnExpression(): string {
  const asns = Array.from(DATACENTER_ASNS).join(" ");
  // CF in{} set cap is ~512 items; 14 ASNs is well under.
  return `(ip.src.asnum in {${asns}})`;
}

const WAF_RULES: Array<{ description: string; expression: string; action: string }> = [
  {
    description: "charmlink: empty UA",
    expression: "(http.user_agent eq \"\")",
    action: "block",
  },
  {
    // CF normalises absent User-Agent header to ""; this rule catches cases where the
    // header is structurally absent (CF field http.request.headers.names).
    description: "charmlink: missing UA",
    expression: "(not any(lower(http.request.headers.names[*])[*] eq \"user-agent\"))",
    action: "block",
  },
  {
    description: "charmlink: cf bot",
    expression: "(cf.client.bot)",
    action: "managed_challenge",
  },
  {
    // Tor / high-threat IPs: Free tier does not expose ip.src.country=="T1".
    // Use cf.threat_score as a proxy (scores > 30 are typically Tor/bad actors).
    description: "charmlink: tor and high threat score",
    expression: "(cf.threat_score gt 30)",
    action: "managed_challenge",
  },
  {
    description: "charmlink: scraper ASNs",
    expression: buildAsnExpression(),
    action: "managed_challenge",
  },
  {
    description: "charmlink: known bad UAs",
    expression:
      "(http.user_agent contains \"python-requests\" or " +
      "http.user_agent contains \"Go-http-client\" or " +
      "http.user_agent contains \"scrapy\" or " +
      "http.user_agent contains \"curl/\" or " +
      "http.user_agent contains \"wget/\" or " +
      "http.user_agent contains \"HeadlessChrome\" or " +
      "http.user_agent contains \"PhantomJS\")",
    action: "block",
  },
];

/**
 * Idempotently apply WAF custom rules to the zone.
 * Uses the http_request_firewall_custom phase entrypoint.
 * Replaces any existing rules whose description starts with "charmlink:".
 */
export async function applyWafRules(
  zoneId: string
): Promise<{ rulesetId: string; rulesApplied: number; errors: string[] }> {
  return applyRulesetRules(
    zoneId,
    "http_request_firewall_custom",
    WAF_RULES.map((r) => ({
      action: r.action,
      expression: r.expression,
      description: r.description,
      enabled: true,
    }))
  );
}

// ── Transform rules ───────────────────────────────────────────────────────────

const VERCEL_HEADERS_TO_STRIP = [
  "server",
  "x-vercel-cache",
  "x-vercel-id",
  "x-vercel-execution-region",
  "x-nextjs-cache",
  "x-nextjs-prerender",
  "x-matched-path",
];

/**
 * Idempotently apply HTTP response header transform rules.
 * Strips Vercel infrastructure headers from every response (phase: http_response_headers_transform).
 * This is the correct fix — middleware.ts/proxy.ts cannot strip these because Vercel re-adds
 * them after the edge function runs; the CF transform layer runs after origin.
 */
export async function applyTransformRules(
  zoneId: string
): Promise<{ rulesetId: string; rulesApplied: number; errors: string[] }> {
  const removeOps: Record<string, { operation: "remove" }> = {};
  for (const h of VERCEL_HEADERS_TO_STRIP) {
    removeOps[h] = { operation: "remove" };
  }

  return applyRulesetRules(
    zoneId,
    "http_response_headers_transform",
    [
      {
        action: "rewrite",
        expression: "true",
        description: "charmlink: strip vercel headers",
        enabled: true,
        action_parameters: { headers: removeOps },
      },
    ]
  );
}

// ── Shared ruleset helper ─────────────────────────────────────────────────────

async function applyRulesetRules(
  zoneId: string,
  phase: string,
  newRules: CFRule[]
): Promise<{ rulesetId: string; rulesApplied: number; errors: string[] }> {
  const errors: string[] = [];

  // Try to GET the existing entrypoint ruleset for this phase
  const getRes = await cfFetchSafe<CFRuleset>(
    "GET",
    `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`
  );

  let existingRules: CFRule[] = [];
  let rulesetId = "";

  if (getRes.ok && getRes.data) {
    rulesetId = getRes.data.id;
    existingRules = getRes.data.rules ?? [];
  }

  // Remove all existing "charmlink:" rules
  const nonCharmRules = existingRules.filter(
    (r) => !r.description?.startsWith("charmlink:")
  );

  // Merge: existing non-charmlink rules first, then new charmlink rules
  const mergedRules = [...nonCharmRules, ...newRules];

  if (rulesetId) {
    // Update existing ruleset
    const putRes = await cfFetchSafe<CFRuleset>(
      "PUT",
      `/zones/${zoneId}/rulesets/${rulesetId}`,
      { rules: mergedRules }
    );
    if (!putRes.ok) {
      errors.push(putRes.error ?? "PUT ruleset failed");
      return { rulesetId, rulesApplied: 0, errors };
    }
    return { rulesetId, rulesApplied: newRules.length, errors };
  } else {
    // Create new ruleset
    const postRes = await cfFetchSafe<CFRuleset>(
      "POST",
      `/zones/${zoneId}/rulesets`,
      {
        name: `CharmLink ${phase}`,
        kind: "zone",
        phase,
        rules: mergedRules,
      }
    );
    if (!postRes.ok || !postRes.data) {
      errors.push(postRes.error ?? "POST ruleset failed");
      return { rulesetId: "", rulesApplied: 0, errors };
    }
    return {
      rulesetId: postRes.data.id,
      rulesApplied: newRules.length,
      errors,
    };
  }
}

// ── Zone provisioning orchestrator ────────────────────────────────────────────

interface ProvisionStep {
  name: string;
  ok: boolean;
  detail?: string;
}

export async function provisionZone(domain: string): Promise<{
  ok: boolean;
  zoneFound: boolean;
  zone?: ZoneInfo;
  steps: ProvisionStep[];
}> {
  const steps: ProvisionStep[] = [];

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

  // Step 2: DNS record
  try {
    const dns = await ensureProxiedDnsRecord(zone.id, domain);
    steps.push({
      name: "ensureProxiedDnsRecord",
      ok: true,
      detail: `recordId=${dns.recordId} created=${dns.created} updated=${dns.updated}`,
    });
  } catch (err) {
    steps.push({
      name: "ensureProxiedDnsRecord",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // Step 3: standard settings (non-fatal)
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

  // Step 4: bot fight mode (non-fatal)
  try {
    const bfm = await enableBotFightMode(zone.id);
    steps.push({
      name: "enableBotFightMode",
      ok: bfm.enabled,
      detail: bfm.error,
    });
  } catch (err) {
    steps.push({
      name: "enableBotFightMode",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // Step 5: WAF rules (non-fatal)
  try {
    const waf = await applyWafRules(zone.id);
    const ok = waf.errors.length === 0;
    steps.push({
      name: "applyWafRules",
      ok,
      detail: ok
        ? `rulesetId=${waf.rulesetId} rulesApplied=${waf.rulesApplied}`
        : `errors: ${waf.errors.join("; ")}`,
    });
  } catch (err) {
    steps.push({
      name: "applyWafRules",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // Step 6: transform rules (non-fatal)
  try {
    const tr = await applyTransformRules(zone.id);
    const ok = tr.errors.length === 0;
    steps.push({
      name: "applyTransformRules",
      ok,
      detail: ok
        ? `rulesetId=${tr.rulesetId} rulesApplied=${tr.rulesApplied}`
        : `errors: ${tr.errors.join("; ")}`,
    });
  } catch (err) {
    steps.push({
      name: "applyTransformRules",
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
