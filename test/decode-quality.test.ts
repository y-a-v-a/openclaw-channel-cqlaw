import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterDecodeNoise, scoreMessageConfidence } from "../src/decode-quality.js";

describe("filterDecodeNoise", () => {
  it("strips common punctuation noise bursts", () => {
    const cleaned = filterDecodeNoise("CQ === ### DE PA3XYZ K");
    assert.equal(cleaned, "CQ DE PA3XYZ K");
  });

  it("collapses long question-mark bursts to a single uncertainty marker", () => {
    const cleaned = filterDecodeNoise("PA3X?????Z");
    assert.equal(cleaned, "PA3X ? Z");
  });
});

describe("scoreMessageConfidence", () => {
  it("returns high for clean text", () => {
    assert.equal(scoreMessageConfidence("CQ CQ DE PA3XYZ K"), "high");
  });

  it("returns medium for moderate uncertainty", () => {
    assert.equal(scoreMessageConfidence("CQ DE PA3X?Z K"), "medium");
  });

  it("returns low for heavy uncertainty", () => {
    assert.equal(scoreMessageConfidence("?? === ###"), "low");
  });
});
