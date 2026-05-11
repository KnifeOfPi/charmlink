"use client";

import { useState } from "react";

/**
 * Confirm-age button. Posts to /api/age-confirm to set cl_age=1, then:
 *  - If `redirectTo` is provided (per-link interstitial flow), navigate there.
 *  - Otherwise (legacy use), reload the current page.
 */
export default function AgeConfirmButton({
  redirectTo,
}: {
  redirectTo?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await fetch("/api/age-confirm", { method: "POST" });
    } catch {
      // Best effort — cookie may not have been set, but we'll continue anyway.
    }
    if (redirectTo) {
      window.location.replace(redirectTo);
    } else {
      window.location.reload();
    }
  }

  return (
    <>
      <button
        onClick={handleConfirm}
        disabled={loading}
        className="w-full py-3 px-6 rounded-full bg-white text-black font-bold text-sm transition-transform hover:scale-105 active:scale-95 mb-3 disabled:opacity-60"
      >
        {loading ? "Confirming…" : "I am 18 or older — Enter"}
      </button>
      <a
        href="https://google.com"
        className="block text-gray-500 text-xs hover:text-gray-400 transition-colors"
      >
        I am under 18 — Leave
      </a>
    </>
  );
}
