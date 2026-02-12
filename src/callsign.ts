/**
 * Amateur radio callsign extraction from decoded CW text.
 *
 * Callsign structure: 1-2 letter prefix, 1 digit, 1-3 letter suffix.
 * Examples: W1AW, PA3XYZ, VU2ABC, JA1ABC, 4X6TT, 9A1A.
 * Compound suffixes: PA3XYZ/P (portable), DL2ABC/MM (maritime mobile), W1AW/4.
 */

/**
 * Matches standard amateur radio callsigns.
 *
 * Pattern breakdown:
 *   [A-Z0-9]{1,2}  — prefix (1-2 alphanumeric, e.g. PA, W, 4X, 9A)
 *   \d              — mandatory single digit
 *   [A-Z]{1,4}     — suffix (1-4 letters)
 *   (?:\/\w+)?      — optional compound modifier (/P, /MM, /4, etc.)
 */
const CALLSIGN_PATTERN = /\b([A-Z0-9]{1,2}\d[A-Z]{1,4}(?:\/\w+)?)\b/g;

/** "CQ CQ DE PA3XYZ" or "CQ DE PA3XYZ" — extract the calling station */
const CQ_DE_PATTERN = /\bCQ(?:\s+CQ)*\s+DE\s+([A-Z0-9]{1,2}\d[A-Z]{1,4}(?:\/\w+)?)\b/g;

/** "<call> DE <call>" — extract both sides of a directed exchange */
const CALL_DE_CALL_PATTERN = /\b([A-Z0-9]{1,2}\d[A-Z]{1,4}(?:\/\w+)?)\s+DE\s+([A-Z0-9]{1,2}\d[A-Z]{1,4}(?:\/\w+)?)\b/g;

export interface CallsignMatch {
  callsign: string;
  /** Index in the source string where the callsign starts */
  index: number;
}

export interface DirectedExchange {
  /** Station being called */
  to: string;
  /** Station calling (after DE) */
  from: string;
}

export interface CqCall {
  /** Station calling CQ */
  from: string;
}

/**
 * Find all callsign-shaped tokens in a string.
 * Returns them in order of appearance.
 */
export function extractCallsigns(text: string): CallsignMatch[] {
  const upper = text.toUpperCase();
  const results: CallsignMatch[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  CALLSIGN_PATTERN.lastIndex = 0;

  while ((match = CALLSIGN_PATTERN.exec(upper)) !== null) {
    const callsign = match[1];
    if (!seen.has(callsign)) {
      seen.add(callsign);
      results.push({ callsign, index: match.index });
    }
  }

  return results;
}

/**
 * Detect "CQ ... DE <callsign>" patterns.
 * Returns the station(s) calling CQ.
 */
export function extractCqCalls(text: string): CqCall[] {
  const upper = text.toUpperCase();
  const results: CqCall[] = [];

  let match: RegExpExecArray | null;
  CQ_DE_PATTERN.lastIndex = 0;

  while ((match = CQ_DE_PATTERN.exec(upper)) !== null) {
    results.push({ from: match[1] });
  }

  return results;
}

/**
 * Detect "<call> DE <call>" patterns (directed exchanges).
 * Returns both sides of the exchange.
 */
export function extractDirectedExchanges(text: string): DirectedExchange[] {
  const upper = text.toUpperCase();
  const results: DirectedExchange[] = [];

  let match: RegExpExecArray | null;
  CALL_DE_CALL_PATTERN.lastIndex = 0;

  while ((match = CALL_DE_CALL_PATTERN.exec(upper)) !== null) {
    results.push({ to: match[1], from: match[2] });
  }

  return results;
}

/**
 * Check whether a string looks like a valid amateur radio callsign.
 */
export function isCallsign(text: string): boolean {
  const upper = text.toUpperCase().trim();
  const pattern = /^[A-Z0-9]{1,2}\d[A-Z]{1,4}(?:\/\w+)?$/;
  return pattern.test(upper);
}
