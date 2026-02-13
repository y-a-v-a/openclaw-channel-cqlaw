import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inferCqZoneFromCallsign,
  reconstructRst,
  reconstructSerial,
  reconstructZone,
} from "../src/context-reconstruct.js";

describe("reconstructRst", () => {
  it("reconstructs noisy rst values", () => {
    assert.equal(reconstructRst("5?9")?.value, "599");
    assert.equal(reconstructRst("?79")?.value, "579");
    assert.equal(reconstructRst("???")?.value, "599");
  });
});

describe("zone reconstruction", () => {
  it("infers cq zone from callsign prefix", () => {
    assert.equal(inferCqZoneFromCallsign("PA3XYZ"), 14);
    assert.equal(inferCqZoneFromCallsign("K1ABC"), 5);
  });

  it("reconstructs zone when decoded value is missing/noisy", () => {
    assert.equal(reconstructZone(undefined, "PA3XYZ")?.value, "14");
    assert.equal(reconstructZone("?4", "PA3XYZ")?.value, "14");
  });
});

describe("serial reconstruction", () => {
  it("enforces monotonic serial progression", () => {
    assert.equal(reconstructSerial("0010", 10)?.value, "11");
    assert.equal(reconstructSerial(undefined, 42)?.value, "43");
  });
});
