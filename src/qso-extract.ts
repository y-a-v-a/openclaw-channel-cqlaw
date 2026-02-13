/**
 * Structured extraction from decoded QSO text (rule-based, no external dependencies).
 */

import { extractCallsigns, isCallsign } from "./callsign.js";
import { scoreConfidence, type Confidence } from "./fuzzy-match.js";

export interface ExtractedField {
  value: string;
  confidence: Confidence;
}

export interface ExtractedQsoFields {
  callsign?: ExtractedField;
  rstRcvd?: ExtractedField;
  name?: ExtractedField;
  qth?: ExtractedField;
}

export interface QsoExtractOptions {
  peerHint?: string;
}

const RST_PATTERN = /\b([1-5][1-9][1-9])\b/g;
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
    out.rstRcvd = { value: rst, confidence: scoreConfidence(rst) };
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

function extractRst(text: string): string | undefined {
  const matches = Array.from(text.matchAll(RST_PATTERN));
  if (matches.length === 0) return undefined;
  return matches[0][1];
}
