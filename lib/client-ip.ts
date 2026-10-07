// The visitor's IP, without trusting a header the visitor can forge.
//
// `cf-connecting-ip` is set by Cloudflare — but only on requests that came
// through Cloudflare. Anyone can reach the Vercel origin directly (the
// *.vercel.app hosts, or a custom Host header against Vercel's IPs) and send
// their own `cf-connecting-ip`, which would let them pick the key the rate
// limiters and ban list use. So: Vercel sets `x-real-ip` / `x-forwarded-for`
// to the TCP peer it actually saw (it overwrites client-sent values). When
// that peer is a Cloudflare edge address, the request came through
// Cloudflare and its `cf-connecting-ip` is trustworthy; otherwise it is
// ignored and the peer itself is the visitor.
//
// Ranges: https://www.cloudflare.com/ips-v4 and /ips-v6 (fetched 2026-10-07).
// Pure TypeScript so it runs on the edge runtime (middleware) as well as Node.

const CF_V4 = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];
const CF_V6 = [
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32",
  "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
];

function v4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!/^\d{1,3}$/.test(p) || v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function v6ToBigInt(ip: string): bigint | null {
  if (!ip.includes(":")) return null;
  const [head, tail] = ip.split("::");
  if (ip.split("::").length > 2) return null;
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : [];
  const missing = 8 - h.length - t.length;
  if (tail === undefined ? h.length !== 8 : missing < 0) return null;
  const groups = [...h, ...Array(tail === undefined ? 0 : missing).fill("0"), ...t];
  let n = BigInt(0);
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    n = (n << BigInt(16)) + BigInt(parseInt(g, 16));
  }
  return n;
}

const V4_RANGES = CF_V4.map((c) => {
  const [base, bits] = c.split("/");
  const size = 2 ** (32 - Number(bits));
  const start = v4ToInt(base)!;
  return [start, start + size] as const;
});
const V6_RANGES = CF_V6.map((c) => {
  const [base, bits] = c.split("/");
  const shift = BigInt(128 - Number(bits));
  return [v6ToBigInt(base)! >> shift, shift] as const;
});

export function isCloudflareIp(ip: string): boolean {
  const v4 = v4ToInt(ip);
  if (v4 !== null) return V4_RANGES.some(([s, e]) => v4 >= s && v4 < e);
  const v6 = v6ToBigInt(ip.toLowerCase());
  if (v6 !== null) return V6_RANGES.some(([prefix, shift]) => v6 >> shift === prefix);
  return false;
}

/** The TCP peer Vercel saw (Cloudflare's edge, when proxied). */
export function peerIp(headers: Headers): string {
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

/** True when the request reached us through Cloudflare. */
export function viaCloudflare(headers: Headers): boolean {
  const peer = peerIp(headers);
  return peer !== "" && isCloudflareIp(peer);
}

/** The visitor's IP: Cloudflare's view when proxied, else the TCP peer. */
export function clientIp(headers: Headers): string {
  const peer = peerIp(headers);
  if (peer && isCloudflareIp(peer)) {
    return headers.get("cf-connecting-ip")?.trim() || peer;
  }
  return peer || "unknown";
}
