/**
 * RTL-SDR process manager for the CQlaw plugin.
 *
 * Manages the `rtl_fm` child process and its audio output pipeline.
 * rtl_fm demodulates a radio frequency and outputs raw PCM audio to stdout,
 * which is piped to an audio sink process (e.g. `pacat` on PulseAudio) so
 * fldigi can decode the audio.
 *
 * Handles:
 * - Binary availability check at startup
 * - Frequency validation against CW band segments (warning only)
 * - Graceful shutdown (SIGTERM → wait → SIGKILL)
 * - Auto-restart with exponential backoff on unexpected exit
 * - USB disconnect detection via stderr patterns
 */

import { spawn, type ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SdrConfig } from "./config.js";
import { checkCwBandPlan } from "./cw-band-plan.js";

const execFileAsync = promisify(execFile);

const SIGTERM_WAIT_MS = 2000;
const RESTART_BACKOFF_INITIAL_MS = 1000;
const RESTART_BACKOFF_MAX_MS = 30000;

/** Stderr patterns that indicate the USB device was disconnected */
const USB_DISCONNECT_PATTERNS = [
  "usb_claim_interface error",
  "Failed to open rtlsdr device",
  "No supported devices found",
  "usb_open error",
];

export type SdrManagerStatus = "stopped" | "starting" | "running" | "stopping" | "error";

export interface SdrManagerCallbacks {
  onStatusChange?: (status: SdrManagerStatus) => void;
  onError?: (err: Error) => void;
  onDeviceDisconnected?: () => void;
}

export interface RtlSdrManagerOptions {
  sdr: SdrConfig;
  frequency: number;
  /** Demodulation mode — "usb" is correct for CW (upper sideband) */
  mode?: string;
  /**
   * Command (argv array) for the audio sink process that receives rtl_fm's PCM output.
   * Defaults to pacat (PulseAudio) at the configured sample rate.
   * Override for testing or alternative audio backends.
   */
  audioSinkCommand?: string[];
  /** Injected spawn function for testing */
  spawnFn?: typeof spawn;
  /** Injected binary-check function for testing */
  checkBinaryFn?: () => Promise<boolean>;
}

/**
 * Manages the rtl_fm child process and the downstream audio sink.
 *
 * Lifecycle: construct → start() → [setFrequency() / restart()] → stop()
 */
export class RtlSdrManager {
  private readonly sdr: SdrConfig;
  private readonly callbacks: SdrManagerCallbacks;
  private readonly mode: string;
  private readonly audioSinkCommand: string[];
  private readonly spawnFn: typeof spawn;
  private readonly checkBinaryFn: () => Promise<boolean>;

