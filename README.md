# GhostLink

Self-hosted Instagram-safe landing page system for OnlyFans/Fanvue creators.

## What It Does

Creator landing pages served on a custom domain (e.g. `links.example.com/holly`). Instagram bio links point here. The page looks like a clean branded link-in-bio page to IG's crawler bot, but shows the real OF/Fanvue links to actual human visitors via client-side JS only.

## How It Works

1. **Bot Detection**: `middleware.ts` checks the User-Agent header for known bot patterns (Instagram/Facebook crawlers, Googlebot, etc.) and sets an `x-is-bot` header.

2. **Server Render (Bots)**: The server component reads this header and passes `isBot=true` to the page. The HTML only contains clean social links — no OF URLs anywhere.

3. **Client-Side Premium Links (Humans)**: After a 2-second delay, the client component fetches `/api/links/[creator]` which also checks user-agent and returns the premium links. These are injected into the DOM client-side only — never in the initial HTML.

4. **IG Browser Breakout**: When the Instagram in-app browser is detected, a banner prompts users to open in their real browser.

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/KnifeOfPi/ghostlink.git
cd ghostlink
npm install
```

### 2. Configure Creators

Edit `creators.json` in the root directory:

```json
{
  "yourcreator": {
    "name": "Creator Name",
    "tagline": "Your tagline here",
    "avatar": "/avatars/yourcreator.jpg",
    "socialLinks": [
      { "label": "Twitter", "url": "https://twitter.com/handle", "icon": "twitter" }
    ],
    "premiumLinks": [
      { "label": "OnlyFans", "url": "https://onlyfans.com/handle", "icon": "star" }
    ],
    "theme": {
      "bgColor": "#0a0a0a",
      "accentColor": "#e91e8a",
      "textColor": "#ffffff"
    }
  }
}
```

### 3. Add Avatars

Drop avatar images in `public/avatars/`. Reference them as `/avatars/filename.jpg` in `creators.json`.

### 4. Run Dev Server

```bash
npm run dev
```

Visit `http://localhost:3000/holly` to see a creator page.

### 5. Deploy to Vercel

```bash
vercel --prod
```

Or connect the GitHub repo to Vercel for automatic deployments.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GHOSTLINK_SECRET` | Optional API key for the /api/links endpoint (future use) |
| `GHOSTLINK_ADMIN_KEY` | Secret key to protect the analytics API and dashboard |

## Routes

| Route | Description |
|-------|-------------|
| `/[creator]` | Creator landing page |
| `/api/links/[creator]` | Returns premium links (bot-filtered) |
| `/api/track` | Click tracking endpoint |
| `/api/analytics/pageview` | Page view ingestion (POST) |
| `/api/analytics/[creator]` | Per-creator analytics (GET, auth required) |
| `/api/analytics/overview` | All-creator overview (GET, auth required) |
| `/admin/analytics` | Analytics dashboard UI |

## Analytics

GhostLink includes a built-in analytics system that tracks page views and link clicks.

### Data Storage

Events are stored locally in `data/analytics.jsonl` (JSONL format, one JSON object per line). This file is **not committed to git** — it stays on the server.

On Vercel, since the filesystem is ephemeral, analytics data resets on each deployment. For persistent analytics, consider pointing the write path to a mounted volume or replacing the file store with a database (e.g. PlanetScale, Supabase, or Vercel KV).

### What's Tracked

**Page Views** (fires automatically on every visitor):
- Creator, timestamp, user agent, referrer
- Country (from Vercel's `x-vercel-ip-country` header)
- Device type (mobile / tablet / desktop)
- Bot detection flag
- Instagram in-app browser flag
- Session ID (stored in `sessionStorage`)

**Clicks** (fires when a visitor taps a premium link):
- Same fields as page view, plus `linkLabel` and `linkUrl`

### Accessing the Dashboard

1. Set `GHOSTLINK_ADMIN_KEY` in your Vercel environment variables (or `.env.local`)
2. Visit `/admin/analytics?key=YOUR_KEY`
3. Or enter the key manually on the login screen at `/admin/analytics`

The dashboard shows:
- **Overview cards**: total views, clicks, CTR, unique visitors
- **Per-creator table**: sortable by views, with CTR highlight
- **Expandable rows**: click any creator for detailed breakdown
  - Clicks by link
  - Top referrers
  - Device split
  - Top 5 countries
  - Instagram vs. other traffic %
  - Daily bar chart (last 14 days)
- **Period selector**: Today / 7 Days / 30 Days / All Time

### Analytics API

Both endpoints require `Authorization: Bearer YOUR_KEY` header (unless `GHOSTLINK_ADMIN_KEY` is not set).

```bash
# Per-creator stats
curl -H "Authorization: Bearer YOUR_KEY" \
  https://your-domain.com/api/analytics/holly?period=7d

# Overview (all creators)
curl -H "Authorization: Bearer YOUR_KEY" \
  https://your-domain.com/api/analytics/overview?period=30d
```

Supported `?period=` values: `today`, `7d`, `30d`, `all`

## Adding a Creator

1. Add entry to `creators.json`
2. Add avatar to `public/avatars/`
3. Deploy

No database required for v1.

## Icon Reference

Available icons for `socialLinks` and `premiumLinks`:
- `twitter` — Twitter/X
- `tiktok` — TikTok
- `instagram` — Instagram
- `youtube` — YouTube
- `star` — (good for premium)
- `crown` — (good for VIP)
- `heart` — (good for exclusive)

## Security Notes

- Premium links NEVER appear in server-rendered HTML
- The `/api/links/[creator]` endpoint also blocks bots
- Even if someone views page source, they will not find OF URLs
- All premium link delivery is 100% client-side after 2s delay
