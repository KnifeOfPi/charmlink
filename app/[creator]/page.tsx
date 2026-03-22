import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Metadata } from "next";
import { getCreatorBySlug, getCreatorLinks } from "../../lib/db";
import { Creator } from "../../lib/types";
import { CreatorPage } from "./CreatorPage";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ creator: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { creator: slug } = await params;

  try {
    const creator = await getCreatorBySlug(slug);
    if (!creator) return { title: "Not Found" };

    return {
      title: `${creator.name} | Creator`,
      description: creator.tagline,
      openGraph: {
        title: creator.name,
        description: creator.tagline,
        images: creator.avatar_url ? [creator.avatar_url] : [],
        type: "profile",
      },
      twitter: {
        card: "summary",
        title: creator.name,
        description: creator.tagline,
      },
    };
  } catch {
    return { title: "Not Found" };
  }
}

export default async function CreatorPageServer({ params }: PageProps) {
  const { creator: slug } = await params;

  let creator: Creator;

  try {
    const dbCreator = await getCreatorBySlug(slug);
    if (!dbCreator) notFound();

    const links = await getCreatorLinks(dbCreator.id);
    const mapLink = (l: (typeof links)[0]) => ({
      id: l.id,
      label: l.label,
      url: l.url,
      icon: l.icon,
      subtitle: l.subtitle,
      badge: l.badge,
      sensitive: l.sensitive,
      image_url: l.image_url,
      deeplink_enabled: l.deeplink_enabled,
      recovery_url: l.recovery_url,
      redirect_url: l.redirect_url,
      // v3
      show_text_glow: l.show_text_glow,
      text_glow_color: l.text_glow_color,
      text_glow_intensity: l.text_glow_intensity,
      hover_animation: l.hover_animation,
      border_color: l.border_color,
      show_border: l.show_border,
      title_color: l.title_color,
      title_font_size: l.title_font_size,
    });

    const socialLinks = links.filter((l) => l.link_type === "social").map(mapLink);
    const premiumLinks = links.filter((l) => l.link_type === "premium").map(mapLink);

    creator = {
      name: dbCreator.name,
      tagline: dbCreator.tagline,
      avatar: dbCreator.avatar_url,
      socialLinks,
      premiumLinks,
      theme: {
        bgColor: dbCreator.theme_bg,
        accentColor: dbCreator.theme_accent,
        textColor: dbCreator.theme_text,
      },
      show_location: dbCreator.show_location,
      location_type: dbCreator.location_type,
      sensitive_default: dbCreator.sensitive_default,
      // v3 background
      bg_type: dbCreator.bg_type,
      bg_gradient_type: dbCreator.bg_gradient_type,
      bg_gradient_direction: dbCreator.bg_gradient_direction,
      bg_color_2: dbCreator.bg_color_2,
      bg_color_3: dbCreator.bg_color_3,
      // v3 floating icons
      show_floating_icons: dbCreator.show_floating_icons,
      floating_icon: dbCreator.floating_icon,
      floating_icon_count: dbCreator.floating_icon_count,
      // v3 stars
      show_stars: dbCreator.show_stars,
      stars_count: dbCreator.stars_count,
      stars_color: dbCreator.stars_color,
      animation_speed: dbCreator.animation_speed,
      // v3 avatar
      avatar_border_style: dbCreator.avatar_border_style,
      avatar_border_color_1: dbCreator.avatar_border_color_1,
      avatar_border_color_2: dbCreator.avatar_border_color_2,
      avatar_border_color_3: dbCreator.avatar_border_color_3,
      // v3 misc
      is_verified: dbCreator.is_verified,
      font: dbCreator.font,
      location_pill_color: dbCreator.location_pill_color,
    };
  } catch (err) {
    console.error("[creator:page] DB error", err);
    notFound();
  }

  const headersList = await headers();
  const isBot = headersList.get("x-is-bot") === "true";

  return <CreatorPage creator={creator} slug={slug} isBot={isBot} />;
}
