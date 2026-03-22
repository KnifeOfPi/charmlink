"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
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

// ── Background Style ──────────────────────────────────────────────────────────

function buildBackground(creator: Creator): React.CSSProperties {
  const c1 = creator.theme.bgColor;
  const c2 = creator.bg_color_2 ?? "#1a1a2e";
  const c3 = creator.bg_color_3;
  const bgType = creator.bg_type ?? "solid";

  if (bgType === "gradient") {
    const gradType = creator.bg_gradient_type ?? "linear";
    if (gradType === "radial") {
      const stops = c3 ? `${c1}, ${c2}, ${c3}` : `${c1}, ${c2}`;
      return { background: `radial-gradient(ellipse at center, ${stops})` };
    }
    const dir = creator.bg_gradient_direction ?? "to bottom";
    const stops = c3 ? `${c1}, ${c2}, ${c3}` : `${c1}, ${c2}`;
    return { background: `linear-gradient(${dir}, ${stops})` };
  }
  return { backgroundColor: c1 };
}

// ── Font Loader ───────────────────────────────────────────────────────────────

const FONT_MAP: Record<string, { family: string; googleName: string }> = {
  inter: { family: "Inter, sans-serif", googleName: "Inter" },
  poppins: { family: "Poppins, sans-serif", googleName: "Poppins" },
  playfair: { family: "'Playfair Display', serif", googleName: "Playfair+Display" },
  roboto: { family: "Roboto, sans-serif", googleName: "Roboto" },
  montserrat: { family: "Montserrat, sans-serif", googleName: "Montserrat" },
  "dancing-script": { family: "'Dancing Script', cursive", googleName: "Dancing+Script" },
};

function useFontLoader(font: string | undefined) {
  useEffect(() => {
    if (!font || font === "inter") return;
    const f = FONT_MAP[font];
    if (!f) return;
    const id = `charmlink-font-${font}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${f.googleName}:wght@400;600;700&display=swap`;
    document.head.appendChild(link);
  }, [font]);

  const fontEntry = font ? FONT_MAP[font] : undefined;
  return fontEntry?.family ?? "Inter, sans-serif";
}

// ── Floating Icons ────────────────────────────────────────────────────────────

interface FloatingIconsProps {
  emoji: string;
  count: number;
  speed: number;
}

