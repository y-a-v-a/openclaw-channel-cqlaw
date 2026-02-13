import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONTEST_PROFILES } from "../src/contest.js";
import { ContestScorer } from "../src/contest-scoring.js";

describe("ContestScorer", () => {
  it("increments points and multipliers for cqww contacts", () => {
    const scorer = new ContestScorer();
    const profile = CONTEST_PROFILES["CQWW"];
    const a = scorer.scoreContact(profile, { callsign: "DL2ABC", zone: 14, rst: "599" }, "40m", false);
    assert.equal(a.points, 3);
    assert.ok(a.multiplierCount >= 1);

    const b = scorer.scoreContact(profile, { callsign: "K1ABC", zone: 5, rst: "599" }, "40m", false);
    assert.equal(b.qsoCount, 2);
    assert.ok(b.totalScore > a.totalScore);
  });

  it("does not change score for dupes", () => {
    const scorer = new ContestScorer();
    const profile = CONTEST_PROFILES["CQ-WPX"];
    const a = scorer.scoreContact(profile, { callsign: "DL2ABC", serial: 1, rst: "599" }, "40m", false);
    const b = scorer.scoreContact(profile, { callsign: "DL2ABC", serial: 2, rst: "599" }, "40m", true);
    assert.equal(b.points, a.points);
    assert.equal(b.qsoCount, a.qsoCount);
  });
});
