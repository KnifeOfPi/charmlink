const BOT_UA_PATTERNS = [
  "facebookexternalhit",
  "facebot",
  "twitterbot",
  "googlebot",
  "bingbot",
  "bytespider",
  "crawler",
  "spider",
  "bot",
];

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_UA_PATTERNS.some((pattern) => ua.includes(pattern));
}

export function isInstagramBrowser(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return userAgent.toLowerCase().includes("instagram");
}
