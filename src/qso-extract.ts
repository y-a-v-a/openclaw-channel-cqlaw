/**
 * Structured extraction from decoded QSO text (rule-based, no external dependencies).
 */

import { extractCallsigns, isCallsign } from "./callsign.js";
import { scoreConfidence, type Confidence } from "./fuzzy-match.js";
import { reconstructRst, reconstructSerial, reconstructZone } from "./context-reconstruct.js";

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

function extractCallsign(text: string, peerHint?: string): string | undefined {
  if (peerHint && isCallsign(peerHint)) {
    return peerHint.toUpperCase();
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
