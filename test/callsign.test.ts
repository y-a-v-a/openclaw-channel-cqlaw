import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractCallsigns,
  extractCqCalls,
  extractDirectedExchanges,
  isCallsign,
} from "../src/callsign.js";

describe("isCallsign", () => {
  it("accepts standard callsigns", () => {
    assert.ok(isCallsign("W1AW"));
    assert.ok(isCallsign("PA3XYZ"));
    assert.ok(isCallsign("VU2ABC"));
    assert.ok(isCallsign("JA1ABC"));
    assert.ok(isCallsign("4X6TT"));
    assert.ok(isCallsign("9A1A"));
  });

  it("accepts compound callsigns", () => {
    assert.ok(isCallsign("PA3XYZ/P"));
    assert.ok(isCallsign("DL2ABC/MM"));
    assert.ok(isCallsign("W1AW/4"));
  });

  it("is case-insensitive", () => {
    assert.ok(isCallsign("pa3xyz"));
    assert.ok(isCallsign("w1aw"));
  });

  it("rejects non-callsigns", () => {
    assert.ok(!isCallsign("HELLO"));
    assert.ok(!isCallsign("123"));
    assert.ok(!isCallsign("CQ"));
    assert.ok(!isCallsign("DE"));
    assert.ok(!isCallsign(""));
    assert.ok(!isCallsign("A"));
  });
});

describe("extractCallsigns", () => {
  it("finds callsigns in plain text", () => {
    const result = extractCallsigns("CQ CQ DE PA3XYZ K");
    assert.equal(result.length, 1);
    assert.equal(result[0].callsign, "PA3XYZ");
  });

  it("finds multiple distinct callsigns", () => {
    const result = extractCallsigns("PA3XYZ DE DL2ABC");
    assert.equal(result.length, 2);
    assert.equal(result[0].callsign, "PA3XYZ");
    assert.equal(result[1].callsign, "DL2ABC");
  });

  it("deduplicates repeated callsigns", () => {
    const result = extractCallsigns("CQ CQ DE PA3XYZ PA3XYZ K");
    assert.equal(result.length, 1);
    assert.equal(result[0].callsign, "PA3XYZ");
  });

  it("finds compound callsigns", () => {
    const result = extractCallsigns("CQ DE PA3XYZ/P K");
    assert.equal(result.length, 1);
    assert.equal(result[0].callsign, "PA3XYZ/P");
  });

  it("is case-insensitive", () => {
    const result = extractCallsigns("cq de pa3xyz k");
    assert.equal(result.length, 1);
    assert.equal(result[0].callsign, "PA3XYZ");
  });

  it("returns empty array when no callsigns found", () => {
    const result = extractCallsigns("HELLO WORLD");
    assert.equal(result.length, 0);
  });

  it("handles numeric prefix callsigns", () => {
    const result = extractCallsigns("4X6TT DE 9A1A K");
    assert.equal(result.length, 2);
    assert.equal(result[0].callsign, "4X6TT");
    assert.equal(result[1].callsign, "9A1A");
  });
});

describe("extractCqCalls", () => {
  it("extracts station calling CQ", () => {
    const result = extractCqCalls("CQ CQ DE PA3XYZ K");
    assert.equal(result.length, 1);
    assert.equal(result[0].from, "PA3XYZ");
  });

  it("handles single CQ", () => {
    const result = extractCqCalls("CQ DE W1AW K");
    assert.equal(result.length, 1);
    assert.equal(result[0].from, "W1AW");
  });

  it("handles triple CQ", () => {
    const result = extractCqCalls("CQ CQ CQ DE JA1ABC K");
    assert.equal(result.length, 1);
    assert.equal(result[0].from, "JA1ABC");
  });

  it("returns empty when no CQ pattern found", () => {
    const result = extractCqCalls("PA3XYZ DE DL2ABC K");
    assert.equal(result.length, 0);
  });
});

describe("extractDirectedExchanges", () => {
  it("extracts both sides of a directed call", () => {
    const result = extractDirectedExchanges("PA3XYZ DE DL2ABC K");
    assert.equal(result.length, 1);
    assert.equal(result[0].to, "PA3XYZ");
    assert.equal(result[0].from, "DL2ABC");
  });

  it("does not match CQ DE as a directed exchange", () => {
    // "CQ" is not a valid callsign, so it won't match the CALL_DE_CALL pattern
    const result = extractDirectedExchanges("CQ DE PA3XYZ K");
    assert.equal(result.length, 0);
  });

  it("handles compound callsigns in directed exchanges", () => {
    const result = extractDirectedExchanges("W1AW DE PA3XYZ/P K");
    assert.equal(result.length, 1);
    assert.equal(result[0].to, "W1AW");
    assert.equal(result[0].from, "PA3XYZ/P");
  });

  it("handles multiple exchanges in one string", () => {
    const text = "PA3XYZ DE DL2ABC RST 599 DL2ABC DE PA3XYZ RST 579";
    const result = extractDirectedExchanges(text);
    assert.equal(result.length, 2);
    assert.equal(result[0].from, "DL2ABC");
    assert.equal(result[1].from, "PA3XYZ");
  });
});
