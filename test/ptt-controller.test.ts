/**
 * Unit tests for PttController (tasks 4.3.2 VOX PTT and 4.3.3 serial PTT).
 *
 * No actual serial ports or Python processes are used — spawn is mocked.
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { createPttController, SerialPttController, buildPythonScript } from "../src/ptt-controller.js";
import type { TxConfig } from "../src/config.js";

// ---------------------------------------------------------------------------
// Mock infrastructure
// ---------------------------------------------------------------------------

interface MockProcess {
  stdin: { write: (s: string) => void; end: () => void; written: string[] };
  stdout: EventEmitter;
  stderr: EventEmitter;
  on: (event: string, cb: (...args: unknown[]) => void) => MockProcess;
  emit: (event: string, ...args: unknown[]) => boolean;
  kill: () => void;
}

function makeMockProcess(opts: { emitReadyImmediately?: boolean } = {}): MockProcess {
  const written: string[] = [];
  const emitter = new EventEmitter();
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();

  const proc: MockProcess = {
    stdin: {
      write: (s: string) => { written.push(s); },
      end: () => { /* no-op */ },
      written,
    },
    stdout,
    stderr,
    on: (event, cb) => { emitter.on(event, cb); return proc; },
    emit: (event, ...args) => emitter.emit(event, ...args),
    kill: () => { /* no-op */ },
  };

  if (opts.emitReadyImmediately) {
    setImmediate(() => stdout.emit("data", Buffer.from("ready\n")));
  }

  return proc;
}

function makeSpawnFactory(proc: MockProcess): {
  spawnFn: typeof import("node:child_process").spawn;
  calls: Array<{ cmd: string; args: string[] }>;
} {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const spawnFn = ((cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    return proc as unknown as ChildProcess;
  }) as unknown as typeof import("node:child_process").spawn;
  return { spawnFn, calls };
}

// ---------------------------------------------------------------------------
// createPttController factory tests
// ---------------------------------------------------------------------------

describe("createPttController", () => {
  const baseTx: TxConfig = {
    enabled: true,
    inhibit: false,
    maxDurationSeconds: 120,
    wpm: 20,
    callsign: "PA3XYZ",
    pttMethod: "none",
    pttSerialPort: "",
    pttSerialLine: "dtr",
  };

  it("returns a no-op controller for 'none' method", async () => {
    const ctrl = createPttController({ pttMethod: "none", pttSerialPort: "", pttSerialLine: "dtr" });
    await assert.doesNotReject(() => ctrl.activate());
    await assert.doesNotReject(() => ctrl.deactivate());
    await assert.doesNotReject(() => ctrl.destroy());
  });

  it("returns a no-op controller for 'cat' method", async () => {
    const ctrl = createPttController({ pttMethod: "cat", pttSerialPort: "", pttSerialLine: "dtr" });
    await assert.doesNotReject(() => ctrl.activate());
    await assert.doesNotReject(() => ctrl.deactivate());
    await assert.doesNotReject(() => ctrl.destroy());
  });

  it("returns a no-op controller for 'vox' method", async () => {
    const ctrl = createPttController({ pttMethod: "vox", pttSerialPort: "", pttSerialLine: "dtr" });
    await assert.doesNotReject(() => ctrl.activate());
    await assert.doesNotReject(() => ctrl.deactivate());
    await assert.doesNotReject(() => ctrl.destroy());
  });

  it("returns a SerialPttController for 'serial' method", () => {
    const ctrl = createPttController({ pttMethod: "serial", pttSerialPort: "/dev/ttyUSB0", pttSerialLine: "dtr" });
    assert.ok(ctrl instanceof SerialPttController);
  });
});

// ---------------------------------------------------------------------------
// NullPttController (none/cat/vox) tests
// ---------------------------------------------------------------------------

describe("NullPttController (none/cat/vox)", () => {
  for (const method of ["none", "cat", "vox"] as const) {
    it(`${method}: activate and deactivate are no-ops`, async () => {
      const ctrl = createPttController({ pttMethod: method, pttSerialPort: "", pttSerialLine: "dtr" });
      await ctrl.activate();
      await ctrl.deactivate();
      await ctrl.destroy();
      // No assertions beyond not throwing
    });
  }
});

// ---------------------------------------------------------------------------
// SerialPttController tests
// ---------------------------------------------------------------------------

