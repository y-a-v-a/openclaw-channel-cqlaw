/**
 * Transmitter — manages all outbound CW transmission through fldigi.
 *
 * Enforces hard safety constraints that MUST NOT be left to the LLM:
 *   - TX enabled / inhibit checks
 *   - Callsign requirement
 *   - Speed matching (TX WPM ≤ detected RX WPM)
 *   - Max TX duration auto-abort
 *   - Legal callsign identification every 10 minutes
 *   - Listen-before-transmit guard
 *   - QRL? check before first TX on a frequency
 *   - TX cooldown between consecutive transmissions
 *   - Full transmission logging for regulatory compliance
 */

import { FldigiClient } from "./fldigi-client.js";
import { sanitizeForCw } from "./cw-sanitize.js";
import { formatForCw, type TxIntent } from "./cw-format.js";
import type { ChannelConfig } from "./config.js";

/** Minimum gap between consecutive transmissions (ms) */
const TX_COOLDOWN_MS = 500;

/** Legal ID interval — 10 minutes in ms */
const LEGAL_ID_INTERVAL_MS = 10 * 60 * 1000;

/** Default listen-before-transmit duration (ms) */
const LISTEN_BEFORE_TX_MS = 10_000;

/** QRL? wait period (ms) */
const QRL_WAIT_MS = 5000;

export interface TransmitResult {
  success: boolean;
  error?: string;
  /** The actual text sent to fldigi (after sanitization) */
  transmitted?: string;
}

export interface TransmitLog {
  timestamp: string;
  text: string;
  wpm: number;
  frequency: number;
  callsign: string;
}

export interface TransmitterCallbacks {
  /** Called for every transmission — for regulatory compliance logging */
  onTransmitLog: (log: TransmitLog) => void;
  /** Called when legal ID is automatically appended */
  onLegalId: (callsign: string) => void;
}

export class Transmitter {
  private readonly client: FldigiClient;
  private readonly config: ChannelConfig;
  private readonly callbacks: TransmitterCallbacks;

  private lastTxTime = 0;
  private lastIdTime = 0;
  private listenStartTime = 0;
  private qrlCheckedForFrequency: number | null = null;
  private inhibited = false;
  private txDurationTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(client: FldigiClient, config: ChannelConfig, callbacks: TransmitterCallbacks) {
    this.client = client;
    this.config = config;
    this.callbacks = callbacks;
    this.inhibited = config.tx.inhibit;
  }

  /**
   * Record that the receiver started listening on a frequency.
   * Must be called when the poller connects or changes frequency.
   */
  markListenStart(): void {
    this.listenStartTime = Date.now();
  }

  /** Emergency stop — abort TX and set inhibit flag */
  async emergencyStop(): Promise<void> {
    this.inhibited = true;
    this.clearDurationTimer();
    try {
      await this.client.abortTx();
      await this.client.stopTx();
    } catch {
      // Best-effort — log but don't throw
    }
    console.log("[transmitter] EMERGENCY STOP — TX inhibited");
  }

  /** Clear the inhibit flag (operator re-enables TX) */
  clearInhibit(): void {
    this.inhibited = false;
    console.log("[transmitter] TX inhibit cleared");
  }

  /** Cancel pending timers. Call on shutdown. */
  destroy(): void {
    this.clearDurationTimer();
  }

  /**
   * Transmit text as CW via fldigi.
   * Applies all safety checks, sanitization, formatting, speed matching, and legal ID.
   */
  async send(text: string, detectedRxWpm?: number, intent?: TxIntent, peerCall?: string): Promise<TransmitResult> {
    // --- Pre-flight safety checks ---

    const preflight = this.preflightChecks();
    if (preflight) return preflight;

    // --- Cooldown ---
    const cooldownResult = this.checkCooldown();
    if (cooldownResult) return cooldownResult;

    // --- Listen-before-transmit guard ---
    const listenResult = this.checkListenGuard();
    if (listenResult) return listenResult;

    // --- Sanitize ---
    const sanitized = sanitizeForCw(text);
    if (!sanitized) {
      return { success: false, error: "Text is empty after sanitization" };
    }

    // --- CW formatting (addressing + closing prosign) ---
    const formatted = formatForCw(sanitized, intent ?? "default", this.config.tx.callsign, peerCall);

    // --- Speed matching (hard constraint) ---
    const txWpm = this.resolveWpm(detectedRxWpm);
    try {
      await this.client.setWpm(txWpm);
    } catch (err) {
      return { success: false, error: `Failed to set WPM: ${err instanceof Error ? err.message : err}` };
    }

    // --- Legal ID check — append callsign if overdue ---
    let finalText = formatted;
    const idNeeded = this.isLegalIdDue();
    if (idNeeded) {
      finalText = `${finalText} DE ${this.config.tx.callsign}`;
      this.lastIdTime = Date.now();
      this.callbacks.onLegalId(this.config.tx.callsign);
      console.log(`[transmitter] Legal ID appended: DE ${this.config.tx.callsign}`);
    }

    // --- Transmit ---
    try {
      await this.client.sendTxText(finalText);
      await this.client.startTx();
    } catch (err) {
      return { success: false, error: `fldigi TX error: ${err instanceof Error ? err.message : err}` };
    }

    // --- Max duration safety timer ---
    this.startDurationTimer();

    this.lastTxTime = Date.now();

    // If this is first TX ever, mark the ID time
    if (this.lastIdTime === 0) {
      this.lastIdTime = Date.now();
    }

    // --- Log ---
    const log: TransmitLog = {
      timestamp: new Date().toISOString(),
      text: finalText,
      wpm: txWpm,
      frequency: this.config.frequency,
      callsign: this.config.tx.callsign,
    };
    this.callbacks.onTransmitLog(log);
    console.log(`[transmitter] TX: "${finalText}" @ ${txWpm} WPM on ${this.config.frequency} Hz`);

    return { success: true, transmitted: finalText };
  }

