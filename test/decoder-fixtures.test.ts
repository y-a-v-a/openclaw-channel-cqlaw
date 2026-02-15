/**
 * Decoder fixture tests — validates our processing pipeline against
 * YAML-defined test cases.
 *
 * Layer A (unit/fast tier): Tests the SentenceBuffer, callsign extraction,
 * and related processing against the known fixture texts. These tests verify
 * that our pipeline handles the expected decoder output correctly — without
 * requiring fldigi or audio decoding.
 *
 * Layer B (fldigi integration) is defined separately for the Docker-based
 * slow test tier.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { SentenceBuffer } from "../src/sentence-buffer.js";
import { extractCallsigns, isCallsign } from "../src/callsign.js";

// --- Fixture types ---

interface NoiseConfig {
  type: "white";
  snr_db: number;
}

interface Fixture {
  id: string;
  text: string;
  wpm: number;
  tone_hz: number;
  sample_rate: number;
  noise: "none" | NoiseConfig;
  expect_exact: boolean;
  expect_contains?: string[];
  description: string;
}

interface FixtureFile {
  fixtures: Fixture[];
}

// --- Load fixtures ---

// __dirname at runtime is dist/test/ — two levels up is the project root
const PROJECT_ROOT = join(__dirname, "..", "..");
const YAML_PATH = join(PROJECT_ROOT, "test", "fixtures", "decoder-tests.yaml");
const WAV_DIR = join(PROJECT_ROOT, "test", "fixtures", "wav");

function loadFixtures(): Fixture[] {
  const yaml = readFileSync(YAML_PATH, "utf-8");
  return (parseYaml(yaml) as FixtureFile).fixtures;
}

// --- Helper: simulate fldigi output by feeding text character-by-character ---

function simulateCharacterStream(
  text: string,
  callback: (message: string) => void
): void {
  const buffer = new SentenceBuffer(callback, { silenceThresholdMs: 50_000 });
  // Feed characters one at a time, as fldigi would
  for (const ch of text) {
    buffer.push(ch);
  }
  // If the buffer didn't flush via prosign, force-flush
  if (buffer.pending) {
    buffer.flush();
  }
  // Cancel any pending silence timers so the event loop can exit
  buffer.reset();
}

// --- Tests ---

describe("Decoder fixtures — pipeline processing", () => {
  let fixtures: Fixture[];

  before(() => {
    fixtures = loadFixtures();
  });

  describe("SentenceBuffer handles fixture texts correctly", () => {
    it("flushes clean fixture texts to normalized messages", () => {
      const cleanFixtures = fixtures.filter((f) => f.noise === "none");
      for (const fixture of cleanFixtures) {
        const messages: string[] = [];
        simulateCharacterStream(fixture.text, (msg) => messages.push(msg));

        assert.ok(
          messages.length >= 1,
          `Fixture '${fixture.id}': expected at least one message, got ${messages.length}`
        );

        // Reassemble all flushed messages. When feeding character-by-character,
        // the buffer flushes eagerly on " K" before seeing that it's part of
        // "KN" or "BK". This splits multi-char prosigns across messages, which
        // is correct real-time behavior — the buffer cannot look ahead.
        // We verify by stripping all whitespace and comparing the raw characters.
        const actualChars = messages.join("").replace(/\s/g, "");
        const expectedChars = fixture.text.replace(/\s/g, "");
        assert.equal(
          actualChars,
          expectedChars,
          `Fixture '${fixture.id}': character content mismatch`
        );
      }
    });

    it("prosign-terminated fixtures flush without silence timeout", () => {
      const prosignFixtures = fixtures.filter(
        (f) =>
          f.noise === "none" &&
          / (K|AR|SK|KN|BK)$/.test(f.text)
      );
      for (const fixture of prosignFixtures) {
        const messages: string[] = [];
        const buffer = new SentenceBuffer((msg) => messages.push(msg), {
          silenceThresholdMs: 999_999, // effectively infinite — no silence flush
        });

        for (const ch of fixture.text) {
          buffer.push(ch);
        }

        assert.ok(
          messages.length >= 1,
          `Fixture '${fixture.id}': should have flushed on prosign without silence timeout`
        );

        // Cancel pending silence timer so the event loop can exit
        buffer.reset();
      }
    });
  });

  describe("Callsign extraction from fixture texts", () => {
    it("extracts callsigns from CQ patterns", () => {
      const cqFixtures = fixtures.filter(
        (f) => f.noise === "none" && f.text.includes("CQ") && f.text.includes("DE")
      );

      for (const fixture of cqFixtures) {
        const callsigns = extractCallsigns(fixture.text);
        assert.ok(
          callsigns.length > 0,
          `Fixture '${fixture.id}': expected to extract at least one callsign from "${fixture.text}"`
        );
      }
    });

    it("extracts callsigns from DE patterns", () => {
      const deFixtures = fixtures.filter(
        (f) => f.noise === "none" && f.text.includes(" DE ")
      );

      for (const fixture of deFixtures) {
        const callsigns = extractCallsigns(fixture.text);
        assert.ok(
          callsigns.length > 0,
          `Fixture '${fixture.id}': expected callsign extraction from DE pattern`
        );
      }
    });

    it("recognizes all callsign formats used in fixtures", () => {
      const expectedCallsigns = [
        "PA3XYZ", "DL2ABC", "W1AW", "JA1ABC", "VU2ABC", "PA3XYZ/P",
      ];
      for (const cs of expectedCallsigns) {
        // Strip /P etc for the base callsign check
        const base = cs.split("/")[0];
        assert.ok(
          isCallsign(base),
          `'${base}' should be recognized as a valid callsign`
        );
      }
    });
  });

  describe("WAV fixtures exist on disk", () => {
    it("all fixture WAV files have been generated", () => {
      const allFixtures = loadFixtures();
      for (const fixture of allFixtures) {
        const wavPath = join(WAV_DIR, `${fixture.id}.wav`);
        assert.ok(
          existsSync(wavPath),
          `Missing WAV fixture: ${fixture.id}.wav — run 'npm run generate-fixtures'`
        );
      }
    });
  });
});
