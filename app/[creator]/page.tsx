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
    const socialLinks = links
      .filter((l) => l.link_type === "social")
      .map((l) => ({
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
      }));
    const premiumLinks = links
      .filter((l) => l.link_type === "premium")
      .map((l) => ({
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
      }));

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
    };
  } catch (err) {
    console.error("[creator:page] DB error", err);
    notFound();
  }

  const headersList = await headers();
  const isBot = headersList.get("x-is-bot") === "true";

  return <CreatorPage creator={creator} slug={slug} isBot={isBot} />;
}
