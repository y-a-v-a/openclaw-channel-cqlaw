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
  });

  it("flags dupes on same callsign and band", () => {
    const session = new ContestSessionManager();
    session.activate("CQWW");
    const first = session.registerContact("DL2ABC 599 14", "40m");
    const second = session.registerContact("DL2ABC 599 14", "40m");
    assert.equal(first.isDupe, false);
    assert.equal(second.isDupe, true);
    assert.equal(second.score.qsoCount, 1);
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
});
