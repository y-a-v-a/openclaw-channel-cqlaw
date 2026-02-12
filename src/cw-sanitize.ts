/**
 * Sanitize text for CW (Morse code) transmission.
 *
 * Morse code supports: A-Z, 0-9, and a limited set of punctuation.
 * Everything else gets stripped. All output is uppercase.
 */

/** Characters that have a Morse code representation */
const VALID_CW_CHARS = /[A-Z0-9 .,?!'"/()&:;=+\-_@]/;

/**
 * Sanitize a string for CW transmission.
 * - Uppercase everything
 * - Strip characters with no Morse representation
 * - Collapse multiple spaces
 * - Trim edges
 */
export function sanitizeForCw(text: string): string {
  return text
    .toUpperCase()
    .split("")
    .filter((ch) => VALID_CW_CHARS.test(ch))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
