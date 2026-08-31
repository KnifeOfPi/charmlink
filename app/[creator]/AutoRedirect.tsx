"use client";

import { useEffect, useRef, useState } from "react";

/**
 * An auto-redirect site: no landing page, no links to tap. The visitor arrives
 * and is sent straight to the target, escaping the in-app browser on the way.
 *
 * WHY THE ESCAPE STILL MATTERS HERE. OnlyFans is web-only, so there is no app
 * to hand off to. What the escape buys is the visitor's *session*: Instagram's
 * WebView has its own cookie jar, so someone already logged into OnlyFans in
 * Safari arrives LOGGED OUT inside Instagram and has to sign in — or re-enter
 * payment details — before they can subscribe. Landing them in their default
 * browser is the entire point.
 *
 * WHY THIS DUPLICATES CreatorPage's CASCADE. It should eventually share it, and
 * this comment is the reminder. It does not today because the escape-vs-stay
 * split test is live and measures CreatorPage's escape path; refactoring that
 * path mid-experiment already forced one restart (see ESCAPE_EXPERIMENT_START).
 * Consolidate once the experiment concludes — and when doing so, note this
 * version deliberately differs in two ways:
 *   - no cl_sid/cl_av handoff, since the destination is OnlyFans rather than
 *     another render of our own page, so there is nothing to reattach to;
 *   - no banner and no "stay" arm, because there is no page worth staying on.
 */

const FALLBACK_DELAYS = { chrome: 1500, firefox: 3000, brave: 4500 } as const;
/** Matches the beacon window in CreatorPage: still visible ⇒ the escape failed. */
const ESCAPE_VERDICT_MS = 2500;

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
    // Fire and forget.
  }
}

export function AutoRedirect({
  slug,
  targetUrl,
  linkId,
  linkLabel,
  isBot,
}: {
  slug: string;
  targetUrl: string;
  linkId: string;
  linkLabel: string;
  isBot: boolean;
}) {
  const fired = useRef(false);
  // Shown only to a visitor who comes BACK to this tab after a successful
  // escape. They already left for their browser, so the verdict timer correctly
  // did nothing — but without this they would return to "Just a moment…" and a
  // page that never resolves. Auto-navigating instead would drag them to
  // OnlyFans inside the WebView, which is the thing the escape just avoided.
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    // A bot that got past cloaking is never redirected and never recorded.
    if (isBot || fired.current) return;
    fired.current = true;

    const ua = navigator.userAgent;
    const uaLower = ua.toLowerCase();
    const isIG = ua.includes("Instagram");
    const isThreads = uaLower.includes("threads") || uaLower.includes("barcelona");
    const surface: "instagram" | "threads" | null = isIG
      ? "instagram"
      : isThreads
        ? "threads"
        : null;
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) &&
      !(window as unknown as { MSStream?: unknown }).MSStream;

    const sessionId =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "";

    sendBeacon("/api/autoredirect", {
      creator: slug,
      sessionId,
      linkId,
      linkLabel,
      isInstagram: surface !== null,
    });

    const go = () => {
      // Not in a Meta in-app browser: nothing to escape from, just go.
      if (!surface) {
        window.location.href = targetUrl;
        return;
      }

      const bare = targetUrl.replace(/^https?:\/\//, "");

      if (surface === "instagram") {
        try {
          window.location.href =
            "instagram://extbrowser/?url=" + encodeURIComponent(targetUrl);
        } catch {
          /* noop */
        }
        // iOS stops here. The scheme cascade below is Android-only: Apple killed
        // x-safari- in iOS 14.5 and never replaced it, and firing the others on
        // iOS only stalls a visitor who has already been handed to Safari.
        if (isIOS) {
          scheduleVerdict(isIOS, surface);
          return;
        }
      } else {
        // Threads: never fire instagram://, which hands off to the Instagram app
        // rather than a browser. On iOS there is no usable scheme at all.
        if (isIOS) {
          window.location.href = targetUrl;
          return;
        }
        try {
          window.location.href = "intent://" + bare + "#Intent;scheme=https;end";
        } catch {
          /* noop */
        }
      }

      // Android fallbacks, each gated on the page still being visible so a
      // visitor whose handoff already succeeded is not yanked between browsers.
      const scheduleFallback = (ms: number, href: string) => {
        setTimeout(() => {
          if (document.visibilityState !== "visible") return;
          try {
            window.location.href = href;
          } catch {
            /* noop */
          }
        }, ms);
      };
      scheduleFallback(FALLBACK_DELAYS.chrome, "googlechromes://" + bare);
      scheduleFallback(
        FALLBACK_DELAYS.firefox,
        "firefox://open-url?url=" + encodeURIComponent(targetUrl)
      );
      scheduleFallback(
        FALLBACK_DELAYS.brave,
        "brave://open-url?url=" + encodeURIComponent(targetUrl)
      );

      scheduleVerdict(isIOS, surface);
    };

    // Still visible after the verdict window ⇒ the escape did not take. Report
    // it, then send the visitor to the target in the WebView rather than
    // stranding them — a logged-out OnlyFans beats a dead end.
    function scheduleVerdict(ios: boolean, surf: "instagram" | "threads") {
      setTimeout(() => {
        if (document.visibilityState !== "visible") return;
        sendBeacon("/api/escape-fallback", {
          creator: slug,
          sessionId,
          platform: ios ? "ios" : /Android/.test(ua) ? "android" : "other",
          surface: surf,
          userAgent: ua,
        });
        window.location.href = targetUrl;
      }, ESCAPE_VERDICT_MS);
    }

    // Past the verdict window, a page that becomes visible again belongs to
    // someone who escaped and came back. Offer the link rather than hijacking.
    const onVisible = () => {
      if (document.visibilityState === "visible") setStalled(true);
    };
    const stallTimer = setTimeout(() => {
      document.addEventListener("visibilitychange", onVisible);
    }, ESCAPE_VERDICT_MS + 500);

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(go, 0));
    } else {
      setTimeout(go, 50);
    }

    return () => {
      clearTimeout(stallTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug, targetUrl, linkId, linkLabel, isBot]);

  // Deliberately says nothing about the destination. This markup is what a
  // human sees for the fraction of a second before the handoff, and what any
  // crawler that slipped past cloaking would read.
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        color: "#f5eefc",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 14,
      }}
    >
      {stalled ? (
        <a
          href={targetUrl}
          style={{ color: "#e91e8a", textDecoration: "none", fontWeight: 600 }}
        >
          Continue →
        </a>
      ) : (
        <p style={{ opacity: 0.7 }}>Just a moment…</p>
      )}
    </main>
  );
}
