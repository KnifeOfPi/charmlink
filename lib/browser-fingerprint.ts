/**
 * Lightweight browser fingerprinting for headless-Chrome detection.
 *
 * Runs on the client, computes a fingerprint hash + signal flags, and sends
 * them with the /api/links/[creator] POST. The server checks for known bot
 * signals (headless Chrome, automation frameworks) and rejects or challenges.
 *
 * Signals collected (no PII, no tracking):
 *   - Canvas hash (2D rendering)
 *   - WebGL vendor/renderer strings
 *   - AudioContext fingerprint (sample rate)
 *   - Screen dimensions + color depth
 *   - Timezone, language
 *   - navigator.webdriver flag
 *   - window.chrome presence
 *   - deviceMemory, hardwareConcurrency
 *   - navigator.plugins length
 *   - navigator.languages
 *   - RTT (Network Information API)
 *   - mediaDevices presence
 *   - pdfViewerEnabled
 *   - Google TTS voices count
 *
 * Known headless-Chrome tells:
 *   - navigator.webdriver=true (but bots override this)
 *   - window.chrome missing (headless Chromium)
 *   - AudioContext.sampleRate = 24000 (headless Chrome; real: 44100/48000)
 *   - WebGL renderer = "SwiftShader" (software rendering = headless)
 *   - deviceMemory undefined (headless)
 *   - screen.availTop = 0 on macOS (no menu bar = headless)
 *   - mediaDevices missing (headless)
 *   - RTT=0 (no real network stack)
 *   - pdfViewerEnabled=false (headless)
 *   - 0 Google TTS voices (headless)
 */

export interface FingerprintResult {
  /** Stable hash of the fingerprint — same browser config → same hash. */
  hash: string;
  /** True if any known bot signal was detected. */
  isSuspicious: boolean;
  /** Human-readable reasons (for server-side logging). */
  reasons: string[];
  /** Raw signals (sent to server for future rule tuning). */
  signals: Record<string, unknown>;
}

/**
 * Compute the browser fingerprint. Returns null if the environment is not a
 * browser (SSR safety).
 */
