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
import { exportCabrillo, type CabrilloHeader } from "./cabrillo.js";
import { calculateRateMetrics, type ContestRateMetrics } from "./contest-rate.js";
import { ContestScorer, type MultiplierAlert, type ScoreSnapshot } from "./contest-scoring.js";

export interface ContestContactLog {
  timestamp: Date;
  band: string;
  parsed: ParsedContestExchange;
  isDupe: boolean;
  score: ScoreSnapshot;
  multiplierAlerts: MultiplierAlert[];
}

export interface ContestContactResult {
  parsed: ParsedContestExchange;
  isDupe: boolean;
  score: ScoreSnapshot;
  multiplierAlerts: MultiplierAlert[];
  shouldAlertMultiplier: boolean;
  rate: ContestRateMetrics | null;
}

export class ContestSessionManager {
  private activeProfile: ContestProfile | null = null;
  private activatedAt: Date | null = null;
  private nextSerialNumber = 1;
  private dupeSheet = new ContestDupeSheet();
  private scorer = new ContestScorer();
  private contacts: ContestContactLog[] = [];

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
    this.contacts = [];
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
        multiplierAlerts: [],
        shouldAlertMultiplier: false,
        rate: null,
      };
    }

    const parsed = this.parseIncoming(text);
    const call = parsed.callsign;
    const isDupe = call ? this.dupeSheet.isDupe(call, band) : false;
    if (call && !isDupe) {
      this.dupeSheet.markWorked(call, band);
    }

    const scoreUpdate = this.scorer.scoreContact(this.activeProfile, parsed, band, isDupe);
    if (!isDupe) {
      this.nextSerialNumber += 1;
    }

    const logEntry: ContestContactLog = {
      timestamp: new Date(),
      band,
      parsed,
      isDupe,
      score: scoreUpdate.snapshot,
      multiplierAlerts: scoreUpdate.newMultipliers,
    };
    this.contacts.push(logEntry);

    return {
      parsed,
      isDupe,
      score: scoreUpdate.snapshot,
      multiplierAlerts: scoreUpdate.newMultipliers,
      shouldAlertMultiplier: scoreUpdate.newMultipliers.length > 0,
      rate: this.rateMetrics(),
    };
  }

  rateMetrics(now = new Date()): ContestRateMetrics | null {
    if (!this.activeProfile || !this.activatedAt) return null;
    return calculateRateMetrics(
      this.contacts.map((entry) => ({
        timestamp: entry.timestamp,
        isDupe: entry.isDupe,
        totalScoreAfterContact: entry.score.totalScore,
      })),
      this.activatedAt,
      now,
      this.activeProfile.duration,
    );
  }

  getContacts(): ReadonlyArray<ContestContactLog> {
    return this.contacts;
  }

  exportCabrillo(input: Omit<CabrilloHeader, "contestId"> & { sentExchange?: string }): string {
    if (!this.activeProfile) {
      throw new Error("No active contest session");
    }

    const qsos = this.contacts
      .filter((entry) => !entry.isDupe && entry.parsed.callsign)
      .map((entry, index) => ({
        timestamp: entry.timestamp,
        band: entry.band,
        ownCallsign: input.callsign,
        theirCallsign: entry.parsed.callsign!,
        sentRst: "599",
        sentExchange: input.sentExchange ?? String(index + 1).padStart(3, "0"),
        rcvdRst: entry.parsed.rst ?? "599",
        rcvdExchange: renderReceivedExchange(entry.parsed),
      }));

    return exportCabrillo(
      {
        ...input,
        contestId: this.activeProfile.contestId,
      },
      qsos,
    );
  }
}

function renderReceivedExchange(parsed: ParsedContestExchange): string {
  const parts: string[] = [];
  if (parsed.zone !== undefined) parts.push(String(parsed.zone));
  if (parsed.serial !== undefined) parts.push(String(parsed.serial));
  if (parsed.category) parts.push(parsed.category);
  if (parsed.precedence) parts.push(parsed.precedence);
  if (parsed.check) parts.push(parsed.check);
  if (parsed.section) parts.push(parsed.section);
  return parts.join(" ");
}
