/**
 * Unit tests for RtlSdrManager.
 *
 * All child process spawning is mocked — no actual rtl_fm binary is needed.
 */

import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { RtlSdrManager, buildRtlFmArgs, type SdrManagerStatus } from "../src/rtlsdr-manager.js";
import type { SdrConfig } from "../src/config.js";

// ---------------------------------------------------------------------------
// Mock infrastructure
// ---------------------------------------------------------------------------

interface MockProcess extends EventEmitter {
  stdout: EventEmitter & { pipe: (dest: MockProcess) => void };
  stderr: EventEmitter;
  stdin: EventEmitter;
  kill: (signal?: string) => boolean;
  exitCode: number | null;
  killed: boolean;
  pid: number;
}

function makeMockProcess(): MockProcess {
  const proc = new EventEmitter() as MockProcess;
  proc.stdout = Object.assign(new EventEmitter(), {
    pipe: (_dest: unknown) => {
      /* no-op */
    },
  });
  proc.stderr = new EventEmitter();
  proc.stdin = new EventEmitter();
  proc.exitCode = null;
  proc.killed = false;
  proc.pid = Math.floor(Math.random() * 10000);
  proc.kill = (signal?: string) => {
    if (proc.exitCode !== null || proc.killed) return false;
    proc.killed = true;
    // Simulate synchronous exit for test predictability
    setImmediate(() => {
      proc.exitCode = signal === "SIGKILL" ? 137 : 0;
      proc.emit("exit", proc.exitCode, signal ?? "SIGTERM");
    });
    return true;
  };
  return proc;
}

interface SpawnCall {
  cmd: string;
  args: string[];
}

function makeSpawnFactory(
  rtlFmProc: MockProcess,
  audioProc: MockProcess,
): { spawnFn: typeof import("node:child_process").spawn; calls: SpawnCall[] } {
  const calls: SpawnCall[] = [];
  const spawnFn = ((cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    if (cmd === "rtl_fm") return rtlFmProc as unknown as ChildProcess;
    return audioProc as unknown as ChildProcess;
  }) as unknown as typeof import("node:child_process").spawn;
  return { spawnFn, calls };
}

