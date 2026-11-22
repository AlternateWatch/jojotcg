import type { JoJoPart } from './schemas/cardTypes';

export interface BattleTrack {
  id: string;
  title: string;
  jpTitle?: string;
  part: JoJoPart;
  src: string;
  /** When true, excluded from the random Campaign pool (e.g. Final Boss exclusive theme) */
  excludeFromCampaignPool?: boolean;
  /** Dedicated campaign stage ID where this track always plays */
  exclusiveStageId?: string;
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
  {
    id: 'p1-ketsui',
    title: 'Determination (決意)',
    jpTitle: '決意',
    part: 1,
    src: '/assets/music/battle/p1-ketsui.ogg',
  },
  {
    id: 'p1-yuki-rendan',
    title: 'Courageous Barrage (勇気連弾)',
    jpTitle: '勇気連弾',
    part: 1,
    src: '/assets/music/battle/p1-yuki-rendan.ogg',
  },
  {
    id: 'p1-fukutsu-final-boss',
    title: 'Indomitable ~Cry of Selflessness~ (不屈～無心の叫び～) [Jefe Final]',
    jpTitle: '不屈～無心の叫び～',
    part: 1,
    src: '/assets/music/battle/p1-fukutsu-final-boss.ogg',
    excludeFromCampaignPool: true,
    exclusiveStageId: 'p1-s20',
  },
];

export function getBattleTracksByPart(
  part: JoJoPart,
  options?: { includeExclusive?: boolean },
): BattleTrack[] {
  return BATTLE_PLAYLIST.filter(
    (t) => t.part === part && (options?.includeExclusive || !t.excludeFromCampaignPool),
  );
}

export function getBattleTrackById(trackId: string | null | undefined): BattleTrack | undefined {
  if (!trackId) return undefined;
  return BATTLE_PLAYLIST.find((t) => t.id === trackId);
}

export function pickRandomBattleTrack(part?: JoJoPart): BattleTrack | null {
  const pool = part
    ? getBattleTracksByPart(part, { includeExclusive: false })
    : BATTLE_PLAYLIST.filter((t) => !t.excludeFromCampaignPool);
  if (pool.length === 0) return null;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx] ?? pool[0] ?? null;
}

export function getBattleTrackForCampaignStage(
  stageId: string,
  part: JoJoPart,
): BattleTrack | null {
  const exclusive = BATTLE_PLAYLIST.find((t) => t.exclusiveStageId === stageId);
  if (exclusive) return exclusive;
  return pickRandomBattleTrack(part);
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
