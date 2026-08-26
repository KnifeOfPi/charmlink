import type { NextRequest } from "next/server";
import { isBot } from "./bot-detect";

/**
 * Server-side resolution of the `is_bot` flag written onto analytics events.
 *
 * This exists because both /api/track and /api/pageview used to record
 * `is_bot: false` unconditionally — /api/track hard-coded it, and /api/pageview
 * read it from the request body, which the client always populates with
 * `false`. The result was that all 708,845 events in the table carried
 * `is_bot = false`, so the dashboard's "Bot Views" metric had never reported a
 * single row and "Human Views" silently included every JS-executing scraper.
 *
 * The client is never consulted. Middleware already runs full detection
 * (isbot UA matching, Meta-2026 patterns, datacenter ASN, honeypot ban list)
 * and stamps the verdict on the forwarded request headers, overwriting
 * anything the caller sent — so `x-is-bot` cannot be spoofed and is the
 * authoritative signal. We fall back to a UA check only if the header is
 * absent, which would mean middleware did not run for this request.
 */
export function resolveIsBot(request: NextRequest): boolean {
  const header = request.headers.get("x-is-bot");
  if (header === "true") return true;
  if (header === "false") return false;
  return isBot(request.headers.get("user-agent"));
}
