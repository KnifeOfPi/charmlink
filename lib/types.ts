export interface SocialLink {
  id?: string;
  label: string;
  url: string;
  icon: string;
  subtitle?: string;
  badge?: string | null;
  sensitive?: boolean;
  image_url?: string;
  deeplink_enabled?: boolean;
  recovery_url?: string;
  redirect_url?: string;
  // v3 visual
  show_text_glow?: boolean;
  text_glow_color?: string;
  text_glow_intensity?: number;
  hover_animation?: string | null;
  border_color?: string | null;
  show_border?: boolean;
  title_color?: string | null;
  title_font_size?: string | null;
}

export interface PremiumLink {
  id?: string;
  label: string;
  url: string;
  icon: string;
  subtitle?: string;
  badge?: string | null;
  sensitive?: boolean;
  image_url?: string;
  deeplink_enabled?: boolean;
  recovery_url?: string;
  redirect_url?: string;
  // v3 visual
  show_text_glow?: boolean;
  text_glow_color?: string;
  text_glow_intensity?: number;
  hover_animation?: string | null;
  border_color?: string | null;
  show_border?: boolean;
  title_color?: string | null;
  title_font_size?: string | null;
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
  show_location?: boolean;
  location_type?: string;
  sensitive_default?: boolean;
  // v3 background
  bg_type?: string;
  bg_gradient_type?: string;
  bg_gradient_direction?: string;
  bg_color_2?: string;
  bg_color_3?: string | null;
  // v3 floating icons
  show_floating_icons?: boolean;
  floating_icon?: string;
  floating_icon_count?: number;
  // v3 stars
  show_stars?: boolean;
  stars_count?: number;
  stars_color?: string;
  animation_speed?: number;
  // v3 avatar
  avatar_border_style?: string;
  avatar_border_color_1?: string;
  avatar_border_color_2?: string;
  avatar_border_color_3?: string;
  // v3 misc
  is_verified?: boolean;
  font?: string;
  location_pill_color?: string | null;
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
