/**
 * CW (Morse code) sub-band frequency segments for amateur radio bands.
 *
 * These are the standard CW portions of each HF band as defined by
 * international band plans (IARU Region 1/2/3). Frequencies outside
 * these segments are not typical CW territory and will trigger a warning.
 */

export interface CwBandSegment {
  band: string;
  minHz: number;
  maxHz: number;
}

/** Standard CW sub-band segments (Hz) */
export const CW_BAND_SEGMENTS: CwBandSegment[] = [
  { band: "160m", minHz: 1_800_000, maxHz: 1_840_000 },
  { band: "80m", minHz: 3_500_000, maxHz: 3_570_000 },
  { band: "40m", minHz: 7_000_000, maxHz: 7_040_000 },
  { band: "30m", minHz: 10_100_000, maxHz: 10_130_000 },
  { band: "20m", minHz: 14_000_000, maxHz: 14_070_000 },
  { band: "17m", minHz: 18_068_000, maxHz: 18_095_000 },
  { band: "15m", minHz: 21_000_000, maxHz: 21_070_000 },
  { band: "12m", minHz: 24_890_000, maxHz: 24_915_000 },
  { band: "10m", minHz: 28_000_000, maxHz: 28_070_000 },
];

export interface FrequencyCheckResult {
  isInCwSegment: boolean;
  band: string | null;
  /** Nearest CW band, populated when isInCwSegment is false */
  nearestBand?: string;
}

/**
 * Check whether a frequency (Hz) falls within a standard CW band segment.
 * Returns the band name if it matches, or the nearest band as a hint when it does not.
 */
export function checkCwBandPlan(hz: number): FrequencyCheckResult {
  for (const segment of CW_BAND_SEGMENTS) {
    if (hz >= segment.minHz && hz <= segment.maxHz) {
      return { isInCwSegment: true, band: segment.band };
    }
  }

  // Identify nearest segment by midpoint distance
  const nearest = CW_BAND_SEGMENTS.reduce((closest, seg) => {
    const midHz = (seg.minHz + seg.maxHz) / 2;
    const closestMid = (closest.minHz + closest.maxHz) / 2;
    return Math.abs(hz - midHz) < Math.abs(hz - closestMid) ? seg : closest;
  });

  return { isInCwSegment: false, band: null, nearestBand: nearest.band };
}
