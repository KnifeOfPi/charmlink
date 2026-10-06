/**
 * Fingerprint rotation detection.
 *
 * Real browsers produce consistent fingerprints across sessions. Bots that
 * rotate fingerprints (to avoid tracking or evade detection) produce
 * inconsistent canvas hashes, WebGL renderers, and other signals.
 *
 * This module stores fingerprint hashes in Vercel KV with a 24h TTL and
 * flags IPs that produce too many distinct hashes in a short window.
 *
 * Usage:
 *   const rotation = await checkFingerprintRotation(ip, fingerprintHash);
 *   if (rotation.isSuspicious) { ... }
 */

import { kv } from "@vercel/kv";

const ROTATION_WINDOW_SECONDS = 24 * 60 * 60; // 24 hours
const MAX_DISTINCT_FINGERPRINTS = 3; // per IP per window
const KV_PREFIX = "fp-rotation:";

export interface RotationResult {
  isSuspicious: boolean;
  distinctCount: number;
  reason?: string;
}

/**
 * Check if an IP has produced too many distinct fingerprints in the last
 * 24 hours. Returns the count of distinct fingerprints seen.
 */
export async function checkFingerprintRotation(
  ip: string,
  fingerprintHash: string
): Promise<RotationResult> {
  if (!ip || !fingerprintHash) {
    return { isSuspicious: false, distinctCount: 0 };
  }

  const key = `${KV_PREFIX}${ip}`;

  try {
    // Get existing hashes for this IP
    const existing = (await kv.get<string[]>(key)) ?? [];

    // Check if this hash is already recorded
    if (existing.includes(fingerprintHash)) {
      return {
        isSuspicious: false,
        distinctCount: existing.length,
      };
    }

    // Add new hash
    const updated = [...existing, fingerprintHash];

    // Store with TTL
    await kv.set(key, updated, { ex: ROTATION_WINDOW_SECONDS });

    const distinctCount = updated.length;

    if (distinctCount > MAX_DISTINCT_FINGERPRINTS) {
      return {
        isSuspicious: true,
        distinctCount,
        reason: `fingerprint-rotation:${distinctCount}-hashes-in-24h`,
      };
    }

    return {
      isSuspicious: false,
      distinctCount,
    };
  } catch (err) {
    // KV failure — fail open (don't block real users)
    console.error("[fp-rotation] KV error:", err);
    return { isSuspicious: false, distinctCount: 0 };
  }
}

/**
 * Record a fingerprint without checking rotation (for logging/analytics).
 */
export async function recordFingerprint(
  ip: string,
  fingerprintHash: string
): Promise<void> {
  if (!ip || !fingerprintHash) return;

  const key = `${KV_PREFIX}${ip}`;

  try {
    const existing = (await kv.get<string[]>(key)) ?? [];
    if (!existing.includes(fingerprintHash)) {
      await kv.set(key, [...existing, fingerprintHash], {
        ex: ROTATION_WINDOW_SECONDS,
      });
    }
  } catch {
    // Silent fail
  }
}
