# CharmLink — Competitor Intel (Link-in-Bio for OF creators)

*Last updated: 2026-09-17 (PDT). Teardowns of 4 live competitor pages. All findings from public requests — no auth, no scraping of private data, and no attempt to get past anyone's bot protection.*

This doc compares CharmLink's IG-evasion stack against live competitor link-in-bio
pages found in the wild. **Bottom line up front:** CharmLink is the strongest of
the set. Both competitors below leak adult signal and/or the OnlyFans destination
to scrapers in ways our decoy + WAF architecture specifically prevents.

---

## TL;DR scorecard

| | **CharmLink (ours)** | **jellybeanhub.com** | **littlearabella.com** |
|---|---|---|---|
| Platform | Custom Next.js 16 + Vercel | Base44 (no-code, Python/uvicorn) | MyLinxx.com template (PHP 8.0) |
| Edge / CDN | Cloudflare orange-cloud + 6 WAF rules | Cloudflare (defaults only) | **None** — raw PHP origin exposed |
| Bot blocking at edge | Yes (empty UA, bad-UA list, datacenter ASNs, Tor, Meta ASN) | No | No |
| Scraper cloaking (decoy) | **Yes** — wholesome decoy blog, zero adult fingerprint | No — leaks "Exclusive Content" in OG tags | No |
| Premium link hidden from static HTML | Yes (client-side only) | Yes (client-side only) | **No** — `/of` is a public 301 |
| OF destination visible to scrapers | No | No (client-side gated) | **Yes** — even `facebookexternalhit` gets the 301 |
| Age/sensitive gate | Per-link interstitial (`/r/[linkId]`) | Client-side modal | Client-side modal (cosmetic) |
| IG-survival verdict | **Strong** | Mid | **Weak** (gets killed fast) |

---

## 1. jellybeanhub.com — "Jelly Bean Xoo"

- **Destination:** `https://onlyfans.com/jamelizsmth`
- **Platform:** **Base44** (no-code/AI app builder). Tells: assets on
  `media.base44.com`, origin header `x-render-origin-server: uvicorn` (Python).
  Template product, not custom-built.
- **Edge:** Cloudflare (`server: cloudflare`, `cf-ray`, LAX). Orange-cloud, but
  **defaults only** — no custom WAF, no decoy.

**Visitor flow:** Landing (avatar + "Model & Content Creator" + single
**Exclusive Content** button) → click → **18+ Content Warning** modal → Continue →
opens `onlyfans.com/jamelizsmth` in a new tab.

**Where they're weaker than CharmLink:**
- **No decoy cloaking.** As `facebookexternalhit` / `TelegramBot` it serves the
  REAL page with adult-tinted OG tags: `og:description: "Model & Content Creator
  — Exclusive Content"`. We serve bots a wholesome decoy blog instead. They leak
  "Exclusive Content" straight into the IG link preview.
- **No bot blocking at edge.** curl/python/empty UAs all get 200.

**Where they're OK:** premium link is client-side gated — plain fetch returns only
the handle `jellybeanxoo`; the OF URL only appears after JS + the button click.

---

## 2. littlearabella.com — "Arabella"

- **Destination:** `https://onlyfans.com/littlearabella`
- **Platform:** **MyLinxx.com** template. Tells: HTML comment
  `<!-- Built by MyLinxx.com -->`, assets on `cdn.minisoft.it/sw/...` ("swsites",
  Italian-origin SaaS). Backend is plain **PHP 8.0** (`x-powered-by: PHP/8.0`).
- **Edge:** **None.** No `cf-ray`, no `server: cloudflare`. Raw origin exposed,
  fully scrapeable.

**Visitor flow:** Landing (avatar + "Model & Content creator" + **Exclusive
Content** + open Facebook/Instagram links) → click → in-page **"Sensitive
content"** warning → Continue → `/of` → **301 redirect** → `onlyfans.com/littlearabella`.

**Where they're weakest of all three:**
- **OF link is NOT hidden.** `/of` server-side 301s straight to OnlyFans — and
  does so **even for `facebookexternalhit`** (the scraper got the identical 301).
  Any IG/preview crawler that follows `/of` lands on a naked OnlyFans redirect.
  This is exactly the open-redirect vulnerability CharmLink's whole architecture
  exists to avoid.
- **No CF, no WAF, no decoy.** Raw PHP origin, 200 to any UA.
- **Real socials linked openly** (FB `id=61588258651116`, IG `@imarabellaa`) →
  creator trivially de-anonymizable.
- The 18+ gate is **cosmetic** — the destination isn't actually protected because
  `/of` is a public redirect.

---

