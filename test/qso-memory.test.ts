import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { QsoMemoryStore } from "../src/qso-memory.js";

describe("QsoMemoryStore", () => {
  const tempPaths: string[] = [];

  afterEach(() => {
    for (const p of tempPaths) {
      try {
        fs.rmSync(path.dirname(p), { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    tempPaths.length = 0;
  });

  it("persists records and can query by callsign", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qso-memory-"));
    const filePath = path.join(dir, "memory.json");
    tempPaths.push(filePath);

    const store = new QsoMemoryStore(filePath);
    store.initialize();
    store.addRecord({
      callsign: "DL2ABC",
      timestamp: "2026-02-13T10:00:00.000Z",
      frequency: 7030000,
      band: "40m",
    });

    const reloaded = new QsoMemoryStore(filePath);
    reloaded.initialize();
    const matches = reloaded.getByCallsign("dl2abc");
    assert.equal(matches.length, 1);
    assert.equal(matches[0].callsign, "DL2ABC");
  });
});
