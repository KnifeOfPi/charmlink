import { NextRequest, NextResponse } from "next/server";
import { getTrafficCounts } from "../../../../lib/db";
import { evaluateTraffic, type Evaluation, type WatchdogState } from "../../../../lib/traffic-watchdog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Traffic watchdog — posts to Slack when real traffic falls off a cliff.
 *
 * Why: on 2026-10-06 a deploy made every creator domain serve the bare app
 * root for 37 minutes. Clicks went from ~0.8/min to zero and nothing told
 * anyone; it was found by accident during a code review.
 *
 * Every 10 minutes (vercel.json cron) this compares the last 30 minutes with
 * the same 30 minutes one and two weeks earlier (averaged, so one odd day
 * doesn't skew it) and alerts when:
 *   - arrivals drop below 30% of that baseline — pages aren't loading; or
 *   - premium clicks drop below 30% while arrivals look normal — pages load
 *     but the links are broken or being decoyed.
 * Quiet hours with too little baseline traffic to judge are skipped rather
 * than guessed at. Repeats at most hourly while the problem lasts, and posts
 * an all-clear once traffic is back above 60%.
 *
 * Env: CRON_SECRET (Vercel sends it as a Bearer token), SLACK_ALERT_WEBHOOK_URL.
 */

const WINDOW_MS = 30 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_KEY = "watchdog:traffic";

async function kvClient() {
  try {
    if (!process.env.KV_REST_API_URL) return null;
    return (await import("@vercel/kv")).kv;
  } catch {
    return null;
  }
}

async function postSlack(text: string): Promise<boolean> {
  const url = process.env.SLACK_ALERT_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const window = (offset: number) =>
    getTrafficCounts(new Date(now - offset - WINDOW_MS), new Date(now - offset));

  let current, w1, w2;
  try {
    [current, w1, w2] = await Promise.all([window(0), window(WEEK_MS), window(2 * WEEK_MS)]);
  } catch (err) {
    // The database being unreachable is itself an outage worth hearing about.
    const msg = err instanceof Error ? err.message : String(err);
    await postSlack(`:rotating_light: CharmLink traffic watchdog can't read the database: ${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const kv = await kvClient();
  let state: WatchdogState = { status: "ok", lastAlertAt: 0 };
  try {
    state = (kv && (await kv.get<WatchdogState>(STATE_KEY))) || state;
  } catch {
    // No state: alert without de-duplication rather than stay silent.
  }

  const evaluation = evaluateTraffic(current, w1, w2, state, now);
  let sent: Evaluation["action"] = null;
  if (evaluation.action === "alert") {
    if (
      await postSlack(
        `:rotating_light: *CharmLink traffic drop* — ${evaluation.problems.join("; ")}.\nCheck a creator page on a phone; if it's broken, roll back the latest deploy in Vercel.`
      )
    ) {
      sent = "alert";
    }
  } else if (evaluation.action === "recovery") {
    if (await postSlack(":white_check_mark: CharmLink traffic is back to normal.")) sent = "recovery";
  }
  // Only advance state once Slack accepted the post, so a failed post retries.
  if (sent) {
    try {
      if (kv) await kv.set(STATE_KEY, evaluation.nextState, { ex: 7 * 24 * 60 * 60 });
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({
    current,
    baseline: evaluation.baseline,
    arrivalsRatio: evaluation.arrivalsRatio,
    clicksRatio: evaluation.clicksRatio,
    problems: evaluation.problems,
    sent,
    slackConfigured: Boolean(process.env.SLACK_ALERT_WEBHOOK_URL),
  });
}
