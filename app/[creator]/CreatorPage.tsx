"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import Image from "next/image";
import { Turnstile } from "@marsidev/react-turnstile";
import { Creator, PremiumLink, SocialLink } from "../../lib/types";
import { resolveFontFamily } from "../../lib/fonts";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a fresh session ID on every pageview mount. */
function createSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const sid = crypto.randomUUID();
  sessionStorage.setItem("charmlink_sid", sid);
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

// ── Keyframes ─────────────────────────────────────────────────────────────────

const ALL_KEYFRAMES = `
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
  @keyframes drift {
    0%,100% { transform: translate(0,0) scale(1); }
    33%      { transform: translate(40px,-30px) scale(1.08); }
    66%      { transform: translate(-30px,25px) scale(0.95); }
  }
  @keyframes auroraSpinRing {
    to { transform: rotate(360deg); }
  }
  @keyframes auroraSpinRingRev {
    to { transform: rotate(-360deg); }
  }
  @keyframes shine {
    0%,60%   { left: -60%; }
    80%,100% { left: 130%; }
  }
  @keyframes dotPulse {
    50% { opacity: 0.4; }
  }
  @keyframes floatUp {
    0%   { transform: translateY(100vh) scale(0.6); opacity: 0; }
    10%  { opacity: 0.9; }
    90%  { opacity: 0.7; }
    100% { transform: translateY(-20vh) scale(1); opacity: 0; }
  }
  @keyframes twinkle {
    0%, 100% { opacity: 0.1; transform: scale(1); }
    50%       { opacity: 1;   transform: scale(1.4); }
  }
  @keyframes gradientSpin {
    0%   { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes statusPulse {
    0%, 100% { transform: scale(1);   opacity: 0.6; }
    50%       { transform: scale(1.8); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

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
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
      style={{ zIndex: 2 }}
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
  );
}

// ── Star Particles ────────────────────────────────────────────────────────────

interface StarParticlesProps {
  count: number;
  color: string;
}

function StarParticles({ count, color }: StarParticlesProps) {
  // Decorative particles are client-only: positions use Math.random(), which
  // would differ between SSR and hydration and throw a React hydration
  // mismatch. Render nothing on the server, then mount on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
    [count, mounted]
  );

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
      style={{ zIndex: 2 }}
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
  const online = (
    <div
      className="absolute bottom-0.5 right-0.5 z-20"
      style={{ width: 18, height: 18 }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: "white", width: 18, height: 18 }}
      />
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
      <div className="relative" style={{ width: 124, height: 124 }}>
        {/* Spinning conic gradient ring */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            padding: 3,
            background: `conic-gradient(from 180deg, ${color1}, ${color2}, ${color3}, ${color1})`,
            boxShadow: `0 0 40px -8px ${accentColor}`,
            animation: "auroraSpinRing 9s linear infinite",
            willChange: "transform",
          }}
        >
          {/* Counter-rotating inner: dark gap + image */}
          <div
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "50%",
              overflow: "hidden",
              animation: "auroraSpinRingRev 9s linear infinite",
              willChange: "transform",
            }}
          >
            <Image src={src} alt={name} fill className="object-cover" />
          </div>
        </div>
        {online}
      </div>
    );
  }

  if (borderStyle === "none") {
    return (
      <div className="relative" style={{ width: 96, height: 96 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden" }}>
          <Image src={src} alt={name} fill className="object-cover" />
        </div>
        {online}
      </div>
    );
  }

  // solid border (default)
  return (
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
        <Image src={src} alt={name} fill className="object-cover" />
      </div>
      {online}
    </div>
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
        fill={GLASS.accent}
        d="M12 2l2.4 1.8 3-.3 1.2 2.7 2.7 1.2-.3 3L23 14l-1.8 2.4.3 3-2.7 1.2-1.2 2.7-3-.3L12 22l-2.4-1.8-3 .3-1.2-2.7L2.7 16.4l.3-3L1 12l1.8-2.4-.3-3 2.7-1.2L6.4 2.7l3 .3z"
      />
      <path
        fill="#fff"
        d="M10.6 14.6l-2.2-2.2-1.2 1.2 3.4 3.4 6-6-1.2-1.2z"
      />
    </svg>
  );
}

// ── Glass design tokens ───────────────────────────────────────────────────────

const GLASS = {
  /** translucent card fill */
  bg: "rgba(255,255,255,0.055)",
  /** card border */
  border: "rgba(255,255,255,0.12)",
  /** muted text */
  muted: "rgba(245,238,252,0.62)",
  /** icon gradient */
  iconBg: "linear-gradient(135deg,rgba(196,91,255,0.25),rgba(255,107,214,0.18))",
  iconBorder: "rgba(255,255,255,0.1)",
  /** featured accent for verified badge */
  accent: "#c45bff",
};

// ── Icons ─────────────────────────────────────────────────────────────────────

function SocialIcon({ icon }: { icon: string }) {
  const icons: Record<string, string> = {
    twitter: "\u{1D54F}",
    tiktok: "\u266A",
    instagram: "\uD83D\uDCF8",
    youtube: "\u25B6",
    default: "\uD83D\uDD17",
  };
  return <span style={{ fontSize: 20 }}>{icons[icon] || icons.default}</span>;
}

function PremiumIcon({ icon }: { icon: string }) {
  const icons: Record<string, string> = {
    star: "\u2B50",
    crown: "\uD83D\uDC51",
    heart: "\uD83D\uDC96",
    default: "\u2728",
  };
  return <span style={{ fontSize: 20 }}>{icons[icon] || icons.default}</span>;
}

// ── Badge Pill ────────────────────────────────────────────────────────────────

function BadgePill({ badge }: { badge: string }) {
  const key = badge.toLowerCase();
  const isHot = key === "hot" || key === "vip";
  return (
    <span
      style={{
        fontSize: "9.5px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.7px",
        padding: "3px 8px",
        borderRadius: "999px",
        background: isHot ? "#ff3b6b" : "rgba(255,255,255,0.22)",
        color: "#fff",
        boxShadow: isHot ? "0 0 12px -2px #ff3b6b" : undefined,
        flexShrink: 0,
      }}
    >
      {badge.toUpperCase()}
    </span>
  );
}

// ── Sensitive Wrapper — glass modal ───────────────────────────────────────────

function SensitiveWrapper({
  children,
  sensitive,
  accentColor,
  onConfirm,
}: {
  children: React.ReactNode;
  sensitive: boolean;
  accentColor: string;
  onConfirm?: () => void;
}) {
  const [showModal, setShowModal] = useState(false);

  if (!sensitive) return <>{children}</>;

  return (
    <>
      {/* Intercept clicks; disable pointer events on children */}
      <div
        className="relative w-full"
        style={{ cursor: "pointer" }}
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowModal(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowModal(true);
          }
        }}
      >
        <div style={{ pointerEvents: "none" }}>{children}</div>
      </div>

      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            background: "rgba(8,3,16,0.72)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 22,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 360,
              background: "linear-gradient(160deg,rgba(30,14,48,0.96),rgba(16,7,26,0.97))",
              border: `1px solid ${GLASS.border}`,
              borderRadius: 24,
              padding: "30px 26px",
              textAlign: "center",
              boxShadow: "0 30px 80px -20px #000",
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 18,
                margin: "0 auto 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                background: "linear-gradient(135deg,rgba(196,91,255,0.3),rgba(255,107,214,0.2))",
                border: `1px solid ${GLASS.border}`,
              }}
            >
              🔞
            </div>
            <h2
              style={{
                fontSize: 21,
                fontWeight: 700,
                marginBottom: 8,
                color: "#f5eefc",
              }}
            >
              18+ Content Ahead
            </h2>
            <p
              style={{
                color: GLASS.muted,
                fontSize: 13.5,
                lineHeight: 1.5,
                marginBottom: 22,
              }}
            >
              This link may contain content intended for adult audiences. By
              continuing you confirm you are 18 or older.
            </p>
            <div style={{ display: "flex", gap: 11 }}>
              <button
                style={{
                  flex: 1,
                  padding: "13px 10px",
                  borderRadius: 13,
                  fontWeight: 600,
                  fontSize: 13.5,
                  border: `1px solid ${GLASS.border}`,
                  background: GLASS.bg,
                  color: "#f5eefc",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
                onClick={() => setShowModal(false)}
              >
                Go back
              </button>
              <button
                style={{
                  flex: 1,
                  padding: "13px 10px",
                  borderRadius: 13,
                  fontWeight: 600,
                  fontSize: 13.5,
                  background: `linear-gradient(120deg, ${accentColor}, ${accentColor}cc)`,
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  boxShadow: `0 8px 22px -8px ${accentColor}`,
                }}
                onClick={() => {
                  setShowModal(false);
                  onConfirm?.();
                }}
              >
                I&apos;m 18+ · Enter
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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

const IG_DISMISS_KEY = "cl_ig_dismiss";

function InstagramBrowserBanner() {
  const [platform, setPlatform] = useState<"ios" | "android" | "unknown">("unknown");
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [chromeNotInstalled, setChromeNotInstalled] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(IG_DISMISS_KEY) === "1") {
      setDismissed(true);
      return;
    }
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) setPlatform("ios");
    else if (/Android/.test(ua)) setPlatform("android");
  }, []);

  const dismiss = () => {
    localStorage.setItem(IG_DISMISS_KEY, "1");
    setDismissed(true);
  };

  const openInChrome = () => {
    const url = window.location.href;

    if (platform === "ios") {
      const chromeUrl = url.replace(/^https?:\/\//, "googlechrome://");
      window.location.href = chromeUrl;
      setTimeout(() => {
        if (!document.hidden) {
          setChromeNotInstalled(true);
          setTimeout(() => setChromeNotInstalled(false), 4000);
        }
      }, 1500);
    } else if (platform === "android") {
      const bare = url.replace(/^https?:\/\//, "");
      window.location.href = `intent://${bare}#Intent;scheme=https;package=com.android.chrome;end`;
    } else {
      window.open(url, "_blank");
    }
  };

  const copyForSafari = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 4000);
    }
  };

  if (dismissed) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: "rgba(30,14,48,0.92)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderBottom: `1px solid ${GLASS.border}`,
        padding: "10px 16px",
        fontSize: 13,
        color: "#f5eefc",
      }}
    >
      <button
        onClick={dismiss}
        style={{
          position: "absolute",
          top: 8,
          right: 10,
          background: "none",
          border: "none",
          color: GLASS.muted,
          fontWeight: 700,
          fontSize: 16,
          cursor: "pointer",
          lineHeight: 1,
          padding: "0 4px",
        }}
        aria-label="Dismiss"
      >
        ✕
      </button>
      <p style={{ fontSize: 12, fontWeight: 600, paddingRight: 20, color: GLASS.muted }}>
        Tap below to open this page outside Instagram:
      </p>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={openInChrome}
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.12)",
            border: `1px solid ${GLASS.border}`,
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Open in Chrome
        </button>
        <button
          onClick={copyForSafari}
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.12)",
            border: `1px solid ${GLASS.border}`,
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {copied ? "✓ Copied" : "Copy for Safari"}
        </button>
      </div>
      {copied && (
        <p style={{ fontSize: 11, marginTop: 6, color: GLASS.muted }}>
          ✓ Copied — paste in Safari address bar
        </p>
      )}
      {copyFailed && (
        <p style={{ fontSize: 11, marginTop: 6, color: GLASS.muted }}>
          Copy blocked — long-press the URL bar to copy
        </p>
      )}
      {chromeNotInstalled && (
        <p style={{ fontSize: 11, marginTop: 6, color: GLASS.muted }}>
          Chrome not installed — try Copy for Safari
        </p>
      )}
      <p style={{ fontSize: 11, marginTop: 6, color: GLASS.muted }}>
        Or tap &#x22EF; at the top → &quot;Open in External Browser&quot;
      </p>
    </div>
  );
}

