/**
 * The instant this project's tracking became trustworthy.
 *
 * Until 2026-08-30, escaping an in-app browser reloaded the page and recorded
 * the same visitor twice — an in-app pageview they abandoned, then a second
 * one in the real browser that received their click (see lib/handoff.ts). The
 * click was always counted exactly once, so click totals were never wrong, but
 * pageviews were inflated in proportion to a domain's Instagram share and
 * every CTR measured against them was understated.
 *
 * The events themselves are deliberately kept: 736k rows going back to March,
 * including 207k click records that were correct all along, and the history
 * that made the bug findable in the first place. What changes is what the
 * dashboard is willing to *show*, which is a presentation decision and
 * reversible — delete `clampToEpoch` and the full history is back.
 */
export const STATS_EPOCH = "2026-08-30T09:00:00Z";

/**
 * Photo stats carry a stronger requirement than the dashboard window, and so
 * get their own predicate rather than relying on the clamp below.
 *
 * Pre-epoch avatar attribution is not merely inflated, it is unrecoverable: a
 * click was credited to whichever photo the second page load happened to draw,
 * and nothing in the data says which photo actually earned it. The dashboard's
 * window is a display choice someone may reasonably widen later; this one is a
 * correctness boundary that must hold regardless.
 */
export const AVATAR_EPOCH_FILTER = `AND e.created_at >= TIMESTAMPTZ '${STATS_EPOCH}'`;

/**
 * Hold an analytics window at the epoch, so no query reaches back into the
 * inflated period. `null` means "all time", which becomes "all trustworthy
 * time".
 *
 * Compared as instants rather than strings: `periodCutoff` emits millisecond
 * precision and the epoch does not, so a lexicographic compare would sort an
 * identical moment as earlier. This becomes a no-op on its own once the epoch
 * is more than 30 days old and every window starts after it.
 */
export function clampToEpoch(cutoff: string | null): string {
  if (!cutoff) return STATS_EPOCH;
  return new Date(cutoff) < new Date(STATS_EPOCH) ? STATS_EPOCH : cutoff;
}
