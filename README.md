# CharmLink

Instagram-safe landing page system for OnlyFans and Fanvue creators. One deployment serves unlimited creators, each with their own custom domain — all managed from a single admin dashboard.

## Why CharmLink?

Instagram actively detects and bans accounts that link to adult content platforms. Their crawler follows bio links, reads destination pages, and flags accounts linking to OnlyFans, Fansly, Fanvue, and similar platforms. Even link-in-bio tools like Linktree and AllMyLinks get flagged because IG crawls through them to the final destination.

CharmLink solves this by serving **completely clean pages** to bots while showing premium links only to real human visitors through client-side JavaScript that crawlers can't execute.

## How It Works

### Bot Evasion (Multi-Layer)

1. **Server-side bot detection** — Middleware identifies known crawlers (`facebookexternalhit`, `Facebot`, `Twitterbot`, `Googlebot`, `bingbot`, `Bytespider`, and others) via User-Agent matching. Bots receive a clean page with only social media links — no premium/adult content links ever appear in server-rendered HTML.

2. **Client-side-only premium links** — Premium links (OnlyFans, Fanvue, etc.) are never in the page source. They're fetched via a separate API call (`POST /api/links/[creator]`) that also filters bots, then injected into the DOM via React state.

3. **HMAC-locked links API** — Premium links load automatically on mount via `POST /api/links/[creator]`, but the request must carry a server-minted HMAC token (bound to slug + a 5-minute time bucket + age-confirmation state) plus a matching `Origin`/`Sec-Fetch-Site`. Any check that fails gets an empty `{ links: [] }` payload instead of an error, so scraping the endpoint directly never reveals real links. The token is deliberately **not** bound to the client IP — see the note in [Security Considerations](#security-considerations) about why that used to reject real visitors.

4. **Per-link age gate** — Sensitive links (not the whole page) route through a `/r/[linkId]` interstitial. The real destination URL is never rendered until the visitor confirms 18+, which sets a server-side `cl_age` cookie; non-sensitive links redirect immediately with no friction.

5. **Honeypot link** — An invisible, `aria-hidden`, non-tabbable link in the DOM (`/api/honeypot`) that a real visitor cannot see or reach by keyboard, so only something crawling the raw HTML would ever follow it. A hit bans the caller's IP for 24h **only when the request itself looks automated** (empty/bot User-Agent, or no `Sec-Fetch-*`/HTML `Accept`) — plain hits are still logged for monitoring either way. See [Security Considerations](#security-considerations) for why that gate exists.

6. **Rate limiting** — The premium links API limits requests to 30/minute per IP. Over-limit and rejected requests receive the same empty `{ links: [] }` payload as a failed auth check — no error messages, and nothing left to tap, that would tip off a bot or trap a human.

7. **Clean OG meta tags** — `<meta>` tags contain only the creator's name and clean tagline — no NSFW keywords, no adult platform references. Metadata stays generic until the visitor's `cl_age` cookie is set, and always stays generic for link-preview scrapers.

8. **Fingerprint-free decoy pages** — Confirmed scrapers and link-preview bots (`facebookexternalhit`, Telegram, Discord, Slack, WhatsApp, etc.) hitting a creator's root path get an inline, per-creator-themed "wholesome blog" HTML response from middleware — zero Next.js/Vercel/CharmLink fingerprints in the markup or headers. Toggleable per creator via a `cloak_enabled` flag; fails open to normal rendering if the lookup fails, so a DB hiccup never breaks a real visitor.

### Custom Domain Routing

Each creator can have their own custom domain (e.g., `hollyxo.com`). All domains point to the same single Vercel deployment. The middleware reads the incoming hostname, looks up which creator is mapped to that domain in the database, and serves their page.

Domain-to-creator mapping is cached in-memory with a 5-minute TTL for performance.

### Instagram In-App Browser Breakout

Instagram's WebView can't launch the system browser via any documented API — `x-safari-https://` was killed by Apple in iOS 14.5 and never replaced, and `window.open`/`window.location.href` to a `https://` URL just stays inside the WebView on every in-app browser (IG, FB, TikTok, LinkedIn). CharmLink combines an automatic attempt with a manual fallback:

- **On page load** — fires `instagram://extbrowser/?url=<current>` once per Instagram session (undocumented, but triggers IG's native "Open in External Browser" handoff on iOS). This is what surfaces the OS-level "this webpage is trying to open [App]" confirmation some visitors see — that dialog is the platform's own gate on custom-scheme handoffs, not something CharmLink can suppress from web code.
- **Banner, user-initiated** — a hot-pink banner offers a manual escape: **Android** uses `intent://…#Intent;scheme=https;package=com.android.chrome;end` to open Chrome directly; **iOS** copies the URL to the clipboard with instructions to paste into Safari, since no scheme reliably launches it. Per-link clicks add an Android-only `intent://` attempt (with a 500ms fallback to normal navigation) — there is deliberately no iOS branch here.

## v2 Features — Link Intelligence

### Link Enhancements
- **Subtitles** — Optional secondary text shown below the link label
- **Badges** — Visual pills: 🟢 New, 🟠 Popular, 🟣 Exclusive
- **Sensitive Content** — Blur overlay with "Click to reveal" — per-link or creator-wide default
- **Image Button Links** — Wide card style with full-bleed background image and title overlay
- **Deeplinking** — Platform-specific app deep links (OnlyFans, Instagram, TikTok, Twitter/X) with fallback URL
- **Redirect Control** — Route clicks through `/api/redirect/[linkId]` for tracking + redirect chain control
- **Admin-only fields** — Internal notes and comma-separated tags (not shown on public page)
- **Active Status** — Pulsing green dot with randomized "Responds in ~Xs" (30s–90s) for social proof

### Creator Enhancements
- **Location Display** — "Visiting from City, Country" banner pulled from IP geolocation (ipapi.co)
- **Sensitive Default** — Creator-level toggle to mark all links as sensitive by default

### Database
- New columns on `charmlink_links`: `subtitle`, `image_url`, `deeplink_enabled`, `recovery_url`, `redirect_url`, `sensitive`, `badge`, `notes`, `tags`
- New columns on `charmlink_creators`: `show_location`, `location_type`, `sensitive_default`
- Run `npx tsx scripts/migrate-v2.ts` to apply to existing databases

## v3 Features — Visual Design System

### UI Framework
- **shadcn/ui** — 13 pre-built components (Button, Input, Select, Switch, Label, Dialog, Tabs, Badge, Card, Separator, Popover, DropdownMenu, Tooltip) for a polished admin experience

### Background Effects
- **Gradient Backgrounds** — Solid, linear gradient, or radial gradient with 2–3 configurable color stops and direction control
- **Floating Icons** — Animated floating emoji particles (configurable emoji, count, speed) using CSS `@keyframes floatUp`
- **Star Particles** — Twinkling dot overlay with configurable count, size (1–3px), and color using `@keyframes twinkle`

### Avatar & Identity
- **Gradient Border** — Spinning conic-gradient avatar border with 3 configurable colors and `@keyframes gradientSpin` animation. Also supports solid color or no border.
- **Polished Online Dot** — 4-layer green status indicator: solid circle + ping animation + blur pulse + white border ring
- **Verified Badge** — Blue checkmark SVG (Twitter-style) next to creator name, toggled per creator

### Typography & Fonts
- **Google Fonts** — 6 font options per creator: Inter, Poppins, Playfair Display, Roboto, Montserrat, Dancing Script. Loaded dynamically via Google Fonts CDN.

### Location
- **Location Pill** — Styled rounded pill with map pin SVG icon, positioned above the avatar. Custom background color configurable per creator.

### Link Visual Effects
- **16:9 Image Cards** — Image button links use proper 16:9 aspect ratio (`pt-[56.25%]`), `bg-cover bg-center`, hover zoom (`group-hover:scale-105`), dark overlay, and title at bottom center
- **Text Glow** — Per-link `text-shadow` glow effect with configurable color and intensity (1–10 scale)
- **Hover Animations** — Per-link hover effects: `pulse` (scale), `bounce`, `shake` (horizontal), `glow` (box-shadow)
- **Custom Border** — Per-link border toggle with custom color
- **Title Color Override** — Per-link custom title color
- **Font Size Control** — Per-link title font size (sm, base, lg, xl)

### Countdown Timer
- Triggered via special `countdown:ISO_DATE` URL format
- Displays live countdown in styled day/hour/min/sec boxes
- For launches, drops, and limited-time promotions

### Admin Dashboard (rebuilt with shadcn/ui)
- **5-tab layout**: Profile, Theme, Effects, Avatar, Misc
- **Profile tab**: Name, tagline, slug, avatar URL, custom domain + Vercel integration, active/sensitive toggles
- **Theme tab**: Background type selector, 3 color pickers, gradient type/direction controls
- **Effects tab**: Floating icons toggle + emoji/count/speed config, star particles toggle + count/color
- **Avatar tab**: Border style selector, 3 gradient color pickers, verified badge toggle
- **Misc tab**: Font family selector, location toggle + type + pill color
- **Link editor**: All v3 visual fields behind expandable "✨ Visual options" section

### Database
- 19 new columns on `charmlink_creators`: `bg_type`, `bg_gradient_type`, `bg_gradient_direction`, `bg_color_2`, `bg_color_3`, `show_floating_icons`, `floating_icon`, `floating_icon_count`, `show_stars`, `stars_count`, `stars_color`, `animation_speed`, `avatar_border_style`, `avatar_border_color_1/2/3`, `is_verified`, `font`, `location_pill_color`
- 8 new columns on `charmlink_links`: `show_text_glow`, `text_glow_color`, `text_glow_intensity`, `hover_animation`, `border_color`, `show_border`, `title_color`, `title_font_size`
- Run `npx tsx scripts/migrate-v3.ts` to apply to existing databases

## v4 Features — V2 Glass Reskin (live)

The public `CreatorPage` is reskinned to a **dark glassmorphism** design (mockup ref:
`docs/mockups/`). This is a pure visual port — **all functional behavior is preserved**
(per-link age gate, countdown, location pill, per-link v3 overrides, theme-driven
styling, bot decoy path, on-mount premium-link fetch).

- **Aurora background** — animated gradient ring derived from the creator's accent/bg
  colors (`auroraSpinRing` / `auroraSpinRingRev` keyframes).
- **Glass link cards** — frosted `backdrop-blur` cards with subtle borders/glow, driven
  by a shared `GLASS` design-token set.
- **Glow avatar** — luminous avatar treatment layered over the aurora.
- **Glass sensitive modal** — "Click to reveal" sensitive overlay restyled as a glass modal.
- **Hydration fix** — `StarParticles` no longer calls `Math.random()` at render (was an
  SSR/client hydration mismatch logging a console error every load); now client-only mounted.

### Admin quality-of-life
- **Copy / Open buttons** — one-click copy + open for creator slug URL and custom domain
  in the creator list (`app/admin/CopyButton.tsx`).
- **Full domain pagination** — `lib/vercel-domains.ts` `listDomains` now paginates so the
  admin domains view returns **all** domains, not just the first page.
- **Mobile fix** — `width=device-width` viewport meta added (fixes desktop-width fallback /
  right-edge overflow on mobile).

### Infra
- **Serverless PG pool cap** — Postgres pool `max=3` with the Supabase transaction pooler
  (`:6543`) to survive Vercel serverless fan-out without exhausting connections.

### Domain health & cursor fixes
- **Server-side domain health probe** — the admin domains list used to probe each row with a
  browser-side `fetch()`, which threw on cross-origin policy errors and falsely flagged
  **every** domain as "SSL broken." Health is now probed server-side in
  `/api/admin/domains/status` (Node runtime), so only real 525/TLS/network failures flag
  broken. Single-domain Refresh + post-Heal re-checks route through the server too.
- **Pointer cursor everywhere** — a global `globals.css` rule applies `cursor: pointer` to all
  interactive elements (`button`, `a[href]`, `[role=button]`, tabs/menu items, `select`,
  `summary`, `label[for]`, `.cursor-pointer`) and `cursor: not-allowed` to disabled/`aria-disabled`
  elements. Covers both the admin dashboard and the public CreatorPage.

### Conversion-funnel fixes (2026-08-26, latest)
Found while investigating a "clicks are up, subs aren't" report. Measured against
production: **12.6% of all recorded premium clicks** were taps on a dead link the
links API used to hand out on rejection, which then banned the visitor's IP for
24h — 86.6% of those bans hit ordinary mobile browsers, not bots.
- **Rejection payload is inert** — `POST /api/links/[creator]` now returns
  `{ links: [] }` on any failed check instead of a followable honeypot link.
- **Link token no longer bound to client IP** — the IP a page renders with and
  the IP its links-fetch arrives from routinely differ on mobile (carrier NAT,
  WiFi/cellular handoff), and every mismatch used to trigger the ban above.
  Old tokens still verify for a grace window so open pages don't break on deploy.
- **Honeypot bans selectively** — only when the hit itself looks automated
  (empty/bot UA, or missing both `Sec-Fetch-*` and an HTML `Accept`), not on
  every visit.
- **Blocked Visitors card** (`/admin/dashboard`) — count + one-click flush for
  the ban backlog the old behavior left behind, since fixing the honeypot
  doesn't retroactively un-ban anyone.
- **Click counting deduplicated**, **`is_bot` resolved server-side** instead of
  hardcoded `false`, and **creator-page 404s no longer logged as database
  errors** — three analytics-correctness bugs found along the way.
- **Dead `x-safari-https://` scheme removed** from the per-link click handler
  (Apple killed it in iOS 14.5; it was only adding a 500ms stall).

## v5 Features — Model Grouping & Avatar A/B Testing (live)

A creator row was really a *site* (slug + domain), not a person — a model
running several domains (common: IG bans one, she opens another) showed up as
that many disconnected rows, each needing its own avatar upload, its own theme
edits, and its own analytics card added up by hand.

### Model grouping
- **`charmlink_models`** is the person; `charmlink_creators` rows point at one
  via `model_id`. The model owns shared identity — name, tagline, theme
  colors, avatar frame shape/border, verified badge — while each site keeps
  its own slug, custom domain, and links.
- **Overlay, not migration.** A site's own columns are left intact underneath;
  the model's values win only while attached. Detaching restores the site's
  own identity instead of blanking it.
- **`/admin/creators` groups by model** — one row per person, expandable to
  her sites, each showing its own views/premium/CTR. **Manage** opens
  `/admin/models/[id]` for shared photos + identity; **Links** opens the
  per-site editor for that domain's own tracking links.
- Backfill matched by **exact name only** — it does not fuzzy-match
  automatically, since e.g. "Kai" and "Kaia" are different people and a wrong
  auto-merge blends two people's photos and stats irreversibly. Emoji/spacing
  duplicates and name variants provable from slug/domain evidence were merged
  by hand after review; ambiguous pairs were left split.

### Avatar carousel (A/B testing)
- Up to **10 candidate photos per model**, shared across every one of her
  sites. One is chosen per page render and its id rides along on that
  session's pageview + click events, so a conversion rate attributes back to
  the exact photo shown.
- **Selection is Thompson sampling** over each photo's Beta(1+clicks,
  1+misses) posterior — new photos get explored automatically, traffic
  concentrates on leaders as evidence builds, and a weak photo is never
  dropped to zero so it can recover if the audience shifts. No threshold to
  tune. Pinning 1–3 photos locks the rotation to that set and stops
  exploration.
- **200 impressions per photo** is the point the UI stops calling a
  conversion rate provisional (`MIN_IMPRESSIONS_FOR_CONFIDENCE`,
  `lib/avatar-rotation.ts`) — below it, both the manager and analytics show
  how many more views are needed rather than a number worth acting on.
  Because the pool is shared across a model's sites, this bar is reached
  roughly *N×* faster for a model with *N* domains than it would be per-site.
- **Per-photo focal point** (`focal_x`/`focal_y`, default 50/25 — biased
  toward the top of the frame since most uploads are selfies) plus **3 frame
  shapes** (circle / portrait 3:4 / rounded square) fix the classic
  circle-crop failure where a 3:4 photo loses the subject's face to a square
  window. Portrait crops almost nothing; the admin has a click-to-set focal
  picker with a live preview of the real crop.
- Rotation stats are cached 5 minutes per serverless instance; an admin
  edit (upload/pin/pause) busts the cache for every site under the model
  immediately rather than waiting out the TTL.

### Admin analytics — now grouped, and rewritten for scale
- `/admin/analytics` reads like the creators list: **one card per model**,
  numbers summed across her sites, with a "N domains" toggle for the
  per-site breakdown. Left sidebar lists every model with a live search box;
  one card renders at a time instead of scrolling a stack of thirty.
- Rates are **recomputed from the summed numerator/denominator, never
  averaged across sites** — averaging a 40,000-view domain at 30% CTR with a
  40-view domain at 100% would report 65%, more than double the true ~30%.
- **`getAnalyticsBatch`** (`lib/db.ts`) replaced a per-creator
  `Promise.all(creators.map(getAnalytics))` fan-out that, once the per-creator
  query count grew past ~5, exceeded the serverless Postgres pool (`max: 3`)
  and 500'd the whole endpoint — the dashboard rendered zeros while the
  underlying data was untouched. The batched version groups every metric by
  `creator_slug` in a fixed number of queries, so cost no longer scales with
  creator count.
- A **clicks-over-time chart** (hour/day/week buckets depending on the period
  filter) sits on every model card, gray "Total" bars with pink "Premium"
  overlaid, alongside the existing device/referrer/link breakdowns.

### Also
- **Inline link editing** — a ✎ on each link edits label/subtitle/URL in
  place; no more delete-and-re-add for a text fix. Icon/type/badge/advanced
  settings are untouched by the edit.
- **Admin dark mode fixed at the root** — `bg-background`/`bg-card` and other
  shadcn tokens were resolving to the *light* palette because nothing ever
  applied Tailwind's `.dark` class; the dark values were in `globals.css` the
  whole time, just unreachable. Applied once at `app/admin/layout.tsx` so
  every token-based admin page inherits it.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui (base-ui/react)
- **Database**: PostgreSQL (Supabase)
- **Deployment**: Vercel
- **Domain Management**: Vercel Domains API + Cloudflare DNS API
- **Fonts**: Google Fonts (dynamic per-creator loading)

## Project Structure

```
charmlink/
├── app/
│   ├── [creator]/               # Public creator pages
│   │   ├── page.tsx             # Server component — fetches from DB, mints link token, passes to client
│   │   ├── CreatorPage.tsx      # Client component — visual effects, IG escape, click/beacon handlers
│   │   ├── AgeGateScreen.tsx    # 18+ confirmation shell, reused by /r/[linkId]
│   │   └── AgeConfirmButton.tsx # Posts /api/age-confirm, then redirects or reloads
│   ├── r/[linkId]/page.tsx      # Per-link interstitial — age-gates sensitive links, then redirects
│   ├── admin/                   # Admin dashboard (shadcn/ui)
│   │   ├── page.tsx             # Login page
│   │   ├── layout.tsx           # Applies Tailwind `.dark` to the whole admin (v5) — see note below
│   │   ├── AdminNav.tsx         # Sidebar navigation
│   │   ├── CopyButton.tsx       # Copy/open buttons for slug + domain
│   │   ├── AvatarCarouselManager.tsx  # (v5) Shared photo-carousel manager, model-scoped;
│   │   │                        #   used by both the model page and (legacy path) a creator page
│   │   ├── useAdminAuth.ts      # Auth hook (localStorage token)
│   │   ├── dashboard/           # Overview stats + recent activity + Blocked Visitors card
│   │   ├── creators/            # Site (domain) list — grouped by model (v5) + link management
│   │   │   ├── page.tsx         # Grouped creator list: one row per model, expands to her sites
│   │   │   └── [id]/page.tsx    # Per-site editor (Profile/Theme/Effects/Misc + Links; Avatar tab
│   │   │                        #   now just links out to the model page — see v5)
│   │   ├── models/[id]/page.tsx # (v5) Photo carousel + shared identity for one model, all her sites
│   │   ├── analytics/           # Analytics dashboard — grouped by model (v5), searchable sidebar
│   │   │   ├── page.tsx         # Analytics page wrapper — owns `period` state
│   │   │   └── AnalyticsDashboard.tsx  # Charts + stats (controlled by page.tsx via onPeriodChange)
│   │   └── domains/             # Domain management
│   │       └── page.tsx         # Add/remove domains, health badges, Heal button
│   ├── api/
│   │   ├── admin/               # Protected admin API routes (CHARMLINK_ADMIN_KEY)
│   │   │   ├── creators/        # CRUD for creator sites (+ [id]/links/ for link CRUD)
│   │   │   ├── models/          # (v5) CRUD for models + re-parenting sites (+ [id]/avatars/
│   │   │   │                    #   for the shared photo carousel — moved here from
│   │   │   │                    #   creators/[id]/avatars/ once avatars became model-owned)
│   │   │   ├── domains/         # Vercel + Cloudflare domain management (+ status/, heal/)
│   │   │   ├── avatar/          # Client-direct Vercel Blob upload token minting
│   │   │   ├── bans/            # GET count / POST flush the honeypot ban list
│   │   │   ├── themes/          # GET built-in theme presets (no auth)
│   │   │   └── recent-events/   # GET last 20 analytics events
│   │   ├── analytics/           # Analytics API (admin-key protected)
│   │   │   ├── [creator]/route.ts    # Per-creator stats
│   │   │   └── overview/route.ts     # All-creators summary
│   │   ├── creators/route.ts    # GET list of creator slugs
│   │   ├── links/[creator]/route.ts  # POST premium links — HMAC token + Origin check + rate limit
│   │   ├── redirect/[linkId]/route.ts  # Records the click, issues the real 302
│   │   ├── age-confirm/route.ts # Sets the cl_age cookie
│   │   ├── honeypot/route.ts    # Bot trap — bans only requests that look automated
│   │   ├── pageview/route.ts    # POST pageview tracking (is_bot resolved server-side)
│   │   ├── track/route.ts       # POST click tracking (is_bot resolved server-side)
│   │   ├── resolve-domain/route.ts       # Internal: custom domain → creator slug (middleware)
│   │   └── resolve-creator-meta/route.ts # Internal: creator existence + cloak_enabled (middleware)
│   ├── globals.css
│   ├── layout.tsx
│   ├── robots.ts                # noindex everywhere
│   └── page.tsx                 # Default landing page
├── components/ui/                # shadcn/ui components (badge, button, card, dialog,
│                                  #   dropdown-menu, input, label, popover, select,
│                                  #   separator, switch, tabs, tooltip)
├── lib/
│   ├── bot-detect.ts             # Layered detection: isbot + Meta-2026 UAs + ASN + KV ban list
│   ├── scraper-detect.ts         # Link-preview scraper UA patterns (for the decoy bypass)
│   ├── datacenter-asns.ts        # Hosting-provider ASN list
│   ├── event-bot-flag.ts         # Resolves is_bot for analytics events from middleware's x-is-bot
│   ├── rate-limit.ts             # Vercel KV sliding-window limiter
│   ├── kv-ban.ts                 # Honeypot IP ban list (24h TTL)
│   ├── link-token.ts             # HMAC link token mint/verify — NOT bound to client IP
│   ├── turnstile.ts              # Server-side Turnstile verification
│   ├── turnstile-admin.ts        # Widget hostname auto-sync to Cloudflare
│   ├── cloudflare.ts             # Zone provisioning (WAF rules, settings, gray→orange flip)
│   ├── cloudflare-dns.ts         # CNAME + orange-cloud DNS record management
│   ├── vercel-domains.ts         # Vercel Domains API client
│   ├── decoy/
│   │   ├── themes.ts             # Wholesome decoy theme bundles, slug-deterministic
│   │   └── cloak.ts              # Scraper bypass renderer for middleware
│   ├── themes.ts                 # Visual theme presets for real creator pages
│   ├── fonts.ts                  # Google Fonts dynamic loader
│   ├── db.ts                     # Database layer — all CRUD + analytics queries, incl.
│   │                              #   getAnalyticsBatch (v5, replaces a per-creator N+1 fan-out)
│   ├── avatar-rotation.ts        # (v5) Thompson-sampling photo selection + rotation cache
│   ├── analytics-rollup.ts       # (v5) Folds per-site AnalyticsSummary rows up to one per model
│   ├── analytics.ts              # Legacy file-based analytics (kept for reference)
│   ├── types.ts                  # TypeScript interfaces
│   └── utils.ts                  # shadcn/ui utility (cn helper)
├── middleware.ts                  # Bot decoy bypass, custom-domain routing, CSP + header stripping
├── next.config.ts                 # Image remotePatterns (Supabase, Blob, OnlyFans, Imgur)
├── scripts/
│   ├── migrate.ts, migrate-v2.ts, migrate-v3.ts  # Schema migrations
│   ├── cf-backfill.ts            # Provision/repair Cloudflare state across all domains
│   └── cf-heal.ts                # CLI: heal a single stuck domain (or --all)
├── supabase/migrations/           # Raw SQL migrations (creators/links schema lives in
│                                   #   scripts/migrate.ts; this dir covers what was
│                                   #   added out-of-band — honeypot_logs, cloak_enabled,
│                                   #   charmlink_creator_domains + its sync trigger,
│                                   #   charmlink_creator_avatars + focal point + shape,
│                                   #   and charmlink_models + the model_id overlay (v5))
├── creators.json                  # Sample creator data (used for seeding only)
├── docs/                          # See below
├── package.json
└── tsconfig.json
```

## Database Schema

All tables prefixed with `charmlink_`:

### `charmlink_creators`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `model_id` | UUID | FK → `charmlink_models.id`, nullable (`SET NULL` on delete). While set, the model's shared fields overlay this row's own values — see v5 above. |
| `slug` | VARCHAR(100) | URL slug (unique) — e.g., `holly` |
| `name` | VARCHAR(255) | Display name |
| `tagline` | TEXT | Short bio shown on page |
| `avatar_url` | TEXT | Avatar image URL |
| `custom_domain` | VARCHAR(255) | Custom domain (unique, nullable) |
| `theme_bg` | VARCHAR(20) | Background color hex (also used as gradient color 1) |
| `theme_accent` | VARCHAR(20) | Accent/button color hex |
| `theme_text` | VARCHAR(20) | Text color hex |
| `is_active` | BOOLEAN | Whether the page is live |
| `show_location` | BOOLEAN | Show visitor location via IP geolocation |
| `location_type` | VARCHAR(20) | `ip_auto` or `manual` |
| `sensitive_default` | BOOLEAN | Default sensitive toggle for all links |
| `bg_type` | VARCHAR(20) | `solid`, `gradient` |
| `bg_gradient_type` | VARCHAR(20) | `linear`, `radial` |
| `bg_gradient_direction` | VARCHAR(30) | CSS direction (e.g., `to bottom`, `to bottom right`) |
| `bg_color_2` | VARCHAR(20) | Second gradient stop color |
| `bg_color_3` | VARCHAR(20) | Optional third gradient stop color |
| `show_floating_icons` | BOOLEAN | Enable floating emoji animation |
| `floating_icon` | VARCHAR(10) | Emoji to float (e.g., `💫`) |
| `floating_icon_count` | INT | Number of floating icons (default 8) |
| `show_stars` | BOOLEAN | Enable twinkling star particles |
| `stars_count` | INT | Number of stars (default 50) |
| `stars_color` | VARCHAR(20) | Star particle color |
| `animation_speed` | INT | Animation cycle in seconds (default 10) |
| `avatar_shape` | TEXT | `circle`, `portrait`, or `square` — the carousel frame; default `circle` |
| `avatar_border_style` | VARCHAR(20) | `solid`, `gradient`, `none` |
| `avatar_border_color_1` | VARCHAR(20) | Primary border / gradient color 1 |
| `avatar_border_color_2` | VARCHAR(20) | Gradient color 2 |
| `avatar_border_color_3` | VARCHAR(20) | Gradient color 3 |
| `is_verified` | BOOLEAN | Show blue verified badge next to name |
| `font` | VARCHAR(30) | Google Font family name |
| `location_pill_color` | VARCHAR(20) | Custom background for location pill |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

### `charmlink_links`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `creator_id` | UUID | FK → `charmlink_creators.id` (CASCADE delete) |
| `label` | VARCHAR(255) | Link display text |
| `url` | TEXT | Destination URL |
| `icon` | VARCHAR(50) | Icon identifier (e.g., `twitter`, `star`, `crown`) |
| `link_type` | VARCHAR(20) | `social` or `premium` |
| `sort_order` | INT | Display order (ascending) |
| `is_active` | BOOLEAN | Whether the link is shown |
| `subtitle` | TEXT | Secondary text below label |
| `image_url` | TEXT | Background image for image button style |
| `deeplink_enabled` | BOOLEAN | Try native app deep link first |
| `recovery_url` | TEXT | Fallback URL if deep link fails |
| `redirect_url` | TEXT | Route through redirect API for tracking |
| `sensitive` | BOOLEAN | Show sensitive content warning |
| `badge` | VARCHAR(20) | `new`, `popular`, or `exclusive` |
| `notes` | TEXT | Internal notes (admin-only) |
| `tags` | TEXT[] | Tag array (admin-only) |
| `show_text_glow` | BOOLEAN | Enable text glow effect |
| `text_glow_color` | VARCHAR(20) | Glow color hex |
| `text_glow_intensity` | INT | Glow strength (1–10) |
| `hover_animation` | VARCHAR(20) | `pulse`, `bounce`, `shake`, `glow` |
| `border_color` | VARCHAR(20) | Custom link border color |
| `show_border` | BOOLEAN | Show border on link |
| `title_color` | VARCHAR(20) | Override title text color |
| `title_font_size` | VARCHAR(10) | `sm`, `base`, `lg`, `xl` |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

### `charmlink_events`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `type` | VARCHAR(20) | `pageview` or `click` |
| `creator_id` | UUID | FK → `charmlink_creators.id` (SET NULL on delete) |
| `creator_slug` | VARCHAR(100) | Creator slug (denormalized for query speed) |
| `link_label` | VARCHAR(255) | Clicked link label (null for pageviews) |
| `link_url` | TEXT | Clicked link URL (null for pageviews) |
| `link_type` | VARCHAR(20) | `social` or `premium` (null for pageviews) |
| `session_id` | VARCHAR(100) | Random UUID per browser session |
| `user_agent` | TEXT | Visitor User-Agent |
| `referer` | TEXT | HTTP referer header |
| `country` | VARCHAR(10) | Country code (from Vercel `x-vercel-ip-country` header) |
| `device` | VARCHAR(20) | `mobile`, `tablet`, or `desktop` |
| `is_bot` | BOOLEAN | Whether the visitor was identified as a bot |
| `is_instagram` | BOOLEAN | Whether the visitor came from Instagram's in-app browser |
| `avatar_id` | UUID | FK → `charmlink_creator_avatars.id`, nullable (`SET NULL` on delete). Which carousel photo was on screen for this event — null for every historical row and for any model with no carousel configured. |
| `created_at` | TIMESTAMPTZ | Event timestamp |

**Indexes**: `creator_slug`, `created_at`, plus unique indexes on `creators.slug` and `creators.custom_domain`.

### `charmlink_models` (v5)
The person behind one or more `charmlink_creators` sites. Owns the identity
fields that overlay onto every attached site — see v5 above for why this
exists and how the overlay works.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Display name — the one shown across all her sites |
| `tagline` | TEXT | Shared tagline |
| `theme_bg` / `theme_accent` / `theme_text` | TEXT | Shared theme colors |
| `bg_type` / `bg_gradient_type` / `bg_gradient_direction` / `bg_color_2` / `bg_color_3` | TEXT | Shared background config |
| `avatar_shape` | TEXT | `circle` / `portrait` / `square` — shared frame shape |
| `avatar_border_style` / `avatar_border_color_1/2/3` | TEXT | Shared avatar border config |
| `is_verified` | BOOLEAN | Shared verified badge |
| `font` | TEXT | Shared font family |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

### `charmlink_creator_avatars` (v5)
Carousel candidate photos. Owned by **either** a model (the shared-pool case
every current row uses) **or** a single creator (legacy path, kept for a
model-less site) — never both; enforced by a `CHECK (num_nonnulls(creator_id,
model_id) = 1)` constraint.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `model_id` | UUID | FK → `charmlink_models.id` (`CASCADE` delete), nullable |
| `creator_id` | UUID | FK → `charmlink_creators.id` (`CASCADE` delete), nullable — legacy per-site ownership |
| `url` | TEXT | Photo URL (Vercel Blob) |
| `is_active` | BOOLEAN | Included in rotation |
| `is_pinned` | BOOLEAN | Locks rotation to the pinned set (max 3) and stops exploration |
| `sort_order` | INT | Manager display order |
| `focal_x` / `focal_y` | SMALLINT | Crop focal point, 0–100. Default 50/25 (biased up, since uploads are overwhelmingly selfies) |
| `created_at` | TIMESTAMPTZ | |

## Setup

### Prerequisites
- Node.js 20+
- PostgreSQL database (Supabase recommended)
- Vercel account

### 1. Clone and install

```bash
git clone git@github.com:KnifeOfPi/charmlink.git
cd charmlink
npm install
```

### 2. Environment variables

Create `.env.local` for local development:

```env
# Required
DATABASE_URL=postgresql://user:password@host:5432/database

# Admin dashboard access
CHARMLINK_ADMIN_KEY=your-secret-admin-key

# Custom domain management (optional)
VERCEL_API_TOKEN=your-vercel-api-token
VERCEL_PROJECT_ID=your-vercel-project-id

# Cloudflare DNS automation (optional — auto-creates DNS records when adding domains)
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
```

> **⚠️ Note**: If your database password contains special characters (like `#`, `@`, `?`), URL-encode them in the connection string. For example, `#` becomes `%23`.

### 3. Run database migration

```bash
# Fresh install — creates all tables with latest schema
npx tsx scripts/migrate.ts

# With sample data
npx tsx scripts/migrate.ts --seed

# Upgrading from v1 → v2 (adds link intelligence columns)
npx tsx scripts/migrate-v2.ts

# Upgrading from v2 → v3 (adds visual design system columns)
npx tsx scripts/migrate-v3.ts
```

### 4. Run locally

```bash
npm run dev
```

Visit:
- `http://localhost:3000/holly` — sample creator page
- `http://localhost:3000/admin` — admin dashboard (enter your `CHARMLINK_ADMIN_KEY`)

### 5. Deploy to Vercel

1. Import the repo on [vercel.com/new](https://vercel.com/new)
2. Set environment variables in Vercel project settings:
   - `DATABASE_URL`
   - `CHARMLINK_ADMIN_KEY`
   - `VERCEL_API_TOKEN` (for domain management)
   - `VERCEL_PROJECT_ID` (for domain management)
3. Deploy

## Admin Dashboard

Access at `/admin` with your `CHARMLINK_ADMIN_KEY`.

### Dashboard (`/admin/dashboard`)
- Total creators, views, clicks, CTR
- Recent activity feed (last 20 events)
- **Blocked Visitors card** — shows how many IPs the honeypot currently has banned (24h TTL each), with a one-click **Clear all bans** to flush the whole list immediately. A stale backlog otherwise keeps real visitors seeing the decoy page until their ban expires on its own; genuine bots get re-banned on their next hit, so clearing is safe

### Creators (`/admin/creators`) (v5: grouped by model)
- **One row per person, not per site.** A model with several domains — the
  common case, since a creator who gets one domain flagged usually opens
  another — expands to show each site's own views/premium/CTR underneath.
- **Manage** opens `/admin/models/[id]` — photos and shared identity for
  every one of her sites, edited once.
- **Links** opens `/admin/creators/[id]` — that specific domain's own
  premium/social links (each domain tracks its own clicks separately).
- Add new creators with name, slug, tagline, avatar, theme colors; delete
  cascades to links and nullifies events.

### Model Detail (`/admin/models/[id]`) (v5)
- **Photo Carousel** — upload up to 10 candidate photos, see live
  impressions/premium-clicks/conversion-rate per photo, pin up to 3 to lock
  the rotation, pause/resume/delete. Click-to-set focal point per photo with
  a live crop preview.
- **Shared identity** — name, tagline, theme colors, avatar frame shape
  (circle/portrait/square), border style, verified badge. Applies to every
  site below.
- **Sites** — every domain under this model, each linking out to its own
  link editor.

### Creator Detail (`/admin/creators/[id]`) — per-site editor
- **Profile tab**: Slug, custom domain + one-click Vercel setup, active/sensitive toggles
- **Theme tab**: Background type (solid/gradient), gradient type (linear/radial) + direction, 3 color pickers with live preview, accent + text colors — overridden by the model's shared theme if this site belongs to one
- **Effects tab**: Floating icons (toggle + emoji + count + speed), star particles (toggle + count + color), animation speed
- **Avatar tab**: Points to `/admin/models/[id]` — photos and frame/border are model-owned as of v5, not edited per-site
- **Misc tab**: Font family selector (6 Google Fonts), location toggle + type + pill color
- **Links section**: Add/edit/delete social + premium links, with **inline editing** (v5: a ✎ button edits label/subtitle/URL in place, no delete-and-re-add) plus the full v3 visual options (glow, animations, borders, badges, subtitles, image URLs, deeplinking)

### Analytics (`/admin/analytics`) (v5: grouped by model, searchable)
- **One card per model**, numbers summed across her sites, with a "N
  domains" toggle for the per-site breakdown — not averaged, since averaging
  rates across sites of very different traffic would misreport her real CTR.
- Left sidebar lists every model with a live search box; one card renders
  at a time.
- Metrics: page views (human vs bot), unique visitors, clicks, CTR,
  Instagram traffic %
- Breakdowns: device (mobile/desktop/tablet), country, top referrers,
  per-link clicks, a clicks-over-time chart (hour/day/week buckets), and
  per-photo conversion rates for models running the avatar carousel
- Time periods: today, 7 days, 30 days, all time
- Dark themed with CSS bar charts

### Domains (`/admin/domains`)
- List all custom domains registered with Vercel (fully paginated)
- Add new domains — runs the full provisioning ceremony (Vercel + DB + Cloudflare, see below), not just a Vercel API call
- Remove domains (detaches from Vercel + clears DB rows)
- **Health badge** — each row shows live SSL/HTTP health, probed **server-side** via `/api/admin/domains/status` (Node runtime, no browser-CORS false positives). Healthy = any sub-500 response; only real 525/TLS/network failures flag **"SSL broken"**
- **🩹 Heal button** — appears on broken rows; re-runs the `cf-heal` flow (unproxy → wait for Vercel cert → re-proxy) then re-probes server-side
- **Copy / Open buttons** — copy a domain to clipboard or open the live page in a new tab
- View verification status (Verified / Pending) and DNS instructions

## Custom Domains

### Prerequisite: the Cloudflare zone must exist first

CharmLink does **not** register domains or create Cloudflare zones for you. Before adding a domain in the admin:
1. **Register the domain** at any registrar (or Cloudflare Registrar).
2. **Add it as a zone in your Cloudflare account** and point its **nameservers to Cloudflare**.

If you add a domain in the admin before its CF zone exists, provisioning returns `zoneFound: false` (*"add the zone in Cloudflare first"*) and the domain half-registers in Vercel + DB only. To recover: remove it, create the CF zone, then re-add. (Everything after "the zone exists" is automated.)

### How it works

When you click **Add Domain** (`POST /api/admin/domains`), the route runs three steps + auto-heal:
1. **Vercel** — registers the domain on the CharmLink project (`addDomain`).
2. **Database** — inserts into `charmlink_creator_domains` (first domain for a creator auto-becomes primary; a DB trigger syncs the primary back to `charmlink_creators.custom_domain` — never write that column directly).
3. **Cloudflare `provisionZone`** — the full ceremony: find zone → gray-cloud (DNS-only) → wait for Vercel cert → flip to orange-cloud (proxied) → apply WAF + Turnstile hostname.
4. **Auto-verify + heal** — HEAD-probes the live domain on a backoff schedule (~105s); if it's stuck in a **525** state, it re-runs `provisionZone` once automatically. This is what eliminates the old stuck-525 regression.

Then at request time: **Middleware routes** — checks the hostname against the database, finds the mapped creator, and rewrites to their page. **SSL** is auto-provisioned by Vercel and served through the Cloudflare proxy.

### DNS Records

**You normally don't set these by hand** — `provisionZone` creates and manages the proxied
CNAME automatically once the CF zone exists. Production runs everything **Cloudflare
orange-cloud (proxied)** in front of the Vercel origin, not a direct-to-Vercel A record.

| Type | Scenario | Name | Value | Proxy |
|------|----------|------|-------|-------|
| CNAME | Root or subdomain (CF flattens apex) | `@` / `www` | `cname.vercel-dns.com` | 🟠 proxied (after cert) |

Provisioning starts the CNAME **gray-cloud** (DNS-only) so Vercel's ACME HTTP-01 challenge
can reach the origin, then **flips it to orange-cloud** once the cert verifies. Full detail:
**[docs/PHASE-3-CLOUDFLARE.md](./docs/PHASE-3-CLOUDFLARE.md)**.

> Legacy/non-Cloudflare fallback (not used in prod): A `@` → `76.76.21.21`, or CNAME
> `www` → `cname.vercel-dns.com` pointed directly at Vercel with no proxy.

### Scaling

One Vercel deployment handles all domains. There's no per-domain cost from Vercel. You only pay for the domains themselves ($8-12/year each from a registrar).

### Troubleshooting a stuck new domain

If a freshly-added domain shows **"SSL handshake failed"** / **Cloudflare 525** for more than ~15 minutes, see **[docs/NEW-DOMAIN-TROUBLESHOOTING.md](./docs/NEW-DOMAIN-TROUBLESHOOTING.md)** for the one-command fix (`npm run cf-heal -- yourdomain.com`).

Full Cloudflare provisioning architecture: **[docs/PHASE-3-CLOUDFLARE.md](./docs/PHASE-3-CLOUDFLARE.md)**.

Tested architecture supports 100+ creators with custom domains from a single deployment.

## Analytics & Tracking

### What's tracked
- **Page views**: creator, timestamp, device, country, referer, Instagram detection, bot detection, session ID
- **Clicks**: all of the above plus link label, link URL, link type (social/premium)

### How tracking works
- Page views are sent via `navigator.sendBeacon` (non-blocking, survives page navigation)
- Clicks are sent via `sendBeacon` before redirecting to the destination
- Bot visits are tracked separately (filtered out of human metrics)
- Session IDs are random UUIDs stored in `sessionStorage` (reset per browser session)
- Country detection uses Vercel's `x-vercel-ip-country` header (automatic on Vercel)

### Metrics available
| Metric | Description |
|--------|-------------|
| Total Views | All page views including bots |
| Human Views | Page views excluding identified bots |
| Bot Views | Page views from identified bots only |
| Unique Visitors | Distinct session IDs |
| Total Clicks | All link clicks |
| Premium Clicks | Clicks on premium links (OnlyFans, Fanvue, etc.) |
| Social Clicks | Clicks on social links (Twitter, TikTok, etc.) |
| CTR | Premium clicks ÷ human views × 100 |
| Instagram Traffic | Views from Instagram's in-app browser |
| Top Referrers | Top 10 HTTP referer values |
| Device Breakdown | Mobile / Desktop / Tablet split |
| Country Breakdown | Top 10 countries by view count |
| Link Breakdown | Clicks per link, sorted by popularity |

## API Reference

### Public Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/creators` | List all active creator slugs |
| `POST` | `/api/links/[creator]` | Get premium links for a creator — requires an HMAC token (minted server-side and embedded in the page), bot-filtered, rate-limited, may respond with `turnstile_required` |
| `GET` | `/r/[linkId]` | Per-link interstitial — age-gates sensitive links, then redirects |
| `GET` | `/api/redirect/[linkId]` | Records the click and issues the real 302 (never rendered in HTML) |
| `POST` | `/api/age-confirm` | Sets the `cl_age` age-verification cookie |
| `POST` | `/api/track` | Record a click event |
| `POST` | `/api/pageview` | Record a page view event |
| `GET` | `/api/resolve-domain?domain=x` | Internal: resolve custom domain to creator slug (used by middleware) |
| `GET` | `/api/resolve-creator-meta?slug=x\|domain=x` | Internal: creator existence + `cloak_enabled` lookup (used by middleware's decoy bypass) |
| `GET` | `/api/honeypot` | Honeypot for bot detection (logs visits) |

### Analytics Routes (requires `Authorization: Bearer <CHARMLINK_ADMIN_KEY>`)

| Method | Path | Query Params | Description |
|--------|------|--------------|-------------|
| `GET` | `/api/analytics/overview` | `?period=today\|7d\|30d\|all` | Global analytics summary |
| `GET` | `/api/analytics/[creator]` | `?period=today\|7d\|30d\|all` | Per-creator analytics |

### Admin Routes (requires `Authorization: Bearer <CHARMLINK_ADMIN_KEY>`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/creators` | List all creators (with full details) |
| `POST` | `/api/admin/creators` | Create a new creator |
| `GET` | `/api/admin/creators/[id]` | Get creator by ID |
| `PUT` | `/api/admin/creators/[id]` | Update creator fields |
| `DELETE` | `/api/admin/creators/[id]` | Delete creator (cascades links) |
| `GET` | `/api/admin/creators/[id]/links` | Get all links for a creator |
| `POST` | `/api/admin/creators/[id]/links` | Create a new link |
| `PUT` | `/api/admin/creators/[id]/links` | Update a link (send `id` in body) |
| `DELETE` | `/api/admin/creators/[id]/links` | Delete a link (send `id` in body) |
| `POST` | `/api/admin/domains` | Add domain — runs the full Vercel + DB + Cloudflare provisioning ceremony + auto-heal (`{ "domain": "example.com" }`) |
| `DELETE` | `/api/admin/domains` | Remove domain (`{ "domain": "example.com" }`) |
| `GET` | `/api/admin/domains/status` | Get all domain verification + server-side health statuses |
| `POST` | `/api/admin/domains/heal` | Re-run the idempotent gray→cert→orange heal cycle for one domain (`{ "domain": "example.com" }`) |
| `POST` | `/api/admin/avatar` | Mint a scoped client-direct upload token for Vercel Blob (browser uploads straight to Blob, not through this route) |
| `GET` | `/api/admin/recent-events` | Last 20 analytics events |
| `GET` | `/api/admin/themes` | List built-in theme presets (no auth — static data only) |
| `GET` | `/api/admin/bans` | Count IPs currently on the honeypot ban list (read-only) |
| `POST` | `/api/admin/bans` | Delete every honeypot ban, immediately un-blocking everyone (also available as a button on `/admin/dashboard`) |
| `GET` | `/api/admin/models` | List every model with her sites nested + aggregated traffic (v5) |
| `POST` | `/api/admin/models` | Create a model (`{ "name": "..." }`) |
| `PUT` | `/api/admin/models` | Update shared identity fields (`{ "id", ...fields }`), or re-parent a site (`{ "creatorId", "modelId" }` — `modelId: null` detaches it) |
| `DELETE` | `/api/admin/models` | Delete a model (`{ "id": "..." }`) — attached sites fall back to their own columns, not deleted |
| `GET` | `/api/admin/models/[id]/avatars` | List a model's carousel photos with per-photo stats (v5) |
| `POST` | `/api/admin/models/[id]/avatars` | Add a photo (`{ "url": "..." }`, max 10 per model) |
| `PUT` | `/api/admin/models/[id]/avatars` | Update a photo (`{ "avatarId", is_active?, is_pinned?, focal_x?, focal_y? }`) |
| `DELETE` | `/api/admin/models/[id]/avatars` | Remove a photo (`{ "avatarId": "..." }`) — past events keep their attribution |

## Security Considerations

- **Admin key**: All admin routes require `CHARMLINK_ADMIN_KEY` via Bearer token. Set a strong, random key.
- **No credentials in code**: All secrets are environment variables. `CHARMLINK_LINK_TOKEN_SECRET` is the one exception worth knowing about: there's a hardcoded dev fallback for local development, but the app refuses to start in production (`NODE_ENV=production`) if the real secret isn't set, rather than silently signing tokens with a value that's public in this repo.
- **Bot detection is defense-in-depth**: Multiple layers (UA matching, ASN checks, HMAC-locked links API, decoy cloaking, honeypot, rate limiting, Turnstile escalation) make it progressively harder for bots to access premium links.
- **Rate limiting**: The links API limits to 30 requests/minute per IP to prevent scraping.
- **No NSFW in HTML source**: Premium link URLs never appear in server-rendered HTML, page source, or OG meta tags.
- **Honeypot monitoring**: Check Vercel function logs for `[honeypot]` entries (each one now says `banned: true|false`) to identify bot IPs, or read `GET /api/admin/bans` for the current ban count.
- **Ban gate is deliberately narrow**: the honeypot only bans a hit that itself looks automated (empty/bot User-Agent, or missing both `Sec-Fetch-*` and an HTML `Accept`). Measured against production before this shipped, an earlier, unconditional version banned every hit — 86.6% of them carried ordinary mobile browser User-Agents and only 0.12% carried a bot signature, so it was mostly locking out real visitors rather than catching scrapers. If you ever loosen this gate again, check that ratio in `honeypot_logs` before shipping it.
- **The links-API rejection payload is inert on purpose**: a failed check returns `{ links: [] }`, never a followable URL. An earlier version pointed rejected callers at the honeypot itself, which turned every false rejection (e.g. a mobile IP change between page load and the links fetch) into a 24h ban — see the point above.

## Roadmap

- [x] ~~Cloudflare DNS API integration~~ ✅ Shipped in v2
- [x] ~~Visual design system (gradients, effects, fonts)~~ ✅ Shipped in v3
- [x] ~~shadcn/ui admin dashboard~~ ✅ Shipped in v3
- [x] ~~Avatar image upload~~ ✅ Shipped — client-direct upload to Vercel Blob (`/api/admin/avatar`)
- [ ] CSV bulk import for onboarding many creators at once
- [x] ~~A/B testing for avatar photos~~ ✅ Shipped in v5 — Thompson-sampled photo carousel with per-photo conversion tracking
- [ ] A/B testing for link labels and page themes
- [ ] Webhook notifications for click milestones
- [ ] Theme presets (one-click "dark neon", "pastel dream", "minimalist" etc.)
- [ ] Carousel/marquee component for scrolling content
- [ ] Video background support
- [ ] SQLite/Turso option for self-hosted deployments without Postgres
- [ ] Geolocation-based link routing (different links per country)

## License

Private — proprietary software.