// ── Active Status — glass presence pill ───────────────────────────────────────

function ActiveStatus() {
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
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        marginTop: 13,
        background: GLASS.bg,
        border: `1px solid ${GLASS.border}`,
        padding: "5px 12px",
        borderRadius: 999,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        fontSize: 12,
        color: GLASS.muted,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          borderRadius: "50%",
          backgroundColor: "#46e08a",
          boxShadow: "0 0 8px #46e08a",
          animation: "dotPulse 1.8s ease-in-out infinite",
          flexShrink: 0,
        }}
      />
      Active now · Responds in ~{responseTime}
    </div>
  );
}

// ── Location Pill — glass style ───────────────────────────────────────────────

function LocationPill({
  pillColor,
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

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        background: pillColor ?? GLASS.bg,
        border: `1px solid ${GLASS.border}`,
        padding: "5px 12px",
        borderRadius: 999,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        fontSize: 12,
        color: GLASS.muted,
      }}
    >
      <svg width="11" height="14" viewBox="0 0 11 14" fill="none" aria-hidden="true">
        <path
          d="M5.5 0C2.46 0 0 2.46 0 5.5c0 3.85 5.5 8.5 5.5 8.5S11 9.35 11 5.5C11 2.46 8.54 0 5.5 0zm0 7.5A2 2 0 1 1 5.5 3.5a2 2 0 0 1 0 4z"
          fill="currentColor"
        />
      </svg>
      Visiting from {location}
    </div>
  );
}

