import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeForCw } from "../src/cw-sanitize.js";

describe("sanitizeForCw", () => {
  it("uppercases all text", () => {
    assert.equal(sanitizeForCw("hello world"), "HELLO WORLD");
  });

  it("preserves letters, digits, and spaces", () => {
    assert.equal(sanitizeForCw("CQ CQ DE PA3XYZ 599"), "CQ CQ DE PA3XYZ 599");
  });

  it("preserves Morse-valid punctuation", () => {
    assert.equal(sanitizeForCw("RST 599. QTH? NAME: BOB"), "RST 599. QTH? NAME: BOB");
  });

  it("strips characters without Morse representation", () => {
    assert.equal(sanitizeForCw("Hello™ World® #1 $$$"), "HELLO WORLD 1");
  });

  it("collapses multiple spaces", () => {
    assert.equal(sanitizeForCw("CQ   CQ    DE"), "CQ CQ DE");
  });

  it("trims leading and trailing whitespace", () => {
    assert.equal(sanitizeForCw("  CQ DE PA3XYZ  "), "CQ DE PA3XYZ");
  });

  it("returns empty string for all-invalid input", () => {
    assert.equal(sanitizeForCw("™®©"), "");
  });

  it("handles empty string", () => {
    assert.equal(sanitizeForCw(""), "");
  });
});
