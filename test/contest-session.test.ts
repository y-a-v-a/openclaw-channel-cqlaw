import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ContestSessionManager } from "../src/contest-session.js";

describe("ContestSessionManager", () => {
  it("activates profile and tracks serial progression", () => {
    const session = new ContestSessionManager();
    session.activate("CQ-WPX", 7);
    const outbound = session.generateOutgoing({ ownCallsign: "PA3XYZ" });
    assert.equal(outbound, "599 007");
    assert.equal(session.nextSerial, 7);

    const result = session.registerContact("DL2ABC 599 023", "40m");
    assert.equal(result.isDupe, false);
    assert.equal(session.nextSerial, 8);
    assert.equal(result.score.qsoCount, 1);
    assert.equal(result.shouldAlertMultiplier, true);
  });

  it("flags dupes on same callsign and band", () => {
    const session = new ContestSessionManager();
    session.activate("CQWW");
    const first = session.registerContact("DL2ABC 599 14", "40m");
    const second = session.registerContact("DL2ABC 599 14", "40m");
    assert.equal(first.isDupe, false);
    assert.equal(second.isDupe, true);
    assert.equal(second.score.qsoCount, 1);
    assert.equal(second.multiplierAlerts.length, 0);
  });

  it("allows same callsign on different bands", () => {
    const session = new ContestSessionManager();
    session.activate("CQWW");
    const first = session.registerContact("DL2ABC 599 14", "40m");
    const second = session.registerContact("DL2ABC 599 14", "20m");
    assert.equal(first.isDupe, false);
    assert.equal(second.isDupe, false);
    assert.equal(second.score.qsoCount, 2);
  });

  it("tracks rate metrics and projected score", () => {
    const session = new ContestSessionManager();
    session.activate("CQ-WPX");
    session.registerContact("DL2ABC 599 001", "40m");
    session.registerContact("K1ABC 599 002", "40m");
    const rate = session.rateMetrics();
    assert.ok(rate);
    assert.ok(rate!.currentRateQsoPerHour > 0);
    assert.ok(rate!.averageRateQsoPerHour > 0);
    assert.ok(rate!.peakRateQsoPerHour > 0);
    assert.ok(rate!.projectedFinalScore >= 0);
    assert.ok(rate!.chart.length >= 1);
  });

  it("exports Cabrillo for non-dupe contacts", () => {
    const session = new ContestSessionManager();
    session.activate("CQWW");
    session.registerContact("DL2ABC 599 14", "40m");
    session.registerContact("DL2ABC 599 14", "40m");
    session.registerContact("K1ABC 599 05", "20m");

    const cabrillo = session.exportCabrillo({
      callsign: "PA3XYZ",
      categoryOperator: "single-op",
      categoryBand: "all",
      categoryPower: "low",
      operators: ["PA3XYZ"],
      createdBy: "unit-test",
    });

    assert.match(cabrillo, /START-OF-LOG: 3.0/);
    assert.match(cabrillo, /CONTEST: CQWW/);
    assert.match(cabrillo, /CALLSIGN: PA3XYZ/);
    assert.match(cabrillo, /QSO:\s+7000 CW/);
    assert.match(cabrillo, /QSO:\s+14000 CW/);
    assert.equal((cabrillo.match(/^QSO:/gm) ?? []).length, 2);
  });
});
