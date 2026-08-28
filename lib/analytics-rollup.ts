import type { AnalyticsSummary } from "./types";

/** One person's combined analytics, with her individual sites kept underneath. */
export interface ModelAnalytics extends AnalyticsSummary {
  modelId: string | null;
  modelName: string;
  sites: Array<AnalyticsSummary & { customDomain: string | null }>;
}

type Keyed = { key: string; count: number };

function mergeCounts<T>(
  groups: T[][],
  keyOf: (item: T) => string,
  countOf: (item: T) => number,
  rebuild: (key: string, count: number, sample: T) => T,
  limit?: number
): T[] {
  const totals = new Map<string, Keyed & { sample: T }>();
  for (const group of groups) {
    for (const item of group) {
      const key = keyOf(item);
      const prev = totals.get(key);
      if (prev) prev.count += countOf(item);
      else totals.set(key, { key, count: countOf(item), sample: item });
    }
  }
  const merged = [...totals.values()]
    .sort((a, b) => b.count - a.count)
    .map((t) => rebuild(t.key, t.count, t.sample));
  return limit ? merged.slice(0, limit) : merged;
}

/**
 * Fold per-site summaries into one row per model.
 *
 * Rates are recomputed from the summed numerator and denominator, never
 * averaged across sites — averaging CTRs would weight a 40-view domain the same
 * as a 40,000-view one and quietly misreport the person's real performance.
 */
export function rollupByModel(
  summaries: AnalyticsSummary[],
  siteMeta: Map<string, { modelId: string | null; modelName: string; customDomain: string | null }>
): ModelAnalytics[] {
  const groups = new Map<string, AnalyticsSummary[]>();
  for (const s of summaries) {
    const meta = siteMeta.get(s.creator);
    // Unassigned sites group under their own slug so nothing is silently dropped.
    const key = meta?.modelId ?? `slug:${s.creator}`;
    const arr = groups.get(key);
    if (arr) arr.push(s);
    else groups.set(key, [s]);
  }

  const out: ModelAnalytics[] = [];
  for (const [key, sites] of groups) {
    const meta = siteMeta.get(sites[0].creator);
    const sum = (pick: (s: AnalyticsSummary) => number) =>
      sites.reduce((n, s) => n + pick(s), 0);

    const humanViews = sum((s) => s.humanViews);
    const premiumClicks = sum((s) => s.premiumClicks);

    const deviceBreakdown = { mobile: 0, tablet: 0, desktop: 0 };
    for (const s of sites) {
      deviceBreakdown.mobile += s.deviceBreakdown.mobile;
      deviceBreakdown.tablet += s.deviceBreakdown.tablet;
      deviceBreakdown.desktop += s.deviceBreakdown.desktop;
    }

    // Photos are a MODEL-level pool: every site of hers reports the same rows
    // with the same pooled totals, so these are deduplicated by id rather than
    // summed — summing would multiply each photo's numbers by her site count.
    const avatarPerformance = [
      ...new Map(
        sites.flatMap((s) => s.avatarPerformance).map((a) => [a.avatarId, a])
      ).values(),
    ];

    out.push({
      creator: meta?.modelName ?? sites[0].creator,
      modelId: meta?.modelId ?? null,
      modelName: meta?.modelName ?? sites[0].creator,
      period: sites[0].period,
      totalViews: sum((s) => s.totalViews),
      humanViews,
      botViews: sum((s) => s.botViews),
      uniqueSessions: sum((s) => s.uniqueSessions),
      totalClicks: sum((s) => s.totalClicks),
      premiumClicks,
      socialClicks: sum((s) => s.socialClicks),
      ctr: humanViews > 0 ? Math.round((premiumClicks / humanViews) * 10000) / 100 : 0,
      instagramTraffic: sum((s) => s.instagramTraffic),
      deviceBreakdown,
      topReferrers: mergeCounts(
        sites.map((s) => s.topReferrers),
        (r) => r.referer, (r) => r.count,
        (referer, count) => ({ referer, count }), 10
      ),
      countryBreakdown: mergeCounts(
        sites.map((s) => s.countryBreakdown),
        (c) => c.country, (c) => c.count,
        (country, count) => ({ country, count }), 10
      ),
      linkBreakdown: mergeCounts(
        sites.map((s) => s.linkBreakdown),
        // Same label on two domains is the same offer, but the URLs differ per
        // domain, so the label is what makes them comparable.
        (l) => `${l.type}|${l.label}`, (l) => l.clicks,
        (k, clicks, sample) => ({ label: sample.label, url: sample.url, type: sample.type, clicks })
      ),
      clickTimeseries: mergeCounts(
        sites.map((s) => s.clickTimeseries),
        (t) => t.bucket, (t) => t.total,
        (bucket, total, sample) => ({ bucket, total, premium: sample.premium })
      )
        // Premium has to be summed on its own pass; mergeCounts folds one metric.
        .map((point) => ({
          ...point,
          premium: sites.reduce(
            (n, s) => n + (s.clickTimeseries.find((t) => t.bucket === point.bucket)?.premium ?? 0),
            0
          ),
        }))
        .sort((a, b) => a.bucket.localeCompare(b.bucket)),
      avatarPerformance,
      sites: sites
        .map((s) => ({ ...s, customDomain: siteMeta.get(s.creator)?.customDomain ?? null }))
        .sort((a, b) => b.totalViews - a.totalViews),
    });
    void key;
  }

  return out.sort((a, b) => b.totalViews - a.totalViews);
}