## 3. What this validates for CharmLink

Both competitors lean on cheap off-the-shelf templates (Base44, MyLinxx) with
effectively zero purpose-built IG evasion. The two things that consistently
differentiate CharmLink:

1. **Decoy cloaking** — scrapers/link-preview bots get a wholesome themed blog
   with zero Next/Vercel/adult fingerprint. Neither competitor does this; both
   leak adult signal (JellyBean in OG tags, littlearabella via the open `/of`
   redirect).
2. **The destination is never in a scraper-reachable response.** littlearabella's
   public `/of` 301 is the canonical anti-pattern — that page gets killed fast.

**One thing competitors do that we don't:** radical simplicity. One creator, one
button, near-zero build cost (no domain-per-creator overhead). Worth noting as a
product tradeoff, not a security one.

---

## How these teardowns were done (repeatable)

For any new competitor page:
1. `web_fetch` the URL → see what's in static HTML (usually just the handle).
2. Open in browser tool, snapshot the rendered DOM → see the real button flow.
3. Click through the gate(s), watch `tabs` / network for the destination.
4. `curl -A "facebookexternalhit/1.1"` and `curl -A "TelegramBot"` → check the
   **scraper view** (the key question: does adult signal / the OF link leak?).
5. `curl -sI` for headers → fingerprint platform (`server`, `x-powered-by`,
   `x-render-origin-server`, asset CDN hostnames) and whether CF is in front.
6. For redirect-style destinations, `curl -sIL` the redirect path with both a
   real-browser UA and a scraper UA to see if the redirect leaks to bots.

---

## hiiii.me (added 2026-09-17)

Teardown of `hiiii.me/itsreyna`. Read from the public gate only — the page puts
Turnstile in front of everything, and no attempt was made to get past it.

**Their architecture is the opposite trade-off to ours.** Every visitor, human
or not, gets a "Just checking" interstitial with Cloudflare Turnstile, then a
`POST /verify` before seeing any link. Nothing automated is ever counted or
served.

| | **CharmLink (ours)** | **hiiii.me** |
|---|---|---|
| Bot exclusion | Layered, after the fact | Turnstile on 100% of visitors |
| Friction for real visitors | None — content immediately | An interstitial every time |
| Crawler view | Full plausible article, 1,991 bytes, zero mentions of the model or OnlyFans | 444-byte empty page, OG tag literally reads "Links from hiiii.me", `noindex,nofollow,noarchive` |
| In-app escape coverage | Meta only (Instagram/Threads) | Meta + Telegram + X `t.co` + SFSafariViewController |
| Escape retry discipline | Once per session (`cl_escape_fired`) | Once, explicitly — "never worth a loop" |

**Where we are genuinely better:** the decoy. Ours serves a complete, credible
article ("Notes on packing light for shoulder-season backpacking"). Theirs
serves an empty page whose own OG description self-identifies as a link page —
that is a stronger signal to a classifier than anything ours emits. And we
don't tax every real visitor with a challenge.

**Where they are genuinely better:** measurement. Their gate makes the entire
class of problem we spent September excavating — 81% bot contamination, zeros
that meant two different things — structurally impossible. The friction is not
paranoia; it is what keeps their denominator honest.

**Their comments are the real find.** The gate's inline JS is heavily commented
with empirical results, and two of them are worth knowing:

- Every third-party browser on iOS is a WKWebView, so `window.webkit.messageHandlers`
  is present in Chrome, Firefox and Edge exactly as in an app's webview. They
  were flagging those as in-app and pushing them to Safari — "about a tenth of
  iOS traffic" — taking people out of the browser they chose. **We do not have
  this bug**: our detection is UA-only (`Instagram`/`threads`/`barcelona`), so
  iOS Chrome is correctly left alone.
- SFSafariViewController (what X bio links and Reddit open) *is* Safari — same
  engine, same cookie jar, byte-identical UA. Escaping it gains nothing. They
  detect it by an absent referrer on iOS and allow exactly one attempt; looping
  cost them 644 sessions that "came back still inside and were shown the page
  again, which cost conversions and protected nothing". We already only fire
  once per session, so this one we had right.

**What it prompted that mattered more than the teardown:** asking why they
handle non-Meta in-app surfaces led to checking ours, which surfaced that 33.7%
of our traffic is the Facebook in-app browser converting at 4.5% against
Instagram's 63.3%. That turned out to be a paid Facebook campaign to
hannazuki.com, not a bug — see the Phase 12 row in the state doc.

**Not adopted:** Turnstile-first. We solved the measurement problem by
filtering instead, and a challenge on cold Instagram traffic would cost more
than the bot noise did.
