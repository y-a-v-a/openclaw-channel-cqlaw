/**
 * Cabrillo export helpers.
 * Format reference: common Cabrillo 3.0 header + QSO lines for CW contests.
 */

export interface CabrilloHeader {
  contestId: string;
  callsign: string;
  categoryOperator?: string;
  categoryBand?: string;
  categoryPower?: string;
  categoryMode?: string;
  categoryTransmitter?: string;
  categoryOverlay?: string;
  club?: string;
  operators?: string[];
  name?: string;
  email?: string;
  location?: string;
  soapbox?: string[];
  createdBy?: string;
}

export interface CabrilloQso {
  timestamp: Date;
  band: string;
  ownCallsign: string;
  theirCallsign: string;
  sentRst?: string;
  sentExchange?: string;
  rcvdRst?: string;
  rcvdExchange?: string;
}

export function exportCabrillo(header: CabrilloHeader, qsos: CabrilloQso[]): string {
  const lines: string[] = [
    "START-OF-LOG: 3.0",
    `CREATED-BY: ${header.createdBy ?? "cqlaw"}`,
    `CONTEST: ${header.contestId}`,
    `CALLSIGN: ${header.callsign.toUpperCase()}`,
  ];

  appendOptional(lines, "CATEGORY-OPERATOR", header.categoryOperator);
  appendOptional(lines, "CATEGORY-BAND", header.categoryBand);
  appendOptional(lines, "CATEGORY-POWER", header.categoryPower);
  appendOptional(lines, "CATEGORY-MODE", header.categoryMode);
  appendOptional(lines, "CATEGORY-TRANSMITTER", header.categoryTransmitter);
  appendOptional(lines, "CATEGORY-OVERLAY", header.categoryOverlay);
  appendOptional(lines, "CLUB", header.club);
  appendOptional(lines, "NAME", header.name);
  appendOptional(lines, "EMAIL", header.email);
  appendOptional(lines, "LOCATION", header.location);

  if (header.operators && header.operators.length > 0) {
    lines.push(`OPERATORS: ${header.operators.join(",").toUpperCase()}`);
  }

  if (header.soapbox) {
    for (const line of header.soapbox) {
      lines.push(`SOAPBOX: ${line}`);
    }
  }

  for (const qso of qsos) {
    lines.push(encodeQsoLine(qso));
  }

  lines.push("END-OF-LOG:");
  return `${lines.join("\n")}\n`;
}

function encodeQsoLine(qso: CabrilloQso): string {
  const freq = bandToFrequencyKhz(qso.band).padStart(5, " ");
  const date = toDate(qso.timestamp);
  const time = toTime(qso.timestamp);
  const sentRst = (qso.sentRst ?? "599").padEnd(3, " ");
  const sentExchange = (qso.sentExchange ?? "000").padEnd(6, " ");
  const rcvdRst = (qso.rcvdRst ?? "599").padEnd(3, " ");
  const rcvdExchange = (qso.rcvdExchange ?? "").trim();
  return `QSO: ${freq} CW ${date} ${time} ${qso.ownCallsign.toUpperCase().padEnd(13, " ")} ${sentRst} ${sentExchange} ${qso.theirCallsign.toUpperCase().padEnd(13, " ")} ${rcvdRst} ${rcvdExchange}`.trimEnd();
}

function appendOptional(lines: string[], key: string, value: string | undefined): void {
  if (value && value.trim() !== "") {
    lines.push(`${key}: ${value.toUpperCase()}`);
  }
}

function toDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTime(value: Date): string {
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hours}${minutes}`;
}

function bandToFrequencyKhz(band: string): string {
  switch (band) {
    case "160m": return "1800";
    case "80m": return "3500";
    case "40m": return "7000";
    case "20m": return "14000";
    case "15m": return "21000";
    case "10m": return "28000";
    case "6m": return "50000";
    default: return "00000";
  }
}
