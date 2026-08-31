import { cache } from "react";
import { notFound } from "next/navigation";
import { headers, cookies } from "next/headers";
import { Metadata } from "next";
import { getCreatorBySlug, getCreatorLinks } from "../../lib/db";
import { Creator } from "../../lib/types";
import { CreatorPage } from "./CreatorPage";
import { AutoRedirect } from "./AutoRedirect";
import { isLinkPreviewScraper } from "../../lib/scraper-detect";
import { generateLinkToken } from "../../lib/link-token";
import { pickAvatar } from "../../lib/avatar-rotation";
import { HANDOFF_AVATAR_PARAM, isUuid } from "../../lib/handoff";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ creator: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const GENERIC_METADATA: Metadata = {
  title: "Creator Profile",
  description: "Personal landing page",
  openGraph: {
    type: "website",
    title: "Creator Profile",
    description: "Personal landing page",
  },
  twitter: {
    card: "summary",
    title: "Creator Profile",
    description: "Personal landing page",
  },
  robots: { index: false, follow: false },
};

/** The share-preview payload — the part a crawler actually surfaces. Kept
 *  generic for anyone who hasn't confirmed their age (which is every bot, since
 *  bots carry no cookies). */
const GENERIC_PREVIEW: Pick<Metadata, "description" | "openGraph" | "twitter" | "robots"> = {
  description: GENERIC_METADATA.description,
  openGraph: GENERIC_METADATA.openGraph,
  twitter: GENERIC_METADATA.twitter,
  robots: GENERIC_METADATA.robots,
};

