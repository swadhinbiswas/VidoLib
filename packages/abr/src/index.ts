import { Rendition } from '@vidolib/manifest';

/**
 * Exponentially Weighted Moving Average (EWMA) Bandwidth Estimator.
 */
export class BandwidthEstimator {
  private estimateBps: number = 2_500_000; // 2.5 Mbps default
  private alpha: number; // smoothing factor (0.1 to 0.5)

  constructor(halfLifeSeconds: number = 3) {
    this.alpha = 1 - Math.exp(-1 / halfLifeSeconds);
  }

  public sample(bytesReceived: number, durationMs: number): number {
    if (durationMs <= 0 || bytesReceived <= 0) return this.estimateBps;
    const instantBps = (bytesReceived * 8 * 1000) / durationMs;
    this.estimateBps = this.alpha * instantBps + (1 - this.alpha) * this.estimateBps;
    return this.estimateBps;
  }

  public getBandwidthBps(): number {
    return this.estimateBps;
  }
}

export interface ABRConfig {
  safetyFactor: number; // e.g. 0.75 -> target 75% of bandwidth
  minBufferSeconds: number; // switch down if buffer < 3s
  maxBufferSeconds: number; // switch up if buffer > 10s
}

export class ABRController {
  private estimator = new BandwidthEstimator();
  private config: ABRConfig = {
    safetyFactor: 0.75,
    minBufferSeconds: 3.0,
    maxBufferSeconds: 10.0
  };

  constructor(userConfig?: Partial<ABRConfig>) {
    if (userConfig) {
      this.config = { ...this.config, ...userConfig };
    }
  }

  public recordSample(bytesReceived: number, durationMs: number): void {
    this.estimator.sample(bytesReceived, durationMs);
  }

  public selectRendition(
    renditions: Rendition[],
    currentRendition: Rendition,
    bufferedSeconds: number
  ): Rendition {
    if (renditions.length === 0) return currentRendition;

    const availableBps = this.estimator.getBandwidthBps() * this.config.safetyFactor;
    const sorted = [...renditions].sort((a, b) => a.bandwidth - b.bandwidth);

    // If buffer is critically low (< minBufferSeconds), downgrade immediately to avoid stall
    if (bufferedSeconds < this.config.minBufferSeconds) {
      const lower = sorted.filter(r => r.bandwidth <= currentRendition.bandwidth);
      if (lower.length > 0) {
        return lower[Math.max(0, lower.indexOf(currentRendition) - 1)] || lower[0];
      }
    }

    // Otherwise select highest bandwidth rendition that fits available bandwidth
    let best = sorted[0];
    for (const r of sorted) {
      if (r.bandwidth <= availableBps) {
        best = r;
      }
    }

    return best;
  }

  public getBandwidthBps(): number {
    return this.estimator.getBandwidthBps();
  }
}
