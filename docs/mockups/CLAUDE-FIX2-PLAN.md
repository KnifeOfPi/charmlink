# Fix plan v2 — MEASURE the exact overflowing spotlight element, then fix it

Context: PR #13 branch feat/spotlight-template. A prior pass already added
boxSizing:border-box to the profile div + overflowX guard + gallery width (commit
a129937), AND a viewport meta was added to app/layout.tsx (commit e5acc65).
DESPITE both, mobile-emulated captures still show the featured "EXCLUSIVE
CONTENT" card, premium link buttons (Subscribe/Custom content), and the
thumbnail gallery bleeding off the RIGHT edge — left gutter present, right gutter
ZERO (asymmetric). globals.css already has `* { box-sizing: border-box }`. So the
earlier guesses were NOT the full fix.

DO NOT GUESS. MEASURE. Enumerate the exact element(s) whose
getBoundingClientRect().right exceeds the viewport width under MOBILE EMULATION,
then fix those specific elements.

## Step 1 — Build a measurement harness
Create `app/clpreview/page.tsx` (normal folder; delete after). It must:
- Render the real `CreatorPage` for ONE mock creator chosen by `?t=spotlight` or
  `?t=glass`.
- Mock SPOTLIGHT creator with REAL data-URI SVG images: hero_image_url,
  featured_card {image_url(data-uri svg), label:"EXCLUSIVE CONTENT", url},
  gallery_thumbnails (4–5 data-uri svg thumbs each with url), socialLinks
  (instagram, x, tiktok, reddit), username, show_follower_count:true,
  follower_count_label:"2.6K". Seed premium via the existing `previewPremiumLinks`
  prop (CreatorPage already accepts it) with 2–3 mock premium links (e.g.
  "Subscribe", "Custom content") so the premium buttons render real content (no
  "Loading…").
- Mock GLASS creator similarly with real data-URI avatar + social links + a
  couple seeded premium links.
- Include a small client-only measurement script (useEffect, mounted) that, after
  layout, computes overflow and writes results to the DOM so headless Chrome
  --dump-dom can read them. Specifically:
  - Set `document.title` to `OVERFLOW:${root.scrollWidth>root.clientWidth}` where
    root = document.documentElement.
  - ALSO build a list of the worst offenders: walk all elements, compute
    `el.getBoundingClientRect().right`, and collect those whose right >
    window.innerWidth + 0.5. For the top ~12 offenders (sorted by right desc),
    emit a line with a stable description: tagName, className (if any), a short
    text snippet, and the right value + innerWidth. Render this list into a
    `<pre id="cl-overflow-report">` element fixed off-screen but present in DOM so
    `--dump-dom | sed -n` can extract it. Each line e.g.
    `OFFENDER tag=BUTTON cls= rect.right=431.5 vw=412 text="EXCLUSIVE CONTENT"`.

## Step 2 — Measure under MOBILE emulation
Boot dev server logging to /tmp/clpreview.log. Then for spotlight at widths 390,
412, 440, capture the page UNDER MOBILE EMULATION (not just a narrow window).
Use headless Chrome with device-metrics override. Robust approach without
puppeteer: prefer Chrome's `--headless=new` with
`--window-size=W,2200` AND emulate mobile by appending an iPhone user-agent and a
mobile viewport — but window-size alone (with the viewport meta now present)
should already give a real CSS px viewport == W. To be certain it matches what
Nate saw (mobile:true, DPR2), if Playwright or Puppeteer is available in
node_modules use it to setViewport({width:W, isMobile:true, deviceScaleFactor:2})
and read document.documentElement.scrollWidth/clientWidth + enumerate offenders
directly via page.evaluate (cleaner than --dump-dom). Check:
  `ls node_modules/.bin | grep -i -E "playwright|puppeteer"` and
  `node -e "require('puppeteer')" 2>/dev/null && echo HAVE_PUP`.
If puppeteer/playwright present, write a tiny node script that:
  - launches headless, for each width sets a mobile viewport, goes to the
    spotlight URL, waits for network idle + the measurement effect, then
    page.evaluate returns {scrollWidth, clientWidth, offenders:[...top 12 by
    rect.right...]}. Print JSON per width.
If neither is installed, do NOT npm-install heavy deps; fall back to the
--dump-dom title+pre approach above at each width.

REPORT the offenders list for 412px specifically (and 390/440 overflow booleans).

