/**
 * User-agent heuristics for marking analytics events as automated.
 *
 * ─── ANALYTICS ONLY — THIS MUST NEVER GATE A REQUEST ────────────────────────
 * Everything here is a heuristic with real false-positive risk (a genuine
 * visitor on an old iPhone trips rule 4). It decides only whether an event row
 * is counted as human in a dashboard. Wiring it into detectBot() would make
 * middleware serve the decoy page to anyone it matches, turning a
 * miscounted visitor into a lost sale. Keep gating in lib/bot-detect.ts, which
 * is deliberately conservative, and keep counting here.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * WHY THIS EXISTS. Middleware's detection is the only input to the `is_bot`
 * flag, and it misses this traffic completely: `isbot` matches self-declared
 * crawlers, and the datacenter-ASN rule in bot-detect.ts step 3 never fires at
 * all because Vercel does not emit `x-vercel-ip-asn` (confirmed against their
 * header docs and empirically). A scraper sending an ordinary desktop Chrome
 * string therefore passes every check and is recorded as a human visitor.
 *
 * Measured on the three auto-redirect domains, 5-9 Sep 2026: 707 of 869
 * recorded arrivals (81.4%) match the rules below, and `is_bot` was true for
 * exactly none of them. The signatures are not subtle:
 *
 *   * 464 desktop hits. The Chrome major is randomised per request (47, 76,
 *     88, 105, 120, 129, 142, 152), but note that browser VERSION is not the
 *     signal and must not become one: real converting visitors show up on
 *     Chrome/76 with a current Android, and Chrome/152 is genuine. What gives
 *     these away is being desktop at all — these domains are Instagram bio
 *     links whose real audience is ~100% mobile.
 *   * 266 hits sharing ONE iOS build, "OS 13_2_3" — an iOS 13.2.3 released in
 *     2019, against a real population spread over iOS 17/18/26.
 *   * A handful of Dalvik/okhttp strings, one "Android 1.5 HTC Hero" (2009),
 *     and 8 empty user agents.
 *
 * Left uncounted, this inflated arrivals ~5x and made the redirect handoff read
 * as 34% when the human figure is ~93%.
 */

/** HTTP client libraries. None of these is ever a person browsing. */
const CLIENT_LIBRARIES = [
  "dalvik",
  "okhttp",
  "python-requests",
  "python-urllib",
  "curl/",
  "wget",
  "go-http-client",
  "java/",
  "apache-httpclient",
  "node-fetch",
  "axios",
  "libwww",
  "guzzle",
  "postman",
];

/** Oldest OS versions plausible in a 2026 audience. Anything below is either a
 *  spoof or a device that cannot complete the redirect anyway. */
const MIN_IOS_MAJOR = 15;
const MIN_ANDROID_MAJOR = 5;

export interface SyntheticOptions {
  /**
   * Set for surfaces whose real audience is mobile-only — the auto-redirect
   * domains, which exist solely as Instagram bio links. On those, a desktop
   * user agent is itself the signal (464 of the 707 matches above). Leave it
   * off anywhere a desktop visitor is legitimate, or the rule will quietly
   * delete real people from the numbers.
   */
  mobileOnlyAudience?: boolean;
}

/**
 * True when the user agent shows a machine rather than a person.
 *
 * Deliberately UA-only: it runs inside `after()` on a server render where the
 * request is already gone, and it must never be expensive enough to delay a
 * redirect.
 */
export function looksSynthetic(
  userAgent: string | null | undefined,
  opts: SyntheticOptions = {}
): boolean {
  const ua = (userAgent ?? "").trim();

  // 1. No user agent at all. Every real browser sends one.
  if (ua === "") return true;

  const lower = ua.toLowerCase();

  // 2. Self-identifying HTTP client libraries.
  if (CLIENT_LIBRARIES.some((lib) => lower.includes(lib))) return true;

  // 3. Structurally impossible: every real Chrome/Safari UA carries an
  //    AppleWebKit token. "Mozilla/5.0 (Windows NT 10.0; Win64; x64)
  //    Chrome/120.0.0.0" does not, and appeared 21 times.
  if (lower.includes("chrome/") && !lower.includes("applewebkit")) return true;

  const isIOS = /iphone|ipad|ipod/.test(lower);
  const isAndroid = lower.includes("android");

  // 4. Implausibly old mobile OS. Catches the 13_2_3 farm without hardcoding
  //    the one build string it currently rotates on.
  if (isIOS) {
    const m = ua.match(/OS (\d+)[._]/);
    if (m && parseInt(m[1], 10) < MIN_IOS_MAJOR) return true;
  }
  if (isAndroid) {
    const m = ua.match(/Android (\d+)/);
    if (m && parseInt(m[1], 10) < MIN_ANDROID_MAJOR) return true;
  }

  // 5. Desktop on a surface that only ever receives mobile traffic.
  if (opts.mobileOnlyAudience && !isIOS && !isAndroid) return true;

  return false;
}
