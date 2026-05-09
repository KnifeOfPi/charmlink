// Sliding-window rate limiter backed by Vercel KV.
// Gracefully no-ops (allows all requests) if KV env vars are not set.

let kvAvailable: boolean | null = null;
let kv: { incr: (k: string) => Promise<number>; expire: (k: string, s: number) => Promise<number> } | null = null;

async function getKv() {
  if (kvAvailable === null) {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      kvAvailable = true;
      const mod = await import("@vercel/kv");
      kv = mod.kv;
    } else {
      kvAvailable = false;
      console.warn(
        "[rate-limit] KV_REST_API_URL / KV_REST_API_TOKEN not set — rate limiting disabled"
      );
    }
  }
  return kvAvailable ? kv : null;
}

/**
 * Sliding-window rate limiter.
 * @param ip    - Client IP address
 * @param route - Short route key (e.g. "links", "honeypot", "age-confirm")
 * @param limit - Max requests per window
 * @param windowSec - Window duration in seconds
 * @returns { allowed, remaining }
 */
export async function rateLimit(
  ip: string,
  route: string,
  limit: number,
  windowSec: number
): Promise<{ allowed: boolean; remaining: number }> {
  const client = await getKv();
  if (!client) return { allowed: true, remaining: limit };

  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const key = `cl:rl:${route}:${ip}:${bucket}`;

  try {
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, windowSec);
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    // KV error — fail open to avoid blocking real users
    return { allowed: true, remaining: limit };
  }
}
