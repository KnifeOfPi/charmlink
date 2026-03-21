export interface SocialLink {
  label: string;
  url: string;
  icon: string;
}

export interface PremiumLink {
  label: string;
  url: string;
  icon: string;
}

export interface CreatorTheme {
  bgColor: string;
  accentColor: string;
  textColor: string;
}

export interface Creator {
  name: string;
  tagline: string;
  avatar: string;
  socialLinks: SocialLink[];
  premiumLinks: PremiumLink[];
  theme: CreatorTheme;
}

export interface CreatorsConfig {
  [slug: string]: Creator;
}

// Analytics Types

export type DeviceType = "mobile" | "tablet" | "desktop";

export interface PageViewEvent {
  type: "pageview";
  id: string; // UUID
  creator: string;
  timestamp: string; // ISO
  userAgent: string;
  referer: string;
  country: string;
  device: DeviceType;
  isBot: boolean;
  isInstagram: boolean;
  sessionId: string;
}

export interface ClickEvent {
  type: "click";
  id: string; // UUID
  creator: string;
  linkLabel: string;
  linkUrl: string;
  linkType: "social" | "premium";
  timestamp: string;
  userAgent: string;
  referer: string;
  country: string;
  device: DeviceType;
  isInstagram: boolean;
  sessionId: string;
}

export type AnalyticsEvent = PageViewEvent | ClickEvent;

export interface AnalyticsSummary {
  creator: string;
  period: "today" | "7d" | "30d" | "all";
  totalViews: number;
  humanViews: number;
  botViews: number;
  uniqueSessions: number;
  totalClicks: number;
  premiumClicks: number;
  socialClicks: number;
  ctr: number; // premiumClicks / humanViews
  topReferrers: Array<{ referer: string; count: number }>;
  deviceBreakdown: Record<DeviceType, number>;
  countryBreakdown: Array<{ country: string; count: number }>;
  instagramTraffic: number;
  linkBreakdown: Array<{ label: string; url: string; type: string; clicks: number }>;
}