// ── Link Components ───────────────────────────────────────────────────────────

interface LinkProps {
  link: SocialLink | PremiumLink;
  isPremium: boolean;
  isFeatured?: boolean;
  theme: { bgColor: string; accentColor: string; textColor: string };
  isSensitive: boolean;
  onClick: () => void;
}

function LinkButton({ link, isPremium, isFeatured, theme, isSensitive, onClick }: LinkProps) {
  const hasImage = Boolean(link.image_url);
  const [hovered, setHovered] = useState(false);

  // Hover animation style (custom per-link)
  const hoverAnim = link.hover_animation;
  let hoverAnimStyle: React.CSSProperties = {};
  if (hovered && hoverAnim) {
    if (hoverAnim === "pulse") {
      hoverAnimStyle = { animation: "linkPulse 0.8s ease-in-out infinite" };
    } else if (hoverAnim === "bounce") {
      hoverAnimStyle = { animation: "linkBounce 0.6s ease-in-out" };
    } else if (hoverAnim === "shake") {
      hoverAnimStyle = { animation: "linkShake 0.5s ease-in-out" };
    } else if (hoverAnim === "glow") {
      hoverAnimStyle = { boxShadow: `0 0 16px 4px ${theme.accentColor}80` };
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
  const fontSizeMap: Record<string, string> = {
    sm: "12px",
    base: "14px",
    lg: "15.5px",
    xl: "18px",
  };
  const titleFontSize = link.title_font_size ? (fontSizeMap[link.title_font_size] ?? "15.5px") : "15.5px";

  // Explicit border override (non-featured, non-glass-default)
  const borderOverride: React.CSSProperties =
    link.show_border && link.border_color ? { border: `1.5px solid ${link.border_color}` } : {};

  // ── Image card (16:9) ────────────────────────────────────────────────────────
  if (hasImage) {
    return (
      <SensitiveWrapper sensitive={isSensitive} accentColor={theme.accentColor} onConfirm={onClick}>
        <button
          onClick={onClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="group w-full relative overflow-hidden active:scale-[0.98]"
          style={{
            borderRadius: 18,
            border: `1px solid ${GLASS.border}`,
            background: GLASS.bg,
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
            ...(hovered
              ? {
                  transform: "translateY(-2px)",
                  borderColor: `${theme.accentColor}8c`,
                  boxShadow: `0 10px 30px -12px ${theme.accentColor}80`,
                }
              : {}),
            ...borderOverride,
            ...hoverAnimStyle,
            cursor: "pointer",
          }}
        >
          {/* 16:9 wrapper */}
          <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
            <Image
              src={link.image_url!}
              alt={link.label}
              fill
              className="object-cover object-center"
              style={{ transition: "transform 0.3s", transform: hovered ? "scale(1.05)" : "scale(1)" }}
            />
            {/* Dark overlay */}
            <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)" }} />
            {/* Bottom content */}
            <div className="absolute inset-x-0 bottom-0" style={{ padding: 12, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    color: link.title_color ?? "#ffffff",
                    fontWeight: 700,
                    fontSize: titleFontSize,
                    filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.8))",
                    ...glowStyle,
                  }}
                >
                  {link.label}
                </span>
                {link.badge && <BadgePill badge={link.badge} />}
              </div>
              {link.subtitle && (
                <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 }}>{link.subtitle}</p>
              )}
            </div>
          </div>
        </button>
      </SensitiveWrapper>
    );
  }

  // ── Glass card (standard + featured) ─────────────────────────────────────────
  const cardBase: React.CSSProperties = isFeatured
    ? {
        background: `linear-gradient(120deg, ${theme.accentColor}e6, ${theme.accentColor}d9)`,
        border: "none",
        boxShadow: `0 12px 34px -10px ${theme.accentColor}b3`,
      }
    : {
        background: GLASS.bg,
        border: `1px solid ${link.show_border && link.border_color ? link.border_color : GLASS.border}`,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      };

  const cardHover: React.CSSProperties = hovered
    ? isFeatured
      ? {
          transform: "translateY(-2px)",
          boxShadow: `0 16px 40px -10px ${theme.accentColor}d9`,
        }
      : {
          transform: "translateY(-2px)",
          borderColor: `${theme.accentColor}8c`,
          boxShadow: `0 10px 30px -12px ${theme.accentColor}80`,
        }
    : {};

  const titleColor = link.title_color ?? (isFeatured ? "#ffffff" : theme.textColor);
  const subtitleColor = isFeatured ? "rgba(255,255,255,0.82)" : GLASS.muted;
  const chevronColor = hovered ? (isFeatured ? "#ffffff" : theme.accentColor) : GLASS.muted;

  const iconBg = isFeatured
    ? "rgba(255,255,255,0.2)"
    : GLASS.iconBg;
  const iconBorder = isFeatured
    ? "rgba(255,255,255,0.25)"
    : GLASS.iconBorder;

  return (
    <SensitiveWrapper sensitive={isSensitive} accentColor={theme.accentColor} onConfirm={onClick}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 18px",
          borderRadius: 18,
          cursor: "pointer",
          textAlign: "left",
          overflow: "hidden",
          transition: "transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease",
          ...cardBase,
          ...cardHover,
          ...hoverAnimStyle,
          willChange: hoverAnim ? "transform" : undefined,
        }}
      >
        {/* Shine sweep — featured only */}
        {isFeatured && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              left: "-60%",
              width: "40%",
              height: "100%",
              background: "linear-gradient(100deg,transparent,rgba(255,255,255,0.35),transparent)",
              transform: "skewX(-18deg)",
              animation: "shine 4.5s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Icon box */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: iconBg,
            border: `1px solid ${iconBorder}`,
          }}
        >
          {isPremium ? <PremiumIcon icon={link.icon} /> : <SocialIcon icon={link.icon} />}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: titleFontSize,
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: titleColor,
              flexWrap: "wrap",
              ...glowStyle,
            }}
          >
            {link.label}
            {link.badge && <BadgePill badge={link.badge} />}
          </div>
          {link.subtitle && (
            <div style={{ color: subtitleColor, fontSize: 12.5, marginTop: 2 }}>
              {link.subtitle}
            </div>
          )}
        </div>

        {/* Chevron */}
        <span
          style={{
            color: chevronColor,
            fontSize: 18,
            flexShrink: 0,
            transition: "transform 0.18s ease, color 0.18s ease",
            transform: hovered ? "translateX(3px)" : "translateX(0)",
            lineHeight: 1,
          }}
          aria-hidden="true"
        >
          ›
        </span>
      </button>
    </SensitiveWrapper>
  );
}

