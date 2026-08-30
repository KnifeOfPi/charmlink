/**
 * The instant the photo experiment starts counting.
 *
 * Attribution before this point is not trustworthy, for two compounding
 * reasons, both fixed as of this timestamp:
 *
 *  1. Escaping an in-app browser reloaded the page and redrew the photo, so a
 *     visitor's click was credited to a photo chosen at random on the second
 *     load while the photo that actually earned it was charged an impression
 *     and a miss (see lib/handoff.ts).
 *  2. The sampler was reading its posterior with a creator id where a model id
 *     was required, so it never found a single stats row and every photo drew
 *     from Beta(1,1) — a uniform random pick wearing Thompson sampling's
 *     clothes. Allocation was an even split, which is why every photo has
 *     roughly the same impression count up to this date.
 *
 * The polluted rows are deliberately NOT deleted: `avatar_id` sits on the same
 * charmlink_events rows that carry every pageview and click, and the history is
 * still worth having for forensics on the mis-attribution itself. A cutoff
 * gives the same clean slate and can be moved if this instant turns out to be
 * wrong — a DELETE could not be taken back.
 *
 * Set to the production deploy of the attribution fix (2026-08-30 08:35:58Z)
 * plus a buffer, so no session that started on the old code is counted.
 */
export const AVATAR_STATS_EPOCH = "2026-08-30T09:00:00Z";

/** Ready-made SQL predicate. The value is a compile-time constant, never user
 *  input, so it is inlined the same way DEDUPED_CLICKS inlines its sentinel. */
export const AVATAR_EPOCH_FILTER = `AND e.created_at >= TIMESTAMPTZ '${AVATAR_STATS_EPOCH}'`;
