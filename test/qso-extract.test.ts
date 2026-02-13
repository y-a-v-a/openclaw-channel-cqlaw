import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractQsoFields, lowConfidenceFields } from "../src/qso-extract.js";

describe("extractQsoFields", () => {
  it("extracts callsign, rst, name, and qth from transcript text", () => {
    const fields = extractQsoFields("DL2ABC DE PA3XYZ UR RST 579 NAME HANS QTH MUNICH ZN 14 NR 0012 K");
    assert.equal(fields.callsign?.value, "PA3XYZ");
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
