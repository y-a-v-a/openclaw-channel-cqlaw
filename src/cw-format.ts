/**
 * Format sanitized text with CW addressing and closing prosigns.
 *
 * Prepends the station addressing (e.g. "DL2ABC DE PA3XYZ") and appends
 * the appropriate closing prosign (K, KN, SK) based on transmission intent.
 *
 * This is a pure formatting step — sanitization must happen before calling this.
 */

/** What kind of CW transmission this is — determines the closing prosign. */
export type TxIntent =
  | "cq"       // Calling CQ → end with K (anyone may respond)
  | "reply"    // Normal turn in a QSO → end with KN (named station only)
  | "signoff"  // Final message of a QSO → end with SK
  | "default"; // Unknown → end with KN (safe default)

const CLOSING_PROSIGN: Record<TxIntent, string> = {
  cq: "K",
  reply: "KN",
  signoff: "SK",
  default: "KN",
};

/** All prosigns that signal end-of-transmission — don't add another if one is already there. */
const ALL_CLOSING_PROSIGNS = [" K", " KN", " SK", " AR", " BK"];

/**
 * Wrap sanitized CW text with addressing and a closing prosign.
 *
 * @param text      Already-sanitized uppercase text (from sanitizeForCw)
 * @param intent    The purpose of this transmission
 * @param ownCall   This station's callsign
 * @param peerCall  The other station's callsign (omit for CQ calls)
 */
export function formatForCw(
  text: string,
  intent: TxIntent,
  ownCall: string,
  peerCall?: string,
): string {
  let result = text;

  // Prepend addressing if not already present in the text
  if (intent === "cq") {
    // CQ calls: ensure "DE <ownCall>" is present
    const deOwn = `DE ${ownCall}`;
    if (!result.includes(deOwn)) {
      result = `${result} ${deOwn}`;
    }
  } else if (peerCall) {
    // Directed transmissions: ensure "<peerCall> DE <ownCall>" is present
    const addressing = `${peerCall} DE ${ownCall}`;
    if (!result.startsWith(addressing)) {
      result = `${addressing} ${result}`;
    }
  }

  // Append closing prosign if no closing prosign is already present
  const hasClosingProsign = ALL_CLOSING_PROSIGNS.some((p) => result.endsWith(p));
  if (!hasClosingProsign) {
    result = `${result} ${CLOSING_PROSIGN[intent]}`;
  }

  return result;
}