// ── Countdown Timer — glass style ─────────────────────────────────────────────

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
      style={{
        width: "100%",
        borderRadius: 18,
        padding: "16px 18px",
        background: GLASS.bg,
        border: `1px solid ${GLASS.border}`,
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          marginBottom: 12,
          color: GLASS.muted,
        }}
      >
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        {units.map((u) => (
          <div key={u.label} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                fontWeight: 700,
                background: `${accentColor}25`,
                border: `1px solid ${accentColor}40`,
                color: textColor,
                animation: "countdownPulse 1s ease-in-out",
              }}
            >
              {String(u.value).padStart(2, "0")}
            </div>
            <span style={{ fontSize: 10, marginTop: 4, color: GLASS.muted }}>
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
  const [premiumLinks, setPremiumLinks] = useState<PremiumLink[]>([]);
  const [premiumVisible, setPremiumVisible] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [isInstagram, setIsInstagram] = useState(false);
  const [turnstileChallenge, setTurnstileChallenge] = useState<{
    siteKey: string;
  } | null>(null);
  const sessionIdRef = useRef<string>("");
  const trackedView = useRef(false);

  const fontFamily = resolveFontFamily(creator.font);

  const fetchPremiumLinks = useCallback(
    async (turnstileToken?: string) => {
      try {
        const scriptEl =
          typeof document !== "undefined"
            ? document.getElementById("cl-token")
            : null;
        const tokenData = scriptEl
          ? (JSON.parse(scriptEl.textContent || "{}") as { token?: string })
          : {};
        const token = tokenData.token ?? "";

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (turnstileToken) {
          headers["x-turnstile-token"] = turnstileToken;
        }

        const res = await fetch(`/api/links/${slug}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            links?: PremiumLink[];
            turnstile_required?: boolean;
            site_key?: string | null;
          };
          if (data.turnstile_required && data.site_key) {
            setTurnstileChallenge({ siteKey: data.site_key });
            return;
          }
          setTurnstileChallenge(null);
          setPremiumLinks(data.links || []);
          setTimeout(() => setPremiumVisible(true), 100);
        }
      } catch {
        // Silently fail
      }
    },
    [slug]
  );

  useEffect(() => {
    const ua = navigator.userAgent;
    const igDetected = ua.includes("Instagram");
    setIsInstagram(igDetected);

    // ── IG WebView auto-escape ─────────────────────────────────────────────────
    if (igDetected && !isBot) {
      try {
        if (!sessionStorage.getItem("cl_escape_fired")) {
          sessionStorage.setItem("cl_escape_fired", "1");
          const full = window.location.href;
          const bare = full.replace(/^https?:\/\//, "");
          const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
          const fire = () => {
            try {
              window.location.href =
                "instagram://extbrowser/?url=" + encodeURIComponent(full);
            } catch {
              /* noop */
            }
            if (isIOS) return;
            setTimeout(() => {
              try { window.location.href = "googlechromes://" + bare; } catch { /* noop */ }
            }, 1500);
            setTimeout(() => {
              try { window.location.href = "firefox://open-url?url=" + encodeURIComponent(full); } catch { /* noop */ }
            }, 3000);
            setTimeout(() => {
              try { window.location.href = "brave://open-url?url=" + encodeURIComponent(full); } catch { /* noop */ }
            }, 4500);
          };
          if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => setTimeout(fire, 0));
          } else {
            setTimeout(fire, 50);
          }
        }
      } catch {
        // sessionStorage blocked — silently skip
      }
    }

    const sid = createSessionId();
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
      setInteracted(true);
      void fetchPremiumLinks();
    }
  }, [isBot, fetchPremiumLinks, slug]);

  // ── Click Handlers ──────────────────────────────────────────────────────────

  function isSensitiveLink(link: SocialLink | PremiumLink): boolean {
    return Boolean(link.sensitive ?? creator.sensitive_default ?? false);
  }

  function getNavigationUrl(link: SocialLink | PremiumLink): string {
    if (isSensitiveLink(link) && link.id) return `/r/${link.id}`;
    if (link.redirect_url) return `/api/redirect/${link.id}`;
    return link.url;
  }

  function navigate(link: SocialLink | PremiumLink) {
    if (link.deeplink_enabled && !isSensitiveLink(link)) {
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
    if (isInstagram && !isSensitiveLink(link)) {
      const targetUrl = link.redirect_url ? `/api/redirect/${link.id}` : link.url;
      const bare = targetUrl.replace(/^https?:\/\//, "");
      const host = window.location.hostname;
      const ua = navigator.userAgent;
      const isIos = /iPhone|iPad|iPod/.test(ua);
      const isAndroid = /Android/.test(ua);
      let deeplink = "";
      if (isIos) {
        deeplink = `x-safari-https://${host}${bare.startsWith(host) ? bare.slice(host.length) : "/" + bare}`;
      } else if (isAndroid) {
        const path = bare.startsWith(host) ? bare.slice(host.length) : "/" + bare;
        deeplink = `intent://${host}${path}#Intent;scheme=https;end`;
      }
      if (deeplink) {
        const blurred = { v: false };
        const onBlur = () => { blurred.v = true; };
        window.addEventListener("blur", onBlur, { once: true });
        window.location.href = deeplink;
        setTimeout(() => {
          window.removeEventListener("blur", onBlur);
          if (!blurred.v) navigate(link);
        }, 500);
        return;
      }
    }
    setTimeout(() => navigate(link), 50);
  };

  const { theme } = creator;
  const bgStyle = buildBackground(creator);

  // Aurora orb colors derived from creator theme
  const orbA = theme.accentColor;
  const orbB = creator.bg_color_2 ?? "#0a0414";
  const orbC = creator.bg_color_3 ?? "#5b8bff";

  // Avatar border gradient fallback colors
  const avColor1 = creator.avatar_border_color_1 ?? theme.accentColor;
  const avColor2 = creator.avatar_border_color_2 ?? "#ff6bd6";
  const avColor3 = creator.avatar_border_color_3 ?? "#5b8bff";

  return (
    <>
      <style>{ALL_KEYFRAMES}</style>

      {/* Page background (behind aurora) */}
      <div
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, zIndex: 0, ...bgStyle }}
      />

      {/* Aurora orbs */}
      <div
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, zIndex: 1, overflow: "hidden", pointerEvents: "none" }}
      >
        <div
          style={{
            position: "absolute",
            width: 420,
            height: 420,
            borderRadius: "50%",
            filter: "blur(70px)",
            opacity: 0.55,
            background: orbA,
            top: -120,
            left: -100,
            animation: "drift 18s ease-in-out infinite",
            willChange: "transform",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 340,
            height: 340,
            borderRadius: "50%",
            filter: "blur(70px)",
            opacity: 0.4,
            background: orbB,
            bottom: -140,
            right: -110,
            animation: "drift 18s ease-in-out infinite",
            animationDelay: "-7s",
            willChange: "transform",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 280,
            height: 280,
            borderRadius: "50%",
            filter: "blur(70px)",
            opacity: 0.28,
            background: orbC,
            top: "38%",
            left: "55%",
            animation: "drift 18s ease-in-out infinite",
            animationDelay: "-12s",
            willChange: "transform",
          }}
        />
      </div>

      {/* Film grain overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2,
          pointerEvents: "none",
          opacity: 0.04,
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
        }}
      />

      {/* IG banner */}
      {isInstagram && <InstagramBrowserBanner />}

      {/* Background effects */}
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
        style={{
          position: "relative",
          zIndex: 3,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingLeft: 18,
          paddingRight: 18,
          paddingBottom: 48,
          paddingTop: isInstagram ? "8rem" : "52px",
          color: theme.textColor,
          fontFamily,
        }}
      >
        <div
          style={{
            position: "relative",
            zIndex: 3,
            width: "100%",
            maxWidth: 440,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Location Pill */}
          {creator.show_location && (
            <LocationPill
              pillColor={creator.location_pill_color}
              textColor={theme.textColor}
            />
          )}

          {/* Avatar */}
          <div style={{ marginTop: creator.show_location ? 20 : 0 }}>
            <AvatarWithBorder
              src={creator.avatar}
              name={creator.name}
              borderStyle={creator.avatar_border_style ?? "gradient"}
              color1={avColor1}
              color2={avColor2}
              color3={avColor3}
              accentColor={theme.accentColor}
            />
          </div>

          {/* Name & Tagline */}
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <h1
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  letterSpacing: "0.2px",
                  color: theme.textColor,
                }}
              >
                {creator.name}
              </h1>
              {creator.is_verified && <VerifiedBadge />}
            </div>
            {creator.tagline && (
              <p style={{ color: GLASS.muted, fontSize: 14.5, marginTop: 6, fontWeight: 450 }}>
                {creator.tagline}
              </p>
            )}
            <ActiveStatus />
          </div>

          {/* Link stack */}
          <div
            style={{
              width: "100%",
              marginTop: 30,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* Social links */}
            {creator.socialLinks.map((link) => {
              const isSensitive = link.sensitive ?? creator.sensitive_default ?? false;
              return (
                <LinkButton
                  key={link.id ?? link.label}
                  link={link}
                  isPremium={false}
                  isFeatured={false}
                  theme={theme}
                  isSensitive={isSensitive}
                  onClick={() => handleSocialClick(link)}
                />
              );
            })}

            {/* Turnstile challenge */}
            {interacted && turnstileChallenge && (
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 0",
                }}
              >
                <p style={{ fontSize: 12, color: GLASS.muted }}>Quick check before continuing…</p>
                <Turnstile
                  siteKey={turnstileChallenge.siteKey}
                  options={{ theme: "auto", size: "normal" }}
                  onSuccess={(token) => {
                    void fetchPremiumLinks(token);
                  }}
                  onError={() => {
                    // Leave the widget mounted so the user can retry.
                  }}
                  onExpire={() => {
                    // No-op: widget will auto-refresh and emit onSuccess again.
                  }}
                />
              </div>
            )}

            {/* Premium links */}
            {interacted && premiumLinks.length > 0 && (
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  transition: "opacity 700ms",
                  opacity: premiumVisible ? 1 : 0,
                }}
              >
                {/* Subtle divider */}
                <div
                  style={{
                    width: "100%",
                    height: 1,
                    background: `linear-gradient(to right, transparent, ${GLASS.border}, transparent)`,
                    margin: "2px 0",
                  }}
                />
                {premiumLinks.map((link, index) => {
                  const isSensitive = link.sensitive ?? creator.sensitive_default ?? false;
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
                      isFeatured={index === 0}
                      theme={theme}
                      isSensitive={isSensitive}
                      onClick={() => handlePremiumClick(link)}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              marginTop: 34,
              fontSize: 11,
              color: "rgba(245,238,252,0.32)",
              letterSpacing: "0.3px",
            }}
          >
            © {creator.name.toLowerCase().replace(/\s+/g, "")} · all links verified
          </div>

          {/* Honeypot — invisible to real users, followed only by bots */}
          <a
            href="/api/honeypot"
            tabIndex={-1}
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "-9999px",
              opacity: 0,
              width: 0,
              height: 0,
              overflow: "hidden",
            }}
          >
            Site map
          </a>
        </div>
      </main>
    </>
  );
}
