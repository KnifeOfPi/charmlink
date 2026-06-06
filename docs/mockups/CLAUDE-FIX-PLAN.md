# Fix plan — Spotlight overflow + trustworthy harness re-verify

PR #13 review found a REAL CSS containment bug in the SpotlightTemplate plus a
harness that renders placeholders (untrustworthy screenshots). Fix both.

## REAL BUG (must fix): right-edge overflow / left-anchored body
Symptom: in the spotlight render, the header/profile block (name, username,
social pills, follower count) is centered, but the featured "EXCLUSIVE CONTENT"
card, the thumbnail gallery, and the premium "Loading…" pill bleed off the right
edge. Center-header-vs-left-anchored-body mismatch = real CSS containment bug.

Root cause: spotlight sections do NOT share one consistent horizontal padding /
containment wrapper. The profile section uses paddingLeft/Right:18; the full-bleed
hero is width:100% edge-to-edge; the featured card, gallery, and premium link
stack handle their own padding inconsistently (gallery uses overflowX:auto with
paddingRight:18 and no matching left treatment, etc.). The net effect is the
body sections aren't uniformly contained within the maxWidth:440 column.

### Required fix (SpotlightTemplate in app/[creator]/CreatorPage.tsx)
- Keep the hero full-bleed (edge-to-edge, width:100% of the maxWidth:440 column,
  no side padding) — that's intentional.
- For EVERYTHING below the hero (name/username/pills/follower block, featured
  card, gallery, premium link stack, footer), wrap them in ONE shared content
  wrapper that applies a single consistent horizontal padding (e.g. one
  `<div style={{ width:"100%", paddingLeft:18, paddingRight:18, boxSizing:"border-box" }}>`),
  and remove the per-section ad-hoc paddingLeft/paddingRight so nothing
  double-pads or escapes. Use `boxSizing:"border-box"` on the padded wrapper so
  the 18px padding does not push children past 100% width.
- The horizontal-scroll GALLERY is the one exception: it must visually "peek"
  past the right edge to imply scroll, but it must NOT cause the PAGE itself to
  scroll horizontally. Implement it so the gallery row scrolls internally
  (`overflowX:auto`) while staying inside the page's horizontal bounds. The
  clean pattern: gallery lives inside the shared padded wrapper; to get the
  right-edge peek without page overflow, give the scroll row a right padding and
  let the inner thumbnails overflow into the scroll area — but the row's own box
  must be width:100% and contained (no negative right margin that exceeds the
  viewport). If you use a negative-margin bleed for the gallery, it must be
  symmetric or clipped so the PAGE has zero horizontal scrollbar at 390/412/440.
- Ensure the featured card, premium link stack ("Loading…" pill included), and
  footer are all width:100% INSIDE the shared padded wrapper and never wider
  than it. The Loading pill / premium links container must obey the same wrapper.
- Add `overflowX: "hidden"` defensively on the spotlight `<main>` (or the
  maxWidth:440 column) so any sub-pixel bleed can't create a page-level
  horizontal scrollbar — but the real fix is consistent containment, not just
  masking. Do BOTH: fix containment AND guard with overflowX hidden on the page
  column.
- Do NOT change GlassTemplate.

### Acceptance for the bug
At 390px, 412px, and 440px viewport widths: NO horizontal scrollbar on the page
(document.documentElement.scrollWidth <= clientWidth), header and body sections
share the same left/right margins (uniformly centered/contained), only the
gallery row scrolls horizontally.

## HARNESS (fix so screenshots are trustworthy — NOT prod)
Recreate `app/clpreview/page.tsx` (normal folder name; delete again after). The
mock SPOTLIGHT creator must use REAL data-URI images so the design is visible:
- `hero_image_url`: a data-URI SVG (e.g. a tall gradient rectangle with a subtle
  figure/shape) so the hero shows a real fading photo-like image.
- `featured_card.image_url`: a data-URI SVG (rich gradient) so the EXCLUSIVE
  CONTENT card shows a real image, plus `label:"EXCLUSIVE CONTENT"` and a `url`.
- `gallery_thumbnails`: 4–5 entries each with a distinct data-URI SVG image and a
  `url`, so the gallery shows real thumbnails (not empty gradients).
- Social links: instagram, x, tiktok, reddit (real-ish data, icons resolve).
- Seed PREMIUM data so the "Loading…" pill RESOLVES into rendered premium links.
  Two options — pick the one that works cleanly:
    (a) Render CreatorPage with mock premium links already populated by passing a
        prop / preview flag that skips the API fetch and sets `interacted=true` +
        `premiumLinks=[...mock]` directly, OR
    (b) Add a tiny preview-only branch in the harness that stubs
        `/api/links/[creator]` — harder. Prefer (a): the cleanest is to have the
        harness pass mock premium links and have CreatorPage accept an optional
        `previewPremiumLinks` prop (preview-only, defaulting undefined) that, when
        set, seeds state and marks interacted so the Loading pill resolves. Keep
        this prop OUT of the prod path semantics (default undefined → unchanged
        behavior). If you add such a prop, make sure it does NOT alter prod
        behavior and tsc stays clean.
  The mock premium links should include at least one featured premium link so the
  premium section renders real content, not a spinner.
- Mock GLASS creator: also give it real data-URI avatar + a couple social links
  so its capture is clean too (it already renders fine; just ensure no spinner
  dominates — seeding premium for it too is fine).
- Harness should accept `?t=spotlight` or `?t=glass` and render ONE creator only
  (so each capture is a single creator, not stacked).

## RE-VERIFY (do all)
1. `npx tsc --noEmit` clean.
2. `npm run build` succeeds.
3. Dev server -> `npm run dev > /tmp/clpreview.log 2>&1 &`, wait for ready/port.
4. Capture SEPARATELY (one creator per capture), at THREE widths each, headless
   Chrome `--hide-scrollbars` OFF for the overflow check is wrong — instead
   verify overflow programmatically. Do this:
   - For spotlight at widths 390, 412, 440: load
     `http://localhost:<port>/clpreview?t=spotlight`, and use headless Chrome to
     evaluate document horizontal overflow. Easiest robust approach: run a tiny
     node/puppeteer-free check via Chrome's `--dump-dom` is insufficient; instead
     use this method — take a screenshot at each width AND separately confirm no
     horizontal overflow by loading the page with Chrome and reading
     scrollWidth. If puppeteer/playwright isn't installed, use a headless Chrome
     `--virtual-time-budget` screenshot at each width and ALSO add a temporary
     inline script in the harness that sets `document.title` to
     `OVERFLOW:${document.documentElement.scrollWidth>document.documentElement.clientWidth}`
     after load, then read it via `--dump-dom | grep -o 'OVERFLOW:[a-z]*'`. The
     check MUST report `OVERFLOW:false` at 390, 412, and 440 for spotlight.
   - Save the trustworthy screenshots (412px, real content) to:
     `docs/mockups/render/spotlight-mobile.png` (overwrite) and
     `docs/mockups/render/glass-mobile.png` (overwrite). One creator per image.
   - Confirm `grep -ic hydrat /tmp/clpreview.log` == 0.
5. DELETE `app/clpreview/` and stop the dev server.
6. Re-run `npx tsc --noEmit` after deletion — still clean.

## DELIVERY
- Stay on branch `feat/spotlight-template`. Commit the fix + overwritten
  screenshots + this fix plan. Push (PR #13 updates automatically). Do NOT merge
  or deploy.
- Print at end: TSC RESULT, BUILD RESULT, OVERFLOW CHECK results at 390/412/440
  (must all be false), HYDRATION COUNT (0), and the two screenshot paths.
