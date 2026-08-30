"use client";

import { useState } from "react";
import type { EscapeExperimentArm, EscapeExperimentDaily } from "../../../lib/db";
import { compareArms, MIN_VISITORS_PER_ARM } from "../../../lib/experiment-stats";

// Validated against the dark chart surface (#111) with
// scripts/validate_palette.js: OKLCH lightness in band, chroma floor met,
// adjacent CVD ΔE 15.7 (protan) and 35.4 (tritan), normal-vision ΔE 34.9, and
// both ≥3:1 against the surface. Teal and green were tried first and FAILED CVD
// against the pink at ΔE 2.8–3.8 — do not "tidy" these to a nicer pair without
// re-running the validator. Both arms are also direct-labeled, so identity is
// never carried by colour alone.
const ESCAPE_COLOR = "#e91e8a";
const STAY_COLOR = "#2563eb";
const NEUTRAL = "#6b7280";

function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

function ArmTile({
  arm,
  color,
  subtitle,
  data,
  rate,
}: {
  arm: string;
  color: string;
  subtitle: string;
  data: EscapeExperimentArm;
  rate: number;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-white text-sm font-semibold">{arm}</span>
      </div>
      <p className="text-gray-500 text-xs mb-3">{subtitle}</p>
      <p className="text-3xl font-bold text-white tabular-nums">
        {data.visitors > 0 ? pct(rate) : "—"}
      </p>
      <p className="text-gray-500 text-xs mt-1 tabular-nums">
        {data.converted.toLocaleString()} of {data.visitors.toLocaleString()} visitors clicked
        a premium link
      </p>
    </div>
  );
}

/**
 * The difference and its 95% interval.
 *
 * This is the only mark on the page, and it earns its place: the question is
 * polarity — does the interval clear zero — which a pair of percentages cannot
 * answer and actively misleads about. It stays grey until significant, so an
 * interval straddling zero never reads as a winner.
 */
function DifferenceBar({
  low,
  high,
  point,
  significant,
}: {
  low: number;
  high: number;
  point: number;
  significant: boolean;
}) {
  const domain = Math.max(10, Math.abs(low), Math.abs(high)) * 1.15;
  const toPct = (v: number) => ((v + domain) / (2 * domain)) * 100;
  const color = !significant ? NEUTRAL : point > 0 ? STAY_COLOR : ESCAPE_COLOR;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-gray-400 text-xs uppercase tracking-wide">
          Difference (stay − escape), 95% interval
        </h3>
        <span className="text-gray-500 text-[11px]">percentage points</span>
      </div>

      <div className="relative h-14">
        {/* Zero reference — recessive, but the thing the eye must find */}
        <div
          className="absolute top-0 bottom-4 w-px bg-gray-600"
          style={{ left: `${toPct(0)}%` }}
        />
        {/* Interval */}
        <div
          className="absolute h-2.5 rounded-[4px]"
          style={{
            top: 14,
            left: `${toPct(low)}%`,
            width: `${Math.max(0.8, toPct(high) - toPct(low))}%`,
            backgroundColor: color,
            opacity: significant ? 0.9 : 0.55,
          }}
          title={`95% CI: ${low > 0 ? "+" : ""}${low.toFixed(1)} to ${high > 0 ? "+" : ""}${high.toFixed(1)} points`}
        />
        {/* Point estimate — 2px surface ring so it reads on top of the interval */}
        <div
          className="absolute w-2 h-5 rounded-sm"
          style={{
            top: 12,
            left: `calc(${toPct(point)}% - 4px)`,
            backgroundColor: color,
            boxShadow: "0 0 0 2px #111827",
          }}
          title={`Observed difference: ${point > 0 ? "+" : ""}${point.toFixed(1)} points`}
        />
        {/* Axis ends */}
        <div className="absolute bottom-0 left-0 text-[10px] text-gray-600 tabular-nums">
          −{domain.toFixed(0)}
        </div>
        <div
          className="absolute bottom-0 text-[10px] text-gray-500"
          style={{ left: `${toPct(0)}%`, transform: "translateX(-50%)" }}
        >
          0
        </div>
        <div className="absolute bottom-0 right-0 text-[10px] text-gray-600 tabular-nums">
          +{domain.toFixed(0)}
        </div>
      </div>

      <p className="text-gray-500 text-xs mt-1">
        {low <= 0 && high >= 0
          ? "The interval crosses zero — the data is consistent with no difference at all."
          : "The interval clears zero."}
      </p>
    </div>
  );
}

