/**
 * Lightweight contest scoring engine.
 */

import type { ContestProfile, ParsedContestExchange } from "./contest.js";

export interface ScoreSnapshot {
  points: number;
  multiplierCount: number;
  totalScore: number;
  qsoCount: number;
}

export class ContestScorer {
  private points = 0;
  private qsoCount = 0;
  private readonly zoneMultipliers = new Set<string>();
  private readonly prefixMultipliers = new Set<string>();
  private readonly sectionMultipliers = new Set<string>();
  private readonly countryMultipliers = new Set<string>();

  scoreContact(
    profile: ContestProfile,
    exchange: ParsedContestExchange,
    band: string,
    isDupe: boolean,
  ): ScoreSnapshot {
    if (isDupe) {
      return this.snapshot();
    }

    this.qsoCount += 1;
    this.points += basePoints(profile.contestId, exchange);

    if (profile.contestId === "CQWW" || profile.contestId === "IARU-HF") {
      if (exchange.zone !== undefined) {
        this.zoneMultipliers.add(`${band}:${exchange.zone}`);
      }
      if (exchange.callsign) {
        const country = callsignCountryKey(exchange.callsign);
        this.countryMultipliers.add(`${band}:${country}`);
      }
    }

    if (profile.contestId === "CQ-WPX" && exchange.callsign) {
      this.prefixMultipliers.add(`${band}:${callsignPrefix(exchange.callsign)}`);
    }

    if (profile.contestId === "ARRL-SS" || profile.contestId === "ARRL-FD") {
      if (exchange.section) {
        this.sectionMultipliers.add(`${band}:${exchange.section}`);
      }
    }

    return this.snapshot();
  }

  snapshot(): ScoreSnapshot {
    const multiplierCount =
      this.zoneMultipliers.size +
      this.prefixMultipliers.size +
      this.sectionMultipliers.size +
      this.countryMultipliers.size;
    return {
      points: this.points,
      multiplierCount,
      totalScore: this.points * Math.max(1, multiplierCount),
      qsoCount: this.qsoCount,
    };
  }
}

function basePoints(contestId: string, exchange: ParsedContestExchange): number {
  if (contestId === "ARRL-SS") return 2;
  if (contestId === "ARRL-FD") return 2;
  if (contestId === "CQ-WPX") return exchange.serial !== undefined ? 2 : 1;
  if (contestId === "CQWW" || contestId === "IARU-HF") return 3;
  return 1;
}

function callsignPrefix(call: string): string {
  const upper = call.toUpperCase();
  const m = upper.match(/^([A-Z0-9]{1,4})/);
  return m ? m[1] : upper;
}

function callsignCountryKey(call: string): string {
  const upper = call.toUpperCase();
  // Coarse approximation for multiplier bookkeeping.
  const m = upper.match(/^([A-Z]{1,2}|[0-9][A-Z])/);
  return m ? m[1] : upper;
}
