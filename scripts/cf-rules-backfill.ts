/**
 * Bring every live CharmLink zone up to the current Cloudflare baseline:
 *   - WAF custom rules (lib/cloudflare.ts WAF_RULES), only on zones that have
 *     no charmlink rules yet — existing policies are never changed;
 *   - the `x-client-asn` request header (charmlink:inject-asn);
 *   - Advanced Bot Protection (AI/content bots blocked) with --abp.
 *
 * "Live" = a zone whose apex points at Vercel. Iterates every zone the token
 * can see — the 2026-10-06 rollout covered only the first page of 50 zones
 * and missed 52 live ones.
 *
 *   CLOUDFLARE_API_TOKEN=… npx tsx scripts/cf-rules-backfill.ts             # dry run
 *   CLOUDFLARE_API_TOKEN=… npx tsx scripts/cf-rules-backfill.ts --apply --only=a.com,b.com
 *   CLOUDFLARE_API_TOKEN=… npx tsx scripts/cf-rules-backfill.ts --apply --abp
 */
import { applyAsnTransform, applyWafRules, enableAdvancedBotProtection } from "../lib/cloudflare";
import { checkDnsStatusBulk, listZones } from "../lib/cloudflare-dns";
import { mapWithConcurrency } from "../lib/cf-http";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const abp = args.includes("--abp");
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean);

function pointsAtVercel(records: Array<{ content: string }>): boolean {
  return records.some((r) => r.content.includes("vercel") || r.content.startsWith("76.76.21."));
}

(async () => {
  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error("CLOUDFLARE_API_TOKEN is not set");
  const zones = await listZones();
  const names = only ?? zones.map((z) => z.name);
  const dns = await checkDnsStatusBulk(names);
  const live = zones.filter((z) => names.includes(z.name) && pointsAtVercel(dns.get(z.name)?.records ?? []));

  console.log(`${apply ? "APPLY" : "DRY RUN"} — ${live.length} live zones${abp ? " (+ABP)" : ""}\n`);
  let failed = 0;

  await mapWithConcurrency(live, 3, async (zone) => {
    const waf = await applyWafRules(zone.id, { dryRun: !apply });
    const asn = await applyAsnTransform(zone.id, { dryRun: !apply });
    let abpNote = "";
    if (abp) {
      if (apply) {
        const r = await enableAdvancedBotProtection(zone.id);
        abpNote = r.error ? ` abp:ERROR ${r.error}` : r.alreadyEnabled ? " abp:ok" : " abp:enabled";
        if (r.error) failed++;
      } else {
        abpNote = " abp:would-check";
      }
    }
    const errs = [...waf.errors, ...(asn.error ? [asn.error] : [])];
    if (errs.length) failed++;
    const wafNote = waf.rulesApplied ? `waf:${apply ? "added" : "would-add"}` : "waf:has-charmlink-rules";
    const asnNote = asn.alreadyPresent ? "asn:ok" : `asn:${apply ? "added" : "would-add"}`;
    console.log(`${errs.length ? "ERR " : "    "}${zone.name.padEnd(26)} ${wafNote.padEnd(24)} ${asnNote}${abpNote}${errs.length ? `  ${errs.join("; ")}` : ""}`);
  });

  console.log(failed ? `\n${failed} zone(s) had errors` : "\nno errors");
  process.exit(failed ? 1 : 0);
})();
