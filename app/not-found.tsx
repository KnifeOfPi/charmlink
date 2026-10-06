import { headers } from "next/headers";
import { decoyHtml } from "../lib/decoy/themes";

export const runtime = "nodejs";

/**
 * Custom 404 page.
 *
 * On custom domains (creator landing pages), unknown paths should NOT leak
 * the stock Next.js 404 with its /_next assets and data-dpl-id fingerprint.
 * Instead, we serve the same decoy page that middleware serves to detected
 * bots — a wholesome blog post that looks like a real indie site.
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
          This page doesn't exist.
        </p>
        <a
          href="/"
          style={{
            color: "#c45bff",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Go home
        </a>
      </div>
    );
  }

  // Custom domain: serve decoy HTML. This prevents fingerprint leaks from
  // stock Next.js 404 pages (which include /_next assets and data-dpl-id).
  const html = decoyHtml(host);
  return (
    <div dangerouslySetInnerHTML={{ __html: html }} />
  );
}
