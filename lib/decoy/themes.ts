// ─────────────────────────────────────────────────────────────────────────────
// Decoy landing-page mirror — bot-only response that looks like the real
// creator page but contains ONLY social-media links (no premium/OF links).
//
// Replaces the old 10-blog-theme system (2026-10-19).
//
// Goal: when a link-preview scraper / Meta crawler hits a creator domain,
// we return a page that:
//   1. Visually mirrors the real landing page (avatar, name, tagline,
//      background, link buttons) so the page reads as the creator's genuine
//      brand presence to Meta's scoring algos.
//   2. Contains ONLY social links marked show_in_decoy=true — never premium
//      or sensitive links. A creator with no decoy links still gets a
//      minimal branded page (avatar + name + tagline).
//   3. Has NO Charmlink/Vercel/Next.js fingerprints (no /_next/static, no
//      data-dpl-id, no cl-* identifiers, no external JS).
//   4. Is deterministic per-slug: same slug → same HTML every build (the
//      creator's real profile is already stable; no hash needed).
//   5. Differs across creators: each creator's decoy carries THEIR actual
//      brand identity, which is exactly what a real personal site looks like.
//
// The output HTML is built by decoyHtml(ctx) below. Total payload is ~2-5 KB.
// No external assets except the avatar image (hotlinked from the creator's
// real avatar_url, which serves the real page anyway — no new signal).
// ─────────────────────────────────────────────────────────────────────────────

export interface DecoyLink {
  label: string;
  url: string;
  icon: string;
}

export interface DecoyContext {
  slug: string;
  name: string;
  tagline: string;
  avatarUrl: string;
  theme: {
    bgColor: string;
    accentColor: string;
    textColor: string;
    bgType?: string;
    bgColor2?: string;
    bgColor3?: string | null;
  };
  links: DecoyLink[];
}

// ─── HTML escaping ──────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Icon label from emoji/name ─────────────────────────────────────────────

function iconLabel(icon: string, label: string): string {
  if (/^[\p{Emoji}]/u.test(icon)) return icon;
  const map: Record<string, string> = {
    instagram: "📸",
    twitter: "🐦",
    x: "𝕏",
    tiktok: "🎵",
    youtube: "▶️",
    twitch: "🎮",
    snapchat: "👻",
    discord: "💬",
    spotify: "🎧",
    link: "🔗",
    onlyfans: "🔒",
    fanvue: "🔒",
    patreon: "⭐",
    linktree: "🌳",
    website: "🌐",
  };
  return map[icon.toLowerCase()] ?? label;
}

// ─── Background CSS ─────────────────────────────────────────────────────────

function bgStyle(ctx: DecoyContext): string {
  const { bgColor, bgType, bgColor2, bgColor3 } = ctx.theme;
  if (bgType === "gradient" && bgColor2) {
    const stops = bgColor3 ? `${bgColor}, ${bgColor2}, ${bgColor3}` : `${bgColor}, ${bgColor2}`;
    return `background:linear-gradient(to bottom,${stops})`;
  }
  return `background:${bgColor}`;
}

// ─── Main renderer ──────────────────────────────────────────────────────────

export function decoyHtml(ctx: DecoyContext): string {
  const name = esc(ctx.name);
  const tagline = esc(ctx.tagline);
  const avatarUrl = esc(ctx.avatarUrl);
  const accent = esc(ctx.theme.accentColor);
  const text = esc(ctx.theme.textColor);
  const bg = bgStyle(ctx);
  const slugEsc = esc(ctx.slug);

  const linkButtons = ctx.links.length > 0
    ? ctx.links.map((l) => {
        const icon = iconLabel(l.icon, l.label);
        const label = esc(l.label);
        const url = esc(l.url);
        return `<a href="${url}" rel="nofollow noopener" style="display:block;width:100%;max-width:320px;margin:0 auto 12px;padding:14px 18px;border-radius:14px;text-align:center;text-decoration:none;color:${text};background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.10);font-size:15px;font-weight:500;letter-spacing:0.2px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)">${icon} ${label}</a>`;
      }).join("\n")
    : `<p style="color:${text};opacity:0.45;font-size:13px;margin-top:8px">links coming soon</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name}</title>
<meta name="description" content="${tagline}">
<meta name="robots" content="noindex,nofollow,noarchive">
<meta property="og:title" content="${name}">
<meta property="og:description" content="${tagline}">
<meta property="og:type" content="profile">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${name}">
<meta name="twitter:description" content="${tagline}">
<link rel="icon" href="data:,">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;${bg};min-height:100vh;color:${text}}
  .container{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;min-height:100vh;padding:60px 18px 48px}
  .card{position:relative;z-index:1;width:100%;max-width:440px;display:flex;flex-direction:column;align-items:center}
  .avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;border:3px solid ${accent};box-shadow:0 0 30px ${accent}33;margin-bottom:20px}
  h1{font-size:30px;font-weight:700;letter-spacing:0.2px;margin-bottom:4px}
  .tagline{font-size:14px;opacity:0.55;font-weight:450;margin-bottom:30px;text-align:center;max-width:300px}
  .links{width:100%;display:flex;flex-direction:column;align-items:center}
  footer{margin-top:34px;font-size:11px;opacity:0.25;letter-spacing:0.3px}
  @media(prefers-color-scheme:dark){body{color-scheme:dark}}
</style>
</head>
<body>
<div class="container">
  <div class="card">
    <img class="avatar" src="${avatarUrl}" alt="${name}" width="96" height="96">
    <h1>${name}</h1>
    ${tagline ? `<p class="tagline">${tagline}</p>` : ""}
    <div class="links">
      ${linkButtons}
    </div>
    <footer>&copy; ${slugEsc} &middot; all links verified</footer>
  </div>
</div>
</body>
</html>
`;
}