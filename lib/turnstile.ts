// Cloudflare Turnstile server-side verification.
// Env: TURNSTILE_SECRET_KEY (server-only), NEXT_PUBLIC_TURNSTILE_SITE_KEY (public, build-time).

export const TURNSTILE_SITE_KEY_ENV = "NEXT_PUBLIC_TURNSTILE_SITE_KEY";

export interface TurnstileVerification {
  success: boolean;
  error?: string;
}

/**
 * Verify a Turnstile challenge token against the Cloudflare siteverify API.
 * Degrades gracefully: if TURNSTILE_SECRET_KEY is unset, returns failure with explanation.
 */
export async function verifyTurnstile(
  token: string,
  ip?: string
): Promise<TurnstileVerification> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return {
      success: false,
      error: "TURNSTILE_SECRET_KEY not configured",
    };
  }

  try {
    const body: Record<string, string> = {
      secret,
      response: token,
    };
    if (ip) body.remoteip = ip;

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      return { success: false, error: `Turnstile API HTTP ${res.status}` };
    }

    const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };

    if (!data.success) {
      const codes = data["error-codes"]?.join(", ") ?? "unknown";
      return { success: false, error: `Turnstile rejected: ${codes}` };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** True iff both Turnstile secret and public site key are configured. */
export function isTurnstileConfigured(): boolean {
  return (
    !!process.env.TURNSTILE_SECRET_KEY &&
    !!process.env[TURNSTILE_SITE_KEY_ENV]
  );
}