describe("SerialPttController", () => {
  let mockProc: ReturnType<typeof makeMockProcess>;

  beforeEach(() => {
    mockProc = makeMockProcess({ emitReadyImmediately: true });
  });

  it("spawns python3 with -c and the inline script on first activate()", async () => {
    const { spawnFn, calls } = makeSpawnFactory(mockProc);
    const ctrl = new SerialPttController("/dev/ttyUSB0", "dtr", spawnFn);

    await ctrl.activate();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].cmd, "python3");
    assert.equal(calls[0].args[0], "-c");
    assert.ok(calls[0].args[1].includes("serial.Serial"));
    assert.ok(calls[0].args[1].includes("/dev/ttyUSB0"));
    assert.ok(calls[0].args[1].includes("dtr"));
  });

  it("sends '1\\n' to stdin on activate()", async () => {
    const { spawnFn } = makeSpawnFactory(mockProc);
    const ctrl = new SerialPttController("/dev/ttyUSB0", "dtr", spawnFn);

    await ctrl.activate();

    assert.ok(mockProc.stdin.written.includes("1\n"), "should write '1\\n' to stdin");
  });

  it("sends '0\\n' to stdin on deactivate()", async () => {
    const { spawnFn } = makeSpawnFactory(mockProc);
    const ctrl = new SerialPttController("/dev/ttyUSB0", "dtr", spawnFn);

    await ctrl.activate();
    await ctrl.deactivate();

    assert.ok(mockProc.stdin.written.includes("0\n"), "should write '0\\n' to stdin");
  });

  it("reuses the same process for multiple activate/deactivate cycles", async () => {
    const { spawnFn, calls } = makeSpawnFactory(mockProc);
    const ctrl = new SerialPttController("/dev/ttyUSB0", "rts", spawnFn);

    await ctrl.activate();
    await ctrl.deactivate();
    await ctrl.activate();
    await ctrl.deactivate();

    // Should only spawn once
    assert.equal(calls.length, 1);
    assert.equal(mockProc.stdin.written.filter((w) => w === "1\n").length, 2);
    assert.equal(mockProc.stdin.written.filter((w) => w === "0\n").length, 2);
  });

  it("uses 'rts' in the Python script when configured", async () => {
    const { spawnFn, calls } = makeSpawnFactory(mockProc);
    const ctrl = new SerialPttController("/dev/ttyUSB0", "rts", spawnFn);

    await ctrl.activate();

    const script = calls[0].args[1];
    assert.ok(script.includes("rts"), "script should reference rts line");
    assert.ok(!script.includes("p.dtr"), "script should not reference dtr");
  });

  it("deactivate() is a no-op if process was never started", async () => {
    const { spawnFn } = makeSpawnFactory(mockProc);
    const ctrl = new SerialPttController("/dev/ttyUSB0", "dtr", spawnFn);

    // Don't call activate() — process never started
    await assert.doesNotReject(() => ctrl.deactivate());
  });

  it("destroy() sends '0\\n' and terminates the process", async () => {
    const { spawnFn } = makeSpawnFactory(mockProc);
    const ctrl = new SerialPttController("/dev/ttyUSB0", "dtr", spawnFn);

    await ctrl.activate();
    await ctrl.destroy();

    // Should have sent deactivate command before closing
    assert.ok(mockProc.stdin.written.includes("0\n"), "should lower PTT before destroying");
  });
});

// ---------------------------------------------------------------------------
// buildPythonScript tests
// ---------------------------------------------------------------------------

describe("buildPythonScript", () => {
  it("includes the port path in the script", () => {
    const script = buildPythonScript("/dev/ttyUSB0", "dtr");
    assert.ok(script.includes("/dev/ttyUSB0"));
  });

  it("includes dtr line assignment when dtr is selected", () => {
    const script = buildPythonScript("/dev/ttyUSB0", "dtr");
    assert.ok(script.includes("p.dtr"));
    assert.ok(!script.includes("p.rts"));
  });

  it("includes rts line assignment when rts is selected", () => {
    const script = buildPythonScript("/dev/ttyUSB0", "rts");
    assert.ok(script.includes("p.rts"));
    assert.ok(!script.includes("p.dtr"));
  });

  it("includes ready signal for handshake", () => {
    const script = buildPythonScript("/dev/ttyUSB0", "dtr");
    assert.ok(script.includes("ready"));
  });

  it("imports serial module", () => {
    const script = buildPythonScript("/dev/ttyUSB0", "dtr");
    assert.ok(script.includes("import serial"));
  });

  it("escapes backslashes in Windows-style port paths", () => {
    const script = buildPythonScript("COM3", "dtr");
    assert.ok(script.includes("COM3"));
  });
});

// ---------------------------------------------------------------------------
// Config validation for serial PTT
// ---------------------------------------------------------------------------

describe("config validation for serial PTT", () => {
  it("validates pttSerialPort is required when pttMethod is serial", async () => {
    const { validateConfig } = await import("../src/config.js");
    const errors = validateConfig({
      frequency: 7_030_000,
      mode: "CW",
      fldigi: { host: "127.0.0.1", port: 7362, pollingIntervalMs: 250 },
      sdr: { enabled: false, device: "", sampleRate: 48000 },
      tx: {
        enabled: true,
        inhibit: false,
        maxDurationSeconds: 120,
        wpm: 20,
        callsign: "PA3XYZ",
        pttMethod: "serial",
        pttSerialPort: "",   // missing — should produce an error
        pttSerialLine: "dtr",
      },
      qrz: { username: "", password: "" },
      callsignLookup: { enabled: false, provider: "mock", cacheTtlSeconds: 3600 },
    });

    const serialError = errors.find((e) => e.field === "tx.pttSerialPort");
    assert.ok(serialError, "should error when serial PTT port is missing");
  });

  it("passes validation when pttSerialPort is provided for serial PTT", async () => {
    const { validateConfig } = await import("../src/config.js");
    const errors = validateConfig({
      frequency: 7_030_000,
      mode: "CW",
      fldigi: { host: "127.0.0.1", port: 7362, pollingIntervalMs: 250 },
      sdr: { enabled: false, device: "", sampleRate: 48000 },
      tx: {
        enabled: true,
        inhibit: false,
        maxDurationSeconds: 120,
        wpm: 20,
        callsign: "PA3XYZ",
        pttMethod: "serial",
        pttSerialPort: "/dev/ttyUSB0",
        pttSerialLine: "dtr",
      },
      qrz: { username: "", password: "" },
      callsignLookup: { enabled: false, provider: "mock", cacheTtlSeconds: 3600 },
    });

    const serialError = errors.find((e) => e.field === "tx.pttSerialPort");
    assert.ok(!serialError, "should not error when serial PTT port is provided");
  });
});
