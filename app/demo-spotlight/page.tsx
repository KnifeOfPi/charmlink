import { CreatorPage } from "../[creator]/CreatorPage";
import { Creator, PremiumLink } from "../../lib/types";

export const dynamic = "force-dynamic";

// Clean data-URI imagery (no debug labels, no baked-in text).
function img(stops: string, w = 800, h = 800): string {
  return (
    "data:image/svg+xml;utf8," +
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>${stops}</linearGradient>` +
    `<radialGradient id='r' cx='50%25' cy='30%25'><stop offset='0%25' stop-color='white' stop-opacity='0.25'/><stop offset='100%25' stop-color='white' stop-opacity='0'/></radialGradient></defs>` +
    `<rect width='${w}' height='${h}' fill='url(%23g)'/><rect width='${w}' height='${h}' fill='url(%23r)'/></svg>`
  );
}
const s = (a: string, b: string) =>
  `<stop offset='0%25' stop-color='${a}'/><stop offset='100%25' stop-color='${b}'/>`;

const avatar = img(s("%23ff8fb1", "%23a855f7"), 400, 400);
const hero = img(s("%23c026d3", "%23120016"), 1200, 800);

const premium: PremiumLink[] = [
  { id: "p1", label: "Subscribe — 50% off", url: "#", icon: "heart", subtitle: "exclusive content, daily posts", badge: "HOT" },
  { id: "p2", label: "Custom content", url: "#", icon: "star", subtitle: "DM me what you want", badge: "VIP" },
  { id: "p3", label: "Chat with me", url: "#", icon: "message" },
];

const demo: Creator = {
  name: "Akira",
  tagline: "ur fav 🌸 come say hi",
  avatar,
  theme: { bgColor: "#1a0e1a", accentColor: "#ff4d8d", textColor: "#ffffff" },
  is_verified: true,
  template: "spotlight",
  username: "akira",
  hero_image_url: hero,
  hero_enabled: true,
  show_follower_count: true,
  follower_count_label: "2.6K",
  featured_card: { image_url: img(s("%23ff3b6b", "%23300018"), 1000, 600), label: "EXCLUSIVE CONTENT", url: "#" },
  gallery_thumbnails: [
    { image_url: img(s("%23ff8a5e", "%23a855f7"), 300, 300), url: "#" },
    { image_url: img(s("%23a855f7", "%23ff4d8d"), 300, 300), url: "#" },
    { image_url: img(s("%23ff4d8d", "%23120016"), 300, 300), url: "#" },
    { image_url: img(s("%23c026d3", "%23ff8a5e"), 300, 300), url: "#" },
  ],
  socialLinks: [
    { id: "s1", label: "Instagram", url: "#", icon: "instagram" },
    { id: "s2", label: "Threads", url: "#", icon: "threads" },
    { id: "s3", label: "X / Twitter", url: "#", icon: "twitter" },
    { id: "s4", label: "Reddit", url: "#", icon: "reddit" },
  ],
  premiumLinks: [],
};

export default function DemoSpotlight() {
  return <CreatorPage creator={demo} slug="demo-spotlight" isBot={false} previewPremiumLinks={premium} />;
}