  private rtlFmProcess: ChildProcess | null = null;
  private audioProcess: ChildProcess | null = null;
  private status: SdrManagerStatus = "stopped";
  private running = false;
  private currentFrequency: number;
  private backoffMs = RESTART_BACKOFF_INITIAL_MS;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: RtlSdrManagerOptions, callbacks: SdrManagerCallbacks = {}) {
    this.sdr = options.sdr;
    this.currentFrequency = options.frequency;
    this.mode = options.mode ?? "usb";
    this.callbacks = callbacks;
    this.spawnFn = options.spawnFn ?? spawn;
    this.checkBinaryFn = options.checkBinaryFn ?? RtlSdrManager.defaultCheckBinary;

    // Default audio sink: PulseAudio client at the configured sample rate
    this.audioSinkCommand = options.audioSinkCommand ?? [
      "pacat",
      "--playback",
      `--rate=${this.sdr.sampleRate}`,
      "--format=s16le",
      "--channels=1",
    ];
  }

  /** Start the rtl_fm pipeline. No-op if already running. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.backoffMs = RESTART_BACKOFF_INITIAL_MS;
    await this.spawnPipeline();
  }

  /** Stop the pipeline gracefully. Clears any pending restart timers. */
  async stop(): Promise<void> {
    this.running = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    await this.terminatePipeline();
    this.setStatus("stopped");
  }

  /** Stop and restart with the current (or updated) frequency. */
  async restart(): Promise<void> {
    await this.terminatePipeline();
    if (this.running) {
      await this.spawnPipeline();
    }
  }

  /**
   * Change the tuned frequency and restart the pipeline.
   * If the manager is not running, the new frequency is stored for the next start().
   */
  async setFrequency(hz: number): Promise<void> {
    this.currentFrequency = hz;
    if (this.running) {
      await this.restart();
    }
  }

  getStatus(): SdrManagerStatus {
    return this.status;
  }

  getCurrentFrequency(): number {
    return this.currentFrequency;
  }

  // --- internals ---

  private async spawnPipeline(): Promise<void> {
    if (!this.sdr.enabled) {
      console.log("[rtlsdr-manager] SDR disabled — skipping rtl_fm startup");
      return;
    }

    this.setStatus("starting");

    const binaryAvailable = await this.checkBinaryFn();
    if (!binaryAvailable) {
      const err = new Error(
        "rtl_fm not found on PATH. Install rtl-sdr tools: https://osmocom.org/projects/rtl-sdr",
      );
      console.error(`[rtlsdr-manager] ${err.message}`);
      this.setStatus("error");
      this.callbacks.onError?.(err);
      return;
    }

    const bandCheck = checkCwBandPlan(this.currentFrequency);
    if (!bandCheck.isInCwSegment) {
      console.warn(
        `[rtlsdr-manager] ${this.currentFrequency}Hz is outside standard CW band segments` +
          (bandCheck.nearestBand ? ` (nearest: ${bandCheck.nearestBand})` : "") +
          ". Proceeding anyway.",
      );
    }

    const rtlFmArgs = buildRtlFmArgs({
      frequency: this.currentFrequency,
      mode: this.mode,
      sampleRate: this.sdr.sampleRate,
      device: this.sdr.device || undefined,
    });

    console.log(
      `[rtlsdr-manager] Starting: rtl_fm ${rtlFmArgs.join(" ")} | ${this.audioSinkCommand.join(" ")}`,
    );

    const rtlFm = this.spawnFn("rtl_fm", rtlFmArgs);
    const audioSink = this.spawnFn(this.audioSinkCommand[0], this.audioSinkCommand.slice(1), {
      stdio: ["pipe", "inherit", "pipe"],
    });

    // Pipe rtl_fm PCM stdout → audio sink stdin
    rtlFm.stdout?.pipe(audioSink.stdin!);

    // Log rtl_fm stderr and detect USB disconnect
    rtlFm.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(`[rtl_fm] ${text}`);
      if (USB_DISCONNECT_PATTERNS.some((pattern) => text.includes(pattern))) {
        console.warn("[rtlsdr-manager] USB device disconnected");
        this.callbacks.onDeviceDisconnected?.();
      }
    });

    // Log audio sink stderr
    audioSink.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`[audio-sink] ${data.toString()}`);
    });

    audioSink.on("error", (err) => {
      console.error(`[rtlsdr-manager] audio sink process error: ${err.message}`);
      this.setStatus("error");
      this.callbacks.onError?.(err);
    });

    // Auto-restart on unexpected rtl_fm exit
    rtlFm.on("exit", (code, signal) => {
      if (!this.running) return;
      console.warn(
        `[rtlsdr-manager] rtl_fm exited unexpectedly (code=${code}, signal=${signal}), ` +
          `retrying in ${this.backoffMs}ms`,
      );
      this.setStatus("error");
      this.scheduleRestart();
    });

    rtlFm.on("error", (err) => {
      console.error(`[rtlsdr-manager] rtl_fm process error: ${err.message}`);
      this.setStatus("error");
      this.callbacks.onError?.(err);
    });

    this.rtlFmProcess = rtlFm;
    this.audioProcess = audioSink;
    this.setStatus("running");
  }

  private async terminatePipeline(): Promise<void> {
    this.setStatus("stopping");
    await Promise.all([terminateProcess(this.rtlFmProcess), terminateProcess(this.audioProcess)]);
    this.rtlFmProcess = null;
    this.audioProcess = null;
  }

  private scheduleRestart(): void {
    if (!this.running) return;
    this.restartTimer = setTimeout(async () => {
      this.restartTimer = null;
      if (!this.running) return;
      await this.terminatePipeline();
      await this.spawnPipeline();
    }, this.backoffMs);
    this.backoffMs = Math.min(this.backoffMs * 2, RESTART_BACKOFF_MAX_MS);
  }

  private setStatus(status: SdrManagerStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.callbacks.onStatusChange?.(status);
    }
  }

  /** Default binary availability check using `which`. */
  private static async defaultCheckBinary(): Promise<boolean> {
    try {
      await execFileAsync("which", ["rtl_fm"]);
      return true;
    } catch {
      return false;
    }
  }
}

/** Build rtl_fm command-line arguments from options */
export function buildRtlFmArgs(opts: {
  frequency: number;
  mode: string;
  sampleRate: number;
  device?: string;
}): string[] {
  const args = [
    "-f",
    String(opts.frequency),
    "-M",
    opts.mode,
    "-s",
    String(opts.sampleRate),
    "-r",
    String(opts.sampleRate),
  ];
  if (opts.device) {
    args.push("-d", opts.device);
  }
  return args;
}

/**
 * Gracefully terminate a child process:
 * sends SIGTERM, waits SIGTERM_WAIT_MS, then SIGKILL if still alive.
 */
async function terminateProcess(proc: ChildProcess | null): Promise<void> {
  if (!proc || proc.exitCode !== null || proc.killed) return;

  return new Promise((resolve) => {
    const killTimer = setTimeout(() => {
      if (proc.exitCode === null && !proc.killed) {
        proc.kill("SIGKILL");
      }
      resolve();
    }, SIGTERM_WAIT_MS);

    proc.once("exit", () => {
      clearTimeout(killTimer);
      resolve();
    });

    proc.kill("SIGTERM");
  });
}
