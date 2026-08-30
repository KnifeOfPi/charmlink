/**
 * Escape handoff — carrying one visitor's identity out of an in-app browser.
 *
 * Escaping Instagram's WebView means handing the URL to a different browser,
 * which loads the page again from scratch. That second load is a different
 * browser process: `sessionStorage` does not survive it, so without help it
 * mints a fresh session id and re-runs the avatar draw. One human then lands
 * in the data as two people:
 *
 *   in-app load   → pageview, session A, photo A, and no click (they left)
 *   browser load  → pageview, session B, photo B, and the click
 *
 * Which systematically credits the wrong photo and makes in-app traffic look
 * like it never converts. Both halves are the same visit, so the identity has
 * to travel in the only channel that survives the jump: the URL.
 *
 * These params are read once on arrival and then stripped from the address bar
 * — see the continuation handling in CreatorPage.
 */

/** Session id of the visit being continued. */
export const HANDOFF_SESSION_PARAM = "cl_sid";
/** Avatar that was on screen when the visitor chose to leave. */
export const HANDOFF_AVATAR_PARAM = "cl_av";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Both handoff values arrive from a URL, so neither is trusted. Session ids
 *  are browser-minted UUIDs already; the avatar id is additionally checked
 *  against the creator's own rotation before it is honoured (see pickAvatar),
 *  so a crafted link cannot credit someone else's photo. */
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Add the handoff params to a URL bound for another browser.
 *
 * Built with `URL` rather than string concatenation so a page that already
 * carries a query string still produces one valid URL.
 */
export function withHandoff(
  url: string,
  sessionId: string | null,
  avatarId: string | null
): string {
  try {
    const next = new URL(url);
    if (isUuid(sessionId)) next.searchParams.set(HANDOFF_SESSION_PARAM, sessionId);
    if (isUuid(avatarId)) next.searchParams.set(HANDOFF_AVATAR_PARAM, avatarId);
    return next.toString();
  } catch {
    // A URL we cannot parse is still worth escaping to — attribution is the
    // thing being lost here, not the visitor.
    return url;
  }
}
