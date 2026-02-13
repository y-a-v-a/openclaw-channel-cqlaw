/**
 * Persistent QSO memory store (JSON) for quick callsign lookup.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface QsoMemoryRecord {
  callsign: string;
  timestamp: string;
  frequency: number;
  band: string;
  note?: string;
}

interface QsoMemoryData {
  records: QsoMemoryRecord[];
}

export class QsoMemoryStore {
  private readonly filePath: string;
  private readonly records: QsoMemoryRecord[] = [];

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  initialize(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({ records: [] }, null, 2), "utf-8");
      return;
    }

    try {
      const content = fs.readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(content) as Partial<QsoMemoryData>;
      if (Array.isArray(parsed.records)) {
        for (const item of parsed.records) {
          if (item && typeof item.callsign === "string" && typeof item.timestamp === "string") {
            this.records.push({
              callsign: item.callsign.toUpperCase(),
              timestamp: item.timestamp,
              frequency: Number(item.frequency) || 0,
              band: typeof item.band === "string" ? item.band : "unknown",
              note: typeof item.note === "string" ? item.note : undefined,
            });
          }
        }
      }
    } catch {
      // If corrupted, start with in-memory empty and overwrite on next write.
    }
  }

  addRecord(record: QsoMemoryRecord): void {
    this.records.push({
      ...record,
      callsign: record.callsign.toUpperCase(),
    });
    this.flush();
  }

  getByCallsign(callsign: string): QsoMemoryRecord[] {
    const upper = callsign.toUpperCase();
    return this.records
      .filter((r) => r.callsign === upper)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  getAll(): ReadonlyArray<QsoMemoryRecord> {
    return this.records;
  }

  private flush(): void {
    const data: QsoMemoryData = { records: this.records };
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf-8");
  }
}