  /**
   * Send QRL? ("is this frequency in use?") and wait for a response.
   * Returns true if frequency appears clear, false if occupied.
   */
  async checkQrl(): Promise<boolean> {
    const preflight = this.preflightChecks();
    if (preflight) return false;

    try {
      // Record buffer position before QRL?
      const rxBefore = await this.client.getRxLength();

      await this.client.sendTxText("QRL?");
      await this.client.startTx();

      console.log(`[transmitter] Sent QRL? — waiting ${QRL_WAIT_MS}ms for response`);

      // Wait
      await sleep(QRL_WAIT_MS);

      // Check if any new text appeared in RX buffer during the wait
      const rxAfter = await this.client.getRxLength();
      const newText = rxAfter > rxBefore;

      if (newText) {
        console.log("[transmitter] QRL? — frequency is occupied (response detected)");
        this.qrlCheckedForFrequency = null;
        return false;
      }

      console.log("[transmitter] QRL? — frequency appears clear");
      this.qrlCheckedForFrequency = this.config.frequency;
      return true;
    } catch (err) {
      console.warn(`[transmitter] QRL? check failed: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }

  // --- Internal checks ---

  private preflightChecks(): TransmitResult | null {
    if (!this.config.tx.enabled) {
      return { success: false, error: "TX is disabled in config" };
    }
    if (this.inhibited) {
      return { success: false, error: "TX is inhibited (emergency stop active)" };
    }
    if (!this.config.tx.callsign) {
      return { success: false, error: "TX callsign is not configured" };
    }
    return null;
  }

  private checkCooldown(): TransmitResult | null {
    const elapsed = Date.now() - this.lastTxTime;
    if (this.lastTxTime > 0 && elapsed < TX_COOLDOWN_MS) {
      return { success: false, error: `TX cooldown: wait ${TX_COOLDOWN_MS - elapsed}ms` };
    }
    return null;
  }

  private checkListenGuard(): TransmitResult | null {
    if (this.listenStartTime === 0) {
      return { success: false, error: "Must listen before transmitting (receiver not started)" };
    }
    const listenDuration = Date.now() - this.listenStartTime;
    if (listenDuration < LISTEN_BEFORE_TX_MS) {
      const remaining = LISTEN_BEFORE_TX_MS - listenDuration;
      return { success: false, error: `Listen-before-transmit: ${Math.ceil(remaining / 1000)}s remaining` };
    }
    return null;
  }

  /**
   * Resolve TX WPM: match or go slightly slower than detected RX speed.
   * This is a hard-coded constraint — not an LLM suggestion.
   */
  private resolveWpm(detectedRxWpm?: number): number {
    if (detectedRxWpm && detectedRxWpm >= 5) {
      // Match or go slightly slower (round down to nearest even number)
      const matched = Math.floor(detectedRxWpm / 2) * 2;
      const wpm = Math.max(5, Math.min(matched, 60));
      console.log(`[transmitter] RX detected ${detectedRxWpm} WPM, setting TX to ${wpm} WPM`);
      return wpm;
    }
    console.log(`[transmitter] No RX WPM detected, using default ${this.config.tx.wpm} WPM`);
    return this.config.tx.wpm;
  }

  /** True if legal callsign identification is overdue (>10 min since last) */
  private isLegalIdDue(): boolean {
    if (this.lastIdTime === 0) return true;
    return Date.now() - this.lastIdTime >= LEGAL_ID_INTERVAL_MS;
  }

  private startDurationTimer(): void {
    this.clearDurationTimer();
    this.txDurationTimer = setTimeout(async () => {
      console.warn(`[transmitter] Max TX duration (${this.config.tx.maxDurationSeconds}s) exceeded — aborting`);
      try {
        await this.client.abortTx();
        await this.client.stopTx();
      } catch {
        // Best effort
      }
    }, this.config.tx.maxDurationSeconds * 1000);
  }

  private clearDurationTimer(): void {
    if (this.txDurationTimer) {
      clearTimeout(this.txDurationTimer);
      this.txDurationTimer = null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
