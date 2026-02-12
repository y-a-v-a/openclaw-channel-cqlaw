/**
 * Fuzzy matching utilities for noisy CW decode correction.
 *
 * CW decoding often produces uncertain characters (shown as '?').
 * These functions help resolve ambiguity by comparing against known callsigns
 * and aggregating across repeated transmissions.
 */

/** Confidence level for a decoded field */
export type Confidence = "high" | "medium" | "low";

/** A decoded value with associated confidence */
export interface ScoredValue {
  value: string;
  confidence: Confidence;
}

/**
 * Levenshtein edit distance between two strings.
 * Used for fuzzy callsign matching.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Find the best matching callsign from a list of known callsigns.
 * Returns null if no match is close enough (maxDistance threshold).
 */
export function fuzzyMatchCallsign(
  decoded: string,
  knownCallsigns: string[],
  maxDistance = 2
): string | null {
  const upper = decoded.toUpperCase().replace(/\?/g, "");
  let best: string | null = null;
  let bestDist = Infinity;

  for (const known of knownCallsigns) {
    const dist = levenshtein(upper, known.toUpperCase());
    if (dist < bestDist && dist <= maxDistance) {
      bestDist = dist;
      best = known;
    }
  }

  return best;
}

/**
 * Score confidence of a decoded string based on presence of uncertainty markers.
 */
export function scoreConfidence(decoded: string): Confidence {
  const questionMarks = (decoded.match(/\?/g) || []).length;
  const total = decoded.length;
  if (total === 0) return "low";
  if (questionMarks === 0) return "high";
  const ratio = questionMarks / total;
  return ratio <= 0.2 ? "medium" : "low";
}

/**
 * Merge multiple noisy observations of the same callsign into a single
 * best-effort decode. Each position is resolved by majority vote among
 * observations that have a non-'?' character at that position.
 *
 * Example: ["DL2A?C", "DL2AB?", "?L2ABC"] → "DL2ABC"
 */
export function mergeObservations(observations: string[]): ScoredValue {
  if (observations.length === 0) {
    return { value: "", confidence: "low" };
  }

  if (observations.length === 1) {
    return { value: observations[0], confidence: scoreConfidence(observations[0]) };
  }

  const maxLen = Math.max(...observations.map((o) => o.length));
  const result: string[] = [];
  let uncertainCount = 0;

  for (let i = 0; i < maxLen; i++) {
    // Collect non-'?' characters at this position from all observations
    const candidates: string[] = [];
    for (const obs of observations) {
      if (i < obs.length && obs[i] !== "?") {
        candidates.push(obs[i]);
      }
    }

    if (candidates.length === 0) {
      result.push("?");
      uncertainCount++;
    } else {
      // Majority vote
      const freq = new Map<string, number>();
      for (const c of candidates) {
        freq.set(c, (freq.get(c) ?? 0) + 1);
      }
      let best = candidates[0];
      let bestCount = 0;
      for (const [ch, count] of freq) {
        if (count > bestCount) {
          best = ch;
          bestCount = count;
        }
      }
      result.push(best);
    }
  }

  const merged = result.join("");
  return { value: merged, confidence: scoreConfidence(merged) };
}
