import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { Metadata } from "next";
import { getLinkById, getCreatorById } from "../../../lib/db";
import AgeGateScreen from "../../[creator]/AgeGateScreen";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ linkId: string }>;
}

// Always generic — never leak link metadata to scrapers.
export const metadata: Metadata = {
  title: "Continue",
  description: "Redirecting…",
  robots: { index: false, follow: false },
};

/**
 * Per-link redirect interstitial.
 *
 *  - Non-sensitive link  → server-redirect to /api/redirect/[linkId] (no friction).
 *  - Sensitive link + cl_age=1 cookie → server-redirect to /api/redirect/[linkId].
 *  - Sensitive link, no cookie → render age gate. Confirm → posts /api/age-confirm,
 *    then the client navigates back to this same URL, which now redirects through.
 *
 * The actual destination URL is NEVER rendered on this page until the user has
 * confirmed age. The redirect happens server-side (302) so the URL never lands
 * in the page HTML.
 */
export default async function RedirectInterstitial({ params }: PageProps) {
  const { linkId } = await params;

  // Basic shape check — link IDs are uuids; refuse anything else to keep this
  // route from being abused as an open scraper of DB rows.
  if (!/^[0-9a-fA-F-]{16,64}$/.test(linkId)) {
    notFound();
  }

  let link;
  try {
    link = await getLinkById(linkId);
  } catch (err) {
    console.error("[r:get] getLinkById failed", err);
    notFound();
  }

  if (!link || !link.is_active) {
    notFound();
  }

  // Resolve sensitivity: explicit per-link `sensitive` OR creator's `sensitive_default`.
  let sensitive = Boolean(link.sensitive);
  if (!sensitive) {
    try {
      const creator = await getCreatorById(link.creator_id);
      if (creator?.sensitive_default) {
        sensitive = true;
      }
    } catch {
      // If we can't resolve the creator, fall back to the per-link flag.
    }
  }

  const cookieStore = await cookies();
  const ageConfirmed = cookieStore.get("cl_age")?.value === "1";

  // Non-sensitive OR already confirmed → straight through to the redirect handler.
  // The redirect handler does URL validation, click tracking, and emits the 302.
  if (!sensitive || ageConfirmed) {
    redirect(`/api/redirect/${linkId}`);
  }

  // Sensitive + no confirmation → render the gate. After confirm, the button
  // navigates back to this same `/r/[linkId]` URL, which on reload will fall
  // into the "ageConfirmed" branch above and redirect through.
  return <AgeGateScreen redirectTo={`/r/${linkId}`} />;
}
