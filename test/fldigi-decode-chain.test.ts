import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const RUN_CHAIN = process.env.CQLAW_RUN_FLDIGI_DECODE_CHAIN === "1";
const SLOW_PREFLIGHT = loadSlowPreflight();
const FORCED_SKIP_REASON =
  SLOW_PREFLIGHT?.status === "degraded"
    ? `slow preflight degraded: ${SLOW_PREFLIGHT.reason || "unknown reason"}`
    : "";
const PREFLIGHT = checkDecodeAudioPreflight();
const DECODE_CHAIN_READY = RUN_CHAIN && !FORCED_SKIP_REASON && PREFLIGHT.ok;
const PROJECT_ROOT = path.join(__dirname, "..", "..");
const WAV_DIR = path.join(PROJECT_ROOT, "test", "fixtures", "wav");
const PLAY_SCRIPT = path.join(PROJECT_ROOT, "scripts", "play-wav-to-fldigi.sh");

if (RUN_CHAIN && FORCED_SKIP_REASON) {
  console.warn(`[decode-chain] Skipping live decode tests: ${FORCED_SKIP_REASON}`);
}

if (RUN_CHAIN && !FORCED_SKIP_REASON && !PREFLIGHT.ok) {
  console.warn(
    `[decode-chain] Skipping live decode tests: ${PREFLIGHT.reason}. ` +
      "The slow-test runtime requires local PulseAudio tooling and a virtual_cw sink."
  );
}

function loadSlowPreflight(): { status: string; reason?: string } | null {
  const file = process.env.CQLAW_SLOW_PREFLIGHT_FILE;
  if (!file || !existsSync(file)) {
    return null;
  }
  try {
    const raw = readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw) as { status?: string; reason?: string };
    if (typeof parsed.status === "string") {
      return { status: parsed.status, reason: parsed.reason };
    }
  } catch {
    // Ignore parse errors; fallback to runtime preflight checks.
  }
  return null;
}

function checkDecodeAudioPreflight(): { ok: boolean; reason: string } {
  const cmd = "command -v paplay >/dev/null 2>&1 && command -v pactl >/dev/null 2>&1";
  const tools = spawnSync("bash", ["-lc", cmd], { encoding: "utf-8" });
  if (tools.status !== 0) {
    return { ok: false, reason: "paplay/pactl not available in test runtime" };
  }

  const sink = spawnSync("bash", ["-lc", "pactl list short sinks | awk '{print $2}'"], {
    encoding: "utf-8",
  });
  if (sink.status !== 0) {
    return { ok: false, reason: "unable to query PulseAudio sinks with pactl" };
  }

  const sinks = sink.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!sinks.includes("virtual_cw")) {
    return { ok: false, reason: "PulseAudio sink 'virtual_cw' not found" };
  }

  return { ok: true, reason: "" };
}

function decodeFixture(fixtureName: string): string {
  const wavPath = path.join(WAV_DIR, `${fixtureName}.wav`);
  if (!existsSync(wavPath)) {
    throw new Error(`Missing WAV fixture: ${wavPath}`);
  }

  const result = spawnSync("bash", [PLAY_SCRIPT, wavPath], {
    cwd: PROJECT_ROOT,
    env: process.env,
    encoding: "utf-8",
    timeout: 90_000,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Decode script failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return extractDecodedText(result.stdout || "");
}

function extractDecodedText(stdout: string): string {
  const startToken = "Decoded text:";
  const endToken = "---";
  const start = stdout.indexOf(startToken);
  if (start === -1) return stdout.trim();
  const after = stdout.slice(start + startToken.length);
  const end = after.lastIndexOf(endToken);
  const chunk = end === -1 ? after : after.slice(0, end);
  return chunk.replace(/\r/g, "").trim();
}

describe("Fldigi decode chain (Docker/real fldigi)", () => {
  it("clean-cq.wav decodes expected CQ call", { skip: !DECODE_CHAIN_READY, timeout: 120_000 }, () => {
    const text = decodeFixture("clean-cq");
    assert.ok(text.includes("CQ"));
    assert.ok(text.includes("PA3XYZ"));
  });

  it("clean-qso-exchange.wav decodes a full QSO exchange", { skip: !DECODE_CHAIN_READY, timeout: 120_000 }, () => {
    const text = decodeFixture("clean-qso-exchange");
    assert.ok(text.includes("RST"));
    assert.ok(text.includes("QTH"));
  });

  it("noisy-weak.wav decodes partially with uncertainty handling", { skip: !DECODE_CHAIN_READY, timeout: 120_000 }, () => {
    const text = decodeFixture("noisy-weak");
    assert.ok(text.length > 0);
    assert.ok(text.includes("?") || text.includes("CQ") || text.includes("DE"));
  });

  it("qrm-two-stations.wav decode handles interference scenario", { skip: !DECODE_CHAIN_READY, timeout: 120_000 }, () => {
    const wavPath = path.join(WAV_DIR, "qrm-two-stations.wav");
    if (!existsSync(wavPath)) {
      return;
    }
    const text = decodeFixture("qrm-two-stations");
    assert.ok(text.length > 0);
  });

  it("qsb-fading.wav decode handles fades and gaps", { skip: !DECODE_CHAIN_READY, timeout: 120_000 }, () => {
    const wavPath = path.join(WAV_DIR, "qsb-fading.wav");
    if (!existsSync(wavPath)) {
      return;
    }
    const text = decodeFixture("qsb-fading");
    assert.ok(text.length > 0);
  });

  it("fast-contest.wav decodes high-speed exchange", { skip: !DECODE_CHAIN_READY, timeout: 120_000 }, () => {
    const text = decodeFixture("fast-contest");
    assert.ok(text.length > 0);
    assert.ok(text.includes("CQ") || text.includes("TEST"));
  });

  it("slow-beginner.wav decodes low-speed exchange", { skip: !DECODE_CHAIN_READY, timeout: 120_000 }, () => {
    const text = decodeFixture("slow-beginner");
    assert.ok(text.length > 0);
    assert.ok(text.includes("CQ") || text.includes("DE"));
  });
});
