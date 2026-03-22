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

export async function listDomains(): Promise<VercelDomainStatus[]> {
  const { projectId } = getConfig();
  const data = await vercelFetch("GET", `/v10/projects/${projectId}/domains`) as VercelDomainList;
  return data.domains ?? [];
}
