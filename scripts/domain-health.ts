/**
 * Domain health check that works from any machine — including a datacenter
 * or cloud IP, where every creator homepage now answers 403.
 *
 *   npm run domain-health                    # every active creator domain (DATABASE_URL)
 *   npm run domain-health -- a.com b.com     # just these
 *   npm run domain-health -- --json          # machine-readable
 *
 * WHY NOT PROBE "/": since 2026-10-07 every zone managed-challenges datacenter
 * ASNs (charmlink:challenge-datacenter-asns). A monitor running on a server
 * gets Cloudflare's challenge — `403` with `cf-mitigated: challenge` — on
 * every homepage, while real visitors are served normally. Probing "/" and
 * treating 403 as broken produced a Slack list of ~75 "heal failed" domains
 * that were all fine; and cf-heal cannot "fix" a WAF challenge.
 *
 * WHAT THIS PROBES: https://<domain>/.well-known/acme-challenge/probe — the
 * one path the WAF deliberately lets through (cert renewal needs it). A 404
 * there proves, in one request: DNS resolves, TLS is valid, Cloudflare is
 * proxying, the Vercel origin and our app answered, and Let's Encrypt can
 * reach the domain to renew its certificate.
 *
 *   404 + via Cloudflare  → OK
 *   404, not via Cloudflare → WARN  serving, but not behind Cloudflare (no WAF)
 *   403 cf-mitigated        → FAIL  cert renewal blocked by our own WAF
 *   5xx (520–526 etc.)      → FAIL  down — run cf-heal
 *   network/TLS error       → FAIL  down — run cf-heal
 *   200 / other             → WARN  not our app answering (parking page?)
 *
 * Exit code 1 only when something FAILs. Warnings never page.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { Pool } from "pg";

type Status = "OK" | "WARN" | "FAIL";
interface Result {
  domain: string;
  status: Status;
  http: number | null;
  viaCloudflare: boolean;
  detail: string;
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const explicit = args.filter((a) => !a.startsWith("--"));

async function activeDomains(): Promise<string[]> {
  let url = process.env.DATABASE_URL;
  if (!url) {
    try {
      url = fs.readFileSync(path.join(os.homedir(), ".openclaw", "charmasutra-db"), "utf-8").trim();
    } catch {
      // fall through
    }
  }
  if (!url) throw new Error("DATABASE_URL is not set (or pass domains as arguments)");
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
  try {
    const { rows } = await pool.query<{ d: string }>(
      `SELECT DISTINCT lower(custom_domain) AS d FROM charmlink_creators
        WHERE is_active AND custom_domain IS NOT NULL AND custom_domain <> '' ORDER BY 1`
    );
    return rows.map((r) => r.d);
  } finally {
    await pool.end();
  }
}

async function probe(domain: string): Promise<Result> {
  const url = `https://${domain}/.well-known/acme-challenge/probe`;
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "charmlink-domain-health/1.0" },
    });
    const viaCloudflare = res.headers.has("cf-ray");
    const mitigated = res.headers.get("cf-mitigated");
    const base = { domain, http: res.status, viaCloudflare };
    if (res.status === 404) {
      return viaCloudflare
        ? { ...base, status: "OK", detail: "serving, proxied, cert renewal open" }
        : { ...base, status: "WARN", detail: "serving but NOT behind Cloudflare — no WAF" };
    }
    if (res.status === 403 && mitigated) {
      return { ...base, status: "FAIL", detail: `cert renewal BLOCKED by WAF (cf-mitigated: ${mitigated}) — see docs/NEW-DOMAIN-TROUBLESHOOTING.md` };
    }
    if (res.status >= 500) {
      return { ...base, status: "FAIL", detail: `down (HTTP ${res.status}) — run: npm run cf-heal -- ${domain}` };
    }
    return { ...base, status: "WARN", detail: `unexpected HTTP ${res.status} — not our app answering? (parking page / registrar)` };
  } catch (err) {
    const msg = err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err);
    return { domain, status: "FAIL", http: null, viaCloudflare: false, detail: `unreachable (${msg}) — run: npm run cf-heal -- ${domain}` };
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

(async () => {
  const domains = explicit.length ? explicit.map((d) => d.toLowerCase()) : await activeDomains();
  const results = await mapLimit(domains, 8, probe);
  const count = (s: Status) => results.filter((r) => r.status === s).length;

  if (asJson) {
    console.log(JSON.stringify({ checked: results.length, ok: count("OK"), warn: count("WARN"), fail: count("FAIL"), results }, null, 2));
  } else {
    for (const r of results.filter((x) => x.status !== "OK")) {
      console.log(`${r.status === "FAIL" ? "❌" : "⚠️ "} ${r.domain.padEnd(26)} ${r.detail}`);
    }
    console.log(`\n${results.length} checked — ✅ ${count("OK")} ok, ⚠️  ${count("WARN")} warn, ❌ ${count("FAIL")} fail`);
  }
  process.exit(count("FAIL") ? 1 : 0);
})().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
