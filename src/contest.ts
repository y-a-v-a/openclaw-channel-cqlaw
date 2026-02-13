/**
 * Contest profile schema + exchange parsing/generation.
 */

import { extractCallsigns } from "./callsign.js";

export interface ContestProfile {
  contestId: string;
  name: string;
  exchangeFormat: {
    fields: string[];
    description: string;
  };
  scoringRules: {
    pointHint: string;
    multiplierHint: string;
  };
  bandPlan: {
    allowedBands: string[];
  };
  duration: {
    timezone: "UTC";
    start: string;
    end: string;
  };
}

export interface ParsedContestExchange {
  rst?: string;
  zone?: number;
  serial?: number;
  category?: string;
  section?: string;
  precedence?: string;
  check?: string;
  callsign?: string;
}

export interface ContestExchangeContext {
  ownCallsign: string;
  rst?: string;
  zone?: number;
  serial?: number;
  category?: string;
  section?: string;
  precedence?: string;
  check?: string;
}

export const CONTEST_PROFILES: Record<string, ContestProfile> = {
  "CQWW": {
    contestId: "CQWW",
    name: "CQ World Wide DX Contest",
    exchangeFormat: { fields: ["RST", "ZONE"], description: "RST + CQ zone" },
    scoringRules: { pointHint: "continent dependent", multiplierHint: "zones + countries per band" },
    bandPlan: { allowedBands: ["160m", "80m", "40m", "20m", "15m", "10m"] },
    duration: { timezone: "UTC", start: "SAT 00:00", end: "SUN 23:59" },
  },
  "CQ-WPX": {
    contestId: "CQ-WPX",
    name: "CQ WPX Contest",
    exchangeFormat: { fields: ["RST", "SERIAL"], description: "RST + serial" },
    scoringRules: { pointHint: "continent dependent", multiplierHint: "unique prefixes per band" },
    bandPlan: { allowedBands: ["160m", "80m", "40m", "20m", "15m", "10m"] },
    duration: { timezone: "UTC", start: "SAT 00:00", end: "SUN 23:59" },
  },
  "ARRL-FD": {
    contestId: "ARRL-FD",
    name: "ARRL Field Day",
    exchangeFormat: { fields: ["CATEGORY", "SECTION"], description: "Category + ARRL section" },
    scoringRules: { pointHint: "mode/power dependent", multiplierHint: "bonus objectives" },
    bandPlan: { allowedBands: ["160m", "80m", "40m", "20m", "15m", "10m", "6m"] },
    duration: { timezone: "UTC", start: "SAT 18:00", end: "SUN 20:59" },
  },
  "IARU-HF": {
    contestId: "IARU-HF",
    name: "IARU HF Championship",
    exchangeFormat: { fields: ["RST", "ZONE"], description: "RST + ITU zone (or HQ id)" },
    scoringRules: { pointHint: "continent dependent", multiplierHint: "zones + HQ stations" },
    bandPlan: { allowedBands: ["160m", "80m", "40m", "20m", "15m", "10m"] },
    duration: { timezone: "UTC", start: "SAT 12:00", end: "SUN 11:59" },
  },
  "ARRL-SS": {
    contestId: "ARRL-SS",
    name: "ARRL Sweepstakes",
    exchangeFormat: { fields: ["SERIAL", "PRECEDENCE", "CALLSIGN", "CHECK", "SECTION"], description: "Serial + precedence + call + check + section" },
    scoringRules: { pointHint: "fixed points per QSO", multiplierHint: "sections" },
    bandPlan: { allowedBands: ["160m", "80m", "40m", "20m", "15m", "10m"] },
    duration: { timezone: "UTC", start: "SAT 21:00", end: "MON 02:59" },
  },
};

const RST = /\b([1-5][1-9][1-9])\b/;
const NUMBER = /\b(\d{1,4})\b/g;
const FD = /\b(\d[A-F])\s+([A-Z]{2,4})\b/;
const SS = /\b(\d{1,4})\s+([A-Z])\s+([A-Z0-9\/]+)\s+(\d{2})\s+([A-Z]{2,4})\b/;

export function parseContestExchange(text: string, profile: ContestProfile): ParsedContestExchange {
  const upper = text.toUpperCase();
  const parsed: ParsedContestExchange = {};

  const calls = extractCallsigns(upper);
  if (calls.length > 0) {
    parsed.callsign = calls[calls.length - 1].callsign;
  }

  if (profile.contestId === "CQWW" || profile.contestId === "IARU-HF") {
    const rstMatch = upper.match(RST);
    if (rstMatch) parsed.rst = rstMatch[1];
    const nums = Array.from(upper.matchAll(NUMBER)).map((m) => parseInt(m[1], 10));
    const zone = nums.find((n) => n >= 1 && n <= 40);
    if (zone !== undefined) parsed.zone = zone;
    return parsed;
  }

  if (profile.contestId === "CQ-WPX") {
    const rstMatch = upper.match(RST);
    if (rstMatch) parsed.rst = rstMatch[1];
    const nums = Array.from(upper.matchAll(NUMBER)).map((m) => parseInt(m[1], 10));
    if (nums.length > 0) parsed.serial = nums[nums.length - 1];
    return parsed;
  }

  if (profile.contestId === "ARRL-FD") {
    const match = upper.match(FD);
    if (match) {
      parsed.category = match[1];
      parsed.section = match[2];
    }
    return parsed;
  }

  if (profile.contestId === "ARRL-SS") {
    const match = upper.match(SS);
    if (match) {
      parsed.serial = parseInt(match[1], 10);
      parsed.precedence = match[2];
      parsed.callsign = match[3];
      parsed.check = match[4];
      parsed.section = match[5];
    }
    return parsed;
  }

  return parsed;
}

export function generateContestExchange(profile: ContestProfile, ctx: ContestExchangeContext): string {
  const rst = ctx.rst ?? "599";

  if (profile.contestId === "CQWW" || profile.contestId === "IARU-HF") {
    const zone = ctx.zone ?? 0;
    return `${rst} ${zone}`.trim();
  }

  if (profile.contestId === "CQ-WPX") {
    const serial = ctx.serial ?? 1;
    return `${rst} ${String(serial).padStart(3, "0")}`;
  }

  if (profile.contestId === "ARRL-FD") {
    const category = ctx.category ?? "1D";
    const section = ctx.section ?? "DX";
    return `${category} ${section}`;
  }

  if (profile.contestId === "ARRL-SS") {
    const serial = String(ctx.serial ?? 1).padStart(4, "0");
    const precedence = ctx.precedence ?? "A";
    const check = ctx.check ?? "26";
    const section = ctx.section ?? "DX";
    return `${serial} ${precedence} ${ctx.ownCallsign.toUpperCase()} ${check} ${section}`;
  }

  return "";
}

export function getContestProfile(contestId: string): ContestProfile | null {
  return CONTEST_PROFILES[contestId] ?? null;
}
