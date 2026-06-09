"use client";

import { useState } from "react";

export function CopyButton({
  value,
  label,
  title,
}: {
  value: string;
  label?: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable / blocked — fail silently.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={title ?? `Copy ${value}`}
      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#e91e8a] border border-[#333] hover:border-[#e91e8a] rounded px-1.5 py-0.5 transition-colors align-middle"
    >
      <span>{copied ? "✓" : "📋"}</span>
      {label && <span>{label}</span>}
      {copied && !label && <span className="text-green-400">Copied</span>}
    </button>
  );
}
