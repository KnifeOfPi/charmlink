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
- **Threads** is detected too (`Threads` / `Barcelona` UA tokens) and gets the banner plus an app-agnostic `intent://` on Android. It deliberately never fires `instagram://` — from inside Threads that hands off to the *Instagram app*, not a browser, which is worse than doing nothing.

**The escape carries the visitor's identity with it** (`lib/handoff.ts`). The far
side is a different browser process, so `sessionStorage` and cookies do not
survive the jump — the second load would otherwise mint a new session id and
redraw the carousel photo, recording one human as two people and crediting the
wrong photo for their click. The session id (`cl_sid`) and the photo that was on
screen (`cl_av`) ride along in the URL, are adopted on arrival instead of being
regenerated, and are then stripped from the address bar. The continuation does
not record a second pageview. Both values are validated as UUIDs, and the avatar
must belong to that creator's own rotation, so a crafted link can't credit
someone else's photo.

**How the escape failure rate is measured**: the escape works by navigating
away, so if the page is still visible 2.5s after firing, it didn't take. Success
unloads the page and the beacon never fires — *absence* of an `escape_fallback`
event is the success signal, which is why successes are never logged
client-side. Treat the resulting rate as an upper bound: it also catches anyone
who saw the OS "Open in app?" dialog and lingered.

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

## v5 Features — Models, Photo Testing, and Attribution

### The person is the unit, not the site (2026-08-27)
A creator row was really a *site* (slug + domain), so one person with ten
domains was ten rows — her avatars uploaded ten times, her photo experiment
split into ten tests that each converged ten times slower than her traffic
warranted. `charmlink_models` is the person; creator rows point at one.

The model owns identity and the photo pool as an **overlay**, not a migration:
a site keeps its own columns and the model's win while attached, so detaching
restores the site instead of blanking it. Links stay per-creator, since each
domain keeps its own premium tracking link.

### Avatar carousel A/B testing
Up to 10 candidate photos per model. One is drawn per render and its id is
stamped on that session's pageview and clicks, so a conversion attributes back
to the photo that was actually on screen.

Selection is **Thompson sampling** over each photo's Beta posterior: photos with
little data have wide distributions and get explored, traffic concentrates on
leaders as evidence accumulates with no threshold to tune, and a loser is never
dropped to zero — so if the audience shifts it climbs back on its own. Pinning
1–3 photos locks the rotation to that set. Stats are cached 5 minutes per
instance, and a failed load falls back to the static avatar rather than breaking
the page.

The dashboard labels any photo under **200 impressions** as provisional — below
that a rate is still noise, and presenting it as a winner is how A/B tests get
misread.

### Analytics: per-model rollup, per-domain drill-down
`getAnalyticsBatch` groups every query by `creator_slug` rather than running
`getAnalytics` once per creator — the old fan-out reached ~490 concurrent
queries against a `max=3` pool and 500'd the whole dashboard. `rollupByModel`
then folds sites into one row per person, recomputing rates from summed
numerators and denominators (**never averaging across sites** — averaging a
40,000-view domain at 30% with a 40-view domain at 100% reports 65% instead of
the true 30.07%).

Each creator card has **domain tabs**: every panel — views, premium clicks, CTR,
IG traffic, clicks-over-time, device, referrers, link clicks, countries, photo
performance — scopes to a single domain. The rolled-up figure routinely hides an
order-of-magnitude spread between one person's domains.

### Attribution correctness (2026-08-30)
Two measurement bugs, both fixed, both worth understanding before trusting any
historical figure:

- **The escape recorded one visitor as two.** See the breakout section above.
  It inflated pageviews in proportion to a domain's Instagram share, understated
  every CTR measured against them, and made in-app traffic look like it never
  converted. **Clicks were never affected** — a click was always counted exactly
  once, it just landed on the second session — so click totals, link breakdown
  and everything downstream in OnlyFans were correct throughout.
- **Thompson sampling had never run.** The sampler read its posterior with a
  creator id where a model id was required, so the lookup was always empty,
  every photo drew from `Beta(1,1)`, and the carousel was a plain even split
  from launch.

