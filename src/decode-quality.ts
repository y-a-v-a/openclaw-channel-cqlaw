/**
 * Helpers for cleaning noisy CW decode output and scoring confidence.
 */

import type { Confidence } from "./fuzzy-match.js";

const HEAVY_PUNCTUATION_RUN = /[=~*#]{2,}/g;
const NON_PRINTABLE = /[^\x20-\x7E]+/g;
const NOISE_TOKEN = /\b[=~*#@]{2,}\b/g;

/**
 * Best-effort cleanup for common fldigi noise artifacts.
 * Keeps valid CW content while stripping obvious junk bursts.
 */
export function filterDecodeNoise(text: string): string {
  return text
    .toUpperCase()
    .replace(NON_PRINTABLE, " ")
    .replace(HEAVY_PUNCTUATION_RUN, " ")
    .replace(NOISE_TOKEN, " ")
    .replace(/\?{3,}/g, " ? ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Confidence for a full decoded message.
 * Uses the ratio of uncertain/noisy characters to visible payload.
 */
export function scoreMessageConfidence(text: string): Confidence {
  const normalized = text.trim();
  if (normalized.length === 0) return "low";

  const visible = normalized.replace(/\s+/g, "");
  if (visible.length === 0) return "low";

  const uncertainCount =
    (normalized.match(/\?/g) || []).length +
    (normalized.match(/[=~*#]/g) || []).length;

  const ratio = uncertainCount / visible.length;
  if (ratio <= 0.05) return "high";
  if (ratio <= 0.2) return "medium";
  return "low";
}
