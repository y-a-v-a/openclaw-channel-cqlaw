/**
 * Unit tests for SNR → RST signal quality mapping.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { snrToRst, snrToSignalQuality } from "../src/signal-quality.js";

describe("snrToRst", () => {
  it("returns 599 for S/N > 20 dB (excellent)", () => {
    assert.equal(snrToRst(21), "599");
    assert.equal(snrToRst(30), "599");
    assert.equal(snrToRst(40), "599");
  });

  it("returns 579 for S/N exactly 20 dB (boundary: good)", () => {
    assert.equal(snrToRst(20), "579");
  });

  it("returns 579 for S/N 10–20 dB (good)", () => {
    assert.equal(snrToRst(15), "579");
    assert.equal(snrToRst(10), "579");
  });

  it("returns 449 for S/N 3–9 dB (fair)", () => {
    assert.equal(snrToRst(3), "449");
    assert.equal(snrToRst(5), "449");
    assert.equal(snrToRst(9), "449");
  });

  it("returns 339 for S/N < 3 dB (poor)", () => {
    assert.equal(snrToRst(2), "339");
    assert.equal(snrToRst(0), "339");
    assert.equal(snrToRst(-5), "339");
  });
});

describe("snrToSignalQuality", () => {
  it("returns excellent for S/N > 20 dB", () => {
    const q = snrToSignalQuality(25);
    assert.equal(q.rst, "599");
    assert.equal(q.label, "excellent");
  });

  it("returns good for S/N 10–20 dB", () => {
    const q = snrToSignalQuality(12);
    assert.equal(q.rst, "579");
    assert.equal(q.label, "good");
  });

  it("returns fair for S/N 3–10 dB", () => {
    const q = snrToSignalQuality(7);
    assert.equal(q.rst, "449");
    assert.equal(q.label, "fair");
  });

  it("returns poor for S/N < 3 dB", () => {
    const q = snrToSignalQuality(1);
    assert.equal(q.rst, "339");
    assert.equal(q.label, "poor");
  });
});