function FloatingIcons({ emoji, count, speed }: FloatingIconsProps) {
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: Math.random() * 90 + 5,
        delay: Math.random() * speed,
        duration: speed * 0.8 + Math.random() * speed * 0.4,
        size: 14 + Math.floor(Math.random() * 14),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, speed]
  );

  return (
    <>
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(100vh) scale(0.6); opacity: 0; }
          10%  { opacity: 0.9; }
          90%  { opacity: 0.7; }
          100% { transform: translateY(-20vh) scale(1); opacity: 0; }
        }
      `}</style>
      <div
        className="fixed inset-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
        style={{ zIndex: 0 }}
      >
        {items.map((item) => (
          <span
            key={item.id}
            style={{
              position: "absolute",
              left: `${item.left}%`,
              bottom: "-5%",
              fontSize: `${item.size}px`,
              animation: `floatUp ${item.duration}s ${item.delay}s ease-in-out infinite`,
              willChange: "transform, opacity",
            }}
          >
            {emoji}
          </span>
        ))}
      </div>
    </>
  );
}

// ── Star Particles ────────────────────────────────────────────────────────────

interface StarParticlesProps {
  count: number;
  color: string;
}

function StarParticles({ count, color }: StarParticlesProps) {
  const stars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: 1 + Math.random() * 2,
        delay: Math.random() * 4,
        duration: 2 + Math.random() * 3,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count]
  );

  return (
    <>
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.1; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.4); }
        }
      `}</style>
      <div
        className="fixed inset-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
        style={{ zIndex: 0 }}
      >
        {stars.map((star) => (
          <div
            key={star.id}
            style={{
              position: "absolute",
              top: `${star.top}%`,
              left: `${star.left}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              borderRadius: "50%",
              backgroundColor: color,
              animation: `twinkle ${star.duration}s ${star.delay}s ease-in-out infinite`,
              willChange: "opacity, transform",
            }}
          />
        ))}
      </div>
    </>
  );
}

// ── Avatar with Border ────────────────────────────────────────────────────────

interface AvatarProps {
  src: string;
  name: string;
  borderStyle: string;
  color1: string;
  color2: string;
  color3: string;
  accentColor: string;
}

function AvatarWithBorder({ src, name, borderStyle, color1, color2, color3, accentColor }: AvatarProps) {
  const spinCss = `
    @keyframes gradientSpin {
      0%   { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes statusPulse {
      0%, 100% { transform: scale(1);   opacity: 0.6; }
      50%       { transform: scale(1.8); opacity: 0; }
    }
  `;

  const online = (
    <div
      className="absolute bottom-0.5 right-0.5 z-20"
      style={{ width: 18, height: 18 }}
    >
      {/* White ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: "white", width: 18, height: 18 }}
      />
      {/* Status pulse (blurred outer ring) */}
      <div
        className="absolute rounded-full"
        style={{
          width: 14,
          height: 14,
          top: 2,
          left: 2,
          backgroundColor: "#22c55e",
          filter: "blur(3px)",
          animation: "statusPulse 2s ease-in-out infinite",
          willChange: "transform, opacity",
        }}
      />
      {/* Ping ring */}
      <div
        className="absolute rounded-full animate-ping"
        style={{
          width: 12,
          height: 12,
          top: 3,
          left: 3,
          backgroundColor: "#22c55e",
          opacity: 0.5,
        }}
      />
      {/* Solid green dot */}
      <div
        className="absolute rounded-full"
        style={{
          width: 12,
          height: 12,
          top: 3,
          left: 3,
          backgroundColor: "#22c55e",
        }}
      />
    </div>
  );

  if (borderStyle === "gradient") {
    return (
      <>
        <style>{spinCss}</style>
        <div className="relative" style={{ width: 96, height: 96 }}>
          {/* Spinning gradient ring */}
          <div
            style={{
              position: "absolute",
              inset: -3,
              borderRadius: "50%",
              background: `conic-gradient(${color1}, ${color2}, ${color3}, ${color1})`,
              animation: "gradientSpin 3s linear infinite",
              willChange: "transform",
            }}
          />
          {/* Inner white gap */}
          <div
            style={{
              position: "absolute",
              inset: 1,
              borderRadius: "50%",
              backgroundColor: "#0a0a0a",
            }}
          />
          {/* Avatar */}
          <div
            style={{
              position: "absolute",
              inset: 3,
              borderRadius: "50%",
              overflow: "hidden",
            }}
          >
            <Image src={src} alt={name} fill className="object-cover" unoptimized />
          </div>
          {online}
        </div>
      </>
    );
  }

  if (borderStyle === "none") {
    return (
      <>
        <style>{spinCss}</style>
        <div className="relative" style={{ width: 96, height: 96 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden" }}>
            <Image src={src} alt={name} fill className="object-cover" unoptimized />
          </div>
          {online}
        </div>
      </>
    );
  }

  // solid border
  return (
    <>
      <style>{spinCss}</style>
      <div className="relative" style={{ width: 96, height: 96 }}>
        <div
          style={{
            position: "absolute",
            inset: -2,
            borderRadius: "50%",
            border: `2px solid ${color1 || accentColor}`,
          }}
        />
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden" }}>
          <Image src={src} alt={name} fill className="object-cover" unoptimized />
        </div>
        {online}
      </div>
    </>
  );
}

// ── Verified Badge ────────────────────────────────────────────────────────────

function VerifiedBadge() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-label="Verified"
      role="img"
      style={{ display: "inline", verticalAlign: "middle", flexShrink: 0 }}
    >
      <path
        fill="#1d9bf0"
        d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.88 9.33 2 10.57 2 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.8 3.91s2.52 1.26 3.92.8c.66 1.31 1.9 2.19 3.33 2.19s2.68-.88 3.34-2.19c1.39.46 2.9.2 3.91-.8s1.27-2.52.81-3.91C21.37 14.67 22.25 13.43 22.25 12zm-6.47-1.22l-4.1 4.1a.75.75 0 0 1-1.06 0l-2.05-2.05a.75.75 0 1 1 1.06-1.06l1.52 1.52 3.57-3.57a.75.75 0 1 1 1.06 1.06z"
      />
    </svg>
  );
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
    if (host.includes("onlyfans.com")) return "onlyfans://";
    if (host.includes("instagram.com")) {
      const username = parsed.pathname.replace(/\//g, "");
      return username ? `instagram://user?username=${username}` : "instagram://";
    }
    if (host.includes("tiktok.com")) return "tiktok://";
    if (host.includes("twitter.com") || host.includes("x.com")) {
      const username = parsed.pathname.replace(/\//g, "");
      return username ? `twitter://user?screen_name=${username}` : "twitter://";
    }
    const intentHost = url.replace(/^https?:\/\//, "");
    return `intent://${intentHost}#Intent;scheme=https;package=com.android.chrome;end`;
  } catch {
    return url;
  }
}

function handleDeepLink(url: string, recoveryUrl: string) {
  const deepLink = buildDeepLink(url);
  const fallback = recoveryUrl || url;
  window.location.href = deepLink;
  setTimeout(() => {
    window.location.href = fallback;
  }, 1500);
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

// ── Active Status ─────────────────────────────────────────────────────────────

function ActiveStatus({ textColor }: { textColor: string }) {
  const [responseTime, setResponseTime] = useState<string | null>(null);

  useEffect(() => {
    const seconds = Math.floor(Math.random() * 61) + 30;
    if (seconds < 60) {
      setResponseTime(`${seconds}s`);
    } else {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      setResponseTime(secs > 0 ? `${mins}m ${secs}s` : `${mins}m`);
    }
  }, []);

  if (!responseTime) return null;

  return (
    <div className="flex items-center justify-center gap-1.5 mt-1.5">
      <span
        className="inline-block w-2 h-2 rounded-full animate-pulse"
        style={{ backgroundColor: "#22c55e" }}
      />
      <span className="text-xs opacity-60" style={{ color: textColor }}>
        Active now · Responds in ~{responseTime}
      </span>
    </div>
  );
}

// ── Location Pill ─────────────────────────────────────────────────────────────

function LocationPill({
  pillColor,
  textColor,
}: {
  pillColor: string | null | undefined;
  textColor: string;
}) {
  const [location, setLocation] = useState<string | null>(null);

  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((data: { city?: string; country_name?: string }) => {
        if (data.city && data.country_name) {
          setLocation(`${data.city}, ${data.country_name}`);
        } else if (data.country_name) {
          setLocation(data.country_name);
        }
      })
      .catch(() => {});
  }, []);

  if (!location) return null;

  const bg = pillColor ?? `${textColor}15`;

  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs"
      style={{ backgroundColor: bg, color: textColor }}
    >
      {/* Map pin SVG */}
      <svg width="11" height="14" viewBox="0 0 11 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M5.5 0C2.46 0 0 2.46 0 5.5c0 3.85 5.5 8.5 5.5 8.5S11 9.35 11 5.5C11 2.46 8.54 0 5.5 0zm0 7.5A2 2 0 1 1 5.5 3.5a2 2 0 0 1 0 4z"
          fill="currentColor"
        />
      </svg>
      Visiting from {location}
    </div>
  );
}

// ── Hover Animation CSS ───────────────────────────────────────────────────────

const HOVER_KEYFRAMES = `
  @keyframes linkPulse {
    0%, 100% { transform: scale(1); }
    50%       { transform: scale(1.03); }
  }
  @keyframes linkBounce {
    0%, 100% { transform: translateY(0); }
    30%       { transform: translateY(-6px); }
    60%       { transform: translateY(-2px); }
  }
  @keyframes linkShake {
    0%, 100% { transform: translateX(0); }
    20%       { transform: translateX(-4px); }
    40%       { transform: translateX(4px); }
    60%       { transform: translateX(-3px); }
    80%       { transform: translateX(3px); }
  }
  @keyframes countdownPulse {
    0%, 100% { transform: scale(1); }
    50%       { transform: scale(1.05); }
  }
`;

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
  const [hovered, setHovered] = useState(false);

  // Hover animation style
  const hoverAnim = link.hover_animation;
  let hoverStyle: React.CSSProperties = {};
  if (hovered && hoverAnim) {
    if (hoverAnim === "pulse") {
      hoverStyle = { animation: "linkPulse 0.8s ease-in-out infinite" };
    } else if (hoverAnim === "bounce") {
      hoverStyle = { animation: "linkBounce 0.6s ease-in-out" };
    } else if (hoverAnim === "shake") {
      hoverStyle = { animation: "linkShake 0.5s ease-in-out" };
    } else if (hoverAnim === "glow") {
      hoverStyle = { boxShadow: `0 0 16px 4px ${theme.accentColor}80` };
    }
  }

  // Text glow
  const glowStyle: React.CSSProperties = {};
  if (link.show_text_glow) {
    const intensity = (link.text_glow_intensity ?? 5) * 2;
    const glowColor = link.text_glow_color ?? "#ffffff";
    glowStyle.textShadow = `0 0 ${intensity}px ${glowColor}, 0 0 ${intensity * 2}px ${glowColor}`;
  }

  // Title font size
  const titleFontSize: Record<string, string> = {
    sm: "text-xs",
    base: "text-sm",
    lg: "text-base",
    xl: "text-lg",
  };
  const titleCls = link.title_font_size ? (titleFontSize[link.title_font_size] ?? "text-sm") : "text-sm";

  // Border
  const borderStyle: React.CSSProperties = {};
  if (link.show_border && link.border_color) {
    borderStyle.border = `1.5px solid ${link.border_color}`;
  }

  if (hasImage) {
    return (
      <SensitiveWrapper sensitive={isSensitive} accentColor={theme.accentColor}>
        <button
          onClick={onClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="group w-full relative overflow-hidden rounded-2xl transition-transform active:scale-[0.98]"
          style={{
            ...borderStyle,
            ...hoverStyle,
            willChange: hoverAnim ? "transform" : undefined,
          }}
        >
          {/* 16:9 wrapper */}
          <div className="relative w-full pt-[56.25%]">
            <Image
              src={link.image_url!}
              alt={link.label}
              fill
              className="object-cover object-center transition-transform duration-300 group-hover:scale-105"
              unoptimized
            />
            {/* Dark overlay */}
            <div className="absolute inset-0 bg-black/40" />
            {/* Bottom content */}
            <div className="absolute inset-x-0 bottom-0 p-3 flex flex-col items-center justify-end">
              <div className="flex items-center gap-2">
                <span
                  className={`text-white font-bold drop-shadow ${titleCls}`}
                  style={{ color: link.title_color ?? "#ffffff", ...glowStyle }}
                >
                  {link.label}
                </span>
                {link.badge && <BadgePill badge={link.badge} />}
              </div>
              {link.subtitle && (
                <p className="text-white/70 text-xs drop-shadow mt-0.5">{link.subtitle}</p>
              )}
            </div>
          </div>
        </button>
      </SensitiveWrapper>
    );
  }

  // Standard button style
  const baseStyle: React.CSSProperties = isPremium
    ? {
        backgroundColor: theme.accentColor,
        color: link.title_color ?? "#ffffff",
        ...borderStyle,
        ...hoverStyle,
      }
    : {
        borderColor: link.show_border ? (link.border_color ?? `${theme.textColor}40`) : `${theme.textColor}40`,
        color: link.title_color ?? theme.textColor,
        ...hoverStyle,
      };

  return (
    <SensitiveWrapper sensitive={isSensitive} accentColor={theme.accentColor}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`w-full flex flex-col items-center py-3 px-6 rounded-full text-sm font-medium transition-all active:scale-95 ${
          isPremium
            ? "font-bold hover:opacity-90"
            : "border hover:opacity-80"
        }`}
        style={baseStyle}
      >
        <div className="flex items-center gap-2">
          {isPremium ? <PremiumIcon icon={link.icon} /> : <SocialIcon icon={link.icon} />}
          <span className={titleCls} style={glowStyle}>
            {link.label}
          </span>
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

// ── Countdown Timer ───────────────────────────────────────────────────────────

function CountdownTimer({
  targetDate,
  label,
  accentColor,
  textColor,
}: {
  targetDate: string;
  label: string;
  accentColor: string;
  textColor: string;
}) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const calculate = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        setExpired(true);
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setTimeLeft({ days, hours, minutes, seconds });
    };

    calculate();
    const timer = setInterval(calculate, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  if (expired) return null;

  const units = [
    { label: "Days", value: timeLeft.days },
    { label: "Hours", value: timeLeft.hours },
    { label: "Min", value: timeLeft.minutes },
    { label: "Sec", value: timeLeft.seconds },
  ];

  return (
    <div
      className="w-full rounded-2xl p-4 text-center"
      style={{ backgroundColor: `${accentColor}15`, border: `1px solid ${accentColor}30` }}
    >
      <p className="text-xs font-semibold uppercase tracking-widest mb-3 opacity-70" style={{ color: textColor }}>
        {label}
      </p>
      <div className="flex items-center justify-center gap-2">
        {units.map((u) => (
          <div key={u.label} className="flex flex-col items-center">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold"
              style={{
                backgroundColor: `${accentColor}25`,
                color: textColor,
                animation: "countdownPulse 1s ease-in-out",
              }}
            >
              {String(u.value).padStart(2, "0")}
            </div>
            <span className="text-[10px] mt-1 opacity-50" style={{ color: textColor }}>
              {u.label}
            </span>
          </div>
        ))}
      </div>
    </div>
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

  const fontFamily = useFontLoader(creator.font);

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
    if (link.redirect_url) return `/api/redirect/${link.id}`;
    return link.url;
  }

  function navigate(link: SocialLink | PremiumLink) {
    if (link.deeplink_enabled) {
      handleDeepLink(link.url, link.recovery_url || link.url);
      return;
    }
    window.location.href = getNavigationUrl(link);
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
  const bgStyle = buildBackground(creator);

  if (!ageVerified) {
    return <AgeGate onConfirm={handleAgeConfirm} />;
  }

  return (
    <>
      <style>{HOVER_KEYFRAMES}</style>
      {isInstagram && <InstagramBrowserBanner />}

      {/* Background effects (fixed, behind content) */}
      {creator.show_floating_icons && (
        <FloatingIcons
          emoji={creator.floating_icon ?? "💫"}
          count={creator.floating_icon_count ?? 8}
          speed={creator.animation_speed ?? 10}
        />
      )}
      {creator.show_stars && (
        <StarParticles
          count={creator.stars_count ?? 50}
          color={creator.stars_color ?? "#ffffff"}
        />
      )}

      <main
        className="min-h-screen flex flex-col items-center justify-start px-4 pb-12 relative"
        style={{
          ...bgStyle,
          color: theme.textColor,
          paddingTop: isInstagram ? "5rem" : "3rem",
          fontFamily,
          zIndex: 1,
        }}
      >
        <div className="w-full max-w-sm flex flex-col items-center gap-6 relative z-10">

          {/* Location Pill — above avatar */}
          {creator.show_location && (
            <LocationPill
              pillColor={creator.location_pill_color}
              textColor={theme.textColor}
            />
          )}

          {/* Avatar */}
          <AvatarWithBorder
            src={creator.avatar}
            name={creator.name}
            borderStyle={creator.avatar_border_style ?? "solid"}
            color1={creator.avatar_border_color_1 ?? "#ffffff"}
            color2={creator.avatar_border_color_2 ?? "#f472b6"}
            color3={creator.avatar_border_color_3 ?? "#fda4af"}
            accentColor={theme.accentColor}
          />

          {/* Name & Tagline */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-2xl font-bold">{creator.name}</h1>
              {creator.is_verified && <VerifiedBadge />}
            </div>
            <p className="text-sm opacity-70 mt-1">{creator.tagline}</p>
            <ActiveStatus textColor={theme.textColor} />
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
                // Check for countdown type (countdown:YYYY-MM-DDTHH:mm:ss)
                if (link.url.startsWith("countdown:")) {
                  const targetDate = link.url.replace("countdown:", "");
                  return (
                    <CountdownTimer
                      key={link.id ?? link.label}
                      targetDate={targetDate}
                      label={link.label}
                      accentColor={theme.accentColor}
                      textColor={theme.textColor}
                    />
                  );
                }
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
