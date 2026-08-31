/**
 * Split test: is escaping Instagram's in-app browser actually worth it?
 *
 * The escape has been on since 2026-05-11 and has never been measured against
 * the alternative. It is not obviously good: it costs a full page reload, it
 * surfaces the OS "open an app outside Instagram?" dialog, and roughly a
 * quarter of attempts fail outright and strand the visitor anyway. Against
 * that, a real browser has the visitor's cookies, saved passwords and payment
 * autofill, which the WebView does not.
 *
 * Arms (in-app Instagram traffic on fav-site.com only):
 *   escape — today's behaviour: fire instagram://extbrowser/ on mount
 *   stay   — do not fire; the visitor stays in the WebView
 *
 * The banner is deliberately IDENTICAL in both arms. It is the constant: this
 * test isolates the on-mount auto-escape, not "escaping" in general. A visitor
 * in `stay` who taps the banner themselves has chosen to leave, which is a
 * different question and is measurable separately.
 *
 * NOTE ON WHY THIS IS MEASURABLE AT ALL: before the handoff fix (§7.11), an
 * escaping visitor's click landed on a brand-new session in the other browser,
 * so the two arms could not be compared — one arm's conversions were being
 * recorded against a session the other arm never created. Assignment below is
 * derived from the session id, and the session id now survives the escape, so
 * a click in Safari is still attributable to the arm that sent it there.
 */

/** fav-site.com. Scoped to one domain on purpose — her other sites keep today's
 *  behaviour, so they double as a concurrent control if traffic shifts. */
export const ESCAPE_EXPERIMENT_SLUG = "hannaz";

/** Kill switch. Set false to end the test; every visitor reverts to `escape`,
 *  which is the pre-experiment behaviour, with no other code change needed. */
export const ESCAPE_EXPERIMENT_ENABLED = true;

/**
 * When the test started counting. Analysis must not reach back past this.
 *
 * Deliberately 17:00 and not the 10:00 deploy. For the first ~6 hours the
 * `stay` arm was still logging failed escapes — visitors on pages served
 * before the deploy, running the old bundle from cache while being assigned to
 * an arm they could not obey. Measured: stay-arm escape attempts ran 4-5 per
 * hour through 16:00 UTC and are exactly ZERO from 17:00 onward, while the
 * escape arm keeps logging them steadily. Those early sessions are an A/A
 * sample wearing the experiment's labels, so the window starts after they stop.
 *
 * This is also the check to repeat after any future change to the escape path:
 * stay-arm `escape_failures` must be ~0, and it takes hours rather than minutes
 * to become true.
 */
export const ESCAPE_EXPERIMENT_START = "2026-08-30T17:00:00Z";

export type EscapeArm = "escape" | "stay";

/**
 * Assign a visitor to an arm, or null when the experiment does not apply (any
 * other creator, or the switch is off) — in which case the caller keeps the
 * default escape behaviour.
 *
 * Assignment is a pure function of the session id's last hex digit, which is
 * uniformly random in a v4 UUID (verified against production: 2,987 / 3,070).
 * Deriving it rather than storing it buys three things: it needs no schema
 * change, it survives the escape handoff for free (the far side adopts the same
 * session id and re-derives the same arm), and it is recoverable from any event
 * row ever written, so the analysis is not dependent on having remembered to
 * stamp a column at write time.
 *
 * The SQL equivalent, which MUST be kept in step with this:
 *
 *   (('x' || right(session_id, 1))::bit(4)::int) % 2 = 0   -- 'escape'
 *
 * Sentinel session ids ('redirect', 'ssr') are not hex and fall through to
 * null rather than silently landing in an arm.
 */
/**
 * The SQL twin of `escapeArm`, kept in this file so the two cannot drift out of
 * sight of each other. Cross-checked against 24 real production session ids.
 * Callers must still exclude non-UUID session ids — `right('redirect',1)` is
 * 't', and the `bit(4)` cast raises rather than returning null.
 */
export const ESCAPE_ARM_SQL =
  `case when (('x'||right(session_id,1))::bit(4)::int) % 2 = 0 ` +
  `then 'escape' else 'stay' end`;

/** Guard for the above: only v4-UUID-shaped session ids are assignable. */
export const ESCAPE_ARM_SESSION_GUARD = `session_id ~ '^[0-9a-f-]{36}$'`;

export function escapeArm(slug: string, sessionId: string): EscapeArm | null {
  if (!ESCAPE_EXPERIMENT_ENABLED) return null;
  if (slug !== ESCAPE_EXPERIMENT_SLUG) return null;
  if (!sessionId) return null;

  const digit = parseInt(sessionId.slice(-1), 16);
  if (Number.isNaN(digit)) return null;

  return digit % 2 === 0 ? "escape" : "stay";
}
