"use client";

import { useState } from "react";

export default function AgeConfirmButton() {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await fetch("/api/age-confirm", { method: "POST" });
    } catch {
      // Ignore — cookie may not have been set, but we reload anyway
    }
    window.location.reload();
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
