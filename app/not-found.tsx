import { headers } from "next/headers";
import Link from "next/link";
import { decoyHtml } from "../lib/decoy/themes";
import type { DecoyContext } from "../lib/decoy/themes";

export const runtime = "nodejs";

/**
 * Custom 404 page.
 *
 * On custom domains (creator landing pages), unknown paths should NOT leak
 * the stock Next.js 404 with its /_next assets and data-dpl-id fingerprint.
 * Instead, we serve a minimal branded 404 using the same decoy renderer.
 *
 * On the canonical app domain (charmrev.com), we serve a simple branded 404.
 */
export default async function NotFound() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isCanonicalDomain =
    host.includes("charmrev.com") || host.includes("vercel.app");

  if (isCanonicalDomain) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0414",
          color: "#f5eefc",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "2rem",
        }}
      >
        <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "1rem" }}>
          404
        </h1>
        <p style={{ color: "rgba(245,238,252,0.62)", marginBottom: "2rem" }}>
          This page doesn&apos;t exist.
        </p>
        <Link
          href="/"
          style={{
            color: "#c45bff",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Go home
        </Link>
      </div>
    );
  }

  // Custom domain: serve a minimal decoy 404. No creator profile available
  // here (we don't have a slug), so use a bare generic context.
  const ctx: DecoyContext = {
    slug: host,
    name: "Page Not Found",
    tagline: "This page does not exist.",
    avatarUrl: "data:,",
    theme: { bgColor: "#1a1a2e", accentColor: "#888", textColor: "#ccc" },
    links: [],
  };
  const html = decoyHtml(ctx);
  return (
    <div dangerouslySetInnerHTML={{ __html: html }} />
  );
}
