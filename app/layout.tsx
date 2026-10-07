import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";

// Self-hosted (see lib/fonts.ts for why not next/font/google).
const geist = localFont({ src: "../assets/fonts/geist-var.woff2", weight: "100 900", variable: "--font-sans" });

const inter = localFont({ src: "../assets/fonts/inter-var.woff2", weight: "100 900" });

export const metadata: Metadata = {
  title: "Creator Links",
  description: "Creator landing page",
};

// Mobile-first: without width=device-width, phones render at ~980px desktop
// width and zoom out, causing content to overflow the right edge. Required.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