`STATS_EPOCH` (`lib/stats-epoch.ts`) holds every analytics window at the fix, so
"All Time" means all *trustworthy* time. **Nothing was deleted** — 736k events
back to March remain queryable, including 207k exact click records — and
removing `clampToEpoch` restores the full view. Photo stats keep a *separate*
boundary on purpose: pre-fix photo attribution is unrecoverable rather than
merely inflated, so it must stay excluded even if the display window is widened.

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
│   │   ├── layout.tsx           # Admin layout with navigation
│   │   ├── AdminNav.tsx         # Sidebar navigation
│   │   ├── CopyButton.tsx       # Copy/open buttons for slug + domain
│   │   ├── useAdminAuth.ts      # Auth hook (localStorage token)
│   │   ├── dashboard/           # Overview stats + recent activity + Blocked Visitors card
│   │   ├── creators/            # Creator CRUD + link management
│   │   │   ├── page.tsx         # Creator list + add/delete
│   │   │   └── [id]/page.tsx    # 5-tab editor (Profile/Theme/Effects/Avatar/Misc)
│   │   ├── analytics/           # Analytics dashboard
│   │   │   ├── page.tsx         # Analytics page wrapper — owns `period` state
│   │   │   └── AnalyticsDashboard.tsx  # Charts + stats (controlled by page.tsx via onPeriodChange)
│   │   └── domains/             # Domain management
│   │       └── page.tsx         # Add/remove domains, health badges, Heal button
│   ├── api/
│   │   ├── admin/               # Protected admin API routes (CHARMLINK_ADMIN_KEY)
│   │   │   ├── creators/        # CRUD for creators (+ [id]/links/ for link CRUD)
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
│   ├── handoff.ts                # Carries cl_sid + cl_av across the in-app-browser escape
│   ├── stats-epoch.ts            # STATS_EPOCH boundary + the analytics window clamp
│   ├── avatar-rotation.ts        # Thompson sampling over each photo's Beta posterior
│   ├── analytics-rollup.ts       # Folds per-site summaries into one row per model
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
│   ├── db.ts                     # Database layer — all CRUD + analytics queries
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
│                                   #   charmlink_creator_domains + its sync trigger)
├── creators.json                  # Sample creator data (used for seeding only)
├── docs/                          # See below
├── package.json
└── tsconfig.json
```

## Database Schema

Three tables, all prefixed with `charmlink_`:

### `charmlink_creators`
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
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
| `type` | VARCHAR(20) | `pageview`, `click`, or `escape_fallback` (an in-app escape that didn't take) |
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
| `is_instagram` | BOOLEAN | Whether the visitor came from a Meta in-app browser (Instagram **or** Threads) |
| `avatar_id` | UUID | FK → `charmlink_creator_avatars.id` — which carousel photo was on screen. Null for creators without a carousel |
| `created_at` | TIMESTAMPTZ | Event timestamp |

**Indexes**: `creator_slug`, `created_at`, plus unique indexes on `creators.slug` and `creators.custom_domain`.

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

### Creators (`/admin/creators`)
- View all creators with quick stats
- Add new creators with name, slug, tagline, avatar, theme colors
- Delete creators (cascades to links and nullifies events)

### Creator Detail (`/admin/creators/[id]`) — 5-Tab Editor
- **Profile tab**: Name, tagline, slug, avatar URL, custom domain + one-click Vercel setup, active/sensitive toggles
- **Theme tab**: Background type (solid/gradient), gradient type (linear/radial) + direction, 3 color pickers with live preview, accent + text colors
- **Effects tab**: Floating icons (toggle + emoji + count + speed), star particles (toggle + count + color), animation speed
- **Avatar tab**: Border style (solid/gradient/none), 3 gradient color pickers, verified badge toggle
- **Misc tab**: Font family selector (6 Google Fonts), location toggle + type + pill color
- **Links section**: Add/edit/delete social + premium links with full v3 visual options (glow, animations, borders, badges, subtitles, image URLs, deeplinking)
- **Analytics**: 30-day stats for this specific creator

### Analytics (`/admin/analytics`)
- Global and **per-model** statistics — one card per person, searchable roster sidebar
- **Domain tabs** on each card scope every panel to a single site; the compare table sorts her domains side by side and its rows are clickable
- Metrics: page views (human vs bot), unique visitors, clicks, CTR, Instagram traffic %
- Breakdowns: device (mobile/desktop/tablet), country, top referrers, per-link clicks
- Clicks-over-time chart (total vs premium) with a table view as its accessible twin
- Photo performance per candidate avatar, with anything under 200 impressions marked provisional
- Time periods: today, 7 days, 30 days, all time — **all held at `STATS_EPOCH`**, so "all time" means all trustworthy time (see v5 above); the header states the date it counts from
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
- Session IDs are random UUIDs stored in `sessionStorage` (reset per browser session) — **except** when a visitor arrives from an in-app-browser escape carrying `cl_sid`, in which case that id is adopted so the two halves of one visit stay joined, and no second pageview is recorded (see the breakout section)
- Country detection uses Vercel's `x-vercel-ip-country` header (automatic on Vercel)
- Clicks through `/api/redirect/[linkId]` write a second, server-side row carrying a sentinel session id. It is **excluded** from click counts by `DEDUPED_CLICKS` but deliberately **kept** — the gap between "beacon fired" and "redirect served" is the funnel signal that measured age-gate completion at 98.8%. Don't delete those rows chasing a cleaner schema.

> **Known broken: Top Referrers.** `/api/pageview` reads the `Referer` header,
> but the beacon is POSTed *from the creator page*, so that header is the page's
> own URL — the panel just re-reports each domain's pageview count. The real
> upstream source is not captured anywhere. Fixing it means sending
> `document.referrer` from the client in the beacon body.

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
| Instagram Traffic | Views from Instagram's (or Threads') in-app browser |
| Top Referrers | Top 10 referer hostnames — **currently self-referential, see the note above** |
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
- [ ] A/B testing for link labels and page themes
- [ ] Webhook notifications for click milestones
- [ ] Theme presets (one-click "dark neon", "pastel dream", "minimalist" etc.)
- [ ] Carousel/marquee component for scrolling content
- [ ] Video background support
- [ ] SQLite/Turso option for self-hosted deployments without Postgres
- [ ] Geolocation-based link routing (different links per country)

## License

Private — proprietary software.
