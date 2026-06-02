import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { addDomain, removeDomain } from "../../../../lib/vercel-domains";
import { provisionZone, removeProxiedDnsRecord, findZoneByDomain } from "../../../../lib/cloudflare";
import { addHostnameToWidget, removeHostnameFromWidget } from "../../../../lib/turnstile-admin";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * HEAD-probe a domain to check end-to-end TLS + HTTP health.
 * Returns healthy=true on any sub-500 response (incl. 3xx/4xx).
 * 525 / TLS errors / network errors => unhealthy.
 */
async function probeHealth(domain: string): Promise<{ status: number | null; healthy: boolean }> {
  try {
    const res = await fetch(`https://${domain}/`, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Mozilla/5.0 charmlink-autoheal-probe" },
    });
    return { status: res.status, healthy: res.status < 500 };
  } catch {
    return { status: null, healthy: false };
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * After provisionZone succeeds, poll the public hostname for healthy TLS.
 * If still broken after the initial backoff window, run a second provisionZone
 * pass (same idempotent recovery the Heal button does) and re-probe.
 *
 * This is what prevents the bouncedat.club regression: even when the initial
 * provisioning returns ok=true, the CF proxy + Vercel cert sometimes settle
 * into a 525 stuck state. One re-run of provisionZone fixes it.
 */
async function verifyAndAutoHeal(
  domain: string,
  initial: Awaited<ReturnType<typeof provisionZone>>
): Promise<{
  healthy: boolean;
  finalStatus: number | null;
  attempts: Array<{ at: number; status: number | null }>;
  reheal: { ran: boolean; ok?: boolean };
}> {
  const attempts: Array<{ at: number; status: number | null }> = [];
  const probeSchedule = [10_000, 15_000, 20_000, 30_000, 30_000]; // ~105s total wait
  const reheal = { ran: false, ok: undefined as boolean | undefined };

  let lastProbe: { status: number | null; healthy: boolean } = { status: null, healthy: false };

  for (const delay of probeSchedule) {
    await sleep(delay);
    lastProbe = await probeHealth(domain);
    attempts.push({ at: Date.now(), status: lastProbe.status });
    if (lastProbe.healthy) break;
  }

  // Still broken after ~105s of polling + initial provision -> run one more pass
  if (!lastProbe.healthy && initial.zoneFound) {
    reheal.ran = true;
    try {
      const second = await provisionZone(domain);
      reheal.ok = second.ok;
      // Probe once more after re-heal
      await sleep(15_000);
      lastProbe = await probeHealth(domain);
      attempts.push({ at: Date.now(), status: lastProbe.status });
    } catch {
      reheal.ok = false;
    }
  }

  return {
    healthy: lastProbe.healthy,
    finalStatus: lastProbe.status,
    attempts,
    reheal,
  };
}

function checkAuth(request: NextRequest): boolean {
  const adminKey = process.env.CHARMLINK_ADMIN_KEY;
  if (!adminKey) return false;
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${adminKey}`;
}

function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 3,
    connectionTimeoutMillis: 10000,
  });
}

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      domain: string;
      creator_id?: string;
      make_primary?: boolean;
    };
    const { domain, creator_id, make_primary = false } = body;
    if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

    const results: {
      vercel?: unknown;
      cloudflare?: {
        zoneFound: boolean;
        message?: string;
        steps?: unknown[];
        ok?: boolean;
      };
      db?: { inserted: boolean; is_primary: boolean };
      errors: string[];
    } = { errors: [] };

    // Step 1: Add domain to Vercel
    try {
      results.vercel = await addDomain(domain);
    } catch (err) {
      results.errors.push(`Vercel: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Step 2: Insert into charmlink_creator_domains (if creator_id provided).
    // The DB trigger trg_sync_creator_primary_domain syncs the primary row back
    // to charmlink_creators.custom_domain — do NOT write that column directly.
    if (creator_id) {
      const pool = getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Check whether this creator already has any rows in the join table
        const existingRows = await client.query<{ id: string; is_primary: boolean }>(
          `SELECT id, is_primary FROM charmlink_creator_domains WHERE creator_id = $1`,
          [creator_id]
        );

        let isPrimary: boolean;
        if (existingRows.rows.length === 0) {
          // No existing domains — force is_primary=true regardless of make_primary
          isPrimary = true;
        } else if (make_primary) {
          // Demote the existing primary first
          await client.query(
            `UPDATE charmlink_creator_domains SET is_primary = false WHERE creator_id = $1 AND is_primary = true`,
            [creator_id]
          );
          isPrimary = true;
        } else {
          isPrimary = false;
        }

        await client.query(
          `INSERT INTO charmlink_creator_domains (creator_id, domain, is_primary)
           VALUES ($1, $2, $3)`,
          [creator_id, domain, isPrimary]
        );

        await client.query("COMMIT");
        results.db = { inserted: true, is_primary: isPrimary };
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        results.errors.push(`DB: ${err instanceof Error ? err.message : String(err)}`);
        results.db = { inserted: false, is_primary: false };
      } finally {
        client.release();
        await pool.end();
      }
    }

    // Step 3: Provision Cloudflare zone (gray-cloud → cert → orange + WAF)
    //         then auto-verify health and re-run provisionZone if still broken.
    //         This is what eliminates the bouncedat.club-style stuck-525 cases.
    if (process.env.CLOUDFLARE_API_TOKEN) {
      try {
        const cfResult = await provisionZone(domain);
        if (!cfResult.zoneFound) {
          console.warn(
            `[admin/domains] CF zone not found for ${domain} — manual setup required`
          );
          results.cloudflare = {
            zoneFound: false,
            message:
              "Zone not in CF account — add the zone in Cloudflare first, then re-run this or use npm run cf-backfill",
          };
        } else {
          // Auto-verify + auto-heal loop (fire-and-poll, blocks up to ~2.5 min)
          const verify = await verifyAndAutoHeal(domain, cfResult);

          const cfBlock: NonNullable<typeof results.cloudflare> = {
            zoneFound: true,
            ok: cfResult.ok && verify.healthy,
            steps: cfResult.steps,
          };
          // Add verification trace so the admin UI / curl can see what happened
          (cfBlock as unknown as Record<string, unknown>).verification = {
            healthy: verify.healthy,
            finalStatus: verify.finalStatus,
            probeAttempts: verify.attempts.length,
            autoHealRan: verify.reheal.ran,
            autoHealOk: verify.reheal.ok,
          };
          results.cloudflare = cfBlock;

          if (!cfResult.ok) {
            const failedSteps = cfResult.steps
              .filter((s) => !s.ok)
              .map((s) => `${s.name}: ${s.detail ?? "failed"}`);
            results.errors.push(`Cloudflare: ${failedSteps.join("; ")}`);
          }
          if (!verify.healthy) {
            results.errors.push(
              `Verification: domain still unhealthy after auto-heal (HTTP ${verify.finalStatus ?? "?"})`
            );
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`Cloudflare: ${msg}`);
        results.cloudflare = { zoneFound: false, message: msg };
      }
    }

    // Step 4: Add hostname to Turnstile widget allow-list (defense-in-depth — never blocks).
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
        console.warn(`[admin/domains] Turnstile widget sync (add) failed for ${domain}: ${msg}`);
        // Non-fatal: WAF/zone are still in place. Log and continue.
      }
    }

    const status = results.errors.length > 0 ? 207 : 201;
    return NextResponse.json(results, { status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { domain } = (await request.json()) as { domain: string };
    if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

    const errors: string[] = [];

    // Step 1: Remove from Vercel
    try {
      await removeDomain(domain);
    } catch (err) {
      errors.push(`Vercel: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Step 2: Delete from charmlink_creator_domains.
    // If the deleted row was is_primary=true and other rows exist for this creator,
    // promote the oldest remaining row to primary.
    // The trigger trg_sync_creator_primary_domain will sync the result back to
    // charmlink_creators.custom_domain — do NOT touch that column directly.
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const deleted = await client.query<{ creator_id: string; is_primary: boolean }>(
        `DELETE FROM charmlink_creator_domains WHERE domain = $1
         RETURNING creator_id, is_primary`,
        [domain]
      );

      if (deleted.rows.length > 0 && deleted.rows[0].is_primary) {
        const creatorId = deleted.rows[0].creator_id;
        // Promote the oldest remaining domain for this creator
        await client.query(
          `UPDATE charmlink_creator_domains
           SET is_primary = true
           WHERE id = (
             SELECT id FROM charmlink_creator_domains
             WHERE creator_id = $1
             ORDER BY created_at ASC
             LIMIT 1
           )`,
          [creatorId]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      errors.push(`DB: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      client.release();
      await pool.end();
    }

    // Step 3: Remove proxied DNS record from Cloudflare (leave WAF/settings intact)
    if (process.env.CLOUDFLARE_API_TOKEN) {
      try {
        const zone = await findZoneByDomain(domain);
        if (zone) {
          const removed = await removeProxiedDnsRecord(zone.id, domain);
          if (removed.removed === 0) {
            console.warn(`[admin/domains] No CNAME found to remove for ${domain}`);
          }
        } else {
          console.warn(`[admin/domains] CF zone not found for ${domain} during DELETE`);
        }
      } catch (err) {
        errors.push(`Cloudflare: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Step 4: Remove hostname from Turnstile widget allow-list (defense-in-depth — never blocks).
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
        console.warn(`[admin/domains] Turnstile widget sync (remove) failed for ${domain}: ${msg}`);
      }
    }

    return NextResponse.json({ ok: true, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
