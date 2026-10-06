/**
 * IPQualityScore proxy/VPN detection.
 *
 * Queries the IPQS Proxy Detection API to identify residential proxies,
 * VPNs, Tor exits, and other anonymization services that bypass
 * datacenter-ASN detection.
 *
 * API docs: https://www.ipqualityscore.com/documentation/proxy-detection-api
 *
 * Setup:
 *   1. Sign up at https://www.ipqualityscore.com
 *   2. Get an API key (free tier: 5,000 lookups/month)
 *   3. Set IPQS_API_KEY env var
 *
 * Cost: ~$0.002/query on paid plans. We cache results in KV for 24h to
 * minimize API calls.
 */

import { kv } from "@vercel/kv";

const IPQS_API_KEY = process.env.IPQS_API_KEY;
const IPQS_BASE_URL = "https://ipqualityscore.com/api/json/ip";
const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const CACHE_PREFIX = "ipqs:";

export interface IPQSResult {
  /** True if the IP is a proxy, VPN, or Tor exit. */
  isProxy: boolean;
  /** True if the IP is a VPN. */
  isVpn: boolean;
  /** True if the IP is a Tor exit. */
  isTor: boolean;
  /** True if the IP is a residential proxy (premium feature). */
  isResidentialProxy: boolean;
  /** Fraud score 0-100. >= 75 = suspicious, >= 90 = high risk. */
  fraudScore: number;
  /** ISP name. */
  isp: string;
  /** Organization name. */
  organization: string;
  /** ASN. */
  asn: number | null;
  /** True if the IP has recent abuse reports. */
  recentAbuse: boolean;
  /** True if the IP is a known bot. */
  botStatus: boolean;
  /** Connection type (residential, business, education, etc.). */
  connectionType: string;
  /** True if the result came from cache. */
  cached: boolean;
}

/**
 * Check an IP address against IPQS. Returns null if the API key is not
 * configured or the request fails (fail-open).
 */
export async function checkIPQS(
  ip: string,
  userAgent?: string,
  userLanguage?: string
): Promise<IPQSResult | null> {
  if (!IPQS_API_KEY) {
    return null;
  }

  // Check cache first
  const cacheKey = `${CACHE_PREFIX}${ip}`;
  try {
    const cached = await kv.get<IPQSResult>(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }
  } catch {
    // Cache miss — continue to API
  }

  try {
    const params = new URLSearchParams({
      strictness: "0", // Lowest strictness to minimize false positives
      allow_public_access_points: "true",
      lighter_penalties: "true",
    });

    if (userAgent) {
      params.set("user_agent", userAgent);
    }
    if (userLanguage) {
      params.set("user_language", userLanguage);
    }

    const url = `${IPQS_BASE_URL}/${IPQS_API_KEY}/${encodeURIComponent(ip)}?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "IPQS-KEY": IPQS_API_KEY,
      },
      // 3 second timeout — don't block the request pipeline
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      console.error(`[ipqs] HTTP ${response.status} for ${ip}`);
      return null;
    }

    const data = await response.json();

    if (!data.success) {
      console.error(`[ipqs] API error for ${ip}: ${data.message}`);
      return null;
    }

    const result: IPQSResult = {
      isProxy: Boolean(data.proxy),
      isVpn: Boolean(data.vpn),
      isTor: Boolean(data.tor),
      isResidentialProxy: Boolean(data.residential_proxy),
      fraudScore: Number(data.fraud_score) || 0,
      isp: String(data.ISP || ""),
      organization: String(data.Organization || ""),
      asn: data.ASN ? Number(data.ASN) : null,
      recentAbuse: Boolean(data.recent_abuse),
      botStatus: Boolean(data.bot_status),
      connectionType: String(data.connection_type || ""),
      cached: false,
    };

    // Cache the result
    try {
      await kv.set(cacheKey, result, { ex: CACHE_TTL_SECONDS });
    } catch {
      // Cache write failure — non-fatal
    }

    return result;
  } catch (err) {
    // Network/timeout failure — fail open
    console.error(`[ipqs] Request failed for ${ip}:`, err);
    return null;
  }
}

/**
 * Determine if an IPQS result should be treated as a bot.
 *
 * We flag:
 *   - Any proxy/VPN/Tor (isProxy, isVpn, isTor)
 *   - Residential proxies (isResidentialProxy)
 *   - High fraud score (>= 75)
 *   - Recent abuse (recentAbuse)
 *   - Known bot status (botStatus)
 *
 * We do NOT flag:
 *   - Low fraud score (< 75) with no other signals
 *   - Corporate/public access points (allowed by allow_public_access_points)
 */
export function isIPQSSuspicious(result: IPQSResult): boolean {
  return (
    result.isProxy ||
    result.isVpn ||
    result.isTor ||
    result.isResidentialProxy ||
    result.fraudScore >= 75 ||
    result.recentAbuse ||
    result.botStatus
  );
}
