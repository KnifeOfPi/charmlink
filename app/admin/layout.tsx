import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CharmLink Admin",
  robots: "noindex, nofollow",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // The whole admin is dark. Pages built on shadcn tokens (bg-background,
  // bg-card) were resolving to the light :root palette because nothing ever
  // applied `.dark` — the dark values existed in globals.css the whole time,
  // just unreachable. The variant is defined as `&:is(.dark *)`, so the class
  // has to sit on an ANCESTOR of the pages, which is what this wrapper is for.
  // Pages that hardcode #0a0a0a are unaffected; they simply override.
  return (
    <div className="dark bg-[#0a0a0a] text-foreground min-h-screen">{children}</div>
  );
}
