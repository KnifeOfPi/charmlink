/**
 * Regression check for the visitor-blocking rules.
 *
 *   npm run check:visitor-signals
 *
 * Each case is a real visitor profile or a known automation tell. The first
 * group are the people the 2026-10-06 rules would have decoyed: if any of
 * them flips to "decoy"/"bot", premium links disappear for real visitors.
 */
import { NextRequest } from "next/server";
import { assessClientSignals } from "../lib/client-signals";
import { classifyIPQS, type IPQSResult } from "../lib/ipqs";
import { isDatacenterAsn } from "../lib/datacenter-asns";
import { detectBot } from "../lib/bot-detect";

let failed = 0;
function expect(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
}

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0";

// Behaviour sampled at page load: nothing has happened yet.
const ON_LOAD_BEHAVIOR = {
  isSuspicious: true,
  reasons: ["no-mouse-movement", "instant-interaction", "no-scroll"],
};

// ── Real visitors: must never be decoyed ─────────────────────────────────────
expect(
  "iPhone Safari / Instagram WKWebView (3 weak fp signals, old client flag)",
  assessClientSignals({
    fp_suspicious: true,
    fp_reasons: ["no-window-chrome", "no-device-memory", "no-google-voices"],
    behavior: ON_LOAD_BEHAVIOR,
  }).decoy,
  false
);
expect(
  "Android Instagram WebView (no window.chrome, no pdf viewer)",
  assessClientSignals({ fp_reasons: ["no-window-chrome", "no-pdf-viewer", "no-google-voices"] }).decoy,
  false
);
expect("Firefox desktop", assessClientSignals({ fp_reasons: ["no-window-chrome", "no-device-memory"] }).decoy, false);
expect("Fullscreen Mac (availTop 0)", assessClientSignals({ fp_reasons: ["mac-avail-top-0"] }).decoy, false);
expect("Behaviour sampled before any interaction", assessClientSignals({ behavior: ON_LOAD_BEHAVIOR }).decoy, false);
expect("Malformed body", assessClientSignals({ fp_reasons: "webdriver", behavior: null }).decoy, false);
expect(
  "Weak signals are shadow-logged, not dropped",
  assessClientSignals({ fp_reasons: ["no-device-memory"], behavior: ON_LOAD_BEHAVIOR }).shadow.length > 0,
  true
);

// ── Automation tells: must be decoyed ────────────────────────────────────────
expect("navigator.webdriver", assessClientSignals({ fp_reasons: ["webdriver"] }).decoy, true);
expect("SwiftShader WebGL", assessClientSignals({ fp_reasons: ["webgl-swiftshader", "no-window-chrome"] }).decoy, true);
expect("Headless audio rate", assessClientSignals({ fp_reasons: ["audio-24000hz"] }).decoy, true);

// ── IPQS: block only near-certain automation ─────────────────────────────────
const base: IPQSResult = {
  isProxy: false, isVpn: false, isTor: false, isResidentialProxy: false, fraudScore: 0,
  isp: "", organization: "", asn: null, recentAbuse: false, botStatus: false,
  connectionType: "", cached: false,
};
expect("IPQS VPN user (e.g. Private Relay)", classifyIPQS({ ...base, isVpn: true, isProxy: true }).block, false);
expect("IPQS residential proxy flag", classifyIPQS({ ...base, isResidentialProxy: true }).block, false);
expect("IPQS fraud 89", classifyIPQS({ ...base, fraudScore: 89 }).block, false);
expect("IPQS recent abuse (shared carrier IP)", classifyIPQS({ ...base, recentAbuse: true }).block, false);
expect("IPQS Tor", classifyIPQS({ ...base, isTor: true }).block, true);
expect("IPQS bot status", classifyIPQS({ ...base, botStatus: true }).block, true);
expect("IPQS fraud 90", classifyIPQS({ ...base, fraudScore: 90 }).block, true);

// ── ASN list ────────────────────────────────────────────────────────────────
expect("Cloudflare ASN (WARP / Private Relay) is not datacenter", isDatacenterAsn("13335"), false);
expect("Fastly ASN (Private Relay) is not datacenter", isDatacenterAsn("54113"), false);
expect("Akamai ASN is not datacenter", isDatacenterAsn("20940"), false);
expect("AWS ASN is datacenter", isDatacenterAsn("16509"), true);

// ── detectBot (no IP header, so no KV/IPQS calls) ────────────────────────────
function req(path: string, headers: Record<string, string>) {
  return new NextRequest(`https://example.com${path}`, { headers: { "user-agent": IPHONE_UA, ...headers } });
}
const page = { accept: "text/html", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };

(async () => {
  expect(
    "iPhone page load, ordinary ISP",
    await detectBot(req("/", { ...page, "x-client-asn": "7922" })),
    { isBot: false, reason: "pass", confidence: "high" }
  );
  expect(
    "iPhone page load via Private Relay (Cloudflare ASN)",
    (await detectBot(req("/", { ...page, "x-client-asn": "13335" }))).isBot,
    false
  );
  const dc = await detectBot(req("/", { ...page, "x-client-asn": "16509" }));
  expect("Datacenter ASN is 'uncertain' (Turnstile), never an instant decoy", [dc.isBot, dc.confidence], [false, "low"]);
  expect(
    "facebookexternalhit is still a high-confidence bot",
    (await detectBot(req("/", { ...page, "user-agent": "facebookexternalhit/1.1" }))).confidence,
    "high"
  );

  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
})();
