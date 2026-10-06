/**
 * Behavioral analysis for bot detection.
 *
 * Tracks mouse movements, touch events, scroll patterns, and timing to
 * distinguish real humans from automated browsers. Real humans move the
 * mouse, scroll, and take time to read. Bots click immediately or follow
 * programmatic patterns.
 *
 * Signals collected:
 *   - Mouse movement count, distance, and entropy
 *   - Touch event count (mobile)
 *   - Scroll depth and timing
 *   - Time from page load to first interaction
 *   - Click timing distribution
 *   - Key press count
 *
 * Bot tells:
 *   - Zero mouse movement before click
 *   - Click within 100ms of page load
 *   - Perfectly linear scroll (constant velocity)
 *   - No touch events on mobile
 *   - No key presses
 *   - Uniform click timing (programmatic)
 */

export interface BehaviorSignals {
  /** Total mousemove events observed. */
  mouseMoves: number;
  /** Total distance traveled by mouse (pixels). */
  mouseDistance: number;
  /** Entropy of mouse movement directions (0-1, higher = more human). */
  mouseEntropy: number;
  /** Total touchstart events. */
  touchStarts: number;
  /** Total scroll events. */
  scrolls: number;
  /** Maximum scroll depth as percentage of page height. */
  maxScrollDepth: number;
  /** Time from page load to first interaction (ms). */
  timeToFirstInteraction: number;
  /** Total keydown events. */
  keyPresses: number;
  /** Click timestamps (for timing analysis). */
  clickTimestamps: number[];
  /** True if any known bot signal was detected. */
  isSuspicious: boolean;
  /** Human-readable reasons. */
  reasons: string[];
}

/**
 * Compute a "human score" from 0 (definitely bot) to 1 (definitely human).
 * Used server-side to decide whether to challenge with Turnstile.
 */
