// Cloudflare DNS API integration
// Env var: CLOUDFLARE_API_TOKEN

import { cfRequest, mapWithConcurrency } from "./cf-http";

const VERCEL_A_RECORD = "76.76.21.21";

function getToken(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set");
  return token;
}

async function cfFetch<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ success: boolean; result: T; errors: Array<{ message: string }> }> {
  const res = await cfRequest(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: { success: boolean; result: T; errors: Array<{ message: string }> };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new Error(`Cloudflare API ${res.status}: non-JSON response`);
  }

  if (!data.success) {
    const msg = data.errors?.map((e) => e.message).join(", ") || res.statusText;
    throw new Error(`Cloudflare API error: ${msg}`);
  }

  return data;
}

// ── Zone lookup ───────────────────────────────────────────────────────────────

interface CFZone {
  id: string;
  name: string;
  status: string;
}

/**
 * Find the zone ID for a domain. Handles subdomains by looking up the root domain.
 * e.g., "www.hollyxo.com" → finds zone for "hollyxo.com"
 */
export async function getZoneId(domain: string): Promise<string | null> {
  // Try the domain as-is first, then strip subdomains
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    const data = await cfFetch<CFZone[]>("GET", `/zones?name=${encodeURIComponent(candidate)}&per_page=1`);
    if (data.result.length > 0) {
      return data.result[0].id;
    }
  }
  return null;
}

// ── DNS Record Management ─────────────────────────────────────────────────────

interface CFDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

/**
 * List all DNS records for a zone, optionally filtered by name.
 */
export async function listDnsRecords(
  zoneId: string,
  name?: string
): Promise<CFDnsRecord[]> {
  const params = name ? `?name=${encodeURIComponent(name)}&per_page=100` : "?per_page=100";
  const data = await cfFetch<CFDnsRecord[]>("GET", `/zones/${zoneId}/dns_records${params}`);
  return data.result;
}

/**
 * Add a DNS A record pointing to Vercel.
 * - For root domains: A record → 76.76.21.21
 * - Proxied through Cloudflare (orange cloud) is OFF — Vercel needs direct DNS for SSL provisioning
 */
