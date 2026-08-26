import { createHmac, timingSafeEqual } from "crypto";

// Fallback for local dev before env var is configured in Vercel
const DEV_SECRET =
  "dev00000000000000000000000000000000000000000000000000000000000000";

function getSecret(): string {
  const secret = process.env.CHARMLINK_LINK_TOKEN_SECRET;
  if (!secret) {
    console.warn(
      "[link-token] CHARMLINK_LINK_TOKEN_SECRET is not set — using dev secret. Set this in Vercel before deploying."
    );
    return DEV_SECRET;
  }
  return secret;
}

export function generateLinkToken(
  slug: string,
  ip: string,
  ageConfirmed: boolean
): string {
  const secret = getSecret();
  const bucket = Math.floor(Date.now() / 300_000);
  const data = `${slug}|${ip}|${bucket}|${ageConfirmed ? "1" : "0"}`;
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function verifyLinkToken(
  token: string,
  slug: string,
  ip: string,
  ageConfirmed: boolean
): boolean {
  if (!token) return false;

  let tokenBuffer: Buffer;
  try {
    tokenBuffer = Buffer.from(token, "hex");
    if (tokenBuffer.length !== 32) return false; // SHA-256 = 32 bytes
  } catch {
    return false;
  }

  const secret = getSecret();
  const bucket = Math.floor(Date.now() / 300_000);

  for (const b of [bucket, bucket - 1]) {
    const data = `${slug}|${ip}|${b}|${ageConfirmed ? "1" : "0"}`;
    const expected = createHmac("sha256", secret).update(data).digest("hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    try {
      if (timingSafeEqual(tokenBuffer, expectedBuffer)) return true;
    } catch {
      // length mismatch guard — shouldn't happen but be safe
    }
  }

  return false;
}
