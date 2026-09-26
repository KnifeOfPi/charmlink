// Shared transport for Cloudflare API calls: retries 429s instead of letting
// them surface as a failed lookup.
//
// Why this exists: CF rate-limits per token (1200 req / 5 min, plus burst
// limits). The admin Domains page fans out a zone lookup per domain, so one
// page load plus a couple of add/remove clicks can trip the limit. Callers
// used to swallow the resulting error as "zone not found", which painted every
// domain "Not on Cloudflare" and made domain-add skip DNS provisioning.

const MAX_RETRIES = 3;
const MAX_WAIT_MS = 8_000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function cfRequest(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= MAX_RETRIES) return res;

    const retryAfter = Number(res.headers.get("retry-after"));
    const wait =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_WAIT_MS)
        : Math.min(1000 * 2 ** attempt, MAX_WAIT_MS);
    await sleep(wait);
  }
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
