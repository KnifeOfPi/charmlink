# Internal build plan — Spotlight template (for the implementing agent)

Read `docs/mockups/SPOTLIGHT-TEMPLATE-TASK.md` (full spec) and study
`docs/mockups/linkme-ref/akirakay-mobile.png` first. This file is the concrete
execution plan and verification checklist. Do everything here, end-to-end.

## Architecture decisions (follow exactly)

1. **Refactor `app/[creator]/CreatorPage.tsx`** so the stateful parent
   `CreatorPage` keeps ALL hooks/state/handlers (premium fetch, age-gate /
   interacted flow, turnstile, IG escape, beacons, navigate/click handlers,
   isBot) and then branches the *presentation* by `creator.template`:
   - Extract the CURRENT return JSX (background, aurora orbs, film grain, IG
     banner, floating icons, stars, avatar, name/tagline, social+premium link
     stacks, footer, honeypot) into a new component `GlassTemplate` that
     receives everything it needs as props (creator, slug, theme, fontFamily,
     isInstagram, interacted, premiumLinks, premiumVisible, turnstileChallenge,
     handleSocialClick, handlePremiumClick, fetchPremiumLinks, plus the derived
     orb/avatar colors). Behavior must be byte-for-byte identical to today.
   - Add `SpotlightTemplate` with the same props contract.
   - `CreatorPage` chooses: `creator.template === "spotlight" ? <SpotlightTemplate .../> : <GlassTemplate .../>`.
   - DO NOT duplicate the premium-fetch/token logic, age-gate, or click
     handlers. They live once in the parent and are passed down.
   - Keep all existing helper components (StarParticles, FloatingIcons,
     AvatarWithBorder, VerifiedBadge, LinkButton, SensitiveWrapper,
     InstagramBrowserBanner, CountdownTimer, LocationPill, ActiveStatus, GLASS,
     buildBackground, ALL_KEYFRAMES, etc.) and reuse them. Splitting into more
     files is fine but not required; a single CreatorPage.tsx with both template
     components is acceptable. If you split files, keep imports clean and tsc
     happy.

