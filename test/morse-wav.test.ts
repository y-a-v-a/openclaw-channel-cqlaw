import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  textToTimings,
  timingsToSamples,
  addNoise,
  encodeWav,
  generateMorseWav,
} from "./fixtures/morse-wav.js";

describe("morse-wav", () => {
  describe("textToTimings", () => {
    it("generates correct dit/dah pattern for 'E' (single dit)", () => {
      const timings = textToTimings("E", 20);
      const dit = 1200 / 20; // 60ms
      // E = "." → one dit, then trailing charGap
      assert.equal(timings.length, 2);
      assert.equal(timings[0], dit);
      assert.equal(timings[1], -dit * 3); // charGap
    });

    it("generates correct dit/dah pattern for 'T' (single dah)", () => {
      const timings = textToTimings("T", 20);
      const dit = 60;
      assert.equal(timings[0], dit * 3); // dah = 3 * dit
    });

    it("generates correct pattern for 'A' (dit-dah)", () => {
      const timings = textToTimings("A", 20);
      const dit = 60;
      // A = ".-" → dit, elementGap, dah, charGap
      assert.equal(timings.length, 4);
      assert.equal(timings[0], dit);
      assert.equal(timings[1], -dit);     // element gap
      assert.equal(timings[2], dit * 3);  // dah
      assert.equal(timings[3], -dit * 3); // char gap
    });

    it("uses word gap (7 dit) for spaces between words", () => {
      const timings = textToTimings("E E", 20);
      const dit = 60;
      // E = dit, charGap replaced by wordGap, E = dit, charGap
      // [dit, wordGap, dit, charGap]
      assert.equal(timings[1], -dit * 7);
    });

    it("handles uppercase and lowercase identically", () => {
      const upper = textToTimings("CQ", 20);
      const lower = textToTimings("cq", 20);
      assert.deepEqual(upper, lower);
    });

    it("skips unsupported characters gracefully", () => {
      // '$' is not in the Morse table — should be skipped
      const withSpecial = textToTimings("A$B", 20);
      const without = textToTimings("AB", 20);
      assert.deepEqual(withSpecial, without);
    });

    it("scales timing inversely with WPM", () => {
      const slow = textToTimings("E", 10);
      const fast = textToTimings("E", 20);
      // dit at 10 WPM = 120ms, at 20 WPM = 60ms
      assert.equal(slow[0], 120);
      assert.equal(fast[0], 60);
    });
  });

  describe("timingsToSamples", () => {
    it("produces samples of expected length", () => {
      const timings = [60, -60]; // 60ms tone + 60ms silence
      const sampleRate = 48000;
      const samples = timingsToSamples(timings, 700, sampleRate);
      // 60ms = 2880 samples, x2 for tone+silence, + 200ms padding (9600)
      const expected = 2880 + 2880 + 9600;
      assert.equal(samples.length, expected);
    });

    it("produces silence during negative timing intervals", () => {
      const timings = [-100]; // 100ms of silence
      const samples = timingsToSamples(timings, 700, 48000);
      // The silence portion (before padding) should all be zero
      const silenceSamples = Math.round(0.1 * 48000);
      for (let i = 0; i < silenceSamples; i++) {
        assert.equal(samples[i], 0, `sample ${i} should be silent`);
      }
    });

    it("produces non-zero samples during positive timing intervals", () => {
      const timings = [60]; // 60ms tone
      const samples = timingsToSamples(timings, 700, 48000);
      // Check middle samples (past the ramp-up) are non-zero
      const midpoint = Math.round(0.03 * 48000); // 30ms in
      assert.notEqual(samples[midpoint], 0);
    });

    it("keeps all samples within [-1, 1]", () => {
      const timings = textToTimings("CQ CQ DE PA3XYZ K", 20);
      const samples = timingsToSamples(timings, 700, 48000);
      for (let i = 0; i < samples.length; i++) {
        assert.ok(
          samples[i] >= -1 && samples[i] <= 1,
          `sample ${i} out of range: ${samples[i]}`
        );
      }
    });
  });

  describe("addNoise", () => {
    it("preserves sample count", () => {
      const clean = new Float64Array(1000);
      for (let i = 0; i < clean.length; i++) clean[i] = Math.sin(i * 0.1);
      const noisy = addNoise(clean, 10);
      assert.equal(noisy.length, clean.length);
    });

    it("changes sample values", () => {
      const clean = new Float64Array(1000);
      for (let i = 0; i < clean.length; i++) clean[i] = Math.sin(i * 0.1);
      const noisy = addNoise(clean, 10);
      let differences = 0;
      for (let i = 0; i < clean.length; i++) {
        if (noisy[i] !== clean[i]) differences++;
      }
      assert.ok(differences > 900, "most samples should differ after adding noise");
    });

    it("returns unchanged samples for all-zero input", () => {
      const silent = new Float64Array(100);
      const result = addNoise(silent, 10);
      // All-zero signal → noise power = 0 → all zeros returned
      for (let i = 0; i < result.length; i++) {
        assert.equal(result[i], 0);
      }
    });
  });

  describe("encodeWav", () => {
    it("produces a valid RIFF WAV header", () => {
      const samples = new Float64Array(100);
      const wav = encodeWav(samples, 48000);

      assert.equal(wav.toString("ascii", 0, 4), "RIFF");
      assert.equal(wav.toString("ascii", 8, 12), "WAVE");
      assert.equal(wav.toString("ascii", 12, 16), "fmt ");
      assert.equal(wav.toString("ascii", 36, 40), "data");
    });

    it("writes correct sample rate", () => {
      const samples = new Float64Array(100);
      const wav = encodeWav(samples, 48000);
      assert.equal(wav.readUInt32LE(24), 48000);
    });

    it("writes correct data size", () => {
      const samples = new Float64Array(100);
      const wav = encodeWav(samples, 48000);
      // 100 samples * 2 bytes per sample (16-bit)
      assert.equal(wav.readUInt32LE(40), 200);
    });

    it("total file size matches header + data", () => {
      const samples = new Float64Array(100);
      const wav = encodeWav(samples, 48000);
      assert.equal(wav.length, 44 + 200);
    });
  });

  describe("generateMorseWav", () => {
    it("produces a valid WAV buffer for simple text", () => {
      const wav = generateMorseWav({
        text: "CQ",
        wpm: 20,
        toneHz: 700,
        sampleRate: 48000,
      });

      assert.ok(Buffer.isBuffer(wav));
      assert.equal(wav.toString("ascii", 0, 4), "RIFF");
      assert.ok(wav.length > 44, "WAV should contain audio data beyond header");
    });

    it("produces longer WAV for slower WPM", () => {
      const fast = generateMorseWav({
        text: "CQ",
        wpm: 30,
        toneHz: 700,
        sampleRate: 48000,
      });
      const slow = generateMorseWav({
        text: "CQ",
        wpm: 15,
        toneHz: 700,
        sampleRate: 48000,
      });
      assert.ok(slow.length > fast.length, "slower WPM should produce longer WAV");
    });

    it("adds noise when noise config is provided", () => {
      const clean = generateMorseWav({
        text: "E",
        wpm: 20,
        toneHz: 700,
        sampleRate: 48000,
      });
      const noisy = generateMorseWav({
        text: "E",
        wpm: 20,
        toneHz: 700,
        sampleRate: 48000,
        noise: { type: "white", snrDb: 10 },
      });
      // Same length, but different content
      assert.equal(clean.length, noisy.length);
      // At least some samples should differ
      let diffs = 0;
      for (let i = 44; i < clean.length; i += 2) {
        if (clean.readInt16LE(i) !== noisy.readInt16LE(i)) diffs++;
      }
      assert.ok(diffs > 0, "noisy WAV should differ from clean");
    });
  });
});
