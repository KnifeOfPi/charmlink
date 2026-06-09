// Vercel Domains API integration
// Env vars: VERCEL_API_TOKEN, VERCEL_PROJECT_ID

function getConfig(): { token: string; projectId: string } {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token) throw new Error("VERCEL_API_TOKEN is not set");
  if (!projectId) throw new Error("VERCEL_PROJECT_ID is not set");
  return { token, projectId };
}

async function vercelFetch(
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const { token } = getConfig();
  const res = await fetch(`https://api.vercel.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = { status: res.status };
  }

  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "error" in data
        ? (data as { error: { message?: string } }).error?.message ?? res.statusText
        : res.statusText;
    throw new Error(`Vercel API error ${res.status}: ${msg}`);
  }

  return data;
}

export interface VercelDomainStatus {
  name: string;
  apexName: string;
  verified: boolean;
  verification?: Array<{
    type: string;
    domain: string;
    value: string;
    reason: string;
  }>;
  redirect?: string | null;
  gitBranch?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface VercelDomainList {
  domains: VercelDomainStatus[];
  pagination?: { count: number; next?: number; prev?: number };
}

export async function addDomain(domain: string): Promise<VercelDomainStatus> {
  const { projectId } = getConfig();
  return vercelFetch("POST", `/v10/projects/${projectId}/domains`, { name: domain }) as Promise<VercelDomainStatus>;
}

export async function removeDomain(domain: string): Promise<void> {
  const { projectId } = getConfig();
  const res = await fetch(`https://api.vercel.com/v10/projects/${projectId}/domains/${domain}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(`Vercel API error ${res.status}: ${data?.error?.message ?? res.statusText}`);
  }
}

export async function getDomainStatus(domain: string): Promise<VercelDomainStatus> {
  const { projectId } = getConfig();
  return vercelFetch("GET", `/v10/projects/${projectId}/domains/${domain}`) as Promise<VercelDomainStatus>;
}

/**
 * Poll until the Vercel domain is verified and has no pending ACME challenges.
 * Resolves with { ready: true } when the cert is issued, or { ready: false, reason } on timeout.
 */
export async function waitForDomainReady(
  domain: string,
  timeoutMs = 180000,
  pollMs = 5000
): Promise<{ ready: true } | { ready: false; reason: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const status = await getDomainStatus(domain);
      const hasPendingChallenges = status.verification && status.verification.length > 0;
      if (status.verified && !hasPendingChallenges) {
        return { ready: true };
      }
    } catch {
      // Ignore transient errors during polling; retry until deadline
    }
    await new Promise<void>((r) => setTimeout(r, pollMs));
  }
  return {
    ready: false,
    reason: `timed out after ${timeoutMs / 1000}s waiting for Vercel cert`,
  };
}

export async function listDomains(): Promise<VercelDomainStatus[]> {
  const { projectId } = getConfig();
  const all: VercelDomainStatus[] = [];
  let until: number | undefined;
  // Vercel paginates project domains; follow pagination.next (a timestamp used
  // as the `until` cursor) until exhausted. Cap iterations to avoid infinite loops.
  for (let i = 0; i < 50; i++) {
    const qs = `?limit=100${until !== undefined ? `&until=${until}` : ""}`;
    const data = (await vercelFetch(
      "GET",
      `/v10/projects/${projectId}/domains${qs}`
    )) as VercelDomainList;
    if (Array.isArray(data.domains)) all.push(...data.domains);
    const next = data.pagination?.next;
    if (next === null || next === undefined) break;
    until = next;
  }
  return all;
}

/**
 * Trigger Vercel cert issuance for a domain via POST /v4/certs?teamId=...
 *
 * Requires VERCEL_API_TOKEN env var. VERCEL_TEAM_ID is strongly recommended —
 * account-scoped token calls to /v4/certs silently 403 without it (2026-05-29 incident).
 *
 * Returns { uid } on success, or throws on unexpected errors.
 * HTTP 409 ("cert already exists") is treated as success and returns { uid: "already-exists" }.
 */
export async function issueCert(domain: string): Promise<{ uid: string }> {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) throw new Error("VERCEL_API_TOKEN is not set");
  const teamId = process.env.VERCEL_TEAM_ID;
  const url = `https://api.vercel.com/v4/certs${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ domains: [domain] }),
  });

  if (res.status === 409) {
    return { uid: "already-exists" };
  }

  const data = (await res.json()) as { uid?: string; error?: { message?: string } };
  if (!res.ok) {
    throw new Error(
      `Vercel cert API ${res.status}: ${data?.error?.message ?? res.statusText}`
    );
  }
  if (!data.uid) {
    throw new Error(`Vercel cert API: response missing uid (status ${res.status})`);
  }
  return { uid: data.uid };
}
