/**
 * Scenario check for the traffic watchdog's decision logic.
 *
 *   npm run check:traffic-watchdog
 */
import { evaluateTraffic, type WatchdogState } from "../lib/traffic-watchdog";

let failed = 0;
function expect(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`);
}

const OK: WatchdogState = { status: "ok", lastAlertAt: 0 };
const NOW = 1_800_000_000_000;
// Roughly a normal half-hour: ~0.8 premium clicks/min (6 Oct baseline).
const normal = { arrivals: 70, premiumClicks: 24 };

expect("Normal traffic: no alert", evaluateTraffic(normal, normal, normal, OK, NOW).action, null);
expect(
  "Ordinary dip to 60%: no alert",
  evaluateTraffic({ arrivals: 42, premiumClicks: 14 }, normal, normal, OK, NOW).action,
  null
);

// 2026-10-06: every domain served the app root — arrivals and clicks to zero.
const outage = evaluateTraffic({ arrivals: 0, premiumClicks: 0 }, normal, normal, OK, NOW);
expect("6 Oct outage (pages down): alert", outage.action, "alert");
expect("6 Oct outage message names visits", outage.problems[0]?.startsWith("visits are at 0%"), true);

// Pages load but premium links are decoyed/broken.
const decoyed = evaluateTraffic({ arrivals: 68, premiumClicks: 1 }, normal, normal, OK, NOW);
expect("Links decoyed while pages load: alert", decoyed.action, "alert");
expect("Decoy message names clicks", decoyed.problems[0]?.startsWith("premium clicks"), true);

expect(
  "Quiet hours (too little baseline to judge): no alert",
  evaluateTraffic({ arrivals: 0, premiumClicks: 0 }, { arrivals: 6, premiumClicks: 2 }, { arrivals: 4, premiumClicks: 1 }, OK, NOW).action,
  null
);

const down: WatchdogState = { status: "down", lastAlertAt: NOW - 20 * 60 * 1000 };
expect("Still down 20 min after alert: no repeat", evaluateTraffic({ arrivals: 0, premiumClicks: 0 }, normal, normal, down, NOW).action, null);
expect(
  "Still down 61 min after alert: repeat",
  evaluateTraffic({ arrivals: 0, premiumClicks: 0 }, normal, normal, { status: "down", lastAlertAt: NOW - 61 * 60 * 1000 }, NOW).action,
  "alert"
);
expect("Back to normal after alert: all-clear", evaluateTraffic(normal, normal, normal, down, NOW).action, "recovery");
expect(
  "Partly back (40%): no all-clear yet",
  evaluateTraffic({ arrivals: 28, premiumClicks: 10 }, normal, normal, down, NOW).action,
  null
);

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
