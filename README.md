# CharmLink

Self-hosted Instagram-safe landing page system for OnlyFans/Fanvue creators — powered by Supabase (Postgres).

## What It Does

Creator landing pages served at `yourapp.vercel.app/[slug]` or on a custom domain. Instagram bio links point here. The page shows clean branded links to IG's crawler bot, but delivers real OF/Fanvue links to human visitors via client-side JS only.

## How It Works

1. **Bot Detection**: `middleware.ts` checks the User-Agent for bot patterns and sets an `x-is-bot` header.
2. **Custom Domain Routing**: If a request comes in on a custom domain (e.g. `holly.example.com`), middleware resolves it to the creator's slug and rewrites the request.
3. **Server Render (Bots)**: Server component reads `x-is-bot` and passes it down. Bots see only clean social links — no OF URLs in HTML.
4. **Client-Side Premium Links (Humans)**: After 2s delay, client fetches `/api/links/[creator]` (bot-filtered). Premium links are injected client-side only.
5. **Analytics**: All events stored in Supabase. Admin dashboard at `/admin`.

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/KnifeOfPi/charmlink.git
cd charmlink
npm install
```

### 2. Environment Variables

Create `.env.local`:

```bash
# Required: Supabase / Postgres connection string
DATABASE_URL=postgresql://postgres.xxxxx:PASSWORD@aws-0-us-west-2.pooler.supabase.com:5432/postgres

# Required: Admin dashboard password
CHARMLINK_ADMIN_KEY=your-secret-key-here

# Required for custom domain management via Vercel API
VERCEL_API_TOKEN=your-vercel-api-token
VERCEL_PROJECT_ID=prj_atmyzfcHyNhhuhcAD2TWvGIeVHfl
```

### 3. Run Database Migration

```bash
# Create tables only:
npx tsx scripts/migrate.ts

# Create tables + import creators.json:
npx tsx scripts/migrate.ts --seed
```

### 4. Run Dev Server

```bash
npm run dev
```

### 5. Deploy to Vercel

```bash
vercel --prod
```

Set all env vars in Vercel dashboard → Project Settings → Environment Variables.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Supabase/Postgres connection string |
| `CHARMLINK_ADMIN_KEY` | ✅ | Password for admin dashboard |
| `VERCEL_API_TOKEN` | Optional | Vercel API token for custom domain management |
| `VERCEL_PROJECT_ID` | Optional | Vercel project ID (`prj_atmyzfcHyNhhuhcAD2TWvGIeVHfl`) |

## Admin Dashboard

Visit `/admin` and enter your `CHARMLINK_ADMIN_KEY`.

### Pages
| Page | Description |
|------|-------------|
| `/admin/dashboard` | Overview: total views, clicks, CTR, recent activity |
| `/admin/creators` | Create, edit, delete creators |
| `/admin/creators/[id]` | Full edit: details, links, domain, per-creator analytics |
| `/admin/analytics` | Analytics dashboard across all creators |
| `/admin/domains` | Add/remove custom domains via Vercel API |

## Routes

| Route | Description |
|-------|-------------|
| `/[creator]` | Creator landing page |
| `/api/links/[creator]` | Premium links (bot-filtered, human-only) |
| `/api/track` | Click tracking |
| `/api/pageview` | Page view tracking |
| `/api/analytics/[creator]` | Per-creator analytics (auth required) |
| `/api/analytics/overview` | All-creator overview (auth required) |
| `/api/admin/creators` | GET/POST creators |
| `/api/admin/creators/[id]` | GET/PUT/DELETE creator |
| `/api/admin/creators/[id]/links` | GET/POST/PUT/DELETE links |
| `/api/admin/domains` | POST/DELETE Vercel domains |
| `/api/admin/domains/status` | GET Vercel domain status |
| `/api/resolve-domain` | Resolves custom domain → creator slug (used by middleware) |

## Custom Domains

1. Add the creator in `/admin/creators`, set Custom Domain field
2. Go to `/admin/domains` → Add the domain to Vercel
3. Follow the DNS instructions shown in the UI (A record: `76.76.21.21`, CNAME: `cname.vercel-dns.com`)
4. Once verified, `holly.example.com/` will serve that creator's page

## Database Schema

Tables: `charmlink_creators`, `charmlink_links`, `charmlink_events`

Run `npx tsx scripts/migrate.ts` to create them. See `scripts/migrate.ts` for full schema.

## Icon Reference

| Icon key | Display |
|----------|---------|
| `twitter` | 𝕏 Twitter |
| `tiktok` | ♪ TikTok |
| `instagram` | 📸 Instagram |
| `youtube` | ▶ YouTube |
| `star` | ⭐ Premium |
| `crown` | 👑 VIP |
| `heart` | 💖 Exclusive |
| `link` | 🔗 Generic |

## Security Notes

- Premium links **never** appear in server-rendered HTML
- `/api/links/[creator]` also checks user-agent, returns empty for bots
- All premium link delivery is 100% client-side after 2s delay
- Admin routes require `CHARMLINK_ADMIN_KEY` Bearer token
- `creators.json` kept as reference only — all live data from Supabase
