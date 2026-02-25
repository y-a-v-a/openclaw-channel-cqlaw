import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractContestQsoFields,
  extractMultipleQsoFields,
  extractQsoFields,
  lowConfidenceFields,
  splitQsoTranscript,
} from "../src/qso-extract.js";

describe("extractQsoFields", () => {
  it("extracts callsign, rst, name, and qth from transcript text", () => {
    const fields = extractQsoFields("DL2ABC DE PA3XYZ UR RST 579 NAME HANS QTH MUNICH ZN 14 NR 0012 K");
    assert.equal(fields.callsign?.value, "DL2ABC");
    assert.equal(fields.rstRcvd?.value, "579");
    assert.equal(fields.zone?.value, "14");
    assert.equal(fields.serial?.value, "12");
    assert.equal(fields.name?.value, "HANS");
    assert.equal(fields.qth?.value, "MUNICH");
  });

  it("prefers peer hint when it is a valid callsign", () => {
    const fields = extractQsoFields("CQ CQ DE UNKNOWN", { peerHint: "W1AW" });
    assert.equal(fields.callsign?.value, "W1AW");
  });

  it("reconstructs noisy rst/zone/serial values with context", () => {
    const fields = extractQsoFields("QSO UR RST 5?9 ZN ?4 NR 0008", {
      peerHint: "PA3XYZ",
      previousSerial: 8,
    });
    assert.equal(fields.rstRcvd?.value, "599");
    assert.equal(fields.zone?.value, "14");
    assert.equal(fields.serial?.value, "9");
  });

  it("extracts available fields from a partial/incomplete QSO", () => {
    const fields = extractQsoFields("DL2ABC DE PA3XYZ UR RST 579 NAME HANS BK");
    assert.equal(fields.callsign?.value, "DL2ABC");
    assert.equal(fields.rstRcvd?.value, "579");
    assert.equal(fields.name?.value, "HANS");
    assert.equal(fields.qth, undefined);
  });

  it("extracts contest CQWW fields (RST + zone)", () => {
    const fields = extractContestQsoFields("DL2ABC 599 14", "CQWW");
    assert.equal(fields.callsign?.value, "DL2ABC");
    assert.equal(fields.rstRcvd?.value, "599");
    assert.equal(fields.zone?.value, "14");
  });

  it("extracts contest CQ-WPX fields (RST + serial)", () => {
    const fields = extractContestQsoFields("DL2ABC 599 023", "CQ-WPX");
    assert.equal(fields.callsign?.value, "DL2ABC");
    assert.equal(fields.rstRcvd?.value, "599");
    assert.equal(fields.serial?.value, "23");
  });

  it("splits and extracts back-to-back QSOs from one transcript", () => {
    const transcript = "CQ CQ DE PA3XYZ K DL2ABC DE PA3XYZ RST 579 NAME HANS SK W1AW DE PA3XYZ RST 599 NAME ARRL SK";
    const segments = splitQsoTranscript(transcript);
    assert.equal(segments.length, 2);

    const extracted = extractMultipleQsoFields(transcript);
    assert.equal(extracted.length, 2);
    assert.equal(extracted[0].fields.callsign?.value, "DL2ABC");
    assert.equal(extracted[0].fields.rstRcvd?.value, "579");
    assert.equal(extracted[1].fields.callsign?.value, "W1AW");
    assert.equal(extracted[1].fields.rstRcvd?.value, "599");
  });

  it("uses peerHint to return the counterparty in directed exchanges", () => {
    const fields = extractQsoFields("PA3XYZ DE DL2ABC RST 579", { peerHint: "DL2ABC" });
    assert.equal(fields.callsign?.value, "PA3XYZ");
  });
});

describe("lowConfidenceFields", () => {
  it("returns names of low-confidence extracted fields", () => {
    const fields = {
      callsign: { value: "PA3X?Z", confidence: "low" as const },
      rstRcvd: { value: "599", confidence: "high" as const },
    };
    assert.deepEqual(lowConfidenceFields(fields), ["callsign"]);
  });
});
