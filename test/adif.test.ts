import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  encodeField,
  encodeRecord,
  encodeHeader,
  frequencyToBand,
  frequencyToMhz,
  createRecord,
  AdifLogger,
  type AdifRecord,
} from "../src/adif.js";

describe("encodeField", () => {
  it("encodes a field with correct length", () => {
    assert.equal(encodeField("CALL", "DL2ABC"), "<CALL:6>DL2ABC");
  });

  it("handles empty value", () => {
    assert.equal(encodeField("NAME", ""), "<NAME:0>");
  });

  it("handles values with spaces", () => {
    assert.equal(encodeField("QTH", "New York"), "<QTH:8>New York");
  });
});

describe("encodeRecord", () => {
  it("encodes a complete record with EOR", () => {
    const record: AdifRecord = {
      call: "DL2ABC",
      qsoDate: "20260212",
      timeOn: "213000",
      band: "40m",
      freq: "7.030",
      mode: "CW",
      rstSent: "599",
      rstRcvd: "579",
      name: "Hans",
      qth: "Munich",
    };
    const encoded = encodeRecord(record);
    assert.ok(encoded.includes("<CALL:6>DL2ABC"));
    assert.ok(encoded.includes("<QSO_DATE:8>20260212"));
    assert.ok(encoded.includes("<TIME_ON:6>213000"));
    assert.ok(encoded.includes("<BAND:3>40m"));
    assert.ok(encoded.includes("<FREQ:5>7.030"));
    assert.ok(encoded.includes("<MODE:2>CW"));
    assert.ok(encoded.includes("<RST_SENT:3>599"));
    assert.ok(encoded.includes("<RST_RCVD:3>579"));
    assert.ok(encoded.includes("<NAME:4>Hans"));
    assert.ok(encoded.includes("<QTH:6>Munich"));
    assert.ok(encoded.endsWith("<EOR>\n"));
  });

  it("skips undefined optional fields", () => {
    const record: AdifRecord = {
      call: "W1AW",
      qsoDate: "20260212",
      timeOn: "120000",
      band: "20m",
      mode: "CW",
    };
    const encoded = encodeRecord(record);
    assert.ok(encoded.includes("<CALL:4>W1AW"));
    assert.ok(!encoded.includes("RST_SENT"));
    assert.ok(!encoded.includes("NAME"));
    assert.ok(encoded.endsWith("<EOR>\n"));
  });
});

describe("encodeHeader", () => {
  it("includes ADIF version", () => {
    const header = encodeHeader();
    assert.ok(header.includes("<ADIF_VER:5>3.1.4"));
  });

  it("includes program ID", () => {
    const header = encodeHeader();
    assert.ok(header.includes("<PROGRAMID:14>openclaw-cqlaw"));
  });

  it("ends with EOH", () => {
    const header = encodeHeader();
    assert.ok(header.includes("<EOH>"));
  });
});

describe("frequencyToBand", () => {
  it("maps 7.030 MHz to 40m", () => {
    assert.equal(frequencyToBand(7030000), "40m");
  });

  it("maps 14.060 MHz to 20m", () => {
    assert.equal(frequencyToBand(14060000), "20m");
  });

  it("maps 3.560 MHz to 80m", () => {
    assert.equal(frequencyToBand(3560000), "80m");
  });

  it("maps 21.060 MHz to 15m", () => {
    assert.equal(frequencyToBand(21060000), "15m");
  });

  it("maps 28.060 MHz to 10m", () => {
    assert.equal(frequencyToBand(28060000), "10m");
  });

  it("returns null for unknown frequency", () => {
    assert.equal(frequencyToBand(100000), null);
  });

  it("maps band edges correctly", () => {
    assert.equal(frequencyToBand(7000000), "40m");
    assert.equal(frequencyToBand(7300000), "40m");
    assert.equal(frequencyToBand(14000000), "20m");
    assert.equal(frequencyToBand(14350000), "20m");
  });
});

