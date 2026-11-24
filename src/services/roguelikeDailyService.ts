export interface DailyLeaderboardEntry {
  username: string;
  floorsCleared: number;
  battlesWon: number;
  bossesWon: number;
  victory: boolean;
  score: number;
  updatedAt?: string;
}

export async function fetchDailyLeaderboard(dateStr: string): Promise<DailyLeaderboardEntry[]> {
  try {
    const res = await fetch(`/api/roguelike/daily?date=${encodeURIComponent(dateStr)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: DailyLeaderboardEntry[] };
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

export async function submitDailyScore(payload: {
  date: string;
  username: string;
  floorsCleared: number;
  battlesWon: number;
  bossesWon: number;
  victory: boolean;
  score: number;
}): Promise<DailyLeaderboardEntry[]> {
  try {
    const res = await fetch('/api/roguelike/daily/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: DailyLeaderboardEntry[] };
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}
