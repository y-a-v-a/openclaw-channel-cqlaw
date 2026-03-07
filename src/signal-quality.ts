/**
 * Signal quality utilities: map S/N ratio to RST report values.
 *
 * RST (Readability / Strength / Tone) is the standard CW signal report.
 * For CW, the Tone component is always 9 (pure sine wave), so the report
 * is typically expressed as R S T = "5 9 9" for an excellent signal.
 *
 * S/N → RST mapping (from task 3.4.3):
 *   S/N > 20 dB  → RST 599  (excellent)
 *   S/N 10–20 dB → RST 579  (good)
 *   S/N 3–10 dB  → RST 449  (fair)
 *   S/N < 3 dB   → RST 339  (poor)
 */

export type RstReport = "599" | "579" | "449" | "339";
export type SignalQualityLabel = "excellent" | "good" | "fair" | "poor";

export interface SignalQuality {
  rst: RstReport;
  label: SignalQualityLabel;
}

/**
 * Map an S/N ratio in dB to an RST report and human-readable label.
 * Use this to enrich inbound message metadata or to suggest a report to send.
 */
export function snrToSignalQuality(snrDb: number): SignalQuality {
  if (snrDb > 20) return { rst: "599", label: "excellent" };
  if (snrDb >= 10) return { rst: "579", label: "good" };
  if (snrDb >= 3) return { rst: "449", label: "fair" };
  return { rst: "339", label: "poor" };
}

/**
 * Convenience wrapper — returns just the RST string.
 * Equivalent to snrToSignalQuality(snrDb).rst.
 */
export function snrToRst(snrDb: number): RstReport {
  return snrToSignalQuality(snrDb).rst;
}
