/**
 * Contextual reconstruction helpers for noisy decoded fields.
 */

import type { Confidence } from "./fuzzy-match.js";

export interface ReconstructedValue {
  value: string;
  confidence: Confidence;
}

const PREFIX_TO_CQ_ZONE: Array<{ prefixes: string[]; zone: number }> = [
  { prefixes: ["K", "N", "W", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AI", "AJ", "AK"], zone: 5 },
  { prefixes: ["VE", "VA"], zone: 4 },
  { prefixes: ["PA", "PB", "PC", "PD", "PE", "PF", "PG", "PH", "PI"], zone: 14 },
  { prefixes: ["DL", "DA", "DB", "DC", "DD", "DE", "DF", "DG", "DH", "DJ", "DK", "DM", "DN", "DO", "DP", "DQ", "DR"], zone: 14 },
  { prefixes: ["F", "TM", "TK"], zone: 14 },
  { prefixes: ["G", "M", "2E"], zone: 14 },
  { prefixes: ["JA", "7J", "8J"], zone: 25 },
  { prefixes: ["VK"], zone: 30 },
];

/**
 * Reconstruct a noisy RST token.
 * Example: 5?9 -> 599, ?79 -> 579, ??? -> 599
 */
export function reconstructRst(raw: string): ReconstructedValue | null {
  const token = raw.toUpperCase().trim();
  if (!/^[1-5?][1-9?][1-9?]$/.test(token)) {
    return null;
  }
  if (!token.includes("?")) {
    return { value: token, confidence: "high" };
  }

  const chars = token.split("");
  if (chars[0] === "?") chars[0] = "5";
  if (chars[1] === "?") chars[1] = "9";
  if (chars[2] === "?") chars[2] = "9";
  return { value: chars.join(""), confidence: "medium" };
}

export function inferCqZoneFromCallsign(callsign: string): number | null {
  const upper = callsign.toUpperCase();
  for (const rule of PREFIX_TO_CQ_ZONE) {
    if (rule.prefixes.some((p) => upper.startsWith(p))) {
      return rule.zone;
    }
  }
  return null;
}

/**
 * Reconcile a decoded zone with callsign-based expectation.
 * Keeps decoded zone when it looks valid and close enough, otherwise uses inferred.
 */
export function reconstructZone(decoded: string | undefined, callsign: string | undefined): ReconstructedValue | null {
  const inferred = callsign ? inferCqZoneFromCallsign(callsign) : null;
  if (!decoded) {
    if (inferred === null) return null;
    return { value: String(inferred), confidence: "medium" };
  }

  const cleaned = decoded.replace(/\?/g, "").trim();
  if (/^\d{1,2}$/.test(cleaned)) {
    const zone = parseInt(cleaned, 10);
    if (zone >= 1 && zone <= 40) {
      if (inferred !== null && Math.abs(zone - inferred) > 5) {
        return { value: String(inferred), confidence: "medium" };
      }
      return { value: String(zone), confidence: decoded.includes("?") ? "medium" : "high" };
    }
  }

  if (inferred !== null) {
    return { value: String(inferred), confidence: "medium" };
  }
  return null;
}

/**
 * Reconstruct contest serial, enforcing monotonic behavior when prior serial exists.
 */
export function reconstructSerial(decoded: string | undefined, previousSerial?: number): ReconstructedValue | null {
  if (!decoded && previousSerial === undefined) return null;
  if (!decoded && previousSerial !== undefined) {
    return { value: String(previousSerial + 1), confidence: "medium" };
  }

  const cleaned = (decoded ?? "").replace(/\?/g, "").trim();
  if (!/^\d{1,4}$/.test(cleaned)) {
    if (previousSerial !== undefined) {
      return { value: String(previousSerial + 1), confidence: "low" };
    }
    return null;
  }

  const parsed = parseInt(cleaned, 10);
  if (previousSerial !== undefined && parsed <= previousSerial) {
    return { value: String(previousSerial + 1), confidence: "medium" };
  }
  return { value: String(parsed), confidence: decoded?.includes("?") ? "medium" : "high" };
}
