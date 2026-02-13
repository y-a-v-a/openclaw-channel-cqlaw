/**
 * Contest session manager with active profile, serial state, dupe sheet, and scoring.
 */

import {
  type ContestExchangeContext,
  type ContestProfile,
  type ParsedContestExchange,
  generateContestExchange,
  getContestProfile,
  parseContestExchange,
} from "./contest.js";
import { ContestDupeSheet } from "./contest-dupe-sheet.js";
import { ContestScorer, type ScoreSnapshot } from "./contest-scoring.js";

export interface ContestContactResult {
  parsed: ParsedContestExchange;
  isDupe: boolean;
  score: ScoreSnapshot;
}

export class ContestSessionManager {
  private activeProfile: ContestProfile | null = null;
  private activatedAt: Date | null = null;
  private nextSerialNumber = 1;
  private dupeSheet = new ContestDupeSheet();
  private scorer = new ContestScorer();

  activate(contestId: string, startSerial = 1): ContestProfile {
    const profile = getContestProfile(contestId);
    if (!profile) {
      throw new Error(`Unknown contest profile: ${contestId}`);
    }

    this.activeProfile = profile;
    this.activatedAt = new Date();
    this.nextSerialNumber = Math.max(1, startSerial);
    this.dupeSheet = new ContestDupeSheet();
    this.scorer = new ContestScorer();
    return profile;
  }

  deactivate(): void {
    this.activeProfile = null;
    this.activatedAt = null;
  }

  get profile(): ContestProfile | null {
    return this.activeProfile;
  }

  get elapsedMs(): number | null {
    if (!this.activatedAt) return null;
    return Date.now() - this.activatedAt.getTime();
  }

  get nextSerial(): number {
    return this.nextSerialNumber;
  }

  parseIncoming(text: string): ParsedContestExchange {
    if (!this.activeProfile) return {};
    return parseContestExchange(text, this.activeProfile);
  }

  generateOutgoing(context: Omit<ContestExchangeContext, "serial">): string {
    if (!this.activeProfile) return "";
    return generateContestExchange(this.activeProfile, {
      ...context,
      serial: this.nextSerialNumber,
    });
  }

  registerContact(text: string, band: string): ContestContactResult {
    if (!this.activeProfile) {
      return {
        parsed: {},
        isDupe: false,
        score: this.scorer.snapshot(),
      };
    }

    const parsed = this.parseIncoming(text);
    const call = parsed.callsign;
    const isDupe = call ? this.dupeSheet.isDupe(call, band) : false;
    if (call && !isDupe) {
      this.dupeSheet.markWorked(call, band);
    }

    const score = this.scorer.scoreContact(this.activeProfile, parsed, band, isDupe);
    if (!isDupe) {
      this.nextSerialNumber += 1;
    }

    return { parsed, isDupe, score };
  }
}
