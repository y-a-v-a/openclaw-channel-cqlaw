/**
 * Generates WAV fixture files from decoder-tests.yaml.
 *
 * Each fixture produces a PCM WAV file in test/fixtures/wav/ that can be
 * piped into fldigi (or any CW decoder) for integration testing.
 *
 * Usage:
 *   npm run generate-fixtures
 *   # or directly:
 *   node dist/test/fixtures/generate-wavs.js
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { generateMorseWav } from "./morse-wav.js";

// __dirname at runtime is dist/test/fixtures/ — three levels up is project root
const PROJECT_ROOT = join(__dirname, "..", "..", "..");
const FIXTURES_DIR = join(PROJECT_ROOT, "test", "fixtures");
const WAV_DIR = join(FIXTURES_DIR, "wav");
const YAML_PATH = join(FIXTURES_DIR, "decoder-tests.yaml");

// --- Types ---

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

// --- Main ---

function main(): void {
  const yamlContent = readFileSync(YAML_PATH, "utf-8");
  const fixtureFile = parseYaml(yamlContent) as FixtureFile;

  mkdirSync(WAV_DIR, { recursive: true });

  let generated = 0;
  for (const fixture of fixtureFile.fixtures) {
    const wavPath = join(WAV_DIR, `${fixture.id}.wav`);
    const wavBuffer = generateMorseWav({
      text: fixture.text,
      wpm: fixture.wpm,
      toneHz: fixture.tone_hz,
      sampleRate: fixture.sample_rate,
      noise:
        fixture.noise === "none"
          ? undefined
          : { type: "white", snrDb: fixture.noise.snr_db },
    });
    writeFileSync(wavPath, wavBuffer);

    const durationMs = Math.round(
      (wavBuffer.length / (fixture.sample_rate * 2 + 44)) * 1000
    );
    console.log(
      `  ✓ ${fixture.id}.wav  (${fixture.wpm} WPM, ${fixture.tone_hz} Hz, ` +
        `${(wavBuffer.length / 1024).toFixed(0)} KB, ` +
        `${fixture.noise === "none" ? "clean" : `SNR ${fixture.noise.snr_db}dB`})`
    );
    generated++;
  }

  console.log(`\nGenerated ${generated} WAV fixtures in ${WAV_DIR}`);
}

main();
