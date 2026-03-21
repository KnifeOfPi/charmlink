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

## Routes

| Route | Description |
|-------|-------------|
| `/[creator]` | Creator landing page |
| `/api/links/[creator]` | Returns premium links (bot-filtered) |
| `/api/track` | Click tracking endpoint |

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