2. **Spotlight design** (data-driven; replicate the link.me reference):
   - Warm near-black background derived from creator colors. Base it on
     `theme.bgColor` / `theme.accentColor`: e.g. a vertical gradient from a
     slightly warm-tinted dark (mix accent into near-black) at top to
     `#0E0808`-ish at bottom. Add ONE soft radial glow behind the profile area
     whose color derives from `theme.accentColor` (low opacity, large blur).
     Do NOT hardcode maroon — compute tint from accent.
   - **Full-bleed hero**: if `creator.hero_enabled` and `creator.hero_image_url`,
     render an edge-to-edge hero (~36vh, max ~360px) using next/image (fill,
     object-cover) with a bottom linear-gradient overlay fading to the bg color
     so it dissolves into the page. If no hero image, gracefully fall back to a
     header block using the avatar (no broken layout).
   - **Name + verified + @username** overlapping the hero bottom: name bold
     ~26px off-white centered, `creator.is_verified` -> VerifiedBadge, then
     `@username` (use `creator.username` || slug) muted, centered.
   - Optional tagline line under username (use `creator.tagline`).
   - **Social pills row**: centered horizontal row of ~38px circular buttons
     from `creator.socialLinks`, gap ~10px, using the existing `SocialIcon`
     glyphs. Give brand-style background where the icon implies it (instagram ->
     ig gradient, reddit -> orange, threads/x -> near-black, tiktok -> dark,
     etc.) via a small icon->style map; fall back to a translucent glass circle
     for generic icons. Each pill calls `handleSocialClick(link)` and respects
     sensitive gating exactly like Glass (the parent's handler already does).
   - **Follower count**: if `creator.show_follower_count`, show a centered block:
     big number `creator.follower_count_label` (e.g. "2.6K") + "Total Followers"
     muted + a decorative down chevron (svg). Leave a `followerBreakdown` hook
     (a no-op placeholder/comment) for phase 2; no dropdown needed now.
   - **Featured card** (from `creator.featured_card` jsonb
     `{ image_url, label, link_id?, url?, sensitive? }`): only render if present.
     Large full-width rounded card (radius ~16px), background image via
     next/image, dark bottom gradient, uppercase label bottom-center
     (default "EXCLUSIVE CONTENT" if label empty), a glass link-icon button
     top-left (chain/link svg in a translucent rounded square), and a subtle
     glossy left-edge sheen (a thin diagonal white-gradient overlay; this sheen
     animation must respect prefers-reduced-motion — static if reduced). Click
     behavior: resolve the target link. If `featured_card.link_id` matches a
     premium link id (premiumLinks) or social link id, route through the SAME
     `handlePremiumClick` / `handleSocialClick` / `navigate` path so sensitive
     gating + age-gate interstitial (`/r/[id]`) + redirect + IG handling all
     apply. If only `url` is given, build a synthetic link object
     `{ id, label, url, sensitive: featured_card.sensitive }` and run it through
     the same `handlePremiumClick` path so gating still applies. Never bypass
     the gating.
   - **Thumbnail gallery** (from `creator.gallery_thumbnails` jsonb: array of
     `{ image_url, link_id?, url? }`): only render if non-empty. Horizontal
     scroll row, square thumbs ~100px, radius ~12px, gap ~8px, with
     `overflow-x:auto`, `-webkit-overflow-scrolling:touch`, and rightmost peek
     (so it reads as scrollable). Each thumb resolves its link the same gated
     way as the featured card.
   - **Footer**: reuse the current footer + honeypot from Glass (same markup).
   - Keep the IG banner, IG WebView escape, beacons, and isBot decoy branch
     working — those live in the parent so both templates get them. If the
     existing Glass return has an isBot-specific decoy branch, make sure
     SpotlightTemplate is only reached for non-decoy render exactly as Glass is
     (mirror whatever the current code does for isBot).

3. **prefers-reduced-motion**: glow drift + sheen animation disabled when the
   user prefers reduced motion. Use a CSS `@media (prefers-reduced-motion:
   reduce)` rule inside the keyframes/style block (extend ALL_KEYFRAMES or add a
   scoped style) — do NOT rely on a JS matchMedia read during SSR (hydration
   risk). Any client-random must be client-only mounted (mounted useState +
   useEffect) like StarParticles already is. Spotlight should not introduce new
   Math.random()-at-render; if you need particles, gate behind mounted.

## Data model changes

### Migration
Create `supabase/migrations/<UTC timestamp>_add_spotlight_template.sql`
(timestamp newer than 20260511000000, format YYYYMMDDHHMMSS). Follow the style
of the two existing migration files: header comment, `ADD COLUMN IF NOT EXISTS`,
sensible non-destructive defaults, COMMENTs. Columns on `charmlink_creators`:
- `template` TEXT NOT NULL DEFAULT 'glass'
- `hero_image_url` TEXT
- `hero_enabled` BOOLEAN NOT NULL DEFAULT TRUE
- `username` TEXT
- `show_follower_count` BOOLEAN NOT NULL DEFAULT FALSE
- `follower_count_label` TEXT
- `featured_card` JSONB
- `gallery_thumbnails` JSONB

### lib/types.ts
Add to `Creator`:
- `template?: "glass" | "spotlight"`
- `hero_image_url?: string | null`
- `hero_enabled?: boolean`
- `username?: string | null`
- `show_follower_count?: boolean`
- `follower_count_label?: string | null`
- `featured_card?: { image_url: string; label?: string; link_id?: string; url?: string; sensitive?: boolean } | null`
- `gallery_thumbnails?: Array<{ image_url: string; link_id?: string; url?: string }> | null`

### lib/db.ts
- Add the same 8 fields to `DBCreator` (template: string; hero_image_url: string
  | null; hero_enabled: boolean; username: string | null; show_follower_count:
  boolean; follower_count_label: string | null; featured_card: ... | null;
  gallery_thumbnails: ... | null). For the JSONB ones, type them as the parsed
  object/array or `unknown`/`Record<...>`; node-postgres returns JSONB already
  parsed, so they come back as objects/arrays — type accordingly (e.g. a
  `FeaturedCard | null` and `GalleryThumb[] | null` interface in db.ts or import
  from types).
- Add the same optional fields to `CreateCreatorInput`.
- Add the 8 field names to the `allowed` array in `updateCreator`. For the JSONB
  columns, ensure the value is passed as JSON: node-postgres will serialize a JS
  object to jsonb only if you `JSON.stringify` it OR rely on pg's object->json
  coercion. To be safe and match pg behavior, `JSON.stringify` featured_card /
  gallery_thumbnails before binding (and cast `$n::jsonb` in the SET clause) OR
  pass the object and let pg handle it. Pick the approach that actually works
  with the existing `query` helper — verify by reading lib/db.ts `query`
  signature. The robust path: in updateCreator, special-case the two jsonb keys
  to push `JSON.stringify(value)` and emit `key = $n::jsonb`.
- `createCreator` does not need the new fields in its INSERT (creators are made
  minimally then edited), but it's fine to leave INSERT as-is. Do NOT break it.

### app/[creator]/page.tsx (SSR mapper)
Map the 8 new DBCreator fields into the `creator` object passed to CreatorPage:
- `template: dbCreator.template as "glass" | "spotlight"`
- `hero_image_url`, `hero_enabled`, `username`, `show_follower_count`,
  `follower_count_label`, `featured_card`, `gallery_thumbnails`.
(JSONB fields arrive already parsed.)

### Admin form: app/admin/creators/[id]/page.tsx
- Add the 8 fields to the local `DBCreator` interface in this file.
- Add a **Template** `<select>` (Glass / Spotlight) bound to `form.template`.
- Add a "Spotlight settings" section, shown only when `form.template ===
  "spotlight"`:
  - hero image URL text input (`hero_image_url`)
  - hero enabled toggle (`hero_enabled`)
  - username text input (`username`)
  - show follower count toggle (`show_follower_count`) + follower label text
    input (`follower_count_label`)
  - featured card: image_url, label, and link target (url) inputs — store into
    `form.featured_card` as an object
  - gallery thumbnails: a simple repeater (add/remove rows of image_url + url)
    stored into `form.gallery_thumbnails` as an array
- The existing `handleSave` PUTs `form` as the body; just make sure the new keys
  are included in `form` and thus sent. The API route already passes the body to
  `updateCreator`, which now allows these keys. Match the existing UI components
  used in this file (Label, inputs, Switch/Select if present) — read the file to
  see what's available (it uses shadcn-style `Label`, `<input>`, custom Select).
  Keep styling consistent. Do not break existing fields.
- The admin API route `app/api/admin/creators/[id]/route.ts` already forwards
  the whole body to updateCreator — no change needed unless validation rejects
  unknown keys (it doesn't). Leave it unless required.

## Preservation checklist (must remain true)
- Glass V2 unchanged when template = "glass" (visual + behavior).
- Age-gate interaction flow: premium links lazy-fetch after interacted; age
  confirm via `/r/[id]` interstitial — unchanged, shared by both templates.
- Lazy premium-fetch + HMAC token logic shared (single implementation in
  parent).
- isBot decoy SSR branch preserved.
- All v3 per-link overrides honored (image_url, badge, sensitive, text glow,
  hover animation, border, title color/size, deeplink_enabled, recovery_url,
  redirect_url) — Glass uses LinkButton which already does this. Spotlight reuses
  the same handlers/nav so gating + redirect still apply.
- Theme-driven styling (resolveFontFamily, theme colors).
- Mobile-first 390–440px. prefers-reduced-motion disables glow drift / sheen.
- No hardcoded "OnlyFans"/platform text anywhere new. Destination links from
  data.
- No new heavy deps. CSS/Tailwind + existing libs only.

## Verification (DO ALL, in repo root)
1. `npx tsc --noEmit` -> must be clean (zero errors).
2. `npm run build` -> must succeed.
3. Preview harness:
   - Create `app/clpreview/page.tsx` (NORMAL folder name — Next 16 treats
     `__`-prefixed dirs as private/non-routable). It must render the real
     `CreatorPage` TWICE on one scrollable page (or accept a `?t=glass|spotlight`
     query and render one) with MOCK creators: one `template:"glass"`, one
     `template:"spotlight"`, isBot=false. Use **data-URI SVG** avatars / hero /
     featured / thumbnails so next/image doesn't 500 on unconfigured hosts
     (data: URIs are allowed). Provide mock socialLinks (instagram, reddit,
     threads, x), a mock premium link is not required (premium fetch will just
     no-op against the API in preview — that's fine; the page must still render).
     Wrap the cl-token script if needed, or guard fetch failures (they already
     fail silently). Keep the harness self-contained.
   - Start dev server logging to a file:
     `npm run dev > /tmp/clpreview.log 2>&1 &` then wait for "Ready"/port.
   - Screenshot BOTH at 412px width with headless Chrome:
     `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars --window-size=412,2000 --screenshot=docs/mockups/render/spotlight-mobile.png "http://localhost:<port>/clpreview?t=spotlight"`
     and likewise `glass-mobile.png` with `?t=glass`.
   - Confirm hydration-clean: `grep -ic hydrat /tmp/clpreview.log` MUST be `0`.
     If non-zero, FIX the cause (client-random not mounted, SSR/CSR mismatch)
     and re-verify until it's 0.
   - Save both PNGs under `docs/mockups/render/`.
4. **DELETE** `app/clpreview/` entirely before finishing. Stop the dev server.
5. Re-run `npx tsc --noEmit` after deleting the harness to confirm still clean.

## Delivery
- You are already on branch `feat/spotlight-template`.
- Commit: migration + code (types, db, page mapper, CreatorPage refactor + both
  templates, admin form) + the two verification screenshots +
  docs/mockups/SPOTLIGHT-TEMPLATE-TASK.md + docs/mockups/linkme-ref/ + this plan.
  Do NOT commit app/clpreview/ (it's deleted) or /tmp logs.
- Use a clear conventional commit message, e.g.
  `feat(charmlink): add selectable spotlight (link.me-style) creator template`.
- Push and open a PR against `main` with `gh pr create` (title + body describing
  the template, fields, migration, preserved behaviors, and the two
  screenshots). DO NOT merge or deploy to production.
- Print at the end: branch name, PR URL, migration filename, tsc result, build
  result, both screenshot paths, and the hydration grep count (must be 0).
