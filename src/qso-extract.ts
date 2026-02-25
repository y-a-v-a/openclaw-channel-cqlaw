/**
 * Structured extraction from decoded QSO text (rule-based, no external dependencies).
 */

import { extractCallsigns, extractCqCalls, extractDirectedExchanges, isCallsign } from "./callsign.js";
import { scoreConfidence, type Confidence } from "./fuzzy-match.js";
import { reconstructRst, reconstructSerial, reconstructZone } from "./context-reconstruct.js";
import { getContestProfile, parseContestExchange } from "./contest.js";

export interface ExtractedField {
  value: string;
  confidence: Confidence;
}

export interface ExtractedQsoFields {
  callsign?: ExtractedField;
  rstRcvd?: ExtractedField;
  zone?: ExtractedField;
  serial?: ExtractedField;
  name?: ExtractedField;
  qth?: ExtractedField;
}

export interface QsoExtractOptions {
  peerHint?: string;
  previousSerial?: number;
}

export interface MultiQsoExtractEntry {
  segment: string;
  fields: ExtractedQsoFields;
}

const RST_PATTERN = /\b([1-5][1-9][1-9])\b/g;
const RST_NOISY_PATTERN = /\b([1-5?][1-9?][1-9?])\b/g;
const ZONE_PATTERN = /\b(?:ZONE|ZN|Z)\s+([0-9?]{1,2})\b/;
const SERIAL_PATTERN = /\b(?:NR|SER|SN)\s+([0-9?]{1,4})\b/;
const NAME_PATTERN = /\b(?:NAME|NM)\s+([A-Z]{2,12})\b/;
const QTH_PATTERN = /\bQTH\s+([A-Z0-9\/-]{2,20})\b/;

export function extractQsoFields(text: string, options: QsoExtractOptions = {}): ExtractedQsoFields {
  const upper = text.toUpperCase();
  const out: ExtractedQsoFields = {};

  const call = extractCallsign(upper, options.peerHint);
  if (call) {
    out.callsign = { value: call, confidence: scoreConfidence(call) };
  }

  const rst = extractRst(upper);
  if (rst) {
    out.rstRcvd = rst;
  }

  const zone = extractZone(upper, call);
  if (zone) {
    out.zone = zone;
  }

  const serial = extractSerial(upper, options.previousSerial);
  if (serial) {
    out.serial = serial;
  }

  const nameMatch = upper.match(NAME_PATTERN);
  if (nameMatch) {
    out.name = { value: nameMatch[1], confidence: scoreConfidence(nameMatch[1]) };
  }

  const qthMatch = upper.match(QTH_PATTERN);
  if (qthMatch) {
    out.qth = { value: qthMatch[1], confidence: scoreConfidence(qthMatch[1]) };
  }

  return out;
}

export function lowConfidenceFields(fields: ExtractedQsoFields): string[] {
  const results: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    const field = value as ExtractedField | undefined;
    if (field?.confidence === "low") {
      results.push(key);
    }
  }
  return results;
}

export function extractContestQsoFields(text: string, contestId: "CQWW" | "CQ-WPX"): ExtractedQsoFields {
  const profile = getContestProfile(contestId);
  if (!profile) return {};

  const parsed = parseContestExchange(text, profile);
  const out: ExtractedQsoFields = {};
  if (parsed.callsign) out.callsign = { value: parsed.callsign, confidence: scoreConfidence(parsed.callsign) };
  if (parsed.rst) out.rstRcvd = { value: parsed.rst, confidence: scoreConfidence(parsed.rst) };
  if (parsed.zone !== undefined) out.zone = { value: String(parsed.zone), confidence: "high" };
  if (parsed.serial !== undefined) out.serial = { value: String(parsed.serial), confidence: "high" };
  return out;
}

export function splitQsoTranscript(transcript: string): string[] {
  const normalized = transcript.toUpperCase().replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const segments: string[] = [];
  const tokens = normalized.split(" ");
  let current: string[] = [];

  for (const token of tokens) {
    current.push(token);
    if (token === "SK" || token === "AR") {
      const segment = current.join(" ").trim();
      if (segment) segments.push(segment);
      current = [];
    }
  }

  if (current.length > 0) {
    const tail = current.join(" ").trim();
    if (tail) segments.push(tail);
  }

  return segments;
}

export function extractMultipleQsoFields(
  transcript: string,
  options: { contestId?: "CQWW" | "CQ-WPX"; peerHint?: string; previousSerial?: number } = {},
): MultiQsoExtractEntry[] {
  const segments = splitQsoTranscript(transcript);
  let previousSerial = options.previousSerial;

  return segments.map((segment) => {
    const fields = options.contestId
      ? extractContestQsoFields(segment, options.contestId)
      : extractQsoFields(segment, { peerHint: options.peerHint, previousSerial });
    if (fields.serial?.value) {
      const parsed = Number.parseInt(fields.serial.value, 10);
      if (Number.isFinite(parsed)) previousSerial = parsed;
    }
    return { segment, fields };
  });
}

function extractCallsign(text: string, peerHint?: string): string | undefined {
  const normalizedHint = peerHint && isCallsign(peerHint) ? peerHint.toUpperCase() : undefined;

  // Directed exchange: "<to> DE <from>".
  // For logging, prefer the counterparty callsign.
  const directed = extractDirectedExchanges(text);
  if (directed.length > 0) {
    const last = directed[directed.length - 1];
    if (normalizedHint) {
      if (last.to === normalizedHint) return last.from;
      if (last.from === normalizedHint) return last.to;
    }
    return last.to;
  }

  // CQ pattern: "CQ ... DE <call>".
  const cqCalls = extractCqCalls(text);
  if (cqCalls.length > 0) {
    return cqCalls[cqCalls.length - 1].from;
  }

  if (normalizedHint) {
    return normalizedHint;
  }

  const calls = extractCallsigns(text);
  if (calls.length === 0) return undefined;
  return calls[calls.length - 1].callsign;
}

function extractZone(text: string, callsign?: string): ExtractedField | undefined {
  const zoneMatch = text.match(ZONE_PATTERN);
  const reconstructed = reconstructZone(zoneMatch?.[1], callsign);
  if (!reconstructed) return undefined;
  return reconstructed;
}

function extractSerial(text: string, previousSerial?: number): ExtractedField | undefined {
  const serialMatch = text.match(SERIAL_PATTERN);
  const reconstructed = reconstructSerial(serialMatch?.[1], previousSerial);
  if (!reconstructed) return undefined;
  return reconstructed;
}

function extractRst(text: string): ExtractedField | undefined {
  const clean = Array.from(text.matchAll(RST_PATTERN));
  if (clean.length > 0) {
    const value = clean[0][1];
    return { value, confidence: scoreConfidence(value) };
  }

  const noisy = Array.from(text.matchAll(RST_NOISY_PATTERN));
  if (noisy.length === 0) return undefined;
  const reconstructed = reconstructRst(noisy[0][1]);
  if (!reconstructed) return undefined;
  return reconstructed;
}
