import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CONTEST_PROFILES,
  generateContestExchange,
  getContestProfile,
  parseContestExchange,
} from "../src/contest.js";

describe("contest profiles", () => {
  it("defines core profiles with required schema fields", () => {
    const cqww = CONTEST_PROFILES["CQWW"];
    assert.equal(cqww.contestId, "CQWW");
    assert.ok(cqww.exchangeFormat.fields.length > 0);
    assert.ok(cqww.bandPlan.allowedBands.length > 0);
    assert.equal(cqww.duration.timezone, "UTC");
  });

  it("retrieves known profiles by id", () => {
    assert.equal(getContestProfile("CQ-WPX")?.contestId, "CQ-WPX");
    assert.equal(getContestProfile("NOPE"), null);
  });
});

describe("parseContestExchange", () => {
  it("parses CQWW exchanges", () => {
    const parsed = parseContestExchange("DL2ABC 599 14", CONTEST_PROFILES["CQWW"]);
    assert.equal(parsed.rst, "599");
    assert.equal(parsed.zone, 14);
    assert.equal(parsed.callsign, "DL2ABC");
  });

  it("parses CQ-WPX exchanges", () => {
    const parsed = parseContestExchange("W1AW 599 023", CONTEST_PROFILES["CQ-WPX"]);
    assert.equal(parsed.rst, "599");
    assert.equal(parsed.serial, 23);
  });

  it("parses ARRL Field Day exchanges", () => {
    const parsed = parseContestExchange("2A ENY", CONTEST_PROFILES["ARRL-FD"]);
    assert.equal(parsed.category, "2A");
    assert.equal(parsed.section, "ENY");
  });

  it("parses ARRL Sweepstakes exchanges", () => {
    const parsed = parseContestExchange("123 A W1AW 26 ENY", CONTEST_PROFILES["ARRL-SS"]);
    assert.equal(parsed.serial, 123);
    assert.equal(parsed.precedence, "A");
    assert.equal(parsed.callsign, "W1AW");
    assert.equal(parsed.check, "26");
    assert.equal(parsed.section, "ENY");
  });
});

describe("generateContestExchange", () => {
  it("generates CQWW exchange", () => {
    const txt = generateContestExchange(CONTEST_PROFILES["CQWW"], { ownCallsign: "PA3XYZ", zone: 14 });
    assert.equal(txt, "599 14");
  });

  it("generates CQ-WPX exchange with padded serial", () => {
    const txt = generateContestExchange(CONTEST_PROFILES["CQ-WPX"], { ownCallsign: "PA3XYZ", serial: 7 });
    assert.equal(txt, "599 007");
  });

  it("generates ARRL SS exchange", () => {
    const txt = generateContestExchange(CONTEST_PROFILES["ARRL-SS"], {
      ownCallsign: "PA3XYZ",
      serial: 12,
      precedence: "A",
      check: "26",
      section: "ENY",
    });
    assert.equal(txt, "0012 A PA3XYZ 26 ENY");
  });
});
