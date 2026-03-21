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
