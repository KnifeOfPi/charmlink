const LINK_PREVIEW_PATTERNS = [
  "facebookexternalhit",
  "facebot",
  "twitterbot",
  "linkedinbot",
  "slackbot",
  "whatsapp",
  "telegrambot",
  "discordbot",
  "pinterestbot",
  "skypeuripreview",
  "embedly",
  "redditbot",
  "applebot",
];

export function isLinkPreviewScraper(ua: string | null | undefined): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return LINK_PREVIEW_PATTERNS.some((p) => lower.includes(p));
}
