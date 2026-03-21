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
| `/api/pageview` | Page view tracking endpoint |
| `/api/analytics/[creator]` | Per-creator analytics (GET, auth required) |
| `/api/analytics/overview` | All-creator overview (GET, auth required) |
| `/admin/analytics` | Analytics dashboard UI |

## Analytics

### Dashboard

Visit `/admin/analytics?key=YOUR_KEY` to see the analytics dashboard.

Set `GHOSTLINK_ADMIN_KEY` in your environment to protect it.

### What Is Tracked

**Page Views** (via `/api/pageview`):
- Creator, timestamp, user-agent, referer
- Country (from `x-vercel-ip-country` header)
- Device type (mobile/tablet/desktop)
- Bot vs human, Instagram vs other

**Clicks** (via `/api/track`):
- All social link clicks + premium link clicks
- Same metadata as page views
- Link type (social vs premium) for CTR calculation

### Tracking Performance

All client-side tracking uses `navigator.sendBeacon` (falls back to `fetch` with `keepalive: true`). This is fire-and-forget — it does NOT block navigation or slow down the page.

### Analytics API

| Endpoint | Description |
|----------|-------------|
| `GET /api/analytics/[creator]?period=7d&key=KEY` | Per-creator stats |
| `GET /api/analytics/overview?period=30d&key=KEY` | All creators summary |

Period options: `today`, `7d`, `30d`, `all`

### Storage & Migration

Data is stored in `data/analytics.json` as an array of events (append-only). This file is gitignored.

**Migration path to SQLite:**
1. Create a SQLite schema with `events` table matching the event types
2. Replace `appendEvent()` and `readEvents()` in `lib/analytics.ts` with better-sqlite3 calls
3. `buildSummary()` can be replaced with SQL aggregation queries

**Migration path to Postgres/Supabase:**
1. Use `pg` or Supabase client
2. Same schema — one `events` table with `type`, `creator`, `timestamp`, and JSONB `data` column
3. Replace the two functions in `lib/analytics.ts`

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