export async function addVercelDnsRecord(domain: string): Promise<{
  success: boolean;
  record?: CFDnsRecord;
  error?: string;
}> {
  try {
    const zoneId = await getZoneId(domain);
    if (!zoneId) {
      return { success: false, error: `Zone not found for domain: ${domain}. Is it on your Cloudflare account?` };
    }

    // Check if record already exists
    const existing = await listDnsRecords(zoneId, domain);
    const hasVercelRecord = existing.some(
      (r) => r.type === "A" && r.content === VERCEL_A_RECORD
    );

    if (hasVercelRecord) {
      return { success: true, record: existing.find((r) => r.type === "A" && r.content === VERCEL_A_RECORD) };
    }

    // Delete any existing A/AAAA/CNAME records for this exact name to avoid conflicts
    for (const record of existing) {
      if (["A", "AAAA", "CNAME"].includes(record.type)) {
        await cfFetch("DELETE", `/zones/${zoneId}/dns_records/${record.id}`);
      }
    }

    // Create A record pointing to Vercel
    // proxied: false is required — Vercel needs to see the real DNS for SSL cert provisioning
    const data = await cfFetch<CFDnsRecord>("POST", `/zones/${zoneId}/dns_records`, {
      type: "A",
      name: domain,
      content: VERCEL_A_RECORD,
      ttl: 1, // Auto
      proxied: false,
    });

    return { success: true, record: data.result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Remove the Vercel A record for a domain.
 */
export async function removeVercelDnsRecord(domain: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const zoneId = await getZoneId(domain);
    if (!zoneId) {
      return { success: false, error: `Zone not found for domain: ${domain}` };
    }

    const records = await listDnsRecords(zoneId, domain);
    const vercelRecords = records.filter(
      (r) => r.type === "A" && r.content === VERCEL_A_RECORD
    );

    for (const record of vercelRecords) {
      await cfFetch("DELETE", `/zones/${zoneId}/dns_records/${record.id}`);
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface DnsStatus {
  configured: boolean;
  zoneFound: boolean;
  /** Set when a CF API call failed (rate limit, bad/expired token). zoneFound
   *  is false then, but it means "couldn't check" — NOT "not on Cloudflare".
   *  Collapsing the two is what flagged the whole fleet as off-Cloudflare. */
  lookupError?: string;
  records: Array<{ type: string; name: string; content: string; proxied: boolean }>;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function recordsStatus(zoneId: string, domain: string): Promise<DnsStatus> {
  const records = await listDnsRecords(zoneId, domain);
  const relevantRecords = records
    .filter((r) => ["A", "AAAA", "CNAME"].includes(r.type))
    .map((r) => ({ type: r.type, name: r.name, content: r.content, proxied: r.proxied }));

  const configured = relevantRecords.some(
    (r) => r.type === "A" && r.content === VERCEL_A_RECORD
  );

  return { configured, zoneFound: true, records: relevantRecords };
}

/**
 * Check if a domain has the correct Vercel DNS record.
 */
export async function checkDnsStatus(domain: string): Promise<DnsStatus> {
  try {
    const zoneId = await getZoneId(domain);
    if (!zoneId) {
      return { configured: false, zoneFound: false, records: [] };
    }
    return await recordsStatus(zoneId, domain);
  } catch (err) {
    return { configured: false, zoneFound: false, lookupError: errMsg(err), records: [] };
  }
}

/**
 * checkDnsStatus for many domains at once, without the per-domain zone
 * lookups: one paginated zone listing, then a concurrency-limited record fetch
 * per domain. The old fan-out (up to 3 CF calls per domain, all in parallel,
 * on every Domains page load) is what tripped CF's rate limit.
 */
export async function checkDnsStatusBulk(domains: string[]): Promise<Map<string, DnsStatus>> {
  const out = new Map<string, DnsStatus>();

  let zones: Array<{ id: string; name: string }>;
  try {
    zones = await listZones();
  } catch (err) {
    const lookupError = errMsg(err);
    for (const d of domains) {
      out.set(d, { configured: false, zoneFound: false, lookupError, records: [] });
    }
    return out;
  }

  // Longest-suffix match, same as getZoneId's "strip subdomains" walk.
  const zoneFor = (domain: string) => {
    const parts = domain.split(".");
    for (let i = 0; i < parts.length - 1; i++) {
      const candidate = parts.slice(i).join(".");
      const z = zones.find((zone) => zone.name === candidate);
      if (z) return z;
    }
    return null;
  };

  await mapWithConcurrency(domains, 4, async (domain) => {
    const zone = zoneFor(domain);
    if (!zone) {
      out.set(domain, { configured: false, zoneFound: false, records: [] });
      return;
    }
    try {
      out.set(domain, await recordsStatus(zone.id, domain));
    } catch (err) {
      // Zone exists — only the record fetch failed. Keep zoneFound true so
      // this never reads as "not on Cloudflare".
      out.set(domain, { configured: false, zoneFound: true, lookupError: errMsg(err), records: [] });
    }
  });

  return out;
}

/**
 * List all zones (domains) on the Cloudflare account.
 */
export async function listZones(): Promise<Array<{ id: string; name: string; status: string }>> {
  const allZones: Array<{ id: string; name: string; status: string }> = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const data = await cfFetch<CFZone[]>("GET", `/zones?per_page=50&page=${page}`);
    allZones.push(...data.result.map((z) => ({ id: z.id, name: z.name, status: z.status })));
    const info = (data as unknown as { result_info?: { total_pages?: number } }).result_info;
    totalPages = info?.total_pages ?? 1;
    page++;
  }

  return allZones;
}