const DEFAULT_SDR: SdrConfig = {
  enabled: true,
  device: "",
  sampleRate: 48000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RtlSdrManager", () => {
  let rtlFmProc: MockProcess;
  let audioProc: MockProcess;

  beforeEach(() => {
    rtlFmProc = makeMockProcess();
    audioProc = makeMockProcess();
  });

  it("does not spawn rtl_fm when SDR is disabled", async () => {
    const { spawnFn, calls } = makeSpawnFactory(rtlFmProc, audioProc);
    const manager = new RtlSdrManager(
      {
        sdr: { ...DEFAULT_SDR, enabled: false },
        frequency: 7_030_000,
        spawnFn,
        checkBinaryFn: async () => true,
      },
      {},
    );

    await manager.start();
    assert.equal(calls.length, 0);
    assert.equal(manager.getStatus(), "stopped");

    await manager.stop();
  });

  it("spawns rtl_fm and audio sink when SDR is enabled", async () => {
    const { spawnFn, calls } = makeSpawnFactory(rtlFmProc, audioProc);
    const manager = new RtlSdrManager(
      {
        sdr: DEFAULT_SDR,
        frequency: 7_030_000,
        spawnFn,
        checkBinaryFn: async () => true,
        audioSinkCommand: ["pacat", "--playback"],
      },
      {},
    );

    await manager.start();

    assert.equal(calls.length, 2);
    assert.equal(calls[0].cmd, "rtl_fm");
    assert.equal(calls[1].cmd, "pacat");
    assert.equal(manager.getStatus(), "running");

    await manager.stop();
    assert.equal(manager.getStatus(), "stopped");
  });

  it("passes correct rtl_fm arguments including frequency and mode", async () => {
    const { spawnFn, calls } = makeSpawnFactory(rtlFmProc, audioProc);
    const manager = new RtlSdrManager(
      {
        sdr: DEFAULT_SDR,
        frequency: 14_025_000,
        mode: "usb",
        spawnFn,
        checkBinaryFn: async () => true,
        audioSinkCommand: ["pacat"],
      },
      {},
    );

    await manager.start();

    const rtlArgs = calls[0].args;
    assert.ok(rtlArgs.includes("-f"), "should have -f flag");
    assert.ok(rtlArgs.includes("14025000"), "should pass frequency");
    assert.ok(rtlArgs.includes("-M"), "should have -M flag");
    assert.ok(rtlArgs.includes("usb"), "should pass mode");
    assert.ok(rtlArgs.includes("-s"), "should have -s flag");
    assert.ok(rtlArgs.includes("48000"), "should pass sample rate");

    await manager.stop();
  });

  it("passes -d device argument when device is configured", async () => {
    const { spawnFn, calls } = makeSpawnFactory(rtlFmProc, audioProc);
    const manager = new RtlSdrManager(
      {
        sdr: { ...DEFAULT_SDR, device: "1" },
        frequency: 7_030_000,
        spawnFn,
        checkBinaryFn: async () => true,
        audioSinkCommand: ["pacat"],
      },
      {},
    );

    await manager.start();

    const rtlArgs = calls[0].args;
    const deviceIdx = rtlArgs.indexOf("-d");
    assert.ok(deviceIdx !== -1, "should have -d flag");
    assert.equal(rtlArgs[deviceIdx + 1], "1");

    await manager.stop();
  });

  it("does not pass -d flag when device is empty", async () => {
    const { spawnFn, calls } = makeSpawnFactory(rtlFmProc, audioProc);
    const manager = new RtlSdrManager(
      {
        sdr: { ...DEFAULT_SDR, device: "" },
        frequency: 7_030_000,
        spawnFn,
        checkBinaryFn: async () => true,
        audioSinkCommand: ["pacat"],
      },
      {},
    );

    await manager.start();
    assert.ok(!calls[0].args.includes("-d"), "should not have -d flag");

    await manager.stop();
  });

  it("emits status changes: stopped → starting → running → stopping → stopped", async () => {
    const statuses: SdrManagerStatus[] = [];
    const { spawnFn } = makeSpawnFactory(rtlFmProc, audioProc);
    const manager = new RtlSdrManager(
      {
        sdr: DEFAULT_SDR,
        frequency: 7_030_000,
        spawnFn,
        checkBinaryFn: async () => true,
        audioSinkCommand: ["pacat"],
      },
      { onStatusChange: (s) => statuses.push(s) },
    );

    await manager.start();
    await manager.stop();

    assert.deepEqual(statuses, ["starting", "running", "stopping", "stopped"]);
  });

  it("emits error status and calls onError when binary not found", async () => {
    const errors: Error[] = [];
    const statuses: SdrManagerStatus[] = [];
    const { spawnFn } = makeSpawnFactory(rtlFmProc, audioProc);
    const manager = new RtlSdrManager(
      {
        sdr: DEFAULT_SDR,
        frequency: 7_030_000,
        spawnFn,
        checkBinaryFn: async () => false,
        audioSinkCommand: ["pacat"],
      },
      {
        onError: (err) => errors.push(err),
        onStatusChange: (s) => statuses.push(s),
      },
    );

    await manager.start();

    assert.equal(errors.length, 1);
    assert.ok(errors[0].message.includes("rtl_fm"));
    assert.ok(statuses.includes("error"));
    assert.equal(manager.getStatus(), "error");

    await manager.stop();
  });

  it("emits error status and calls onError when audio sink emits an error", async () => {
    const errors: Error[] = [];
    const statuses: SdrManagerStatus[] = [];
    const { spawnFn } = makeSpawnFactory(rtlFmProc, audioProc);
    const manager = new RtlSdrManager(
      {
        sdr: DEFAULT_SDR,
        frequency: 7_030_000,
        spawnFn,
        checkBinaryFn: async () => true,
        audioSinkCommand: ["pacat"],
      },
      {
        onError: (err) => errors.push(err),
        onStatusChange: (s) => statuses.push(s),
      },
    );

    await manager.start();
    const sinkErr = new Error("spawn pacat ENOENT");
    audioProc.emit("error", sinkErr);

    assert.equal(manager.getStatus(), "error");
    assert.equal(errors.length, 1);
    assert.equal(errors[0], sinkErr);
    assert.ok(statuses.includes("error"));

    await manager.stop();
  });

  it("sets status to error and schedules restart on unexpected rtl_fm exit", async () => {
    const statuses: SdrManagerStatus[] = [];
    const { spawnFn } = makeSpawnFactory(rtlFmProc, audioProc);
    const manager = new RtlSdrManager(
      {
        sdr: DEFAULT_SDR,
        frequency: 7_030_000,
        spawnFn,
        checkBinaryFn: async () => true,
        audioSinkCommand: ["pacat"],
      },
      { onStatusChange: (s) => statuses.push(s) },
    );

    await manager.start();
    assert.equal(manager.getStatus(), "running");

    // Simulate unexpected exit
    rtlFmProc.exitCode = 1;
    rtlFmProc.emit("exit", 1, null);

    // Status should flip to error
    assert.equal(manager.getStatus(), "error");

    // Stop cleanly (cancels the pending restart timer)
    await manager.stop();
  });

  it("sets status to error and schedules restart on unexpected audio sink exit", async () => {
    const statuses: SdrManagerStatus[] = [];
    const { spawnFn } = makeSpawnFactory(rtlFmProc, audioProc);
    const manager = new RtlSdrManager(
      {
        sdr: DEFAULT_SDR,
        frequency: 7_030_000,
        spawnFn,
        checkBinaryFn: async () => true,
        audioSinkCommand: ["pacat"],
      },
      { onStatusChange: (s) => statuses.push(s) },
    );

    await manager.start();
    assert.equal(manager.getStatus(), "running");

    audioProc.exitCode = 1;
    audioProc.emit("exit", 1, null);

    assert.equal(manager.getStatus(), "error");
    assert.ok(statuses.includes("error"));

    await manager.stop();
  });

  it("calls onDeviceDisconnected when USB disconnect pattern detected in stderr", async () => {
    const disconnectEvents: number[] = [];
    const { spawnFn } = makeSpawnFactory(rtlFmProc, audioProc);
    const manager = new RtlSdrManager(
      {
        sdr: DEFAULT_SDR,
        frequency: 7_030_000,
        spawnFn,
        checkBinaryFn: async () => true,
        audioSinkCommand: ["pacat"],
      },
      { onDeviceDisconnected: () => disconnectEvents.push(1) },
    );

    await manager.start();

    rtlFmProc.stderr.emit("data", Buffer.from("usb_claim_interface error -6\n"));

    assert.equal(disconnectEvents.length, 1);

    await manager.stop();
  });

  it("setFrequency updates currentFrequency", async () => {
    const { spawnFn } = makeSpawnFactory(rtlFmProc, audioProc);
    const manager = new RtlSdrManager(
      {
        sdr: DEFAULT_SDR,
        frequency: 7_030_000,
        spawnFn,
        checkBinaryFn: async () => true,
        audioSinkCommand: ["pacat"],
      },
      {},
    );

    assert.equal(manager.getCurrentFrequency(), 7_030_000);
    // Not running — just update stored frequency
    await manager.setFrequency(14_025_000);
    assert.equal(manager.getCurrentFrequency(), 14_025_000);
  });

  it("is a no-op to start when already running", async () => {
    const { spawnFn, calls } = makeSpawnFactory(rtlFmProc, audioProc);
    const manager = new RtlSdrManager(
      {
        sdr: DEFAULT_SDR,
        frequency: 7_030_000,
        spawnFn,
        checkBinaryFn: async () => true,
        audioSinkCommand: ["pacat"],
      },
      {},
    );

    await manager.start();
    const callCountAfterFirst = calls.length;
    await manager.start(); // should be a no-op
    assert.equal(calls.length, callCountAfterFirst);

    await manager.stop();
  });

  it("stop is idempotent", async () => {
    const { spawnFn } = makeSpawnFactory(rtlFmProc, audioProc);
    const manager = new RtlSdrManager(
      {
        sdr: DEFAULT_SDR,
        frequency: 7_030_000,
        spawnFn,
        checkBinaryFn: async () => true,
        audioSinkCommand: ["pacat"],
      },
      {},
    );

    await manager.start();
    await manager.stop();
    await manager.stop(); // second stop should not throw
    assert.equal(manager.getStatus(), "stopped");
  });
});

// ---------------------------------------------------------------------------
// buildRtlFmArgs unit tests
// ---------------------------------------------------------------------------

describe("buildRtlFmArgs", () => {
  it("includes frequency, mode, and sample rate", () => {
    const args = buildRtlFmArgs({ frequency: 7_030_000, mode: "usb", sampleRate: 48000 });
    assert.ok(args.includes("-f"));
    assert.ok(args.includes("7030000"));
    assert.ok(args.includes("-M"));
    assert.ok(args.includes("usb"));
    assert.ok(args.includes("-s"));
    assert.ok(args.includes("48000"));
    assert.ok(args.includes("-r"));
  });

  it("omits -d when device is undefined", () => {
    const args = buildRtlFmArgs({ frequency: 7_030_000, mode: "usb", sampleRate: 48000 });
    assert.ok(!args.includes("-d"));
  });

  it("includes -d when device is provided", () => {
    const args = buildRtlFmArgs({
      frequency: 7_030_000,
      mode: "usb",
      sampleRate: 48000,
      device: "0",
    });
    const idx = args.indexOf("-d");
    assert.ok(idx !== -1);
    assert.equal(args[idx + 1], "0");
  });
});
