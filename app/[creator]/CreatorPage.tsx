"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { Creator, PremiumLink, SocialLink } from "../../lib/types";

// ── Age Gate ─────────────────────────────────────────────────────────────────

function AgeGate({ onConfirm }: { onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <div className="text-5xl mb-6">🔞</div>
        <h2 className="text-2xl font-bold text-white mb-3">Age Verification</h2>
        <p className="text-gray-400 text-sm mb-8 leading-relaxed">
          This page contains links to adult content. By continuing, you confirm that you are at least{" "}
          <strong className="text-white">18 years old</strong> (or the age of majority in your jurisdiction).
        </p>
        <button
          onClick={onConfirm}
          className="w-full py-3 px-6 rounded-full bg-white text-black font-bold text-sm transition-transform hover:scale-105 active:scale-95 mb-3"
        >
          I am 18 or older — Enter
        </button>
        <a
          href="https://google.com"
          className="block text-gray-500 text-xs hover:text-gray-400 transition-colors"
        >
          I am under 18 — Leave
        </a>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Icons ─────────────────────────────────────────────────────────────────────

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

// ── Badge Pill ────────────────────────────────────────────────────────────────

function BadgePill({ badge }: { badge: string }) {
  const styles: Record<string, string> = {
    new: "bg-green-600 text-green-100",
    popular: "bg-orange-500 text-orange-100",
    exclusive: "bg-purple-600 text-purple-100",
  };
  const labels: Record<string, string> = {
    new: "New",
    popular: "Popular",
    exclusive: "Exclusive",
  };
  const cls = styles[badge] ?? "bg-gray-600 text-gray-100";
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cls}`}>
      {labels[badge] ?? badge}
    </span>
  );
}

// ── Sensitive Wrapper ─────────────────────────────────────────────────────────

function SensitiveWrapper({
  children,
  sensitive,
  accentColor,
}: {
  children: React.ReactNode;
  sensitive: boolean;
  accentColor: string;
}) {
  const [revealed, setRevealed] = useState(false);

  if (!sensitive || revealed) return <>{children}</>;

  return (
    <div className="relative w-full" onClick={(e) => e.stopPropagation()}>
      <div className="blur-sm pointer-events-none select-none">{children}</div>
      <button
        className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full text-white text-xs font-semibold backdrop-blur-[2px]"
        style={{ backgroundColor: `${accentColor}cc` }}
        onClick={() => setRevealed(true)}
      >
        <span>🔞 Sensitive Content</span>
        <span className="text-[10px] opacity-80">Click to reveal</span>
      </button>
    </div>
  );
}

// ── Deep Link ─────────────────────────────────────────────────────────────────

function buildDeepLink(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host.includes("onlyfans.com")) {
      return "onlyfans://";
    }
    if (host.includes("instagram.com")) {
      const username = parsed.pathname.replace(/\//g, "");
      return username ? `instagram://user?username=${username}` : "instagram://";
    }
    if (host.includes("tiktok.com")) {
      return "tiktok://";
    }
    if (host.includes("twitter.com") || host.includes("x.com")) {
      const username = parsed.pathname.replace(/\//g, "");
      return username ? `twitter://user?screen_name=${username}` : "twitter://";
    }

    // Generic intent (Android) — iOS falls through to recovery
    const intentHost = url.replace(/^https?:\/\//, "");
    return `intent://${intentHost}#Intent;scheme=https;package=com.android.chrome;end`;
  } catch {
    return url;
  }
}

function handleDeepLink(url: string, recoveryUrl: string) {
  const deepLink = buildDeepLink(url);
  const fallback = recoveryUrl || url;

  // On iOS, deep link attempts must be a direct assignment
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);

  if (isIos) {
    window.location.href = deepLink;
    setTimeout(() => {
      window.location.href = fallback;
    }, 1500);
  } else {
    // Android / desktop: intent or custom scheme
    window.location.href = deepLink;
    setTimeout(() => {
      window.location.href = fallback;
    }, 1500);
  }
}

// ── Instagram Banner ──────────────────────────────────────────────────────────

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

