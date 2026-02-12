/**
 * ADIF (Amateur Data Interchange Format) writer.
 *
 * Writes ham radio contact logs in ADIF 3.1.4 format.
 * Spec: https://adif.org/314/ADIF_314.htm
 *
 * Format is simple: <FIELDNAME:LENGTH>VALUE per field, <EOR> per record.
 * Header has <ADIF_VER>, <PROGRAMID>, and ends with <EOH>.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/** Standard ADIF field names used in CW QSO logging */
export interface AdifRecord {
  call: string;
  qsoDate: string;       // YYYYMMDD
  timeOn: string;         // HHMMSS UTC
  timeOff?: string;       // HHMMSS UTC
  band: string;           // e.g. "40m"
  freq?: string;          // MHz, e.g. "7.030"
  mode: string;           // e.g. "CW"
  rstSent?: string;       // e.g. "599"
  rstRcvd?: string;       // e.g. "579"
  name?: string;
  qth?: string;
  gridsquare?: string;    // Maidenhead grid locator
  comment?: string;
  txPwr?: string;
  contestId?: string;
  srx?: string;           // Received serial number (contest)
  stx?: string;           // Sent serial number (contest)
}

/** Map from AdifRecord keys to ADIF field names */
const FIELD_MAP: Record<keyof AdifRecord, string> = {
  call: "CALL",
  qsoDate: "QSO_DATE",
  timeOn: "TIME_ON",
  timeOff: "TIME_OFF",
  band: "BAND",
  freq: "FREQ",
  mode: "MODE",
  rstSent: "RST_SENT",
  rstRcvd: "RST_RCVD",
  name: "NAME",
  qth: "QTH",
  gridsquare: "GRIDSQUARE",
  comment: "COMMENT",
  txPwr: "TX_PWR",
  contestId: "CONTEST_ID",
  srx: "SRX",
  stx: "STX",
};

/** Encode a single ADIF field: <FIELDNAME:LENGTH>VALUE */
export function encodeField(name: string, value: string): string {
  return `<${name}:${value.length}>${value}`;
}

/** Encode a full ADIF record (one QSO), terminated by <EOR> */
export function encodeRecord(record: AdifRecord): string {
  const fields: string[] = [];
  for (const [key, fieldName] of Object.entries(FIELD_MAP)) {
    const value = record[key as keyof AdifRecord];
    if (value !== undefined && value !== "") {
      fields.push(encodeField(fieldName, value));
    }
  }
  return fields.join(" ") + " <EOR>\n";
}

/** Generate the ADIF file header */
export function encodeHeader(): string {
  const lines = [
    encodeField("ADIF_VER", "3.1.4"),
    encodeField("PROGRAMID", "openclaw-cqlaw"),
    encodeField("PROGRAMVERSION", "0.1.0"),
    "<EOH>\n",
  ];
  return lines.join("\n");
}

/**
 * Frequency (Hz) to band name mapping.
 * Covers HF amateur bands used for CW.
 */
const BAND_TABLE: Array<{ minHz: number; maxHz: number; band: string }> = [
  { minHz: 1800000, maxHz: 2000000, band: "160m" },
  { minHz: 3500000, maxHz: 4000000, band: "80m" },
  { minHz: 5250000, maxHz: 5450000, band: "60m" },
  { minHz: 7000000, maxHz: 7300000, band: "40m" },
  { minHz: 10100000, maxHz: 10150000, band: "30m" },
  { minHz: 14000000, maxHz: 14350000, band: "20m" },
  { minHz: 18068000, maxHz: 18168000, band: "17m" },
  { minHz: 21000000, maxHz: 21450000, band: "15m" },
  { minHz: 24890000, maxHz: 24990000, band: "12m" },
  { minHz: 28000000, maxHz: 29700000, band: "10m" },
  { minHz: 50000000, maxHz: 54000000, band: "6m" },
];

/** Convert a frequency in Hz to a band name (e.g. 7030000 → "40m") */
export function frequencyToBand(hz: number): string | null {
  for (const entry of BAND_TABLE) {
    if (hz >= entry.minHz && hz <= entry.maxHz) {
      return entry.band;
    }
  }
  return null;
}

/** Convert a frequency in Hz to MHz string (e.g. 7030000 → "7.030") */
export function frequencyToMhz(hz: number): string {
  return (hz / 1_000_000).toFixed(3);
}

/**
 * Create an AdifRecord from QSO data and a frequency in Hz.
 * Automatically derives band and freq fields.
 */