export function ExperimentDashboard({
  slug,
  start,
  enabled,
  arms,
  daily,
}: {
  slug: string;
  start: string;
  enabled: boolean;
  arms: EscapeExperimentArm[];
  daily: EscapeExperimentDaily[];
}) {
  const [showTable, setShowTable] = useState(false);

  const escape = arms.find((a) => a.arm === "escape") ?? {
    arm: "escape" as const, visitors: 0, converted: 0, escapeFailures: 0,
  };
  const stay = arms.find((a) => a.arm === "stay") ?? {
    arm: "stay" as const, visitors: 0, converted: 0, escapeFailures: 0,
  };

  const r = compareArms(escape, stay);
  const smaller = Math.min(escape.visitors, stay.visitors);
  const progress = r.targetPerArm > 0 ? Math.min(100, (smaller / r.targetPerArm) * 100) : 0;

  // The suppression is what makes the arms different. If the stay arm is still
  // logging failed escapes, it is still escaping and the two arms are the same
  // experiment — which is worth shouting about, because every number below
  // would then be an A/A test wearing a conclusion.
  const assignmentBroken = stay.visitors >= 20 && stay.escapeFailures > stay.visitors * 0.1;

  const verdictBox = (() => {
    if (r.verdict.kind === "collecting") {
      return {
        border: "border-gray-700",
        bg: "bg-gray-900",
        title: "Too early to read",
        body: r.verdict.reason + ".",
      };
    }
    if (r.verdict.kind === "inconclusive") {
      return {
        border: "border-gray-700",
        bg: "bg-gray-900",
        title: "No difference detected yet",
        body:
          `At this sample size only a difference of about ${pct(r.verdict.minimumDetectable)} or larger ` +
          `could be reliably detected, so this is not evidence that the arms perform the same — ` +
          `only that any gap between them is smaller than that.`,
      };
    }
    const winner = r.verdict.winner;
    return {
      border: winner === "stay" ? "border-blue-500/60" : "border-pink-500/60",
      bg: winner === "stay" ? "bg-blue-500/5" : "bg-pink-500/5",
      title:
        winner === "stay"
          ? "Staying in the in-app browser converts better"
          : "Escaping to the native browser converts better",
      body:
        `${pct(Math.abs(r.difference))} difference (95% CI ${r.ciLow.toFixed(1)} to ` +
        `${r.ciHigh.toFixed(1)} points, p = ${r.pValue < 0.001 ? "<0.001" : r.pValue.toFixed(3)}).`,
    };
  })();

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">🧪 Escape Split Test</h1>
            <p className="text-gray-500 text-sm mt-1">
              {slug} · Instagram in-app traffic only · since{" "}
              {new Date(start).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
            </p>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full ${
              enabled ? "bg-green-500/15 text-green-400" : "bg-gray-800 text-gray-400"
            }`}
          >
            {enabled ? "Running" : "Stopped — everyone on escape"}
          </span>
        </div>

        {assignmentBroken && (
          <div className="mb-6 rounded-xl border border-amber-500/50 bg-amber-500/5 p-4">
            <p className="text-amber-300 text-sm font-semibold">
              ⚠ Assignment may not be live
            </p>
            <p className="text-amber-200/80 text-xs mt-1">
              The <strong>stay</strong> arm has logged {stay.escapeFailures} failed escapes. If
              it were really staying it would attempt none. Until that reads ~0 these are two
              halves of the same behaviour, and every figure below is an A/A test.
            </p>
          </div>
        )}

        {/* Verdict — the hero. Deliberately louder than the percentages. */}
        <div className={`rounded-2xl border ${verdictBox.border} ${verdictBox.bg} p-5 mb-6`}>
          <p className="text-lg font-bold text-white">{verdictBox.title}</p>
          <p className="text-gray-400 text-sm mt-1.5 leading-relaxed">{verdictBox.body}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <ArmTile
            arm="Escape"
            color={ESCAPE_COLOR}
            subtitle="Fires instagram://extbrowser on load (current behaviour)"
            data={escape}
            rate={r.escapeRate}
          />
          <ArmTile
            arm="Stay"
            color={STAY_COLOR}
            subtitle="No auto-escape — visitor remains in the WebView"
            data={stay}
            rate={r.stayRate}
          />
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
          <DifferenceBar
            low={r.ciLow}
            high={r.ciHigh}
            point={r.difference}
            significant={r.verdict.kind === "significant"}
          />
        </div>

        {/* Progress toward a readable result */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-gray-400 text-xs uppercase tracking-wide">
              Progress to a 5-point-sensitive result
            </h3>
            <span className="text-gray-500 text-[11px] tabular-nums">
              {smaller.toLocaleString()} / {r.targetPerArm.toLocaleString()} per arm
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, backgroundColor: progress >= 100 ? STAY_COLOR : NEUTRAL }}
            />
          </div>
          <p className="text-gray-600 text-[11px] mt-2">
            Minimum {MIN_VISITORS_PER_ARM} per arm before any comparison is shown. A run of this
            test against production while both arms were still executing{" "}
            <em>identical code</em> produced a 17-point gap at n≈25 — noise, not a finding.
          </p>
        </div>

        {/* Daily counts. A table rather than a rates chart on purpose: at ~50
            visitors per arm per day the daily rate swings wildly and invites
            exactly the misreading the verdict box exists to prevent. */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-gray-400 text-xs uppercase tracking-wide">Daily</h3>
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2"
            >
              {showTable ? "Hide" : "Show"} ({daily.length} days)
            </button>
          </div>
          {showTable &&
            (daily.length === 0 ? (
              <p className="text-gray-600 text-sm">No data yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-800">
                      <th className="py-1.5 pr-3 font-normal">Day</th>
                      <th className="py-1.5 pr-3 font-normal text-right">Escape</th>
                      <th className="py-1.5 pr-3 font-normal text-right">Escape conv.</th>
                      <th className="py-1.5 pr-3 font-normal text-right">Stay</th>
                      <th className="py-1.5 font-normal text-right">Stay conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map((d) => (
                      <tr key={d.day} className="border-b border-gray-900 text-gray-300">
                        <td className="py-1.5 pr-3">{d.day}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-right">{d.escapeVisitors}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-right">{d.escapeConverted}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-right">{d.stayVisitors}</td>
                        <td className="py-1.5 tabular-nums text-right">{d.stayConverted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </div>

        <p className="text-gray-600 text-[11px] mt-6 leading-relaxed">
          <strong className="text-gray-500">What this measures.</strong> A conversion here is a
          premium-link click — the last thing CharmLink can see. It is not a subscription, and
          the in-app browser is expected to be weakest exactly where our visibility ends (no
          saved passwords, no payment autofill). A win for <em>stay</em> on clicks is therefore
          not automatically a win on revenue. Conversions are joined on session id, never on
          Instagram detection: an escaping visitor clicks from Safari, so filtering clicks by
          surface would discard that arm&apos;s conversions entirely.
        </p>
      </div>
    </main>
  );
}
