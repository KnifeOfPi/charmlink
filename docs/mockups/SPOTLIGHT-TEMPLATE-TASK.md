# Task: "Spotlight" template (link.me clone) — selectable per-creator template

## Goal
Add a SECOND, selectable landing-page template called **"spotlight"** modeled on
link.me (reference render: `docs/mockups/linkme-ref/akirakay-mobile.png`).
Creators pick their template in admin: existing design = `"glass"` (current V2),
new design = `"spotlight"`. Everything must be **data-driven per creator** — no
hardcoded content. The current Glass V2 template must keep working unchanged.

## Reference design (link.me/akirakay) — replicate these moves
1. **Full-bleed hero photo** at top, edge-to-edge, ~33% viewport height, that
   **dissolves into the dark background** via a bottom gradient overlay. Name +
   username overlap the lower edge of the hero.
2. **Warm near-black background** (`#1A0E0E → #0E0808`) with a **soft radial glow**
   behind the profile area. The warm tint + glow color must DERIVE from the
   creator's `accentColor`/bg colors so each creator looks distinct (don't
   hardcode maroon).
3. **Name** (bold ~26px off-white) + optional **verified badge** + **@username**
   (muted) centered, overlapping hero bottom.
4. **Circular gradient social pills** row — centered, ~38px circles, gap ~10px.
   Use existing `socialLinks` (icon-driven). Keep brand-style coloring where the
   icon implies it (instagram gradient, reddit orange, etc.) but fall back to a
   glass circle for generic icons.
5. **Follower count** display: big "2.6K" + "Total Followers" + a chevron.
   Data-driven via new fields (see schema). Chevron can be decorative for now
   (no dropdown required in phase 1) but leave a `followerBreakdown` hook.
6. **Featured card** ("EXCLUSIVE CONTENT"): large full-width rounded card
   (radius ~16px) with a **background image**, dark bottom gradient, uppercase
   label bottom-center, a **glass link-icon button top-left**, and a subtle
   glossy left-edge sheen. Click → its link (respect existing link nav/redirect
   + sensitive gating + age-gate interaction flow).
7. **Scrollable thumbnail gallery**: horizontal scroll row of square thumbnails
   (radius ~12px, ~100px, gap ~8px), rightmost peek-cut to imply scroll. Each
   thumbnail is {image, link}.
8. **Footer**: muted "Privacy Policy | Terms | Report" style row already exists —
   keep current footer behavior.

## Must preserve (do NOT break)
- All existing Glass V2 behavior when `template = "glass"`.
- Age-gate interaction flow (premium links lazy-fetch after `interacted`; age
  confirm on interaction — unchanged).
- `isBot` decoy SSR branch.
- All v3 per-link overrides (image_url, badge, sensitive, text glow, hover
  animation, border, title color/size, deeplink_enabled, recovery_url,
  redirect_url).
- Theme-driven styling (theme colors, font via resolveFontFamily, etc.).
- Mobile-first 390–440px. `prefers-reduced-motion` disables glow drift / sheen.
- No hardcoded "OnlyFans"/platform text. Destination links come from data.
- No new heavy deps. CSS/Tailwind + existing libs.

## Data model (new per-creator fields)
Add to `Creator` type (lib/types.ts), `DBCreator` (lib/db.ts), the DB column set,
the SELECT/INSERT/UPDATE mappers, AND the admin creator form
(app/admin/creators/[id]/page.tsx + its API route):

- `template`: `"glass" | "spotlight"` (default `"glass"`)
- `hero_image_url`: string | null  (full-bleed hero photo for spotlight)
- `hero_enabled`: boolean (default true when spotlight + hero_image_url set)
- `username`: string | null  (the @handle shown under name; falls back to slug)
- `show_follower_count`: boolean
- `follower_count_label`: string | null (e.g. "2.6K")  — manual for phase 1
- `featured_card`: jsonb | null → `{ image_url, label, link_id? , url? , sensitive? }`
- `gallery_thumbnails`: jsonb | null → array of `{ image_url, link_id?, url? }`

Use a Supabase migration in `supabase/migrations/` (timestamped, follow the
existing two files' style: `ADD COLUMN IF NOT EXISTS`, sensible defaults, no
destructive ops). JSONB for featured_card + gallery_thumbnails.

## Implementation shape
- Split presentation: keep current `CreatorPage.tsx` logic, but render template
  by branch. Cleanest: extract `GlassTemplate` (current body) and add
  `SpotlightTemplate`, with `CreatorPage` choosing based on `creator.template`.
  Shared hooks/state (premium fetch, age-gate, nav) stay in the parent and pass
  down as props/render-prop so BOTH templates reuse the exact same data flow and
  anti-scraping gating. Do not duplicate the premium-fetch/token logic.
- Admin form: add a Template dropdown + the spotlight-only fields (hero image
  URL, username, follower toggle+label, featured card image/label/link, gallery
  thumbnail repeater). Gate spotlight fields behind template === spotlight.

## Verification (required before reporting done)
1. `npx tsc --noEmit` clean.
2. `npm run build` succeeds.
3. Render BOTH templates with a local preview harness route (use a NON-private
   folder name — Next 16 treats `__`-prefixed dirs as private/non-routable;
   `app/clpreview/` worked). Mock both `template:"glass"` and
   `template:"spotlight"` creators. Capture mobile-width (412px) screenshots via
   headless Chrome and CONFIRM NO hydration mismatch in the dev log (the
   StarParticles Math.random() bug pattern — any client-random must be
   client-only mounted).
4. DELETE the preview harness route before finishing (do not ship it).
5. Report: what changed, the migration filename, confirmation each preserved
   behavior still works, screenshots saved under docs/mockups/render/, and
   tsc/build results.

## Branch / delivery
- Work on a feature branch `feat/spotlight-template`, commit cleanly, open a PR
  against main. DO NOT auto-deploy to production — Cepheus/Nate will review the
  PR + screenshots first, then merge.
- Keep the diff focused. Screenshots + this task file may be committed.
