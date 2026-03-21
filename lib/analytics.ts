import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { AnalyticsEvent, PageViewEvent, ClickEvent, DeviceType } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const ANALYTICS_FILE = path.join(DATA_DIR, "analytics.jsonl");

// ── Device detection ─────────────────────────────────────────────────────────

export function detectDevice(ua: string): DeviceType {
  const lower = ua.toLowerCase();
  if (/ipad|tablet|kindle|silk|playbook/.test(lower)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|windows phone|opera mini/.test(lower)) return "mobile";
  return "desktop";
}

// Alias for backwards compatibility
export const parseDeviceType = detectDevice;

// ── File I/O ─────────────────────────────────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(ANALYTICS_FILE)) {
    fs.writeFileSync(ANALYTICS_FILE, "", "utf8");
  }
}

export function appendEvent(event: AnalyticsEvent): void {
  try {
    ensureDataDir();
    fs.appendFileSync(ANALYTICS_FILE, JSON.stringify(event) + "\n", "utf8");
  } catch (err) {
    console.error("[analytics] write error", err);
  }
}

export function readEvents(): AnalyticsEvent[] {
  try {
    ensureDataDir();
    const raw = fs.readFileSync(ANALYTICS_FILE, "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as AnalyticsEvent);
  } catch {
    return [];
  }
}

export function generateId(): string {
  return randomUUID();
}

// ── Period filtering ──────────────────────────────────────────────────────────

export type Period = "today" | "7d" | "30d" | "all";

export function filterByPeriod(events: AnalyticsEvent[], period: Period): AnalyticsEvent[] {
  if (period === "all") return events;
  const now = Date.now();
  const ms =
    period === "today"
      ? (() => {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          return now - d.getTime();
        })()
      : period === "7d"
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;
  const cutoff = now - ms;
  return events.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
}

// ── Stats builder ─────────────────────────────────────────────────────────────

export interface CreatorStats {
  creator: string;
  views: number;
  clicks: number;
  ctr: number;
  uniqueVisitors: number;
  referrers: Record<string, number>;
  devices: { mobile: number; tablet: number; desktop: number };
  countries: Record<string, number>;
  instagramViews: number;
  instagramClicks: number;
  dailyBreakdown: Record<string, { views: number; clicks: number }>;
  linkBreakdown: Record<string, { clicks: number; url: string }>;
  topLink: string | null;
}

export function buildCreatorStats(events: AnalyticsEvent[], creator: string): CreatorStats {
  const views = events.filter(
    (e): e is PageViewEvent => e.type === "pageview" && e.creator === creator && !e.isBot
  );
  const clicks = events.filter(
    (e): e is ClickEvent => e.type === "click" && e.creator === creator
  );

  const uniqueVisitors = new Set(views.map((e) => e.sessionId)).size;

  const referrers: Record<string, number> = {};
  views.forEach((e) => {
    const ref = e.referer || "direct";
    referrers[ref] = (referrers[ref] || 0) + 1;
  });

  const devices = { mobile: 0, tablet: 0, desktop: 0 };
  [...views, ...clicks].forEach((e) => {
    devices[e.device]++;
  });

  const countries: Record<string, number> = {};
  views.forEach((e) => {
    const c = e.country || "unknown";
    countries[c] = (countries[c] || 0) + 1;
  });

  const instagramViews = views.filter((e) => e.isInstagram).length;
  const instagramClicks = clicks.filter((e) => e.isInstagram).length;

  const dailyBreakdown: Record<string, { views: number; clicks: number }> = {};
  views.forEach((e) => {
    const day = e.timestamp.slice(0, 10);
    if (!dailyBreakdown[day]) dailyBreakdown[day] = { views: 0, clicks: 0 };
    dailyBreakdown[day].views++;
  });
  clicks.forEach((e) => {
    const day = e.timestamp.slice(0, 10);
    if (!dailyBreakdown[day]) dailyBreakdown[day] = { views: 0, clicks: 0 };
    dailyBreakdown[day].clicks++;
  });

  const linkBreakdown: Record<string, { clicks: number; url: string }> = {};
  clicks.forEach((e) => {
    if (!linkBreakdown[e.linkLabel]) linkBreakdown[e.linkLabel] = { clicks: 0, url: e.linkUrl };
    linkBreakdown[e.linkLabel].clicks++;
  });

  const topLink =
    Object.keys(linkBreakdown).sort(
      (a, b) => linkBreakdown[b].clicks - linkBreakdown[a].clicks
    )[0] || null;

  const ctr = views.length > 0 ? Math.round((clicks.length / views.length) * 100) : 0;

  return {
    creator,
    views: views.length,
    clicks: clicks.length,
    ctr,
    uniqueVisitors,
    referrers,
    devices,
    countries,
    instagramViews,
    instagramClicks,
    dailyBreakdown,
    linkBreakdown,
    topLink,
  };
}

export interface OverviewStats {
  totalViews: number;
  totalClicks: number;
  overallCtr: number;
  uniqueVisitors: number;
  creators: CreatorStats[];
}

export function buildOverviewStats(events: AnalyticsEvent[]): OverviewStats {
  const creators = Array.from(new Set(events.map((e) => e.creator)));
  const creatorStats = creators.map((c) => buildCreatorStats(events, c));

  const totalViews = creatorStats.reduce((s, c) => s + c.views, 0);
  const totalClicks = creatorStats.reduce((s, c) => s + c.clicks, 0);
  const uniqueVisitors = new Set(
    events
      .filter((e): e is PageViewEvent => e.type === "pageview" && !e.isBot)
      .map((e) => e.sessionId)
  ).size;
  const overallCtr = totalViews > 0 ? Math.round((totalClicks / totalViews) * 100) : 0;

  return { totalViews, totalClicks, overallCtr, uniqueVisitors, creators: creatorStats };
}
