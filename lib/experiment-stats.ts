/**
 * Two-proportion statistics for the escape split test.
 *
 * These exist because the raw percentages lie at small n, and lie
 * convincingly. Run against production while both arms were still executing
 * *identical* code, the split test query returned 37.0% (n=27) against 54.2%
 * (n=24) — a 17-point gap manufactured entirely by noise. Anyone reading those
 * two numbers off a dashboard would have shipped a decision based on nothing.
 *
 * So the readout's job is not to show a percentage. It is to say whether the
 * percentages are yet worth looking at.
 */

/** Conventional two-sided 95% / 80% power. */
const Z_ALPHA = 1.959964;
const Z_BETA = 0.841621;

/** Below this per arm, no comparison is reported at all. At n=25 the A/A noise
 *  above spanned 17 points; a floor keeps the page from inviting that read. */
export const MIN_VISITORS_PER_ARM = 100;

/** Abramowitz & Stegun 7.1.26. Max error ~1.5e-7 — far tighter than any
 *  decision made from a few hundred visitors requires. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF. */
function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export interface ArmCounts {
  visitors: number;
  converted: number;
}

export type Verdict =
  | { kind: "collecting"; reason: string }
  | { kind: "inconclusive"; minimumDetectable: number }
  | { kind: "significant"; winner: "escape" | "stay" };

export interface ComparisonResult {
  escapeRate: number;
  stayRate: number;
  /** stay − escape, in percentage points. Positive means staying won. */
  difference: number;
  /** 95% CI on that difference, percentage points. Straddling zero means the
   *  data is consistent with no effect at all. */
  ciLow: number;
  ciHigh: number;
  pValue: number;
  /** Smallest difference this sample size could reliably have detected. A big
   *  number here is why an "inconclusive" result is not evidence of no effect. */
  minimumDetectable: number;
  /** Per-arm visitors needed to detect a 5-point difference at the observed
   *  base rate — the "how much longer" number. */
  targetPerArm: number;
  verdict: Verdict;
}

/**
 * Compare the two arms.
 *
 * The significance test is pooled (standard for a null of "no difference");
 * the confidence interval is unpooled, which is the correct estimator for the
 * size of a difference once you believe there is one.
 */
export function compareArms(escape: ArmCounts, stay: ArmCounts): ComparisonResult {
  const n1 = escape.visitors;
  const n2 = stay.visitors;
  const p1 = n1 > 0 ? escape.converted / n1 : 0;
  const p2 = n2 > 0 ? stay.converted / n2 : 0;
  const diff = p2 - p1;

  // Unpooled SE → confidence interval on the difference.
  const seUnpooled =
    n1 > 0 && n2 > 0
      ? Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2)
      : 0;

  // Pooled SE → the hypothesis test.
  const pPool = n1 + n2 > 0 ? (escape.converted + stay.converted) / (n1 + n2) : 0;
  const sePooled =
    n1 > 0 && n2 > 0
      ? Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2))
      : 0;

  const z = sePooled > 0 ? diff / sePooled : 0;
  const pValue = sePooled > 0 ? 2 * (1 - normalCdf(Math.abs(z))) : 1;

  // Smallest effect detectable at THIS sample size, and the sample size that
  // would be needed for 5 points. Both use the pooled rate as the base.
  const harmonicN = n1 > 0 && n2 > 0 ? 2 / (1 / n1 + 1 / n2) : 0;
  const variance = 2 * pPool * (1 - pPool);
  const mde =
    harmonicN > 0 ? (Z_ALPHA + Z_BETA) * Math.sqrt(variance / harmonicN) : 1;
  const targetPerArm =
    variance > 0 ? Math.ceil((variance * (Z_ALPHA + Z_BETA) ** 2) / 0.05 ** 2) : 0;

  let verdict: Verdict;
  if (n1 < MIN_VISITORS_PER_ARM || n2 < MIN_VISITORS_PER_ARM) {
    const short = Math.max(MIN_VISITORS_PER_ARM - n1, MIN_VISITORS_PER_ARM - n2);
    verdict = {
      kind: "collecting",
      reason: `${short} more visitor${short === 1 ? "" : "s"} needed in the smaller arm before any comparison is meaningful`,
    };
  } else if (pValue >= 0.05) {
    verdict = { kind: "inconclusive", minimumDetectable: mde * 100 };
  } else {
    verdict = { kind: "significant", winner: diff > 0 ? "stay" : "escape" };
  }

  return {
    escapeRate: p1 * 100,
    stayRate: p2 * 100,
    difference: diff * 100,
    ciLow: (diff - Z_ALPHA * seUnpooled) * 100,
    ciHigh: (diff + Z_ALPHA * seUnpooled) * 100,
    pValue,
    minimumDetectable: mde * 100,
    targetPerArm,
    verdict,
  };
}
