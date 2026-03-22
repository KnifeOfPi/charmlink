# CharmLink

Instagram-safe landing page system for OnlyFans and Fanvue creators. One deployment serves unlimited creators, each with their own custom domain — all managed from a single admin dashboard.

## Why CharmLink?

Instagram actively detects and bans accounts that link to adult content platforms. Their crawler follows bio links, reads destination pages, and flags accounts linking to OnlyFans, Fansly, Fanvue, and similar platforms. Even link-in-bio tools like Linktree and AllMyLinks get flagged because IG crawls through them to the final destination.

CharmLink solves this by serving **completely clean pages** to bots while showing premium links only to real human visitors through client-side JavaScript that crawlers can't execute.

## How It Works

### Bot Evasion (Multi-Layer)

1. **Server-side bot detection** — Middleware identifies known crawlers (`facebookexternalhit`, `Facebot`, `Twitterbot`, `Googlebot`, `bingbot`, `Bytespider`, and others) via User-Agent matching. Bots receive a clean page with only social media links — no premium/adult content links ever appear in server-rendered HTML.

2. **Client-side-only premium links** — Premium links (OnlyFans, Fanvue, etc.) are never in the page source. They're fetched via a separate API call (`GET /api/links/[creator]`) that also filters bots, then injected into the DOM via React state.

3. **Interaction-gated loading** — Premium links only load after a real human interaction (scroll, touch, click, or mouse movement). Headless browsers that execute JavaScript but don't simulate user input will never trigger the fetch.

4. **18+ age gate** — A full-screen age verification overlay blocks all content until the user confirms they're 18+. This is client-side only, so bots see nothing. Persists per browser session via `sessionStorage`.

5. **Honeypot link** — An invisible link in the DOM (`/api/honeypot`) that only bots would discover and follow. Visits are logged with User-Agent, IP, and referer for monitoring.

6. **Rate limiting** — The premium links API limits requests to 30/minute per IP. Excessive requests receive empty responses silently (no error messages that would tip off a bot).

7. **Clean OG meta tags** — `<meta>` tags contain only the creator's name and clean tagline — no NSFW keywords, no adult platform references.

### Custom Domain Routing

Each creator can have their own custom domain (e.g., `hollyxo.com`). All domains point to the same single Vercel deployment. The middleware reads the incoming hostname, looks up which creator is mapped to that domain in the database, and serves their page.

Domain-to-creator mapping is cached in-memory with a 5-minute TTL for performance.

### Instagram In-App Browser Breakout

When a visitor opens the link from Instagram (which uses an in-app WebView), a banner appears with platform-specific instructions:
- **iOS**: Attempts to open via `x-safari-https://` scheme, falls back to `window.open`
- **Android**: Uses `intent://` scheme to open in Chrome

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

## Tech Stack

