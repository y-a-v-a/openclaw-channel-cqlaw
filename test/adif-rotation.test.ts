import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { RotatingAdifLogger, createRecord } from "../src/adif.js";

describe("RotatingAdifLogger", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    tempDirs.length = 0;
  });

  it("uses daily suffix when policy is daily", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adif-rotate-"));
    tempDirs.push(dir);
    const logger = new RotatingAdifLogger({
      basePath: path.join(dir, "log.adi"),
      policy: "daily",
    });
    const p = logger.resolvePath(new Date("2026-02-13T00:00:00.000Z"));
    assert.ok(p.endsWith("log-20260213.adi"));
  });

  it("uses monthly suffix when policy is monthly", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adif-rotate-"));
    tempDirs.push(dir);
    const logger = new RotatingAdifLogger({
      basePath: path.join(dir, "log.adi"),
      policy: "monthly",
    });
    const p = logger.resolvePath(new Date("2026-02-13T00:00:00.000Z"));
    assert.ok(p.endsWith("log-202602.adi"));
  });

  it("rotates size-based logs after maxBytes", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adif-rotate-"));
    tempDirs.push(dir);
    const logger = new RotatingAdifLogger({
      basePath: path.join(dir, "log.adi"),
      policy: "size",
      maxBytes: 80,
    });

    logger.initialize();
    logger.log(createRecord("DL2ABC", 7030000));
    logger.log(createRecord("W1AW", 7030000));
    logger.log(createRecord("PA3XYZ", 7030000));

    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".adi"));
    assert.ok(files.includes("log-001.adi"));
    assert.ok(files.includes("log-002.adi"));
  });
});
