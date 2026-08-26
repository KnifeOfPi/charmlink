import { createHmac, timingSafeEqual } from "crypto";

// Fallback for local dev before env var is configured in Vercel
const DEV_SECRET =
  "dev00000000000000000000000000000000000000000000000000000000000000";

function getSecret(): string {
  const secret = process.env.CHARMLINK_LINK_TOKEN_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      // Never fall back to the public DEV_SECRET in production — it's
      // committed to the repo, so falling back would make every link token
      // forgeable by anyone who reads the source.
      throw new Error(
        "[link-token] CHARMLINK_LINK_TOKEN_SECRET is not set. Refusing to start in production."
      );
    }
    console.warn(
      "[link-token] CHARMLINK_LINK_TOKEN_SECRET is not set — using dev secret. Set this in Vercel before deploying."
    );
    return DEV_SECRET;
  }
  return secret;
}

// NOTE: the token is deliberately NOT bound to the client IP.
//
// It used to be (`slug|ip|bucket|age`). On mobile networks the IP that renders
// the page and the IP that POSTs to /api/links/[creator] moments later are
// frequently different — WiFi/cellular handoff, carrier NAT rotation, IPv6
// privacy addressing, CF edge variance. Every one of those mismatches failed
// verification and dropped a real visitor into the rejection path. That path
// used to hand them a honeypot link that banned them for 24h; 86.6% of the
// 33,517 honeypot hits carried mobile browser UAs.
//
// What the token still guarantees is what actually matters here: the caller
// holds a value only our server could have minted, scoped to this creator
// slug, issued within the last ~5-10 minutes, for this age-confirmation state.
// Cross-origin abuse is blocked by the Origin === Host check in the route, and
// per-IP rate limiting is unchanged. Dropping the IP term costs no meaningful
// security and stops rejecting real users.
function computeToken(
  slug: string,
  bucket: number,
  ageConfirmed: boolean,
  legacyIp?: string
): string {
  const secret = getSecret();
  const data =
    legacyIp === undefined
      ? `${slug}|${bucket}|${ageConfirmed ? "1" : "0"}`
      : `${slug}|${legacyIp}|${bucket}|${ageConfirmed ? "1" : "0"}`;
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function generateLinkToken(slug: string, ageConfirmed: boolean): string {
  const bucket = Math.floor(Date.now() / 300_000);
  return computeToken(slug, bucket, ageConfirmed);
}

/**
 * @param legacyIp - Only used to accept tokens minted by the previous
 *   IP-bound scheme, so pages already in a visitor's browser at deploy time
 *   keep working. Safe to drop this parameter (and the fallback below) once
 *   every in-flight page predating the deploy has expired — one bucket plus
 *   the grace bucket, so ~10 minutes.
 */
export function verifyLinkToken(
  token: string,
  slug: string,
  ageConfirmed: boolean,
  legacyIp?: string
): boolean {
  if (!token) return false;

  let tokenBuffer: Buffer;
  try {
    tokenBuffer = Buffer.from(token, "hex");
    if (tokenBuffer.length !== 32) return false; // SHA-256 = 32 bytes
  } catch {
    return false;
  }

  const bucket = Math.floor(Date.now() / 300_000);

  const candidates: string[] = [];
  for (const b of [bucket, bucket - 1]) {
    candidates.push(computeToken(slug, b, ageConfirmed));
    if (legacyIp) candidates.push(computeToken(slug, b, ageConfirmed, legacyIp));
  }

  for (const expected of candidates) {
    const expectedBuffer = Buffer.from(expected, "hex");
    try {
      if (timingSafeEqual(tokenBuffer, expectedBuffer)) return true;
    } catch {
      // length mismatch guard — shouldn't happen but be safe
    }
  }

  return false;
}
