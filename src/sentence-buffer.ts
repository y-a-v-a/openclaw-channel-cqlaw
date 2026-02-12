/**
 * Accumulates decoded CW characters from the fldigi polling loop and
 * flushes complete messages based on silence timeout or prosign detection.
 *
 * Prosigns that trigger an immediate flush:
 *   AR — end of message
 *   SK — end of contact
 *   K  — go ahead (end of word boundary, not mid-word "K")
 *   KN — go ahead, named station only
 *   BK — break
 */

/** Prosigns that signal "my transmission is done" — flush immediately */
const FLUSH_PROSIGNS = [" AR", " SK", " KN", " BK"];

/**
 * Standalone " K" at end of buffer signals go-ahead.
 * Must be preceded by a space (or start-of-buffer) and NOT be part of
 * a longer prosign like SK, BK, KN. We check for " K" at the tail
 * only after ruling out the multi-char prosigns above.
 */
const K_PATTERN = / K$/;

export interface SentenceBufferOptions {
  /** Silence duration (ms) before auto-flushing the buffer. Default 3000. */
  silenceThresholdMs?: number;
}

export type FlushCallback = (message: string) => void;

export class SentenceBuffer {
  private buffer = "";
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly silenceThresholdMs: number;
  private readonly onFlush: FlushCallback;

  constructor(onFlush: FlushCallback, options: SentenceBufferOptions = {}) {
    this.silenceThresholdMs = options.silenceThresholdMs ?? 3000;
    this.onFlush = onFlush;
  }

  /**
   * Feed new decoded characters into the buffer.
   * Resets the silence timer and checks for prosign-triggered flushes.
   */
  push(text: string): void {
    if (!text) return;

    this.buffer += text;
    this.resetSilenceTimer();

    if (this.shouldFlushOnProsign()) {
      this.flush();
    }
  }

  /** Force-flush whatever is in the buffer. No-op if buffer is empty. */
  flush(): void {
    this.clearSilenceTimer();

    const message = this.normalize(this.buffer);
    this.buffer = "";

    if (message) {
      this.onFlush(message);
    }
  }

  /** Discard buffer contents and cancel pending timers. */
  reset(): void {
    this.buffer = "";
    this.clearSilenceTimer();
  }

  /** Current raw buffer contents (for inspection/testing). */
  get pending(): string {
    return this.buffer;
  }

  // --- internals ---

  private shouldFlushOnProsign(): boolean {
    const upper = this.buffer.toUpperCase();

    for (const prosign of FLUSH_PROSIGNS) {
      if (upper.endsWith(prosign)) return true;
    }

    // Standalone " K" — but only if it isn't the tail of SK/BK/KN
    // (those are already caught above). We just need to check the
    // simple " K" case that didn't match a longer prosign.
    if (K_PATTERN.test(upper)) {
      // Make sure it's not part of SK or BK (already handled above,
      // but guard against buffer like "XYZK" where there's no space).
      return true;
    }

    return false;
  }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      this.flush();
    }, this.silenceThresholdMs);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /** Strip edges and collapse internal whitespace runs. */
  private normalize(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }
}
