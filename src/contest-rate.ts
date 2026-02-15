/**
 * Contest rate tracking helpers.
 */

export interface ContestRateContact {
  timestamp: Date;
  isDupe: boolean;
  totalScoreAfterContact: number;
}

export interface ContestRatePoint {
  timestamp: string;
  qsoCount: number;
  qsoPerHour: number;
  totalScore: number;
}

export interface ContestRateMetrics {
  currentRateQsoPerHour: number;
  averageRateQsoPerHour: number;
  peakRateQsoPerHour: number;
  projectedFinalScore: number;
  chart: ContestRatePoint[];
}

export interface ContestDurationWindow {
  start: string;
  end: string;
}

export function calculateRateMetrics(
  contacts: ContestRateContact[],
  activatedAt: Date,
  now: Date,
  duration: ContestDurationWindow | undefined,
): ContestRateMetrics {
  const uniqueContacts = contacts
    .filter((contact) => !contact.isDupe)
    .slice()
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const elapsedHours = Math.max((now.getTime() - activatedAt.getTime()) / 3_600_000, 1 / 3_600);
  const qsoCount = uniqueContacts.length;
  const totalScore = uniqueContacts.length > 0 ? uniqueContacts[uniqueContacts.length - 1].totalScoreAfterContact : 0;
  const currentRateQsoPerHour = rollingRate(uniqueContacts, now, 60);
  const averageRateQsoPerHour = qsoCount / elapsedHours;
  const peakRateQsoPerHour = peakRollingRate(uniqueContacts, 60);
  const projectedFinalScore = projectFinalScore({
    durationHours: parseDurationHours(duration),
    elapsedHours,
    currentRateQsoPerHour,
    totalScore,
    qsoCount,
  });

  return {
    currentRateQsoPerHour: round2(currentRateQsoPerHour),
    averageRateQsoPerHour: round2(averageRateQsoPerHour),
    peakRateQsoPerHour: round2(peakRateQsoPerHour),
    projectedFinalScore,
    chart: buildChart(uniqueContacts, activatedAt, now),
  };
}

function rollingRate(contacts: ContestRateContact[], now: Date, windowMinutes: number): number {
  if (contacts.length === 0) return 0;
  const windowMs = windowMinutes * 60_000;
  const start = now.getTime() - windowMs;
  let count = 0;
  for (const contact of contacts) {
    const time = contact.timestamp.getTime();
    if (time >= start && time <= now.getTime()) {
      count += 1;
    }
  }
  return count * (60 / windowMinutes);
}

function peakRollingRate(contacts: ContestRateContact[], windowMinutes: number): number {
  if (contacts.length === 0) return 0;
  const windowMs = windowMinutes * 60_000;
  let peakCount = 0;
  let left = 0;
  for (let right = 0; right < contacts.length; right += 1) {
    const rightTime = contacts[right].timestamp.getTime();
    while (rightTime - contacts[left].timestamp.getTime() > windowMs) {
      left += 1;
    }
    const count = right - left + 1;
    if (count > peakCount) peakCount = count;
  }
  return peakCount * (60 / windowMinutes);
}

function buildChart(contacts: ContestRateContact[], activatedAt: Date, now: Date): ContestRatePoint[] {
  if (contacts.length === 0) return [];

  const bucketMs = 15 * 60_000;
  const startBucket = Math.floor(activatedAt.getTime() / bucketMs) * bucketMs;
  const endBucket = Math.floor(now.getTime() / bucketMs) * bucketMs;
  const points: ContestRatePoint[] = [];
  let cursor = startBucket;
  let contactIndex = 0;
  let runningScore = 0;

  while (cursor <= endBucket) {
    const nextCursor = cursor + bucketMs;
    let bucketCount = 0;

    while (contactIndex < contacts.length && contacts[contactIndex].timestamp.getTime() < nextCursor) {
      if (contacts[contactIndex].timestamp.getTime() >= cursor) {
        bucketCount += 1;
      }
      runningScore = contacts[contactIndex].totalScoreAfterContact;
      contactIndex += 1;
    }

    points.push({
      timestamp: new Date(nextCursor).toISOString(),
      qsoCount: bucketCount,
      qsoPerHour: bucketCount * 4,
      totalScore: runningScore,
    });
    cursor = nextCursor;
  }

  return points;
}

function parseDurationHours(duration: ContestDurationWindow | undefined): number | null {
  if (!duration) return null;
  const startMinutes = parseDurationValue(duration.start);
  const endMinutes = parseDurationValue(duration.end);
  if (startMinutes === null || endMinutes === null) return null;
  let diff = endMinutes - startMinutes;
  if (diff <= 0) diff += 7 * 24 * 60;
  return diff / 60;
}

function parseDurationValue(value: string): number | null {
  const match = value.match(/^(SUN|MON|TUE|WED|THU|FRI|SAT)\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const dayIndex = dayToIndex(match[1]);
  if (dayIndex === null) return null;
  const hour = Number.parseInt(match[2], 10);
  const minute = Number.parseInt(match[3], 10);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return null;
  return dayIndex * 24 * 60 + hour * 60 + minute;
}

function dayToIndex(day: string): number | null {
  switch (day) {
    case "SUN": return 0;
    case "MON": return 1;
    case "TUE": return 2;
    case "WED": return 3;
    case "THU": return 4;
    case "FRI": return 5;
    case "SAT": return 6;
    default: return null;
  }
}

function projectFinalScore(input: {
  durationHours: number | null;
  elapsedHours: number;
  currentRateQsoPerHour: number;
  totalScore: number;
  qsoCount: number;
}): number {
  const { durationHours, elapsedHours, currentRateQsoPerHour, totalScore, qsoCount } = input;
  if (durationHours === null || qsoCount === 0) {
    return Math.round(totalScore);
  }
  const remainingHours = Math.max(durationHours - elapsedHours, 0);
  const averageScorePerQso = totalScore / qsoCount;
  const projectedAdditionalScore = currentRateQsoPerHour * remainingHours * averageScorePerQso;
  return Math.round(totalScore + projectedAdditionalScore);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
