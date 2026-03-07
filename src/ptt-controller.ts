/**
 * PTT (Push-to-Talk) controller abstraction.
 *
 * Encapsulates the four PTT methods supported by the plugin:
 *
 *   "none"   — No PTT control. TX audio goes to fldigi but nothing keys the rig.
 *              Use for software-only testing.
 *
 *   "cat"    — fldigi's built-in CAT/RIG control handles PTT automatically when
 *              `main.tx()` is called. No additional plugin action needed.
 *              Configure CAT in fldigi's Rig Control settings.
 *
 *   "vox"    — The transceiver's built-in VOX (Voice-Operated Relay) circuit keys
 *              the rig when audio is present. The plugin calls `main.tx()` to make
 *              fldigi output audio; the radio keys itself. No explicit PTT from
 *              the plugin is needed. Enable VOX on the transceiver.
 *
 *   "serial" — The plugin directly raises/lowers the DTR or RTS line on a serial
 *              port to key the rig. Requires pyserial (pip install pyserial).
 *              Configure tx.pttSerialPort (e.g. "/dev/ttyUSB0") and
 *              tx.pttSerialLine ("dtr" or "rts").
 *
 * For "cat" and "vox", the plugin simply calls fldigi's main.tx()/main.rx() as
 * usual — fldigi and the radio handle keying. The PttController for these modes
 * is a logged no-op.
 *
 * For "serial", the plugin holds a persistent Python child process open that
 * controls the serial line. This avoids re-opening the port on every TX and
 * ensures clean DTR/RTS drop on shutdown.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { TxConfig } from "./config.js";

export interface PttController {
  /** Raise PTT (key the transmitter). Call before main.tx(). */
  activate(): Promise<void>;
  /** Lower PTT (unkey the transmitter). Call after main.rx(). */
  deactivate(): Promise<void>;
  /** Release any held resources (close serial port, etc.). */
  destroy(): Promise<void>;
}

/**
 * Factory: create the appropriate PttController for the configured pttMethod.
 * @param config - TX configuration
 * @param spawnFn - injectable spawn function for testing
 */
export function createPttController(
  config: Pick<TxConfig, "pttMethod" | "pttSerialPort" | "pttSerialLine">,
  spawnFn: typeof spawn = spawn,
): PttController {
  switch (config.pttMethod) {
    case "none":
      return new NullPttController("none");
    case "cat":
      return new NullPttController("cat");
    case "vox":
      return new NullPttController("vox");
    case "serial":
      return new SerialPttController(config.pttSerialPort, config.pttSerialLine ?? "dtr", spawnFn);
  }
}

// ---------------------------------------------------------------------------
// NullPttController — used for none / cat / vox
// ---------------------------------------------------------------------------

/**
 * PTT controller that performs no explicit keying action.
 *
 * - "none": no PTT at all (software testing only)
 * - "cat": fldigi's built-in CAT control handles PTT via main.tx()/main.rx()
 * - "vox": the transceiver's VOX circuit keys when audio is present
 */
class NullPttController implements PttController {
  private readonly method: string;

  constructor(method: string) {
    this.method = method;
  }

  async activate(): Promise<void> {
    if (this.method === "cat") {
      console.log("[ptt] CAT PTT — fldigi will key the rig via CAT on main.tx()");
    } else if (this.method === "vox") {
      console.log("[ptt] VOX PTT — transceiver will key on audio; ensure VOX is enabled on the rig");
    }
    // "none" logs nothing — expected for testing
  }

  async deactivate(): Promise<void> {
    // No action needed for cat/vox/none
  }

  async destroy(): Promise<void> {
    // No resources to release
  }
}

// ---------------------------------------------------------------------------
// SerialPttController — controls DTR or RTS via a persistent Python process
// ---------------------------------------------------------------------------

/**
 * Serial PTT controller that toggles DTR or RTS on a serial port.
 *
 * Uses a persistent Python/pyserial child process to hold the port open and
 * respond to activate/deactivate commands on stdin. This avoids re-opening
 * the serial port for every transmission (which would reset DTR/RTS).
 *
 * Requires Python 3 with pyserial installed:
 *   pip install pyserial   (or: pip3 install pyserial)
 */
export class SerialPttController implements PttController {
  private readonly port: string;
  private readonly line: "dtr" | "rts";
  private readonly spawnFn: typeof spawn;
  private proc: ChildProcess | null = null;
  private ready = false;
  private startError: Error | null = null;

