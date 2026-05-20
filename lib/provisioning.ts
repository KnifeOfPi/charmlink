/**
 * Shared provisioning helpers used by both /api/admin/domains and
 * /api/admin/creators/[id]/domains routes.
 */

import { addDomain, removeDomain } from "./vercel-domains";
import { provisionZone, removeProxiedDnsRecord, findZoneByDomain } from "./cloudflare";
import { addHostnameToWidget, removeHostnameFromWidget } from "./turnstile-admin";

export interface ProvisionResult {
  vercel?: unknown;
  cloudflare?: {
    zoneFound: boolean;
    message?: string;
    steps?: unknown[];
    ok?: boolean;
  };
  errors: string[];
}

export async function provisionDomain(domain: string): Promise<ProvisionResult> {
  const results: ProvisionResult = { errors: [] };

  // Step 1: Add domain to Vercel
  try {
    results.vercel = await addDomain(domain);
  } catch (err) {
    results.errors.push(`Vercel: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 2: Provision Cloudflare zone (orange-cloud CNAME + WAF + transform rules)
  if (process.env.CLOUDFLARE_API_TOKEN) {
    try {
      const cfResult = await provisionZone(domain);
      if (!cfResult.zoneFound) {
        console.warn(
          `[provisioning] CF zone not found for ${domain} — manual setup required`
        );
        results.cloudflare = {
          zoneFound: false,
          message:
            "Zone not in CF account — add the zone in Cloudflare first, then re-run this or use npm run cf-backfill",
        };
      } else {
        results.cloudflare = {
          zoneFound: true,
          ok: cfResult.ok,
          steps: cfResult.steps,
        };
        if (!cfResult.ok) {
          const failedSteps = cfResult.steps
            .filter((s) => !s.ok)
            .map((s) => `${s.name}: ${s.detail ?? "failed"}`);
          results.errors.push(`Cloudflare: ${failedSteps.join("; ")}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.errors.push(`Cloudflare: ${msg}`);
      results.cloudflare = { zoneFound: false, message: msg };
    }
  }

  // Step 3: Add hostname to Turnstile widget allow-list (defense-in-depth — never blocks).
  const tsSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (
    tsSiteKey &&
    process.env.CLOUDFLARE_API_TOKEN &&
    process.env.CLOUDFLARE_ACCOUNT_ID
  ) {
    try {
      await addHostnameToWidget(tsSiteKey, domain);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[provisioning] Turnstile widget sync (add) failed for ${domain}: ${msg}`);
      // Non-fatal: WAF/zone are still in place. Log and continue.
    }
  }

  return results;
}

export interface DeprovisionResult {
  ok: boolean;
  errors: string[];
}

export async function deprovisionDomain(domain: string): Promise<DeprovisionResult> {
  const errors: string[] = [];

  // Step 1: Remove from Vercel
  try {
    await removeDomain(domain);
  } catch (err) {
    errors.push(`Vercel: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 2: Remove proxied DNS record from Cloudflare (leave WAF/settings intact)
  if (process.env.CLOUDFLARE_API_TOKEN) {
    try {
      const zone = await findZoneByDomain(domain);
      if (zone) {
        const removed = await removeProxiedDnsRecord(zone.id, domain);
        if (removed.removed === 0) {
          console.warn(`[provisioning] No CNAME found to remove for ${domain}`);
        }
      } else {
        console.warn(`[provisioning] CF zone not found for ${domain} during DELETE`);
      }
    } catch (err) {
      errors.push(`Cloudflare: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Step 3: Remove hostname from Turnstile widget allow-list
  const tsSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (
    tsSiteKey &&
    process.env.CLOUDFLARE_API_TOKEN &&
    process.env.CLOUDFLARE_ACCOUNT_ID
  ) {
    try {
      await removeHostnameFromWidget(tsSiteKey, domain);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[provisioning] Turnstile widget sync (remove) failed for ${domain}: ${msg}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
