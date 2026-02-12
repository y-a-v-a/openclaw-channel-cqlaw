import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  levenshtein,
  fuzzyMatchCallsign,
  scoreConfidence,
  mergeObservations,
} from "../src/fuzzy-match.js";

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    assert.equal(levenshtein("PA3XYZ", "PA3XYZ"), 0);
  });

  it("returns string length for empty vs non-empty", () => {
    assert.equal(levenshtein("", "ABC"), 3);
    assert.equal(levenshtein("ABC", ""), 3);
  });

  it("returns 1 for single substitution", () => {
    assert.equal(levenshtein("PA3XYZ", "PA3XYA"), 1);
  });

  it("returns 1 for single insertion", () => {
    assert.equal(levenshtein("PA3XY", "PA3XYZ"), 1);
  });

  it("returns 1 for single deletion", () => {
    assert.equal(levenshtein("PA3XYZ", "PA3XY"), 1);
  });

  it("handles multiple edits", () => {
    assert.equal(levenshtein("DL2ABC", "DL2XYZ"), 3);
  });
});

describe("fuzzyMatchCallsign", () => {
  const known = ["PA3XYZ", "DL2ABC", "W1AW", "JA1ABC"];

  it("matches exact callsign", () => {
    assert.equal(fuzzyMatchCallsign("PA3XYZ", known), "PA3XYZ");
  });

  it("matches with one uncertain character removed", () => {
    // "PA3X?Z" → stripped of ? → "PA3XZ" → distance 1 from PA3XYZ
    assert.equal(fuzzyMatchCallsign("PA3X?Z", known), "PA3XYZ");
  });

  it("matches with one wrong character", () => {
    assert.equal(fuzzyMatchCallsign("DL2ABX", known), "DL2ABC");
  });

  it("returns null when no match is close enough", () => {
    assert.equal(fuzzyMatchCallsign("ZZZZZ", known), null);
  });

  it("respects maxDistance parameter", () => {
    assert.equal(fuzzyMatchCallsign("PA3ABC", known, 1), null);
    // PA3ABC is distance 3 from PA3XYZ — at maxDistance 3, a match is found
    const result = fuzzyMatchCallsign("PA3ABC", known, 3);
    assert.ok(result !== null, "should find a match at distance 3");
  });

  it("is case-insensitive", () => {
    assert.equal(fuzzyMatchCallsign("pa3xyz", known), "PA3XYZ");
  });
});

describe("scoreConfidence", () => {
  it("returns high for clean decode", () => {
    assert.equal(scoreConfidence("PA3XYZ"), "high");
  });

  it("returns medium for minor uncertainty (<=20%)", () => {
    assert.equal(scoreConfidence("PA3X?Z"), "medium"); // 1/6 = 16.7%
  });

  it("returns low for heavy uncertainty (>20%)", () => {
    assert.equal(scoreConfidence("P?3??Z"), "low"); // 3/6 = 50%
  });

  it("returns low for empty string", () => {
    assert.equal(scoreConfidence(""), "low");
  });

  it("returns high for no question marks", () => {
    assert.equal(scoreConfidence("W1AW"), "high");
  });
});

describe("mergeObservations", () => {
  it("merges complementary uncertain observations", () => {
    const result = mergeObservations(["DL2A?C", "DL2AB?", "?L2ABC"]);
    assert.equal(result.value, "DL2ABC");
    assert.equal(result.confidence, "high");
  });

  it("uses majority vote when observations disagree", () => {
    const result = mergeObservations(["PA3XYZ", "PA3XYZ", "PA3XYA"]);
    assert.equal(result.value, "PA3XYZ");
  });

  it("returns the single observation when only one provided", () => {
    const result = mergeObservations(["PA3X?Z"]);
    assert.equal(result.value, "PA3X?Z");
    assert.equal(result.confidence, "medium");
  });

  it("returns low confidence for empty array", () => {
    const result = mergeObservations([]);
    assert.equal(result.value, "");
    assert.equal(result.confidence, "low");
  });

  it("keeps ? when no observation resolves a position", () => {
    const result = mergeObservations(["PA?X?Z", "PA??YZ"]);
    assert.equal(result.value, "PA?XYZ");
  });

  it("handles observations of different lengths", () => {
    const result = mergeObservations(["DL2AB", "DL2ABC"]);
    assert.equal(result.value, "DL2ABC");
  });
});
