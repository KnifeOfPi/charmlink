// Creator slugs and custom domains, normalized and validated at the API.
//
// A slug is a URL path segment: middleware rewrites a creator's domain to
// `/<slug>`, and the page looks the creator up by exact match. On 2026-10-15 a
// site was created from the person page's "add another domain" form with the
// slug "Account 2"; the rewrite became /Account%202, the lookup found nothing,
// and the domain served the decoy 404 to its own creator. The main creator form
// already normalized slugs; that form and the API did not.

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

// Top-level app routes a creator slug would shadow or be shadowed by.
const RESERVED = new Set(["admin", "api", "r", "_next", "favicon.ico", "robots.txt"]);

/** "Account 2" → "account-2"; "  Holly XO! " → "holly-xo". */
export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

export function slugError(slug: string): string | null {
  if (!SLUG_RE.test(slug)) {
    return "slug must be 1–64 characters: lowercase letters, numbers, - or _, starting with a letter or number";
  }
  if (RESERVED.has(slug)) return `"${slug}" is reserved`;
  return null;
}

/** "https://WWW.Example.com/path" → "www.example.com". Empty → null. */
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
  return d || null;
}

export function domainError(domain: string): string | null {
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)
    ? null
    : `"${domain}" is not a valid domain`;
}

/**
 * Normalize + validate the slug/custom_domain fields of a create or update
 * body in place. Fields absent from the body are left alone (partial update).
 * Returns an error message, or null when the body is acceptable.
 */
export function cleanCreatorFields(body: Record<string, unknown>, opts: { requireSlug: boolean }): string | null {
  if (typeof body.slug === "string" || opts.requireSlug) {
    const slug = normalizeSlug(typeof body.slug === "string" ? body.slug : "");
    const err = slugError(slug);
    if (err) return err;
    body.slug = slug;
  }
  if ("custom_domain" in body) {
    const domain = normalizeDomain(typeof body.custom_domain === "string" ? body.custom_domain : null);
    if (domain) {
      const err = domainError(domain);
      if (err) return err;
    }
    body.custom_domain = domain;
  }
  return null;
}
