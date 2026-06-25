import { ProviderError } from "./errors.js";
import type {
  AnalyzeImageInput,
  CompareImagesInput,
  FetchFn,
  ProviderHealth,
  RawVisionResult,
  VisionProvider,
} from "./types.js";

// ---------------------------------------------------------------------------
// FallbackVisionProvider
// ---------------------------------------------------------------------------

/**
 * A `VisionProvider` wrapper that falls back to a secondary provider when the
 * primary fails with a transient error (timeout, rate limit, 5xx).
 *
 * The primary provider is always tried first. On failure it tries the fallback
 * **once**. If both fail, the primary error is propagated.
 */
export class FallbackVisionProvider implements VisionProvider {
  readonly name: string;
  private readonly primary: VisionProvider;
  private readonly fallback: VisionProvider;

  constructor(primary: VisionProvider, fallback: VisionProvider) {
    this.primary = primary;
    this.fallback = fallback;
    this.name = `${primary.name}+fallback:${fallback.name}`;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Return true for errors that should trigger a fallback:
   * network errors, 5xx, rate limits, timeouts.
   */
  private static _isTransientError(err: unknown): boolean {
    if (err instanceof ProviderError) {
      const msg = err.message.toLowerCase();
      return (
        msg.includes("timeout") ||
        msg.includes("rate limit") ||
        msg.includes("429") ||
        msg.includes("5") ||
        msg.includes("network") ||
        msg.includes("econnrefused") ||
        msg.includes("econnreset") ||
        msg.includes("enotfound") ||
        msg.includes("etimedout")
      );
    }
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      return (
        msg.includes("timeout") ||
        msg.includes("429") ||
        msg.includes("5") ||
        msg.includes("network") ||
        msg.includes("econnrefused") ||
        msg.includes("econnreset") ||
        msg.includes("enotfound") ||
        msg.includes("etimedout")
      );
    }
    return false;
  }

  /**
   * Run `fn` on primary; on transient error run `fn` on fallback instead.
   * Returns the result annotated with provider info.
   */
  private async _withFallback<T>(
    primaryLabel: string,
    fallbackLabel: string,
    primaryFn: () => Promise<T>,
    fallbackFn: () => Promise<T>,
  ): Promise<T & { _fallbackUsed?: boolean }> {
    try {
      const result = await primaryFn();
      return { ...result, _fallbackUsed: false };
    } catch (primaryErr) {
      if (!FallbackVisionProvider._isTransientError(primaryErr)) {
        // Non-transient → don't retry via fallback
        throw primaryErr;
      }

      // Try fallback
      try {
        const result = await fallbackFn();
        return { ...result, _fallbackUsed: true };
      } catch {
        // Both failed → throw primary error (more relevant)
        throw primaryErr;
      }
    }
  }

  // -----------------------------------------------------------------------
  // VisionProvider interface
  // -----------------------------------------------------------------------

  async analyzeImage(input: AnalyzeImageInput): Promise<RawVisionResult> {
    return this._withFallback(
      this.primary.name,
      this.fallback.name,
      () => this.primary.analyzeImage(input),
      () => this.fallback.analyzeImage(input),
    );
  }

  async compareImages(input: CompareImagesInput): Promise<RawVisionResult> {
    return this._withFallback(
      this.primary.name,
      this.fallback.name,
      () => this.primary.compareImages(input),
      () => this.fallback.compareImages(input),
    );
  }

  async healthCheck(): Promise<ProviderHealth> {
    // Health check: try primary, if it fails try fallback
    const primaryHealth = await this.primary.healthCheck();
    if (primaryHealth.ok) return primaryHealth;

    const fallbackHealth = await this.fallback.healthCheck();
    if (fallbackHealth.ok) return fallbackHealth;

    // Both unhealthy → return primary error
    return primaryHealth;
  }
}