// ── Location Display ──────────────────────────────────────────────────────────

function LocationBadge({ textColor }: { textColor: string }) {
  const [location, setLocation] = useState<string | null>(null);

  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((data: { city?: string; country_name?: string }) => {
        if (data.city && data.country_name) {
          setLocation(`Visiting from ${data.city}, ${data.country_name}`);
        } else if (data.country_name) {
          setLocation(`Visiting from ${data.country_name}`);
        }
      })
      .catch(() => {
        // Silently ignore
      });
  }, []);

  if (!location) return null;

  return (
    <p
      className="text-xs opacity-50 mt-1"
      style={{ color: textColor }}
    >
      📍 {location}
    </p>
  );
}

// ── Link Components ───────────────────────────────────────────────────────────

interface LinkProps {
  link: SocialLink | PremiumLink;
  isPremium: boolean;
  theme: { bgColor: string; accentColor: string; textColor: string };
  isSensitive: boolean;
  onClick: () => void;
}

function LinkButton({ link, isPremium, theme, isSensitive, onClick }: LinkProps) {
  const hasImage = Boolean(link.image_url);

  if (hasImage) {
    // Image button style
    return (
      <SensitiveWrapper sensitive={isSensitive} accentColor={theme.accentColor}>
        <button
          onClick={onClick}
          className="w-full relative overflow-hidden rounded-2xl h-20 flex items-center transition-transform hover:scale-[1.02] active:scale-[0.98]"
          style={{ boxShadow: `0 2px 16px ${theme.accentColor}40` }}
        >
          {/* Background image */}
          <Image
            src={link.image_url!}
            alt={link.label}
            fill
            className="object-cover"
            unoptimized
          />
          {/* Dark overlay */}
          <div className="absolute inset-0 bg-black/40" />
          {/* Content overlay */}
          <div className="relative z-10 w-full px-4 flex items-center gap-3">
            {isPremium ? (
              <PremiumIcon icon={link.icon} />
            ) : (
              <SocialIcon icon={link.icon} />
            )}
            <div className="flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-sm drop-shadow">{link.label}</span>
                {link.badge && <BadgePill badge={link.badge} />}
              </div>
              {link.subtitle && (
                <p className="text-white/70 text-xs drop-shadow">{link.subtitle}</p>
              )}
            </div>
          </div>
        </button>
      </SensitiveWrapper>
    );
  }

  // Standard button style
  const baseStyle = isPremium
    ? {
        backgroundColor: theme.accentColor,
        color: "#ffffff",
      }
    : {
        borderColor: `${theme.textColor}40`,
        color: theme.textColor,
      };

  return (
    <SensitiveWrapper sensitive={isSensitive} accentColor={theme.accentColor}>
      <button
        onClick={onClick}
        className={`w-full flex flex-col items-center py-3 px-6 rounded-full text-sm font-medium transition-all hover:opacity-80 active:scale-95 ${
          isPremium
            ? "font-bold transition-transform hover:scale-105 hover:opacity-100"
            : "border"
        }`}
        style={baseStyle}
      >
        <div className="flex items-center gap-2">
          {isPremium ? <PremiumIcon icon={link.icon} /> : <SocialIcon icon={link.icon} />}
          <span>{link.label}</span>
          {link.badge && <BadgePill badge={link.badge} />}
        </div>
        {link.subtitle && (
          <span
            className="text-xs mt-0.5 opacity-70"
            style={{ color: isPremium ? "#ffffffcc" : theme.textColor }}
          >
            {link.subtitle}
          </span>
        )}
      </button>
    </SensitiveWrapper>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface CreatorPageProps {
  creator: Creator;
  slug: string;
  isBot: boolean;
}

export function CreatorPage({ creator, slug, isBot }: CreatorPageProps) {
  const [ageVerified, setAgeVerified] = useState(false);
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
    if (sessionStorage.getItem("charmlink_age_verified") === "true") {
      setAgeVerified(true);
    }
  }, []);

  const handleAgeConfirm = () => {
    sessionStorage.setItem("charmlink_age_verified", "true");
    setAgeVerified(true);
  };

  useEffect(() => {
    const ua = navigator.userAgent;
    const igDetected = ua.includes("Instagram");
    setIsInstagram(igDetected);

    const sid = getSessionId();
    sessionIdRef.current = sid;

    if (!trackedView.current) {
      trackedView.current = true;
      sendBeacon("/api/pageview", {
        creator: slug,
        sessionId: sid,
        isInstagram: igDetected,
        isBot: false,
      });
    }

    if (!isBot) {
      let loaded = false;
      const loadOnInteraction = () => {
        if (loaded) return;
        loaded = true;
        setTimeout(() => fetchPremiumLinks(), 500);
        for (const evt of interactionEvents) {
          window.removeEventListener(evt, loadOnInteraction);
        }
      };
      const interactionEvents = ["scroll", "touchstart", "click", "mousemove", "keydown"];
      for (const evt of interactionEvents) {
        window.addEventListener(evt, loadOnInteraction, { once: true, passive: true });
      }
      return () => {
        for (const evt of interactionEvents) {
          window.removeEventListener(evt, loadOnInteraction);
        }
      };
    }
  }, [isBot, fetchPremiumLinks, slug]);

  // ── Click Handlers ──────────────────────────────────────────────────────────

  function getNavigationUrl(link: SocialLink | PremiumLink): string {
    if (link.redirect_url) {
      return `/api/redirect/${link.id}`;
    }
    return link.url;
  }

  function navigate(link: SocialLink | PremiumLink) {
    if (link.deeplink_enabled) {
      handleDeepLink(link.url, link.recovery_url || link.url);
      return;
    }
    const dest = getNavigationUrl(link);
    window.location.href = dest;
  }

  const handleSocialClick = (link: SocialLink) => {
    sendBeacon("/api/track", {
      creator: slug,
      linkLabel: link.label,
      linkUrl: link.url,
      linkType: "social",
      sessionId: sessionIdRef.current,
      isInstagram,
    });
    setTimeout(() => navigate(link), 50);
  };

  const handlePremiumClick = (link: PremiumLink) => {
    sendBeacon("/api/track", {
      creator: slug,
      linkLabel: link.label,
      linkUrl: link.url,
      linkType: "premium",
      sessionId: sessionIdRef.current,
      isInstagram,
    });
    setTimeout(() => navigate(link), 50);
  };

  const { theme } = creator;

  if (!ageVerified) {
    return <AgeGate onConfirm={handleAgeConfirm} />;
  }

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
            {creator.show_location && <LocationBadge textColor={theme.textColor} />}
          </div>

          {/* Social Links */}
          <div className="w-full flex flex-col gap-3">
            {creator.socialLinks.map((link) => {
              const isSensitive = link.sensitive ?? creator.sensitive_default ?? false;
              return (
                <LinkButton
                  key={link.id ?? link.label}
                  link={link}
                  isPremium={false}
                  theme={theme}
                  isSensitive={isSensitive}
                  onClick={() => handleSocialClick(link)}
                />
              );
            })}
          </div>

          {/* Premium Links — client-side only, delayed, never in server HTML */}
          {premiumLinks.length > 0 && (
            <div
              className="w-full flex flex-col gap-3 transition-opacity duration-700"
              style={{ opacity: premiumVisible ? 1 : 0 }}
            >
              <div className="w-full h-px opacity-20 my-1" style={{ background: theme.textColor }} />
              {premiumLinks.map((link) => {
                const isSensitive = link.sensitive ?? creator.sensitive_default ?? false;
                return (
                  <LinkButton
                    key={link.id ?? link.label}
                    link={link}
                    isPremium={true}
                    theme={theme}
                    isSensitive={isSensitive}
                    onClick={() => handlePremiumClick(link)}
                  />
                );
              })}
            </div>
          )}

          {/* Honeypot */}
          <a
            href="/api/honeypot"
            tabIndex={-1}
            aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", opacity: 0, width: 0, height: 0, overflow: "hidden" }}
          >
            Premium Content
          </a>
        </div>
      </main>
    </>
  );
}
