/**
 * Unit tests for CW band plan frequency validation.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkCwBandPlan, CW_BAND_SEGMENTS } from "../src/cw-band-plan.js";

describe("checkCwBandPlan", () => {
  it("recognizes a frequency in the 40m CW segment", () => {
    const result = checkCwBandPlan(7_030_000);
    assert.equal(result.isInCwSegment, true);
    assert.equal(result.band, "40m");
  });

  it("recognizes a frequency at the lower edge of 40m CW segment", () => {
    const result = checkCwBandPlan(7_000_000);
    assert.equal(result.isInCwSegment, true);
    assert.equal(result.band, "40m");
  });

  it("recognizes a frequency at the upper edge of 40m CW segment", () => {
    const result = checkCwBandPlan(7_040_000);
    assert.equal(result.isInCwSegment, true);
    assert.equal(result.band, "40m");
  });

  it("recognizes 20m CW segment", () => {
    const result = checkCwBandPlan(14_025_000);
    assert.equal(result.isInCwSegment, true);
    assert.equal(result.band, "20m");
  });

  it("recognizes 80m CW segment", () => {
    const result = checkCwBandPlan(3_525_000);
    assert.equal(result.isInCwSegment, true);
    assert.equal(result.band, "80m");
  });

  it("recognizes 160m CW segment", () => {
    const result = checkCwBandPlan(1_810_000);
    assert.equal(result.isInCwSegment, true);
    assert.equal(result.band, "160m");
  });

  it("recognizes 10m CW segment", () => {
    const result = checkCwBandPlan(28_050_000);
    assert.equal(result.isInCwSegment, true);
    assert.equal(result.band, "10m");
  });

  it("returns isInCwSegment=false for a frequency in the SSB portion of 40m", () => {
    // 7.100 MHz is in the SSB portion of 40m, outside CW segment (7.000-7.040)
    const result = checkCwBandPlan(7_100_000);
    assert.equal(result.isInCwSegment, false);
    assert.equal(result.band, null);
  });

  it("provides nearestBand hint when outside CW segments", () => {
    // 7.100 MHz — nearest CW band is 40m
    const result = checkCwBandPlan(7_100_000);
    assert.equal(result.nearestBand, "40m");
  });

  it("returns isInCwSegment=false for a broadcast frequency", () => {
    const result = checkCwBandPlan(9_600_000); // shortwave broadcast
    assert.equal(result.isInCwSegment, false);
  });

  it("returns isInCwSegment=false for frequency 0", () => {
    const result = checkCwBandPlan(0);
    assert.equal(result.isInCwSegment, false);
  });

  it("all CW_BAND_SEGMENTS midpoints resolve to their own band", () => {
    for (const seg of CW_BAND_SEGMENTS) {
      const mid = Math.floor((seg.minHz + seg.maxHz) / 2);
      const result = checkCwBandPlan(mid);
      assert.equal(result.isInCwSegment, true, `midpoint of ${seg.band} should be in CW segment`);
      assert.equal(result.band, seg.band);
    }
  });
});