  /**
   * @param port - Serial device path, e.g. "/dev/ttyUSB0" or "COM3"
   * @param line - Which control line to use: "dtr" (default) or "rts"
   * @param spawnFn - Injectable for testing
   */
  constructor(port: string, line: "dtr" | "rts" = "dtr", spawnFn: typeof spawn = spawn) {
    this.port = port;
    this.line = line;
    this.spawnFn = spawnFn;
  }

  async activate(): Promise<void> {
    await this.ensureProcess();
    if (this.startError) throw this.startError;
    this.send("1");
    console.log(`[ptt] Serial PTT activated: ${this.port} ${this.line.toUpperCase()} raised`);
  }

  async deactivate(): Promise<void> {
    if (!this.proc || !this.ready) return;
    this.send("0");
    console.log(`[ptt] Serial PTT deactivated: ${this.port} ${this.line.toUpperCase()} lowered`);
  }

  async destroy(): Promise<void> {
    if (this.proc) {
      try {
        this.send("0"); // Lower PTT before closing
        this.proc.stdin?.end();
      } catch {
        // Best-effort
      }
      this.proc.kill("SIGTERM");
      this.proc = null;
      this.ready = false;
      console.log(`[ptt] Serial PTT controller closed (${this.port})`);
    }
  }

  /** Lazily spawn the Python helper on first use. */
  private async ensureProcess(): Promise<void> {
    if (this.proc || this.startError) return;

    // Inline Python script: read commands from stdin, toggle DTR or RTS
    const script = buildPythonScript(this.port, this.line);

    this.proc = this.spawnFn("python3", ["-c", script], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        console.error(`[ptt-serial] ${msg}`);
        // Detect common setup errors and surface them clearly
        if (msg.includes("ModuleNotFoundError") && msg.includes("serial")) {
          this.startError = new Error(
            "pyserial not found. Install it: pip install pyserial (or pip3 install pyserial)",
          );
        } else if (msg.includes("could not open port") || msg.includes("No such file or directory")) {
          this.startError = new Error(`Serial port not found: ${this.port}`);
        } else if (msg.includes("PermissionError") || msg.includes("Access is denied")) {
          this.startError = new Error(
            `Permission denied opening ${this.port}. Try: sudo chmod a+rw ${this.port} or add user to dialout group`,
          );
        }
      }
    });

    this.proc.on("exit", (code) => {
      if (code !== 0 && this.ready) {
        console.warn(`[ptt-serial] Python PTT process exited unexpectedly (code=${code})`);
      }
      this.proc = null;
      this.ready = false;
    });

    this.proc.on("error", (err) => {
      if (err.message.includes("ENOENT")) {
        this.startError = new Error("python3 not found on PATH. Install Python 3 to use serial PTT.");
      } else {
        this.startError = err;
      }
      this.proc = null;
      this.ready = false;
    });

    // Wait briefly for the Python process to open the port and signal readiness
    await this.waitForReady();
  }

  /**
   * Wait for the Python helper to emit a "ready" line on stdout, confirming
   * the serial port was opened successfully.
   */
  private waitForReady(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.proc?.stdout) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        // If no ready signal within 3 seconds, treat as failed
        if (!this.ready) {
          this.startError ??= new Error(`Serial PTT: timed out opening ${this.port}`);
        }
        resolve();
      }, 3000);

      this.proc.stdout.once("data", () => {
        // Any stdout output means the process started and the port opened
        this.ready = true;
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  private send(command: string): void {
    try {
      this.proc?.stdin?.write(`${command}\n`);
    } catch {
      // Process may have exited
    }
  }
}

/**
 * Build the inline Python script that controls the serial line.
 * The script opens the port, prints "ready" to stdout, then reads
 * "1" (raise) or "0" (lower) commands from stdin until EOF.
 */
export function buildPythonScript(port: string, line: "dtr" | "rts"): string {
  // Use double-quoted Python string so single quotes in port path are safe
  const escapedPort = port.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return [
    "import serial, sys",
    `p = serial.Serial("${escapedPort}", timeout=0)`,
    "import sys; sys.stdout.write('ready\\n'); sys.stdout.flush()",
    "for cmd in sys.stdin:",
    `    val = cmd.strip() == '1'`,
    `    p.${line} = val`,
  ].join("\n");
}