export function createRecord(
  call: string,
  frequencyHz: number,
  options?: Partial<Omit<AdifRecord, "call" | "band" | "freq" | "mode" | "qsoDate" | "timeOn">> & {
    startTime?: Date;
    endTime?: Date;
  }
): AdifRecord {
  const start = options?.startTime ?? new Date();
  const band = frequencyToBand(frequencyHz) ?? "unknown";
  const freq = frequencyToMhz(frequencyHz);

  const record: AdifRecord = {
    call: call.toUpperCase(),
    qsoDate: formatDate(start),
    timeOn: formatTime(start),
    band,
    freq,
    mode: "CW",
  };

  if (options?.endTime) {
    record.timeOff = formatTime(options.endTime);
  }
  if (options?.rstSent) record.rstSent = options.rstSent;
  if (options?.rstRcvd) record.rstRcvd = options.rstRcvd;
  if (options?.name) record.name = options.name;
  if (options?.qth) record.qth = options.qth;
  if (options?.gridsquare) record.gridsquare = options.gridsquare;
  if (options?.comment) record.comment = options.comment;
  if (options?.txPwr) record.txPwr = options.txPwr;
  if (options?.contestId) record.contestId = options.contestId;
  if (options?.srx) record.srx = options.srx;
  if (options?.stx) record.stx = options.stx;

  return record;
}

function formatDate(d: Date): string {
  return d.getUTCFullYear().toString() +
    (d.getUTCMonth() + 1).toString().padStart(2, "0") +
    d.getUTCDate().toString().padStart(2, "0");
}

function formatTime(d: Date): string {
  return d.getUTCHours().toString().padStart(2, "0") +
    d.getUTCMinutes().toString().padStart(2, "0") +
    d.getUTCSeconds().toString().padStart(2, "0");
}

/**
 * ADIF log file writer. Appends records to a file on disk.
 */
export class AdifLogger {
  private readonly filePath: string;
  private readonly records: AdifRecord[] = [];

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /** Ensure the log file exists with a valid header. */
  initialize(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, encodeHeader(), "utf-8");
      console.log(`[adif] Created log file: ${this.filePath}`);
    }
  }

  /** Append a QSO record to the log file. */
  log(record: AdifRecord): void {
    this.records.push(record);
    fs.appendFileSync(this.filePath, encodeRecord(record), "utf-8");
    console.log(`[adif] Logged QSO with ${record.call} on ${record.band}`);
  }

  /** Check if a callsign has already been worked on a given band. */
  isDupe(call: string, band: string): boolean {
    const upperCall = call.toUpperCase();
    return this.records.some(
      (r) => r.call.toUpperCase() === upperCall && r.band === band
    );
  }

  /** Get all logged records (in-memory). */
  getRecords(): ReadonlyArray<AdifRecord> {
    return this.records;
  }

  /** Load existing records from the ADIF file into memory for dupe checking. */
  loadExisting(): void {
    if (!fs.existsSync(this.filePath)) return;
    const content = fs.readFileSync(this.filePath, "utf-8");
    // Skip past header (everything before <EOH>)
    const headerEnd = content.toUpperCase().indexOf("<EOH>");
    if (headerEnd === -1) return;
    const body = content.substring(headerEnd + 5);
    // Split into records by <EOR>
    const recordChunks = body.split(/<EOR>/i).filter((s) => s.trim());
    for (const chunk of recordChunks) {
      const record = parseRecordChunk(chunk);
      if (record) this.records.push(record);
    }
    console.log(`[adif] Loaded ${this.records.length} existing records from ${this.filePath}`);
  }
}

/** Parse a single ADIF record chunk into an AdifRecord (best-effort). */
function parseRecordChunk(chunk: string): AdifRecord | null {
  const fields = new Map<string, string>();
  const regex = /<([A-Z_]+):(\d+)>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(chunk)) !== null) {
    const fieldName = match[1].toUpperCase();
    const length = parseInt(match[2], 10);
    const valueStart = match.index + match[0].length;
    const value = chunk.substring(valueStart, valueStart + length);
    fields.set(fieldName, value);
  }

  const call = fields.get("CALL");
  if (!call) return null;

  return {
    call,
    qsoDate: fields.get("QSO_DATE") ?? "",
    timeOn: fields.get("TIME_ON") ?? "",
    timeOff: fields.get("TIME_OFF"),
    band: fields.get("BAND") ?? "",
    freq: fields.get("FREQ"),
    mode: fields.get("MODE") ?? "CW",
    rstSent: fields.get("RST_SENT"),
    rstRcvd: fields.get("RST_RCVD"),
    name: fields.get("NAME"),
    qth: fields.get("QTH"),
    gridsquare: fields.get("GRIDSQUARE"),
    comment: fields.get("COMMENT"),
    txPwr: fields.get("TX_PWR"),
    contestId: fields.get("CONTEST_ID"),
    srx: fields.get("SRX"),
    stx: fields.get("STX"),
  };
}
