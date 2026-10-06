// HMAC for middleware → internal resolver calls (/api/resolve-domain,
// /api/resolve-creator-meta).
//
// Web Crypto, NOT `import { createHmac } from "crypto"`: middleware.ts and
// lib/decoy/cloak.ts run on the edge runtime, which has no Node `crypto`
// module. Importing it there threw on every request and took every custom
// domain down to the bare app root on 2026-10-06 (16:08–16:45 UTC).
// crypto.subtle exists on both edge and Node, so one implementation serves
// the signer (middleware) and the verifiers (Node route handlers), and the
// hex output byte-matches Node's createHmac(...).digest("hex").

const encoder = new TextEncoder();

export async function internalHmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Token the middleware sends; "" when the secret is unset (dev). */
export async function signInternal(message: string): Promise<string> {
  const secret = process.env.CHARMLINK_LINK_TOKEN_SECRET;
  return secret ? internalHmac(secret, message) : "";
}

/**
 * Constant-time check of a received token. No secret: allowed outside
 * production only (same pattern as lib/link-token.ts).
 */
export async function verifyInternal(message: string, token: string | null): Promise<boolean> {
  const secret = process.env.CHARMLINK_LINK_TOKEN_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!token) return false;
  const expected = await internalHmac(secret, message);
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
