/**
 * Amateur radio callsign extraction from decoded CW text.
 *
 * Supports common standard callsigns and practical contest/special-event variants:
 * - Standard: W1AW, PA3XYZ, VU2ABC, JA1ABC, 4X6TT, 9A1A
 * - Special event: GB13YOTA, II0IARU
 * - Portable/mobile: PA3XYZ/P, DL2ABC/MM, W1AW/4
 * - DX prefix form: EA8/ON4UN
 */

/**
 * Base callsign variants:
 * - Standard: 1-3 alphanumeric prefix, 1 digit, 1-5 letter suffix
 * - Special-event/contest variant: 1-2 letter prefix, 2 digits, 1-6 letter suffix
 *
 * Wrapped callsign forms:
 * - Optional DX prefix before slash: EA8/ON4UN
 * - Optional portable/mobile modifier after slash: PA3XYZ/P
 */
const STANDARD_CALL = "[A-Z0-9]{1,3}\\d[A-Z]{1,5}";
const SPECIAL_EVENT_CALL = "[A-Z]{1,2}\\d{2}[A-Z]{1,6}";
const CALL_CORE = `(?:${STANDARD_CALL}|${SPECIAL_EVENT_CALL})`;
const CALL_TOKEN = `(?:[A-Z0-9]{1,4}/)?${CALL_CORE}(?:/[A-Z0-9]{1,4})?`;
const CALLSIGN_PATTERN = new RegExp(`\\b(${CALL_TOKEN})\\b`, "g");

/** "CQ CQ DE PA3XYZ" or "CQ DE PA3XYZ" — extract the calling station */
const CQ_DE_PATTERN = new RegExp(`\\bCQ(?:\\s+CQ)*\\s+DE\\s+(${CALL_TOKEN})\\b`, "g");

/** "<call> DE <call>" — extract both sides of a directed exchange */
const CALL_DE_CALL_PATTERN = new RegExp(`\\b(${CALL_TOKEN})\\s+DE\\s+(${CALL_TOKEN})\\b`, "g");

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
  const pattern = new RegExp(`^${CALL_TOKEN}$`);
  return pattern.test(upper);
}