export function computeHumanScore(signals: BehaviorSignals): number {
  let score = 1.0;

  // No mouse movement on desktop = suspicious
  const isMobile = signals.touchStarts > 0;
  if (!isMobile && signals.mouseMoves === 0) {
    score -= 0.4;
  }

  // Very fast first interaction = suspicious
  if (signals.timeToFirstInteraction < 100) {
    score -= 0.3;
  } else if (signals.timeToFirstInteraction < 500) {
    score -= 0.1;
  }

  // No scrolling = suspicious (real users scroll)
  if (signals.scrolls === 0) {
    score -= 0.2;
  }

  // No key presses = mildly suspicious
  if (signals.keyPresses === 0) {
    score -= 0.1;
  }

  // Low mouse entropy = suspicious (programmatic movement)
  if (signals.mouseMoves > 5 && signals.mouseEntropy < 0.3) {
    score -= 0.2;
  }

  // Uniform click timing = suspicious
  if (signals.clickTimestamps.length >= 3) {
    const intervals: number[] = [];
    for (let i = 1; i < signals.clickTimestamps.length; i++) {
      intervals.push(signals.clickTimestamps[i] - signals.clickTimestamps[i - 1]);
    }
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    // Very low variance = programmatic timing
    if (stdDev < 50) {
      score -= 0.3;
    }
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Client-side tracker. Instantiate on page load, call `getSignals()` when
 * ready to send to server.
 */
export class BehaviorTracker {
  private signals: BehaviorSignals = {
    mouseMoves: 0,
    mouseDistance: 0,
    mouseEntropy: 0,
    touchStarts: 0,
    scrolls: 0,
    maxScrollDepth: 0,
    timeToFirstInteraction: 0,
    keyPresses: 0,
    clickTimestamps: [],
    isSuspicious: false,
    reasons: [],
  };

  private lastMouseX = 0;
  private lastMouseY = 0;
  private mouseDirections: number[] = [];
  private pageLoadTime: number;
  private firstInteractionTime: number | null = null;
  private scrollHandler: (() => void) | null = null;
  private mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  private touchStartHandler: (() => void) | null = null;
  private keyDownHandler: (() => void) | null = null;
  private clickHandler: (() => void) | null = null;

  constructor() {
    this.pageLoadTime = Date.now();
    this.setupListeners();
  }

  private setupListeners(): void {
    if (typeof window === "undefined") return;

    // Mouse movement
    this.mouseMoveHandler = (e: MouseEvent) => {
      this.signals.mouseMoves++;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.signals.mouseDistance += Math.sqrt(dx * dx + dy * dy);
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      // Track direction for entropy calculation
      if (dx !== 0 || dy !== 0) {
        const angle = Math.atan2(dy, dx);
        this.mouseDirections.push(angle);
        if (this.mouseDirections.length > 100) {
          this.mouseDirections.shift();
        }
      }

      this.recordInteraction();
    };
    window.addEventListener("mousemove", this.mouseMoveHandler, { passive: true });

    // Touch events
    this.touchStartHandler = () => {
      this.signals.touchStarts++;
      this.recordInteraction();
    };
    window.addEventListener("touchstart", this.touchStartHandler, { passive: true });

    // Scroll
    this.scrollHandler = () => {
      this.signals.scrolls++;
      const scrollDepth = window.scrollY + window.innerHeight;
      const pageHeight = document.body.scrollHeight;
      const depth = pageHeight > 0 ? scrollDepth / pageHeight : 0;
      if (depth > this.signals.maxScrollDepth) {
        this.signals.maxScrollDepth = depth;
      }
      this.recordInteraction();
    };
    window.addEventListener("scroll", this.scrollHandler, { passive: true });

    // Key presses
    this.keyDownHandler = () => {
      this.signals.keyPresses++;
      this.recordInteraction();
    };
    window.addEventListener("keydown", this.keyDownHandler, { passive: true });

    // Clicks
    this.clickHandler = () => {
      this.signals.clickTimestamps.push(Date.now());
      this.recordInteraction();
    };
    window.addEventListener("click", this.clickHandler, { passive: true });
  }

  private recordInteraction(): void {
    if (this.firstInteractionTime === null) {
      this.firstInteractionTime = Date.now();
      this.signals.timeToFirstInteraction = this.firstInteractionTime - this.pageLoadTime;
    }
  }

  /**
   * Compute mouse movement entropy (0-1). Higher = more human-like.
   * Uses direction histogram entropy.
   */
  private computeMouseEntropy(): number {
    if (this.mouseDirections.length < 5) return 0;

    // Bin directions into 8 sectors
    const bins = new Array(8).fill(0);
    for (const angle of this.mouseDirections) {
      const sector = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 8) % 8;
      bins[sector]++;
    }

    // Compute Shannon entropy
    const total = this.mouseDirections.length;
    let entropy = 0;
    for (const count of bins) {
      if (count > 0) {
        const p = count / total;
        entropy -= p * Math.log2(p);
      }
    }

    // Normalize to 0-1 (max entropy for 8 bins = 3)
    return entropy / 3;
  }

  /**
   * Get the current signals and compute suspicion flags.
   */
  getSignals(): BehaviorSignals {
    this.signals.mouseEntropy = this.computeMouseEntropy();

    const reasons: string[] = [];
    const isMobile = this.signals.touchStarts > 0;

    if (!isMobile && this.signals.mouseMoves === 0) {
      reasons.push("no-mouse-movement");
    }
    if (this.signals.timeToFirstInteraction < 100) {
      reasons.push("instant-interaction");
    }
    if (this.signals.scrolls === 0) {
      reasons.push("no-scroll");
    }
    if (this.signals.mouseMoves > 5 && this.signals.mouseEntropy < 0.3) {
      reasons.push("low-mouse-entropy");
    }
    if (this.signals.clickTimestamps.length >= 3) {
      const intervals: number[] = [];
      for (let i = 1; i < this.signals.clickTimestamps.length; i++) {
        intervals.push(this.signals.clickTimestamps[i] - this.signals.clickTimestamps[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / intervals.length;
      if (Math.sqrt(variance) < 50) {
        reasons.push("uniform-click-timing");
      }
    }

    this.signals.isSuspicious = reasons.length >= 2;
    this.signals.reasons = reasons;

    return { ...this.signals };
  }

  /**
   * Clean up event listeners.
   */
  destroy(): void {
    if (typeof window === "undefined") return;
    if (this.mouseMoveHandler) window.removeEventListener("mousemove", this.mouseMoveHandler);
    if (this.touchStartHandler) window.removeEventListener("touchstart", this.touchStartHandler);
    if (this.scrollHandler) window.removeEventListener("scroll", this.scrollHandler);
    if (this.keyDownHandler) window.removeEventListener("keydown", this.keyDownHandler);
    if (this.clickHandler) window.removeEventListener("click", this.clickHandler);
  }
}