export function computeFingerprint(): FingerprintResult | null {
  if (typeof window === "undefined") return null;

  const signals: Record<string, unknown> = {};
  const reasons: string[] = [];

  // ── navigator.webdriver ─────────────────────────────────────────────────
  const webdriver = navigator.webdriver ?? false;
  signals.webdriver = webdriver;
  if (webdriver) {
    reasons.push("webdriver");
  }

  // ── window.chrome ─────────────────────────────────────────────────────────
  const hasChrome = "chrome" in window;
  signals.hasChrome = hasChrome;
  if (!hasChrome) {
    reasons.push("no-window-chrome");
  }

  // ── AudioContext fingerprint ──────────────────────────────────────────────
  let audioSampleRate: number | null = null;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      audioSampleRate = ctx.sampleRate;
      signals.audioSampleRate = audioSampleRate;
      // Headless Chrome defaults to 24000 Hz. Real browsers use 44100 or 48000.
      if (audioSampleRate === 24000) {
        reasons.push("audio-24000hz");
      }
      void ctx.close();
    } else {
      signals.audioSampleRate = null;
      reasons.push("no-audio-context");
    }
  } catch {
    signals.audioSampleRate = null;
    reasons.push("audio-context-error");
  }

  // ── WebGL ─────────────────────────────────────────────────────────────────
  let webglRenderer: string | null = null;
  let webglVendor: string | null = null;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl") as WebGLRenderingContext | null;
    if (gl) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        webglRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
        webglVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string;
      } else {
        webglRenderer = gl.getParameter(gl.RENDERER) as string;
        webglVendor = gl.getParameter(gl.VENDOR) as string;
      }
      signals.webglRenderer = webglRenderer;
      signals.webglVendor = webglVendor;
      // SwiftShader = software rendering = headless Chrome
      if (webglRenderer?.includes("SwiftShader")) {
        reasons.push("webgl-swiftshader");
      }
      // "Google Inc." vendor with SwiftShader renderer is a classic headless tell
      if (webglVendor?.includes("Google Inc.") && webglRenderer?.includes("SwiftShader")) {
        reasons.push("webgl-google-swiftshader");
      }
    } else {
      signals.webglRenderer = null;
      signals.webglVendor = null;
      reasons.push("no-webgl");
    }
  } catch {
    signals.webglRenderer = null;
    signals.webglVendor = null;
    reasons.push("webgl-error");
  }

  // ── Canvas hash (2D) ──────────────────────────────────────────────────────
  let canvasHash: string | null = null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("CharmLink", 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText("CharmLink", 4, 17);
      canvasHash = canvas.toDataURL();
      // Simple hash of the data URL for compactness
      let h = 0;
      for (let i = 0; i < canvasHash.length; i++) {
        h = ((h << 5) - h + canvasHash.charCodeAt(i)) | 0;
      }
      canvasHash = h.toString(36);
      signals.canvasHash = canvasHash;
    }
  } catch {
    canvasHash = null;
    signals.canvasHash = null;
  }

  // ── Screen + device ───────────────────────────────────────────────────────
  signals.screenWidth = screen.width;
  signals.screenHeight = screen.height;
  signals.screenColorDepth = screen.colorDepth;
  signals.devicePixelRatio = window.devicePixelRatio;
  signals.availTop = (screen as unknown as { availTop?: number }).availTop ?? null;
  signals.availLeft = (screen as unknown as { availLeft?: number }).availLeft ?? null;

  // macOS headless: availTop should be ~25 (menu bar). 0 = no menu bar = headless.
  const isMac = /Mac/.test(navigator.platform);
  const availTop = (screen as unknown as { availTop?: number }).availTop;
  if (isMac && availTop === 0) {
    reasons.push("mac-avail-top-0");
  }

  // ── deviceMemory / hardwareConcurrency ────────────────────────────────────
  const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const hardwareConcurrency = navigator.hardwareConcurrency;
  signals.deviceMemory = deviceMemory ?? null;
  signals.hardwareConcurrency = hardwareConcurrency;
  if (deviceMemory === undefined) {
    reasons.push("no-device-memory");
  }

  // ── Timezone + language ───────────────────────────────────────────────────
  signals.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  signals.language = navigator.language;
  signals.languages = navigator.languages;

  // ── Network Information API ───────────────────────────────────────────────
  const connection = (navigator as unknown as { connection?: { effectiveType?: string; rtt?: number; downlink?: number } }).connection;
  signals.connectionType = connection?.effectiveType ?? null;
  signals.rtt = connection?.rtt ?? null;
  signals.downlink = connection?.downlink ?? null;
  if (connection?.rtt === 0) {
    reasons.push("rtt-0");
  }

  // ── mediaDevices ──────────────────────────────────────────────────────────
  signals.hasMediaDevices = "mediaDevices" in navigator;
  if (!("mediaDevices" in navigator)) {
    reasons.push("no-media-devices");
  }

  // ── pdfViewerEnabled ──────────────────────────────────────────────────────
  signals.pdfViewerEnabled = navigator.pdfViewerEnabled ?? false;
  if (!navigator.pdfViewerEnabled) {
    reasons.push("no-pdf-viewer");
  }

  // ── Google TTS voices ─────────────────────────────────────────────────────
  let googleVoices = 0;
  try {
    const voices = speechSynthesis.getVoices();
    googleVoices = voices.filter((v) => v.name.startsWith("Google")).length;
    signals.googleVoices = googleVoices;
    if (googleVoices === 0) {
      reasons.push("no-google-voices");
    }
  } catch {
    signals.googleVoices = null;
  }

  // ── Plugins ───────────────────────────────────────────────────────────────
  signals.pluginsLength = navigator.plugins?.length ?? 0;

  // ── Overall suspicion ─────────────────────────────────────────────────────
  // Weight reasons: some are stronger signals than others.
  const strongSignals = ["webdriver", "audio-24000hz", "webgl-swiftshader", "webgl-google-swiftshader", "mac-avail-top-0"];
  const weakSignals = ["no-window-chrome", "no-device-memory", "no-media-devices", "no-pdf-viewer", "rtt-0", "no-google-voices"];
  const strongCount = reasons.filter((r) => strongSignals.includes(r)).length;
  const weakCount = reasons.filter((r) => weakSignals.includes(r)).length;

  // Suspicious if any strong signal, or 3+ weak signals.
  const isSuspicious = strongCount > 0 || weakCount >= 3;

  // ── Hash ──────────────────────────────────────────────────────────────────
  // Stable hash of the raw signals (for future server-side rules).
  const hashInput = JSON.stringify(signals);
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    hash = ((hash << 5) - hash + hashInput.charCodeAt(i)) | 0;
  }
  const hashStr = hash.toString(36);

  return {
    hash: hashStr,
    isSuspicious,
    reasons,
    signals,
  };
}
