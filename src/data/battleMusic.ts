import type { JoJoPart } from './schemas/cardTypes';

export interface BattleTrack {
  id: string;
  title: string;
  jpTitle?: string;
  part: JoJoPart;
  src: string;
}

export type BattleMusicChoice = 'RANDOM' | 'NONE' | string;

export const BATTLE_PLAYLIST: BattleTrack[] = [
  {
    id: 'p1-chojin-saisei',
    title: 'Superhuman Regeneration (超人再生)',
    jpTitle: '超人再生',
    part: 1,
    src: '/assets/music/battle/p1-chojin-saisei.ogg',
  },
];

export function getBattleTracksByPart(part: JoJoPart): BattleTrack[] {
  return BATTLE_PLAYLIST.filter((t) => t.part === part);
}

export function getBattleTrackById(trackId: string | null | undefined): BattleTrack | undefined {
  if (!trackId) return undefined;
  return BATTLE_PLAYLIST.find((t) => t.id === trackId);
}

export function pickRandomBattleTrack(part?: JoJoPart): BattleTrack | null {
  const pool = part ? getBattleTracksByPart(part) : BATTLE_PLAYLIST;
  if (pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] ?? pool[0] ?? null;
}

export function resolveBattleTrackChoice(
  choice: BattleMusicChoice,
  preferredPart?: JoJoPart,
): string | null {
  if (choice === 'NONE') return null;
  if (choice === 'RANDOM') {
    const picked = pickRandomBattleTrack(preferredPart) ?? pickRandomBattleTrack();
    return picked?.id ?? null;
  }
  return getBattleTrackById(choice)?.id ?? null;
}