## Step 3 — Fix the SPECIFIC offending elements
From the measurement, fix the exact elements whose right exceeds innerWidth.
Likely root causes to check IN THE MEASURED ELEMENTS (do not blanket-apply):
- A flex child that won't shrink: needs `minWidth: 0` (very common with text/img
  inside flex rows — the premium LinkButton row, the featured card label row, or
  the social pills row).
- An element with an explicit pixel width/min-width wider than its padded
  container (e.g. a 100px thumb is fine, but a row with fixed width or a button
  with width larger than container).
- A negative margin (gallery bleed) exceeding the container.
- A `100vw` or `width:100%` element that sits OUTSIDE the padded wrapper so its
  100% resolves to the full column (476px) instead of the padded content width.
  THIS IS THE PRIME SUSPECT: if the featured card / premium stack / gallery are
  NOT actually inside the same padded wrapper as the header, their width:100%
  resolves to the unpadded 440 column and they get only the LEFT pad via some
  ancestor but no right pad — producing exactly the "left gutter, zero right
  gutter" asymmetry Nate described. CONFIRM whether featured card, premium link
  stack, and gallery are INSIDE the paddingLeft/Right:18 boxSizing:border-box
  wrapper. If any are siblings of that wrapper (not children), MOVE them inside
  it so they share the identical horizontal padding. This is the most likely real
  fix.
- The premium link buttons (Subscribe/Custom content) come from the SHARED
  LinkButton component rendered in the spotlight premium section — ensure that
  whole premium container is inside the padded wrapper too.
Apply the minimal targeted fix to the measured offenders. Re-measure until
OVERFLOW:false and offenders list is EMPTY at 390/412/440. Gutters must be
symmetric; only the gallery row scrolls internally.

Do NOT modify GlassTemplate layout structure (Nate noted glass link rows also
showed it pre-viewport-fix; re-measure glass too and if glass still overflows
after the viewport fix, the SAME containment fix likely applies — but verify by
measurement; prefer not to restructure glass unless measurement proves it
overflows).

## Step 4 — Re-verify + recapture (trustworthy, real content)
- `npx tsc --noEmit` clean; `npm run build` succeeds.
- Mobile-emulated overflow check spotlight 390/412/440 => scrollWidth ===
  clientWidth (OVERFLOW:false, offenders empty).
- Also measure glass at 412 => OVERFLOW:false.
- `grep -ic hydrat /tmp/clpreview.log` == 0.
- Recapture REAL-content screenshots (no "Loading…", no placeholder text):
  overwrite docs/mockups/render/spotlight-mobile.png and
  docs/mockups/render/glass-mobile.png, ONE creator per image, 412px mobile.
- DELETE app/clpreview/ and stop dev server. Re-run tsc clean.

## Delivery
Stay on branch feat/spotlight-template. Commit the targeted fix + recaptured
screenshots + this plan. Push (updates PR #13). DO NOT merge/deploy.
Print at end: the EXACT offending element(s) identified by measurement + the
specific fix applied, TSC, BUILD, overflow booleans at 390/412/440 (spotlight)
and 412 (glass), hydration count, and the two screenshot paths.

## Measurement results (this pass — 2026-06-06)

**Method:** Custom Node.js CDP client (no puppeteer/playwright), mobile emulation
via `Emulation.setDeviceMetricsOverride` (width, isMobile:true, deviceScaleFactor:2).

**Spotlight @ 390px:** scrollWidth=390 clientWidth=390 innerWidth=390 → OVERFLOW=false  
Offenders: BUTTON right=442, IMG right=442 (4th gallery thumbnail inside overflowX:auto scroll container — properly clipped, not a real overflow)

**Spotlight @ 412px:** scrollWidth=412 clientWidth=412 innerWidth=412 → OVERFLOW=false  
Offenders: same gallery thumb (right=442), properly contained

**Spotlight @ 440px:** scrollWidth=440 clientWidth=440 innerWidth=440 → OVERFLOW=false  
Offenders: same gallery thumb (right=442), properly contained

**Glass @ 412px:** scrollWidth=412 clientWidth=412 innerWidth=412 → OVERFLOW=false  
Offenders: DIV right=504.5, DIV right=483.5 — aurora orb divs (position:fixed, animated drift, clipped by overflow:hidden parent — intentional)

**Conclusion:** The overflow bug was fully fixed by commits a129937 + e5acc65.  
- Featured card, premium links, and gallery thumbnails ARE inside the padded profile div (paddingLeft:18, paddingRight:18, boxSizing:border-box). Prime-suspect hypothesis (siblings vs children) did not apply.  
- No code changes needed. Screenshots recaptured with real content, no "Loading..." text.
