/**
 * Polling loop that reads decoded text from fldigi's RX buffer,
 * feeds it through the SentenceBuffer, and dispatches complete
 * messages to the gateway.
 *
 * Handles reconnection with exponential backoff when fldigi is unreachable.
 */

import { FldigiClient, XmlRpcError } from "./fldigi-client.js";
import { SentenceBuffer } from "./sentence-buffer.js";
import { extractCqCalls, extractDirectedExchanges, extractCallsigns } from "./callsign.js";
import type { ChannelConfig } from "./config.js";

export type ChannelStatus = "connected" | "disconnected" | "reconnecting" | "error";

export interface FldigiPollerCallbacks {
  /** Called when the sentence buffer flushes a complete message */
  onMessage: (text: string, peer: string, metadata: Record<string, unknown>) => void;
  /** Called when connection status changes */
  onStatusChange: (status: ChannelStatus) => void;
}

const CHANNEL_ID = "morse-radio";
const UNKNOWN_PEER = "UNKNOWN";
const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const PERF_LOG_INTERVAL_MS = 60000;
const SIGNAL_SAMPLE_INTERVAL_MS = 1000;

export class FldigiPoller {
  private readonly client: FldigiClient;
  private readonly config: ChannelConfig;
  private readonly callbacks: FldigiPollerCallbacks;
  private readonly sentenceBuffer: SentenceBuffer;

  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private rxOffset = 0;
  private currentPeer = UNKNOWN_PEER;
  private status: ChannelStatus = "disconnected";
  private backoffMs = BACKOFF_INITIAL_MS;
  private pollCount = 0;
  private lastPerfLog = 0;
  private lastSignalSampleAt = 0;
  private detectedWpm: number | undefined;
  private signalNoiseRatio: number | undefined;

  constructor(config: ChannelConfig, callbacks: FldigiPollerCallbacks) {
    this.config = config;
    this.callbacks = callbacks;

    this.client = new FldigiClient({
      host: config.fldigi.host,
      port: config.fldigi.port,
      timeoutMs: 5000,
    });

    this.sentenceBuffer = new SentenceBuffer(
      (message) => this.handleFlush(message),
      { silenceThresholdMs: 3000 }
    );
  }

  async start(): Promise<void> {
    this.running = true;
    this.rxOffset = 0;
    this.currentPeer = UNKNOWN_PEER;
    this.backoffMs = BACKOFF_INITIAL_MS;
    this.pollCount = 0;
    this.lastPerfLog = Date.now();
    this.lastSignalSampleAt = 0;
    this.detectedWpm = undefined;
    this.signalNoiseRatio = undefined;

    await this.tryConnect();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.sentenceBuffer.reset();
    this.setStatus("disconnected");
  }

  /** Expose the client for direct access (e.g. getting version info at startup). */
  get fldigi(): FldigiClient {
    return this.client;
  }

  // --- internals ---

  private async tryConnect(): Promise<void> {
    if (!this.running) return;

    try {
      await this.client.connect();
      const version = await this.client.getVersion();
      console.log(`[fldigi-poller] Connected to fldigi ${version}`);

      // Sync to end of current RX buffer so we only get new text
      this.rxOffset = await this.client.getRxLength();
      this.backoffMs = BACKOFF_INITIAL_MS;
      this.setStatus("connected");
      this.schedulePoll();
    } catch {
      this.setStatus("reconnecting");
      console.warn(`[fldigi-poller] Cannot reach fldigi at ${this.config.fldigi.host}:${this.config.fldigi.port}, retrying in ${this.backoffMs}ms`);
      this.scheduleReconnect();
    }
  }

  private schedulePoll(): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => this.poll(), this.config.fldigi.pollingIntervalMs);
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => this.tryConnect(), this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    const pollStart = Date.now();

    try {
      const currentLength = await this.client.getRxLength();

      // Detect fldigi restart (buffer reset — length jumped backward)
      if (currentLength < this.rxOffset) {
        console.log("[fldigi-poller] Buffer reset detected (fldigi restarted?), re-syncing");
        this.rxOffset = currentLength;
        this.sentenceBuffer.reset();
      }

      // Read new text since last poll
      if (currentLength > this.rxOffset) {
        const newLength = currentLength - this.rxOffset;
        const newText = await this.client.getRxText(this.rxOffset, newLength);
        this.rxOffset = currentLength;

        if (newText) {
          this.updatePeer(newText);
          this.sentenceBuffer.push(newText);
        }
      }

      await this.sampleSignalMetricsIfDue();

      this.pollCount++;
      this.logPerfIfDue(pollStart);
      this.schedulePoll();
    } catch (err) {
      console.warn(`[fldigi-poller] Poll error: ${err instanceof Error ? err.message : err}`);
      this.setStatus("reconnecting");
      this.sentenceBuffer.flush();
      this.scheduleReconnect();
    }
  }

  /** Extract the most recent callsign from decoded text to use as peer */
  private updatePeer(text: string): void {
    // Prefer CQ DE <call> — that's the station transmitting
    const cqCalls = extractCqCalls(text);
    if (cqCalls.length > 0) {
      this.currentPeer = cqCalls[cqCalls.length - 1].from;
      return;
    }

    // Directed exchange: <to> DE <from> — the "from" is the station transmitting
    const exchanges = extractDirectedExchanges(text);
    if (exchanges.length > 0) {
      this.currentPeer = exchanges[exchanges.length - 1].from;
      return;
    }

    // Fall back to any callsign found
    const calls = extractCallsigns(text);
    if (calls.length > 0) {
      this.currentPeer = calls[calls.length - 1].callsign;
    }
  }

  /** Called by SentenceBuffer when a complete message is ready */
  private handleFlush(message: string): void {
    const metadata: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      frequency: this.config.frequency,
      channel: CHANNEL_ID,
      detectedWpm: this.detectedWpm,
      snr: this.signalNoiseRatio,
    };

    this.callbacks.onMessage(message, this.currentPeer, metadata);
    this.currentPeer = UNKNOWN_PEER;
  }

  private async sampleSignalMetricsIfDue(): Promise<void> {
    const now = Date.now();
    if (now - this.lastSignalSampleAt < SIGNAL_SAMPLE_INTERVAL_MS) {
      return;
    }

    this.lastSignalSampleAt = now;
    try {
      const [wpm, snr] = await Promise.all([
        this.client.getWpm(),
        this.client.getSignalNoiseRatio(),
      ]);
      if (Number.isFinite(wpm)) this.detectedWpm = wpm;
      if (Number.isFinite(snr)) this.signalNoiseRatio = snr;
    } catch {
      // Non-fatal: metadata sampling should never break message flow.
    }
  }

  private setStatus(status: ChannelStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.callbacks.onStatusChange(status);
    }
  }

  private logPerfIfDue(pollStart: number): void {
    const now = Date.now();
    if (now - this.lastPerfLog >= PERF_LOG_INTERVAL_MS) {
      const latency = now - pollStart;
      console.log(`[fldigi-poller] Polls: ${this.pollCount}, last latency: ${latency}ms, offset: ${this.rxOffset}`);
      this.lastPerfLog = now;
    }
  }
}
