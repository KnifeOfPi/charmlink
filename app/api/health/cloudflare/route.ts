import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Is the CLOUDFLARE_API_TOKEN this deployment holds still valid?
 *
 * Public on purpose: it answers only valid/invalid — never the token, its id
 * or the account — so it's safe to open after every token rotation, which is
 * exactly when it's needed (the admin UI shows "CF check failed" only once
 * someone loads it). A rolled token kills the old secret immediately, and a
 * stale value in Vercel silently breaks Heal, domain-add and the Domains page.
 *
 * Result is cached per instance for 60s so the endpoint can't be used to spend
 * the token's CF rate limit (1200 req / 5 min) that the admin flows depend on.
 */

type Health = {
  configured: boolean;
  valid: boolean;
  status: string | null;
  error?: string;
  checkedAt: string;
};

const TTL_MS = 60_000;
let cached: { at: number; body: Health; httpStatus: number } | null = null;

async function check(): Promise<{ body: Health; httpStatus: number }> {
  const checkedAt = new Date().toISOString();
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    return {
      body: { configured: false, valid: false, status: null, error: "CLOUDFLARE_API_TOKEN is not set", checkedAt },
      httpStatus: 503,
    };
  }

  // Account-owned tokens (cfat_…) only verify at the account endpoint;
  // /user/tokens/verify rejects them as "Invalid API Token".
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const url = account
    ? `https://api.cloudflare.com/client/v4/accounts/${account}/tokens/verify`
    : "https://api.cloudflare.com/client/v4/user/tokens/verify";

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as {
      success?: boolean;
      result?: { status?: string };
      errors?: Array<{ message?: string }>;
    };
    const status = data.result?.status ?? null;
    const valid = data.success === true && status === "active";
    return {
      body: {
        configured: true,
        valid,
        status,
        ...(valid ? {} : { error: data.errors?.map((e) => e.message).join(", ") || `HTTP ${res.status}` }),
        checkedAt,
      },
      httpStatus: valid ? 200 : 503,
    };
  } catch (err) {
    return {
      body: {
        configured: true,
        valid: false,
        status: null,
        error: err instanceof Error ? err.message : String(err),
        checkedAt,
      },
      httpStatus: 503,
    };
  }
}

export async function GET() {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    cached = { at: Date.now(), ...(await check()) };
  }
  return NextResponse.json(cached.body, {
    status: cached.httpStatus,
    headers: { "Cache-Control": "no-store" },
  });
}
