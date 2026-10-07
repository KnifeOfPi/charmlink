// Decision logic for /api/cron/traffic-alert, kept pure so it can be tested
// (scripts/check-traffic-watchdog.ts) without a database or Slack.

export type Counts = { arrivals: number; premiumClicks: number };
export type WatchdogState = { status: "ok" | "down"; lastAlertAt: number };

export const DROP_RATIO = 0.3;
export const RECOVER_RATIO = 0.6;
export const MIN_BASELINE_ARRIVALS = 15;
export const MIN_BASELINE_CLICKS = 8;
export const REPEAT_MS = 60 * 60 * 1000;

export interface Evaluation {
  baseline: Counts;
  arrivalsRatio: number | null;
  clicksRatio: number | null;
  problems: string[];
  /** What to post, if anything. */
  action: "alert" | "recovery" | null;
  /** State to persist if the post succeeds. */
  nextState: WatchdogState;
}

/**
 * Compare the current 30-minute window with the same window one and two weeks
 * earlier (averaged). Alerts when visits fall below 30% of normal, or when
 * premium clicks do while visits look normal. Windows with too little
 * baseline traffic to judge are skipped. Repeats at most hourly while down;
 * signals recovery once back above 60%.
 */
export function evaluateTraffic(
  current: Counts,
  weekAgo: Counts,
  twoWeeksAgo: Counts,
  state: WatchdogState,
  now: number
): Evaluation {
  const baseline: Counts = {
    arrivals: (weekAgo.arrivals + twoWeeksAgo.arrivals) / 2,
    premiumClicks: (weekAgo.premiumClicks + twoWeeksAgo.premiumClicks) / 2,
  };
  const arrivalsRatio =
    baseline.arrivals >= MIN_BASELINE_ARRIVALS ? current.arrivals / baseline.arrivals : null;
  const clicksRatio =
    baseline.premiumClicks >= MIN_BASELINE_CLICKS ? current.premiumClicks / baseline.premiumClicks : null;

  const problems: string[] = [];
  if (arrivalsRatio !== null && arrivalsRatio < DROP_RATIO) {
    problems.push(
      `visits are at ${Math.round(arrivalsRatio * 100)}% of normal (${current.arrivals} in the last 30 min vs ~${Math.round(baseline.arrivals)} usually) — pages may not be loading`
    );
  } else if (clicksRatio !== null && clicksRatio < DROP_RATIO) {
    problems.push(
      `premium clicks are at ${Math.round(clicksRatio * 100)}% of normal (${current.premiumClicks} vs ~${Math.round(baseline.premiumClicks)}) while visits look normal — links may be broken or decoyed`
    );
  }

  const recovered =
    (arrivalsRatio === null || arrivalsRatio >= RECOVER_RATIO) &&
    (clicksRatio === null || clicksRatio >= RECOVER_RATIO);

  let action: Evaluation["action"] = null;
  let nextState = state;
  if (problems.length > 0) {
    if (state.status !== "down" || now - state.lastAlertAt >= REPEAT_MS) {
      action = "alert";
      nextState = { status: "down", lastAlertAt: now };
    }
  } else if (state.status === "down" && recovered) {
    action = "recovery";
    nextState = { status: "ok", lastAlertAt: 0 };
  }

  return { baseline, arrivalsRatio, clicksRatio, problems, action, nextState };
}
