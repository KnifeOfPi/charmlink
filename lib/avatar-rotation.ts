import {
  getRotationAvatarsBySlug,
  getAvatarStats,
  type DBCreatorAvatar,
  type AvatarStats,
} from "./db";

/**
 * Avatar rotation — which candidate photo a visitor sees.
 *
 * The goal is not "show the best photo" but "find the best photo and keep
 * checking that it still is". A pure argmax would lock onto whichever photo got
 * lucky in its first few dozen impressions and never revisit that call, and a
 * pure even split would keep sending a quarter of traffic to a known loser
 * forever. Thompson sampling gives both properties for free:
 *
 *   - Every avatar is sampled from the posterior of its own conversion rate,
 *     so a photo with little data has a wide distribution and gets explored.
 *   - As evidence accumulates the distributions tighten and traffic
 *     concentrates on the leaders automatically — no threshold to tune.
 *   - A loser is never dropped to zero. It keeps a small share, so if the
 *     audience shifts and it starts converting, its posterior widens back out
 *     and it climbs on its own. That is the "ween off, but keep trialing"
 *     behaviour, and it is a property of the algorithm rather than a special
 *     case bolted on top.
 *
 * Pinned avatars short-circuit all of this: see getRotationAvatarsBySlug.
 */

/**
 * Impressions per photo before its measured rate is worth acting on.
 *
 * At CharmLink's observed premium-click rate (roughly 15-30% of human views),
 * 200 impressions puts the 95% interval on a single photo at about ±6 points —
 * tight enough to separate a genuine winner from a genuine loser, but not so
 * tight that a photo needs a week of traffic to say anything. Below this the
 * UI labels the number as provisional; the sampler itself needs no threshold,
 * it simply explores more while the posteriors are wide.
 */
export const MIN_IMPRESSIONS_FOR_CONFIDENCE = 200;

/** Cache TTL for the per-creator stats read. */
const STATS_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  expires: number;
  avatars: DBCreatorAvatar[];
  stats: Map<string, AvatarStats>;
}

// Per-instance cache. Serverless gives each function instance its own copy,
// which is fine: every instance converges on the same posterior because they
// all read the same events table, and a few minutes of staleness costs nothing
// when the decision is inherently probabilistic.
const cache = new Map<string, CacheEntry>();

/** Marsaglia-Tsang gamma sampler (shape >= 1 via the standard boost for a < 1). */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    // Boost: Gamma(a) = Gamma(a+1) * U^(1/a)
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      // Box-Muller for a standard normal.
      const u1 = Math.random() || Number.MIN_VALUE;
      const u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Draw from Beta(alpha, beta) via the ratio of two gammas. */
function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x + y === 0 ? 0 : x / (x + y);
}

async function loadRotation(slug: string, creatorId: string): Promise<CacheEntry> {
  const cached = cache.get(slug);
  if (cached && cached.expires > Date.now()) return cached;

  const [avatars, stats] = await Promise.all([
    getRotationAvatarsBySlug(slug),
    getAvatarStats(creatorId, "all"),
  ]);

  const entry: CacheEntry = {
    expires: Date.now() + STATS_TTL_MS,
    avatars,
    stats: new Map(stats.map((s) => [s.avatar_id, s])),
  };
  cache.set(slug, entry);
  return entry;
}

/**
 * Choose the avatar to render for one page view.
 *
 * Returns null when the creator has no carousel configured, in which case the
 * caller falls back to the creator's single `avatar_url` and no attribution is
 * recorded.
 */
export async function pickAvatar(
  slug: string,
  creatorId: string,
  /**
   * The photo a continuing visitor already saw, from the escape handoff.
   *
   * Re-drawing on the second load would show them a different face and, worse,
   * hand the click to a photo that never earned it while charging the origin
   * photo an impression it appeared to lose. Honouring it keeps one visit
   * attributed to one photo — which matters twice over, since these same
   * counts are the posterior the sampler below draws from.
   */
  preferredId?: string | null
): Promise<{ id: string; url: string; focalX: number; focalY: number } | null> {
  let entry: CacheEntry;
  try {
    entry = await loadRotation(slug, creatorId);
  } catch (err) {
    // Never let the experiment break the page — fall back to the static avatar.
    console.error("[avatar-rotation] load failed", slug, err);
    return null;
  }

  const { avatars, stats } = entry;
  if (avatars.length === 0) return null;
  const shape = (a: DBCreatorAvatar) => ({
    id: a.id,
    url: a.url,
    focalX: a.focal_x,
    focalY: a.focal_y,
  });

  // Matched against THIS creator's rotation, never trusted from the URL alone:
  // that is what stops a crafted `cl_av` from pinning — or crediting — a photo
  // belonging to someone else. An id that has since left the rotation simply
  // falls through to a normal draw.
  if (preferredId) {
    const carried = avatars.find((a) => a.id === preferredId);
    if (carried) return shape(carried);
  }

  if (avatars.length === 1) return shape(avatars[0]);

  let best = avatars[0];
  let bestDraw = -1;
  for (const avatar of avatars) {
    const s = stats.get(avatar.id);
    const impressions = s?.impressions ?? 0;
    const conversions = s?.premiumClicks ?? 0;
    // Beta(1,1) prior = uniform: a brand-new photo is treated as "could be
    // anything", which is exactly the state that earns it exploration traffic.
    // clamp misses at 0 — a click can outlive the pageview that produced it
    // (a session spanning the period edge), which would otherwise go negative.
    const misses = Math.max(0, impressions - conversions);
    const draw = sampleBeta(1 + conversions, 1 + misses);
    if (draw > bestDraw) {
      bestDraw = draw;
      best = avatar;
    }
  }
  return shape(best);
}

/** Drop a creator's cached rotation, so admin edits take effect immediately. */
export function invalidateAvatarCache(slug?: string): void {
  if (slug) cache.delete(slug);
  else cache.clear();
}