// generateMetadata and the page body both need the creator row. React's
// per-request cache collapses them into a single query — without it, giving the
// tab a real title would have added a second DB round trip to every pageview.
const getCreatorCached = cache(getCreatorBySlug);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { creator: slug } = await params;

  const headersList = await headers();
  const ua = headersList.get("user-agent") ?? "";
  const cookieStore = await cookies();
  const hasAgeCookie = cookieStore.get("cl_age")?.value === "1";

  // A recognised link-preview crawler gets nothing identifying, title included.
  if (isLinkPreviewScraper(ua)) {
    return GENERIC_METADATA;
  }

  try {
    const creator = await getCreatorCached(slug);
    if (!creator) return { title: "Not Found" };

    // The browser tab shows the creator's name for everyone. The share preview
    // (og:image, og:description) stays generic until the visitor is age
    // confirmed — that payload is what a crawler republishes, and the avatar
    // and tagline in it are far more identifying than a name in a <title>.
    if (!hasAgeCookie) {
      return { title: creator.name, ...GENERIC_PREVIEW };
    }

    return {
      title: creator.name,
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

export default async function CreatorPageServer({ params, searchParams }: PageProps) {
  const { creator: slug } = await params;

  // Per-link age gate (Phase 4): the site-wide age gate has been removed.
  // Anyone (including non-age-confirmed visitors) can view the creator page.
  // Sensitive links route through `/r/[linkId]` interstitial, which enforces
  // the age confirmation before revealing the real URL.
  const cookieStore = await cookies();
  const hasAgeCookie = cookieStore.get("cl_age")?.value === "1";

  // ── Fetch creator data ────────────────────────────────────────────────────
  // Only the DB calls belong inside the try. `notFound()` signals by THROWING
  // a Next control-flow error (NEXT_HTTP_ERROR_FALLBACK;404), so calling it
  // inside the try meant the catch swallowed it, logged an ordinary
  // missing-creator 404 as "[creator:page] DB error", and left real database
  // failures indistinguishable from bad slugs in the logs.
  let dbCreator: Awaited<ReturnType<typeof getCreatorBySlug>>;
  let links: Awaited<ReturnType<typeof getCreatorLinks>>;

  try {
    dbCreator = await getCreatorCached(slug);
    links = dbCreator ? await getCreatorLinks(dbCreator.id) : [];
  } catch (err) {
    // A genuine DB/connection failure. Worth logging loudly.
    console.error("[creator:page] DB error", slug, err);
    notFound();
  }

  // No such creator — a normal 404, not an error condition. Not logged.
  if (!dbCreator) notFound();

  // ── Auto-redirect sites ────────────────────────────────────────────────────
  // No landing page: hand the visitor straight to the target, escaping the
  // in-app browser on the way. Placed BEFORE any of the page-building work
  // below because none of it is needed — and deliberately AFTER the creator
  // lookup, so a redirect site still 404s for a bad slug like any other.
  //
  // Cloaking is already handled upstream: middleware serves the decoy for
  // anything it flags as a crawler before this route runs, so a bot never
  // reaches this branch and never learns the destination.
  if (dbCreator.autoredirect_link_id) {
    const target = links.find(
      (l) => l.id === dbCreator.autoredirect_link_id && l.is_active
    );
    // A target that is missing or deactivated falls through to the normal
    // landing page rather than erroring — the site degrades, it does not break.
    if (target) {
      const headersList = await headers();
      const flaggedBot = headersList.get("x-is-bot") === "true";
      return (
        <AutoRedirect
          slug={slug}
          // Defence in depth. Cloaking should mean a crawler never reaches this
          // branch at all — verified in production, a Meta UA gets the decoy
          // blog before the rewrite even runs. But `targetUrl` is a client-
          // component prop, so Next serialises it into the HTML: anything that
          // DID slip through would read the OnlyFans destination straight out of
          // the page source, even though the isBot guard stops the redirect
          // itself. Withholding it means the worst case is a blank holding page
          // that names nothing. The landing page has no equivalent exposure —
          // its links load from the token-gated API, never inline.
          targetUrl={flaggedBot ? "" : target.redirect_url || target.url}
          linkId={flaggedBot ? "" : target.id}
          linkLabel={flaggedBot ? "" : target.label}
          isBot={flaggedBot}
        />
      );
    }
  }

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

  // Avatar carousel: when the creator has candidate photos, one is chosen per
  // render and its id rides along on this session's events so the conversion
  // can be attributed back to the photo that was actually on screen. Creators
  // without a carousel keep their single avatar_url and record no attribution.
  //
  // A visitor escaping an in-app browser loads this page a second time in the
  // real browser, and that render would otherwise draw a different photo — so
  // the one they already saw travels with them and is honoured here. See
  // lib/handoff.ts.
  const carriedAvatar = (await searchParams)[HANDOFF_AVATAR_PARAM];
  const chosenAvatar = await pickAvatar(
    slug,
    // The MODEL's id, not this site's: the pool and its stats are hers, shared
    // across every domain she owns.
    dbCreator.model_id,
    typeof carriedAvatar === "string" && isUuid(carriedAvatar) ? carriedAvatar : null
  );

  const creator: Creator = {
    name: dbCreator.name,
    tagline: dbCreator.tagline,
    avatar: chosenAvatar?.url ?? dbCreator.avatar_url,
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
    avatar_shape: dbCreator.avatar_shape,
    avatar_border_style: dbCreator.avatar_border_style,
    avatar_border_color_1: dbCreator.avatar_border_color_1,
    avatar_border_color_2: dbCreator.avatar_border_color_2,
    avatar_border_color_3: dbCreator.avatar_border_color_3,
    // v3 misc
    is_verified: dbCreator.is_verified,
    font: dbCreator.font,
    location_pill_color: dbCreator.location_pill_color,
  };

  const headersList = await headers();
  const isBot = headersList.get("x-is-bot") === "true";

  // Generate HMAC token bound to slug + 5-min bucket + age confirmation.
  // Token is bound to the visitor's current age-confirmation state so that the
  // links API can serve the appropriate (sanitized vs full) payload. It is
  // deliberately NOT bound to the client IP — see lib/link-token.ts.
  const linkToken = generateLinkToken(slug, hasAgeCookie);

  return (
    <>
      <script
        id="cl-token"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({ token: linkToken, slug }) }}
      />
      <CreatorPage
        creator={creator}
        slug={slug}
        isBot={isBot}
        avatarId={chosenAvatar?.id ?? null}
        avatarFocalX={chosenAvatar?.focalX}
        avatarFocalY={chosenAvatar?.focalY}
      />
    </>
  );
}
