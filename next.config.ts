import type { NextConfig } from "next";

// Supabase storage hostname from env, e.g. abcxyz.supabase.co
// Falls back to a wildcard pattern that covers all Supabase projects.
function supabaseHostname(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  try {
    return new URL(url).hostname;
  } catch {
    return "*.supabase.co";
  }
}

const nextConfig: NextConfig = {
  // Suppress the `x-powered-by: Next.js` header on every response. Combined
  // with middleware-side stripping of x-vercel-* headers and the bot-decoy
  // bypass, this removes the most obvious cross-domain framework fingerprint.
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHostname(),
        pathname: "/storage/v1/object/public/**",
      },
      // Wildcard fallback covers any Supabase project subdomain
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // OnlyFans public CDN — creators often paste their OF avatar URL
      // directly into the avatar_url field instead of uploading.
      {
        protocol: "https",
        hostname: "public.onlyfans.com",
        pathname: "/files/**",
      },
      // Imgur — some creators host avatar/banners on imgur.
      {
        protocol: "https",
        hostname: "i.imgur.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "imgur.com",
        pathname: "/**",
      },
      // Vercel Blob — admin-uploaded creator avatars live here.
      // Each Blob store gets a unique subdomain like
      // <hash>.public.blob.vercel-storage.com.
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