- **Framework**: Next.js 15 (App Router)
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
│   ├── [creator]/              # Public creator pages
│   │   ├── page.tsx            # Server component — fetches from DB, passes to client
│   │   └── CreatorPage.tsx     # Client component — all visual effects, age gate, bot evasion
│   ├── admin/                  # Admin dashboard (shadcn/ui)
│   │   ├── page.tsx            # Login page
│   │   ├── layout.tsx          # Admin layout with navigation
│   │   ├── AdminNav.tsx        # Sidebar navigation
│   │   ├── useAdminAuth.ts     # Auth hook (localStorage token)
│   │   ├── dashboard/          # Overview stats + recent activity
│   │   ├── creators/           # Creator CRUD + link management
│   │   │   ├── page.tsx        # Creator list + add/delete
│   │   │   └── [id]/page.tsx   # 5-tab editor (Profile/Theme/Effects/Avatar/Misc)
│   │   ├── analytics/          # Analytics dashboard
│   │   │   ├── page.tsx        # Analytics page wrapper
│   │   │   └── AnalyticsDashboard.tsx  # Charts + stats
│   │   └── domains/            # Domain management
│   │       └── page.tsx        # Add/remove domains, DNS instructions
│   ├── api/
│   │   ├── admin/              # Protected admin API routes
│   │   │   ├── creators/       # CRUD for creators
│   │   │   │   ├── route.ts    # GET (list) / POST (create)
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts      # GET / PUT / DELETE
│   │   │   │       └── links/
│   │   │   │           └── route.ts  # GET / POST / PUT / DELETE links
│   │   │   ├── domains/        # Vercel + Cloudflare domain management
│   │   │   │   ├── route.ts    # POST (add) / DELETE (remove)
│   │   │   │   └── status/
│   │   │   │       └── route.ts      # GET verification status
│   │   │   └── recent-events/
│   │   │       └── route.ts    # GET recent analytics events
│   │   ├── analytics/          # Analytics API (admin-key protected)
│   │   │   ├── [creator]/route.ts    # Per-creator stats
│   │   │   └── overview/route.ts     # All-creators summary
│   │   ├── creators/route.ts   # GET list of creator slugs
│   │   ├── honeypot/route.ts   # Bot honeypot endpoint
│   │   ├── links/[creator]/route.ts  # GET premium links (bot-filtered, rate-limited)
│   │   ├── pageview/route.ts   # POST pageview tracking
│   │   ├── redirect/[linkId]/route.ts  # Click tracking + 302 redirect
│   │   ├── resolve-domain/route.ts   # Internal domain → slug resolution
│   │   └── track/route.ts      # POST click tracking
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                # Default landing page
├── components/ui/              # shadcn/ui components
│   ├── badge.tsx
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── dropdown-menu.tsx
│   ├── input.tsx
│   ├── label.tsx
│   ├── popover.tsx
│   ├── select.tsx
│   ├── separator.tsx
│   ├── switch.tsx
│   ├── tabs.tsx
│   └── tooltip.tsx
├── lib/
│   ├── analytics.ts            # Legacy file-based analytics (kept for reference)
│   ├── bot-detect.ts           # Bot UA detection
│   ├── cloudflare-dns.ts       # Cloudflare DNS API client
│   ├── db.ts                   # Database layer — all CRUD + analytics queries
│   ├── types.ts                # TypeScript interfaces
│   ├── utils.ts                # shadcn/ui utility (cn helper)
│   └── vercel-domains.ts       # Vercel Domains API client
├── middleware.ts                # Bot detection + custom domain routing
├── scripts/
│   ├── migrate.ts              # DB schema creation + seed from creators.json
│   ├── migrate-v2.ts           # v2 ALTER TABLE migration (links + location)
│   └── migrate-v3.ts           # v3 ALTER TABLE migration (visual design system)
├── creators.json               # Sample creator data (used for seeding only)
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
- Global and per-creator statistics
- Metrics: page views (human vs bot), unique visitors, clicks, CTR, Instagram traffic %
- Breakdowns: device (mobile/desktop/tablet), country, top referrers, per-link clicks
- Time periods: today, 7 days, 30 days, all time
- Dark themed with CSS bar charts

### Domains (`/admin/domains`)
- List all custom domains registered with Vercel
- Add new domains (calls Vercel API)
- Remove domains
- View verification status and DNS instructions

## Custom Domains

### How it works

1. **Add domain in admin** → Calls Vercel Domains API to register the domain on the project
2. **Point DNS** → Set A record to `76.76.21.21` (or CNAME to `cname.vercel-dns.com` for subdomains)
3. **Middleware routes** → When a request comes in, middleware checks the hostname against the database, finds the mapped creator, and rewrites the request to their page
4. **SSL auto-provisioned** → Vercel handles certificate generation automatically

### DNS Records

| Type | Scenario | Name | Value |
|------|----------|------|-------|
| A | Root domain (`example.com`) | `@` | `76.76.21.21` |
| CNAME | Subdomain (`www.example.com`) | `www` | `cname.vercel-dns.com` |

### Scaling

One Vercel deployment handles all domains. There's no per-domain cost from Vercel. You only pay for the domains themselves ($8-12/year each from a registrar).

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
| `GET` | `/api/links/[creator]` | Get premium links for a creator (bot-filtered, rate-limited) |
| `POST` | `/api/track` | Record a click event |
| `POST` | `/api/pageview` | Record a page view event |
| `GET` | `/api/resolve-domain?domain=x` | Internal: resolve custom domain to creator slug |
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
| `POST` | `/api/admin/domains` | Add domain to Vercel (`{ "domain": "example.com" }`) |
| `DELETE` | `/api/admin/domains` | Remove domain (`{ "domain": "example.com" }`) |
| `GET` | `/api/admin/domains/status` | Get all domain verification statuses |
| `GET` | `/api/admin/recent-events` | Last 20 analytics events |

## Security Considerations

- **Admin key**: All admin routes require `CHARMLINK_ADMIN_KEY` via Bearer token. Set a strong, random key.
- **No credentials in code**: All secrets are environment variables.
- **Bot detection is defense-in-depth**: Multiple layers (UA matching, interaction gating, honeypot, rate limiting) make it progressively harder for bots to access premium links.
- **Rate limiting**: The links API limits to 30 requests/minute per IP to prevent scraping.
- **No NSFW in HTML source**: Premium link URLs never appear in server-rendered HTML, page source, or OG meta tags.
- **Honeypot monitoring**: Check Vercel function logs for `[honeypot]` entries to identify bot IPs.

## Roadmap

- [x] ~~Cloudflare DNS API integration~~ ✅ Shipped in v2
- [x] ~~Visual design system (gradients, effects, fonts)~~ ✅ Shipped in v3
- [x] ~~shadcn/ui admin dashboard~~ ✅ Shipped in v3
- [ ] Avatar image upload (currently URL-only)
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
