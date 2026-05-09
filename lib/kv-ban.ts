// KV-backed IP ban list for honeypot hits.
// Gracefully no-ops if KV env vars are not set.

const BAN_TTL_SEC = 60 * 60 * 24; // 24 hours
const BAN_KEY_PREFIX = "cl:banned:";

let kvAvailable: boolean | null = null;
let kv: {
  set: (k: string, v: string, opts: { ex: number }) => Promise<unknown>;
  get: (k: string) => Promise<string | null>;
} | null = null;

async function getKv() {
  if (kvAvailable === null) {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      kvAvailable = true;
      const mod = await import("@vercel/kv");
      kv = mod.kv as typeof kv;
    } else {
      kvAvailable = false;
    }
  }
  return kvAvailable ? kv : null;
}

/** Write an IP to the 24-hour honeypot ban list. */
export async function banIp(ip: string): Promise<void> {
  const client = await getKv();
  if (!client || !ip || ip === "unknown") return;
  try {
    await client.set(`${BAN_KEY_PREFIX}${ip}`, "1", { ex: BAN_TTL_SEC });
  } catch {
    // Fail silently — ban is best-effort
  }
}

/** Check if an IP is currently in the honeypot ban list. */
export async function isIpBanned(ip: string): Promise<boolean> {
  const client = await getKv();
  if (!client || !ip || ip === "unknown") return false;
  try {
    const val = await client.get(`${BAN_KEY_PREFIX}${ip}`);
    return val === "1";
  } catch {
    return false;
  }
}