describe("frequencyToMhz", () => {
  it("converts Hz to MHz string", () => {
    assert.equal(frequencyToMhz(7030000), "7.030");
  });

  it("handles 14.060 MHz", () => {
    assert.equal(frequencyToMhz(14060000), "14.060");
  });
});

describe("createRecord", () => {
  it("creates a record with auto-derived band and freq", () => {
    const now = new Date("2026-02-12T21:30:00Z");
    const record = createRecord("DL2ABC", 7030000, { startTime: now, rstSent: "599" });
    assert.equal(record.call, "DL2ABC");
    assert.equal(record.band, "40m");
    assert.equal(record.freq, "7.030");
    assert.equal(record.mode, "CW");
    assert.equal(record.qsoDate, "20260212");
    assert.equal(record.timeOn, "213000");
    assert.equal(record.rstSent, "599");
  });

  it("uppercases the callsign", () => {
    const record = createRecord("dl2abc", 7030000);
    assert.equal(record.call, "DL2ABC");
  });
});

describe("AdifLogger", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("creates a new log file with header on initialize", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adif-test-"));
    const filePath = path.join(tmpDir, "test.adi");
    const logger = new AdifLogger(filePath);
    logger.initialize();

    assert.ok(fs.existsSync(filePath));
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(content.includes("<ADIF_VER:5>3.1.4"));
    assert.ok(content.includes("<EOH>"));
  });

  it("appends a record to the log file", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adif-test-"));
    const filePath = path.join(tmpDir, "test.adi");
    const logger = new AdifLogger(filePath);
    logger.initialize();

    const record = createRecord("DL2ABC", 7030000, {
      startTime: new Date("2026-02-12T21:30:00Z"),
      rstSent: "599",
      rstRcvd: "579",
    });
    logger.log(record);

    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(content.includes("<CALL:6>DL2ABC"));
    assert.ok(content.includes("<EOR>"));
  });

  it("detects dupes by callsign and band", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adif-test-"));
    const filePath = path.join(tmpDir, "test.adi");
    const logger = new AdifLogger(filePath);
    logger.initialize();

    const record = createRecord("DL2ABC", 7030000);
    logger.log(record);

    assert.equal(logger.isDupe("DL2ABC", "40m"), true);
    assert.equal(logger.isDupe("DL2ABC", "20m"), false);
    assert.equal(logger.isDupe("W1AW", "40m"), false);
  });

  it("dupe check is case-insensitive", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adif-test-"));
    const filePath = path.join(tmpDir, "test.adi");
    const logger = new AdifLogger(filePath);
    logger.initialize();

    logger.log(createRecord("DL2ABC", 7030000));
    assert.equal(logger.isDupe("dl2abc", "40m"), true);
  });

  it("loads existing records from file", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adif-test-"));
    const filePath = path.join(tmpDir, "test.adi");

    // Write a file manually
    const header = encodeHeader();
    const record = encodeRecord(createRecord("DL2ABC", 7030000));
    const record2 = encodeRecord(createRecord("W1AW", 14060000));
    fs.writeFileSync(filePath, header + record + record2, "utf-8");

    // Load into a new logger
    const logger = new AdifLogger(filePath);
    logger.loadExisting();

    assert.equal(logger.getRecords().length, 2);
    assert.equal(logger.isDupe("DL2ABC", "40m"), true);
    assert.equal(logger.isDupe("W1AW", "20m"), true);
  });

  it("creates parent directories if they don't exist", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adif-test-"));
    const filePath = path.join(tmpDir, "subdir", "deep", "test.adi");
    const logger = new AdifLogger(filePath);
    logger.initialize();

    assert.ok(fs.existsSync(filePath));
  });

  it("does not overwrite existing file on initialize", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adif-test-"));
    const filePath = path.join(tmpDir, "test.adi");

    const logger1 = new AdifLogger(filePath);
    logger1.initialize();
    logger1.log(createRecord("DL2ABC", 7030000));

    // Re-initialize should not wipe the file
    const logger2 = new AdifLogger(filePath);
    logger2.initialize();

    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(content.includes("<CALL:6>DL2ABC"));
  });
});
