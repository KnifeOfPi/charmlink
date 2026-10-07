// CDN networks are deliberately absent: Cloudflare (13335), Fastly (54113)
// and Akamai (20940) carry real people — iCloud Private Relay (Safari) and
// Cloudflare WARP exit through them.
export const DATACENTER_ASNS: Set<string> = new Set([
  // AWS
  "16509",
  "14618",
  // GCP
  "15169",
  "396982",
  // Azure
  "8075",
  // DigitalOcean
  "14061",
  // OVH
  "16276",
  // Hetzner
  "24940",
  // Linode (Akamai Cloud)
  "63949",
  // Oracle Cloud
  "31898",
  // Alibaba Cloud
  "45102",
  // Tencent
  "132203",
]);

export function isDatacenterAsn(asn: string | null | undefined): boolean {
  if (!asn) return false;
  return DATACENTER_ASNS.has(asn.trim());
}
