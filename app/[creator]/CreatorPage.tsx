"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { Creator, PremiumLink, SocialLink } from "../../lib/types";

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let sid = sessionStorage.getItem("charmlink_sid");
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem("charmlink_sid", sid);
  }
  return sid;
}

function sendBeacon(url: string, data: Record<string, unknown>): void {
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, JSON.stringify(data));
    } else {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        keepalive: true,
      });
    }
  } catch {
    // Fire and forget
  }
}

interface CreatorPageProps {
  creator: Creator;
  slug: string;
  isBot: boolean;
}

function SocialIcon({ icon }: { icon: string }) {
  const icons: Record<string, string> = {
    twitter: "\u{1D54F}",
    tiktok: "\u266A",
    instagram: "\uD83D\uDCF8",
    youtube: "\u25B6",
    default: "\uD83D\uDD17",
  };
  return <span className="text-lg">{icons[icon] || icons.default}</span>;
}

function PremiumIcon({ icon }: { icon: string }) {
  const icons: Record<string, string> = {
    star: "\u2B50",
    crown: "\uD83D\uDC51",
    heart: "\uD83D\uDC96",
    default: "\u2728",
  };
  return <span className="text-lg">{icons[icon] || icons.default}</span>;
}

function InstagramBrowserBanner() {
  const [platform, setPlatform] = useState<"ios" | "android" | "unknown">("unknown");

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) setPlatform("ios");
    else if (/Android/.test(ua)) setPlatform("android");
  }, []);

  const openInBrowser = () => {
    const url = window.location.href;
    if (platform === "ios") {
      window.location.href = `x-safari-https://${url.replace("https://", "").replace("http://", "")}`;
      setTimeout(() => window.open(url, "_blank"), 500);
    } else if (platform === "android") {
      const intentUrl = `intent://${url.replace("https://", "").replace("http://", "")}#Intent;scheme=https;package=com.android.chrome;end`;
      window.location.href = intentUrl;
      setTimeout(() => window.open(url, "_blank"), 500);
    } else {
      window.open(url, "_blank");
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-black px-4 py-3 text-center text-sm">
      <p className="font-semibold mb-1">For the best experience, open in your browser</p>
      <button
        onClick={openInBrowser}
        className="bg-black text-white px-4 py-1 rounded-full text-xs font-bold mr-2"
      >
        Open in Browser
      </button>
      <span className="text-xs opacity-75">or tap &#x22EF; then &quot;Open in Browser&quot;</span>
    </div>
  );
}

export function CreatorPage({ creator, slug, isBot }: CreatorPageProps) {
  const [premiumLinks, setPremiumLinks] = useState<PremiumLink[]>([]);
  const [premiumVisible, setPremiumVisible] = useState(false);
  const [isInstagram, setIsInstagram] = useState(false);
  const sessionIdRef = useRef<string>("");
  const trackedView = useRef(false);

  const fetchPremiumLinks = useCallback(async () => {
    try {
      const res = await fetch(`/api/links/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setPremiumLinks(data.links || []);
        setTimeout(() => setPremiumVisible(true), 100);
      }
    } catch {
      // Silently fail
    }
  }, [slug]);

  useEffect(() => {
    const ua = navigator.userAgent;
    const igDetected = ua.includes("Instagram");
    setIsInstagram(igDetected);

    const sid = getSessionId();
    sessionIdRef.current = sid;

    // Track page view (once per mount)
    if (!trackedView.current) {
      trackedView.current = true;
      sendBeacon("/api/pageview", {
        creator: slug,
        sessionId: sid,
        isInstagram: igDetected,
        isBot: false, // Client-side = always human
      });
    }

    // Load premium links after 2s delay (non-bot only)
    if (!isBot) {
      const timer = setTimeout(() => {
        fetchPremiumLinks();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isBot, fetchPremiumLinks, slug]);

  const trackSocialClick = (link: SocialLink) => {
    sendBeacon("/api/track", {
      creator: slug,
      linkLabel: link.label,
      linkUrl: link.url,
      linkType: "social",
      sessionId: sessionIdRef.current,
      isInstagram,
    });
  };

  const trackAndVisitPremium = async (link: PremiumLink) => {
    sendBeacon("/api/track", {
      creator: slug,
      linkLabel: link.label,
      linkUrl: link.url,
      linkType: "premium",
      sessionId: sessionIdRef.current,
      isInstagram,
    });
    // Small delay to let beacon fire, then navigate
    setTimeout(() => {
      window.location.href = link.url;
    }, 50);
  };

  const { theme } = creator;

  return (
    <>
      {isInstagram && <InstagramBrowserBanner />}
      <main
        className="min-h-screen flex flex-col items-center justify-start px-4 pb-12"
        style={{
          backgroundColor: theme.bgColor,
          color: theme.textColor,
          paddingTop: isInstagram ? "5rem" : "3rem",
        }}
      >
        <div className="w-full max-w-sm flex flex-col items-center gap-6">
          {/* Avatar */}
          <div
            className="relative w-24 h-24 rounded-full overflow-hidden border-2"
            style={{ borderColor: theme.accentColor }}
          >
            <Image
              src={creator.avatar}
              alt={creator.name}
              fill
              className="object-cover"
              unoptimized
            />
          </div>

          {/* Name & Tagline */}
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-1">{creator.name}</h1>
            <p className="text-sm opacity-70">{creator.tagline}</p>
          </div>

          {/* Social Links — tracked */}
          <div className="w-full flex flex-col gap-3">
            {creator.socialLinks.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackSocialClick(link)}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-full border text-sm font-medium transition-opacity hover:opacity-80"
                style={{ borderColor: `${theme.textColor}40`, color: theme.textColor }}
              >
                <SocialIcon icon={link.icon} />
                {link.label}
              </a>
            ))}
          </div>

          {/* Premium Links — client-side only, delayed, never in server HTML */}
          {premiumLinks.length > 0 && (
            <div
              className="w-full flex flex-col gap-3 transition-opacity duration-700"
              style={{ opacity: premiumVisible ? 1 : 0 }}
            >
              <div className="w-full h-px opacity-20 my-1" style={{ background: theme.textColor }} />
              {premiumLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => trackAndVisitPremium(link)}
                  className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-full text-sm font-bold transition-transform hover:scale-105 active:scale-95"
                  style={{
                    backgroundColor: theme.accentColor,
                    color: "#ffffff",
                  }}
                >
                  <PremiumIcon icon={link.icon} />
                  {link.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
