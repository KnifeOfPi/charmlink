// Server-side verdict on the fingerprint / behaviour data CreatorPage sends
// with the premium-links POST.
//
// Everything here is reported by the visitor's own browser, so a scraper can
// simply claim to be clean: these signals can catch lazy automation, never a
// determined bot. What they CAN do is misfire on people — and on 2026-10-06
// they would have for nearly everyone:
//   - behaviour was sampled at page load, before any tap or scroll, so every
//     visitor tripped no-mouse + instant-interaction + no-scroll;
//   - the fingerprint's "3 weak signals" rule matched every iPhone (Safari and
//     WKWebView have no window.chrome, no deviceMemory, no Google voices);
//   - rotation keyed per-load values on carrier-NAT IPs shared by many users.
//
// So the server decides, from the raw reasons, and only a strong automation
// tell — something real browsers do not produce — leads to a decoy. All other
// signals are returned as `shadow` for logging until they are measured
// against real traffic.

/** Fingerprint reasons only automation produces. */
export const STRONG_FP_SIGNALS: ReadonlySet<string> = new Set([
  "webdriver",
  "audio-24000hz",
  "webgl-swiftshader",
  "webgl-google-swiftshader",
]);

export interface ClientSignalsBody {
  fingerprint?: unknown;
  fp_reasons?: unknown;
  fp_suspicious?: unknown;
  behavior?: { isSuspicious?: unknown; reasons?: unknown } | null;
}

export interface ClientSignalsVerdict {
  /** Decoy this request. Only for strong automation tells. */
  decoy: boolean;
  /** Strong reasons that caused `decoy`. */
  strong: string[];
  /** Signals observed but not enforced (shadow mode). */
  shadow: string[];
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 32) : [];
}

export function assessClientSignals(body: ClientSignalsBody): ClientSignalsVerdict {
  const fpReasons = strings(body.fp_reasons);
  const strong = fpReasons.filter((r) => STRONG_FP_SIGNALS.has(r));
  const shadow = fpReasons.filter((r) => !STRONG_FP_SIGNALS.has(r)).map((r) => `fp:${r}`);

  // The browser's own verdict is ignored: a bot reports false, and a real
  // iPhone used to report true.
  if (body.fp_suspicious === true && strong.length === 0) shadow.push("fp:client-flag");

  if (body.behavior && body.behavior.isSuspicious === true) {
    const b = strings(body.behavior.reasons);
    shadow.push(...(b.length ? b.map((r) => `behavior:${r}`) : ["behavior:client-flag"]));
  }

  return { decoy: strong.length > 0, strong, shadow };
}
