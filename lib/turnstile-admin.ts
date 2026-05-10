// Cloudflare Turnstile widget admin — list/get/update widget configs to keep the
// `domains` allow-list in sync with creator custom domains.
//
// API reference (verified working with the project's "Turnstile Edit" token):
//   LIST   GET  /accounts/{acct}/challenges/widgets
//   GET    GET  /accounts/{acct}/challenges/widgets/{sitekey}
//   UPDATE PUT  /accounts/{acct}/challenges/widgets/{sitekey}   (body must include the full config)
//
// Env:
//   CLOUDFLARE_API_TOKEN     — required
//   CLOUDFLARE_ACCOUNT_ID    — required
//
// All functions throw on hard failure. Callers (admin route, backfill script) are
// expected to wrap in try/catch — Turnstile widget sync is defense-in-depth and
// must never block a successful WAF/zone provision.

const CF_BASE = "https://api.cloudflare.com/client/v4";

export interface TurnstileWidget {
  sitekey: string;
  name: string;
  /** "managed" | "non-interactive" | "invisible" */
  mode: string;
  /** Allow-listed hostnames — exact match or apex+all subdomains depending on CF behavior. */
  domains: string[];
  bot_fight_mode?: boolean;
  region?: string;
  offlabel?: boolean;
  clearance_level?: string;
  modified_on?: string;
  created_on?: string;
}

interface CFResponse<T> {
  success: boolean;
  result: T;
  errors: Array<{ message: string; code?: number }>;
}

function getToken(): string {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set");
  return token;
}

function getAccountId(): string {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!id) throw new Error("CLOUDFLARE_ACCOUNT_ID is not set");
  return id;
}

async function cf<T>(method: string, path: string, body?: unknown): Promise<T> {
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
    throw new Error(`Turnstile API ${res.status}: non-JSON response`);
  }

  if (!data.success) {
    const msg =
      data.errors?.map((e) => e.message).join(", ") || `HTTP ${res.status}`;
    throw new Error(`Turnstile API error: ${msg}`);
  }

  return data.result;
}

/** List all Turnstile widgets in the account. */
export async function listTurnstileWidgets(): Promise<TurnstileWidget[]> {
  const account = getAccountId();
  return cf<TurnstileWidget[]>(
    "GET",
    `/accounts/${account}/challenges/widgets`
  );
}

/** Fetch a single Turnstile widget config by sitekey. */
export async function getTurnstileWidget(
  siteKey: string
): Promise<TurnstileWidget> {
  const account = getAccountId();
  return cf<TurnstileWidget>(
    "GET",
    `/accounts/${account}/challenges/widgets/${encodeURIComponent(siteKey)}`
  );
}

/**
 * Build the PUT body required by the UPDATE endpoint. CF requires the full widget
 * config (name, mode, domains, etc.) — it's a replace, not a patch.
 */
function buildUpdateBody(widget: TurnstileWidget) {
  const body: Record<string, unknown> = {
    name: widget.name,
    mode: widget.mode,
    domains: widget.domains,
  };
  if (typeof widget.bot_fight_mode === "boolean") {
    body.bot_fight_mode = widget.bot_fight_mode;
  }
  if (widget.region) body.region = widget.region;
  if (typeof widget.offlabel === "boolean") body.offlabel = widget.offlabel;
  if (widget.clearance_level) body.clearance_level = widget.clearance_level;
  return body;
}

/**
 * Add a hostname to the widget's domains allow-list (idempotent).
 * Returns the updated widget. No-ops (returns current widget) if hostname is already present.
 */
export async function addHostnameToWidget(
  siteKey: string,
  hostname: string
): Promise<TurnstileWidget> {
  const normalized = normalizeHostname(hostname);
  const widget = await getTurnstileWidget(siteKey);

  const existing = new Set((widget.domains ?? []).map(normalizeHostname));
  if (existing.has(normalized)) {
    return widget; // already present
  }

  const account = getAccountId();
  const updated: TurnstileWidget = {
    ...widget,
    domains: [...(widget.domains ?? []), normalized],
  };
  return cf<TurnstileWidget>(
    "PUT",
    `/accounts/${account}/challenges/widgets/${encodeURIComponent(siteKey)}`,
    buildUpdateBody(updated)
  );
}

/**
 * Remove a hostname from the widget's domains allow-list (idempotent).
 * Returns the updated widget. No-ops (returns current widget) if hostname is absent.
 */
export async function removeHostnameFromWidget(
  siteKey: string,
  hostname: string
): Promise<TurnstileWidget> {
  const normalized = normalizeHostname(hostname);
  const widget = await getTurnstileWidget(siteKey);

  const next = (widget.domains ?? []).filter(
    (d) => normalizeHostname(d) !== normalized
  );
  if (next.length === (widget.domains ?? []).length) {
    return widget; // not present, nothing to do
  }

  const account = getAccountId();
  const updated: TurnstileWidget = { ...widget, domains: next };
  return cf<TurnstileWidget>(
    "PUT",
    `/accounts/${account}/challenges/widgets/${encodeURIComponent(siteKey)}`,
    buildUpdateBody(updated)
  );
}

function normalizeHostname(host: string): string {
  return host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}
