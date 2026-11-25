export type CompetitiveMode = 'AI' | 'PVP';

export const COMPETITIVE_ENTRY_FEE: Record<CompetitiveMode, number> = {
  AI: 50,
  PVP: 75,
};

export interface CompetitiveLeaderboardEntry {
  username: string;
  points: number;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  updatedAt?: string;
}

export interface CompetitiveRewardTier {
  minRank: number;
  maxRank: number;
  label: string;
  coins: number;
  packCount: number;
}

export const COMPETITIVE_WEEKLY_REWARD_TIERS: CompetitiveRewardTier[] = [
  { minRank: 1, maxRank: 1, label: '#1 · Campeón Semanal', coins: 1500, packCount: 3 },
  { minRank: 2, maxRank: 3, label: '#2 – #3 · Podio', coins: 900, packCount: 2 },
  { minRank: 4, maxRank: 10, label: '#4 – #10 · Top 10', coins: 500, packCount: 1 },
  { minRank: 11, maxRank: 25, label: '#11 – #25 · Top 25', coins: 250, packCount: 0 },
  { minRank: 26, maxRank: 999999, label: 'Participante (≥1 combate)', coins: 100, packCount: 0 },
];

/**
 * Returns the ISO-8601 week key in UTC, e.g. "2026-W48".
 */
export function getIsoWeekKey(date: Date = new Date()): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Returns the previous ISO-8601 week key (7 days earlier).
 */
export function getPreviousIsoWeekKey(date: Date = new Date()): string {
  const prev = new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000);
  return getIsoWeekKey(prev);
}

/**
 * Human-readable countdown until next Monday 00:00 UTC (weekly reset).
 */
export function getWeeklyResetCountdown(now: Date = new Date()): string {
  const day = now.getUTCDay() || 7; // Mon=1 .. Sun=7
  const daysUntilNextMon = 8 - day;
  const nextMon = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilNextMon,
    0,
    0,
    0,
  );
  const diffMs = Math.max(0, nextMon - now.getTime());
  const totalHours = Math.floor(diffMs / 3600000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d ${hours}h`;
}

export function computeCompetitivePointsDelta(won: boolean, currentStreak: number): number {
  if (!won) return -15;
  const nextStreak = currentStreak + 1;
  const streakBonus = nextStreak >= 2 ? Math.min(15, (nextStreak - 1) * 5) : 0;
  return 40 + streakBonus;
}

export function computeWeeklyRankReward(rank: number): CompetitiveRewardTier | null {
  if (rank <= 0 || !Number.isFinite(rank)) return null;
  for (const tier of COMPETITIVE_WEEKLY_REWARD_TIERS) {
    if (rank >= tier.minRank && rank <= tier.maxRank) {
      return tier;
    }
  }
  return null;
}

export function getCompetitiveClaimKey(weekKey: string, mode: CompetitiveMode): string {
  return `${weekKey}:${mode}`;
}

export async function fetchCompetitiveRankings(
  mode: CompetitiveMode,
  weekKey: string = getIsoWeekKey(),
): Promise<CompetitiveLeaderboardEntry[]> {
  try {
    const res = await fetch(
      `/api/competitive/rankings?mode=${encodeURIComponent(mode)}&week=${encodeURIComponent(weekKey)}`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: CompetitiveLeaderboardEntry[] };
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

export async function reportCompetitiveMatchResult(payload: {
  mode: CompetitiveMode;
  username: string;
  won: boolean;
  weekKey?: string;
}): Promise<{
  ok: boolean;
  delta: number;
  points: number;
  entries: CompetitiveLeaderboardEntry[];
}> {
  const weekKey = payload.weekKey ?? getIsoWeekKey();
  try {
    const res = await fetch('/api/competitive/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: payload.mode,
        weekKey,
        username: payload.username,
        won: payload.won,
      }),
    });
    if (!res.ok) {
      return { ok: false, delta: 0, points: 0, entries: [] };
    }
    const data = (await res.json()) as {
      ok?: boolean;
      delta?: number;
      points?: number;
      entries?: CompetitiveLeaderboardEntry[];
    };
    return {
      ok: Boolean(data.ok),
      delta: typeof data.delta === 'number' ? data.delta : 0,
      points: typeof data.points === 'number' ? data.points : 0,
      entries: Array.isArray(data.entries) ? data.entries : [],
    };
  } catch {
    return { ok: false, delta: 0, points: 0, entries: [] };
  }
}
