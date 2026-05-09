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
  // Cloudflare
  "13335",
  // Fastly
  "54113",
  // Akamai
  "20940",
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
