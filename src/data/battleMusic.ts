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
  {
    id: 'p2-take-cover',
    title: 'Take Cover',
    part: 2,
    src: '/assets/music/battle/p2-take-cover.ogg',
  },
  {
    id: 'p2-elephant-talk-1',
    title: 'Elephant Talk 1',
    part: 2,
    src: '/assets/music/battle/p2-elephant-talk-1.ogg',
  },
  {
    id: 'p2-kigai-kappo',
    title: 'Kigai Kappo (鬼街闊歩)',
    jpTitle: '鬼街闊歩',
    part: 2,
    src: '/assets/music/battle/p2-kigai-kappo.ogg',
  },
  {
    id: 'p2-shissou',
    title: 'Shissou',
    part: 2,
    src: '/assets/music/battle/p2-shissou.ogg',
  },
  {
    id: 'p2-hyoutekiwo-toraero',
    title: 'Hyoutekiwo Toraero',
    part: 2,
    src: '/assets/music/battle/p2-hyoutekiwo-toraero.ogg',
  },
  {
    id: 'p2-senritsuno-kishi',
    title: 'Senritsuno Kishi',
    part: 2,
    src: '/assets/music/battle/p2-senritsuno-kishi.ogg',
  },
  {
    id: 'p2-kizame-sono-hamon',
    title: 'Kizame Sono Hamon',
    part: 2,
    src: '/assets/music/battle/p2-kizame-sono-hamon.ogg',
  },
  {
    id: 'p2-aoi-kurayamino-soko',
    title: 'Aoi Kurayamino Soko',
    part: 2,
    src: '/assets/music/battle/p2-aoi-kurayamino-soko.ogg',
  },
  {
    id: 'p2-kessen-kasanariau-unmei',
    title: 'Kessen Kasanariau Unmei',
    part: 2,
    src: '/assets/music/battle/p2-kessen-kasanariau-unmei.ogg',
  },
  {
    id: 'p2-propaganda',
    title: 'Propaganda [Coliseo]',
    part: 2,
    src: '/assets/music/battle/p2-propaganda.ogg',
    excludeFromCampaignPool: true,
    exclusiveStageId: 'p2-s19',
  },
  {
    id: 'p2-burning-colosseum-final-boss',
    title: 'Burning Colosseum [Jefe Final]',
    part: 2,
    src: '/assets/music/battle/p2-burning-colosseum-final-boss.ogg',
    excludeFromCampaignPool: true,
    exclusiveStageId: 'p2-s20',
  },
  // ==================== PART 3: STARDUST CRUSADERS ====================
  {
    id: 'p3-stardust-crusaders',
    title: 'Stardust Crusaders (スターダストクルセイダース)',
    jpTitle: 'スターダストクルセイダース',
    part: 3,
    src: '/assets/music/battle/p3-stardust-crusaders.ogg',
  },
  {
    id: 'p3-koketsu-naru-kyoko',
    title: 'Noble Pope (高潔なる教皇)',
    jpTitle: '高潔なる教皇',
    part: 3,
    src: '/assets/music/battle/p3-koketsu-naru-kyoko.ogg',
  },
  {
    id: 'p3-honoo-no-jujutsushi',
    title: 'Fire Magician (炎の呪術師)',
    jpTitle: '炎の呪術師',
    part: 3,
    src: '/assets/music/battle/p3-honoo-no-jujutsushi.ogg',
  },
  {
    id: 'p3-gekitotsu',
    title: 'Clash (激突)',
    jpTitle: '激突',
    part: 3,
    src: '/assets/music/battle/p3-gekitotsu.ogg',
  },
  {
    id: 'p3-kessen-no-toki',
    title: 'Time of Decisive Battle (決戦の時)',
    jpTitle: '決戦の時',
    part: 3,
    src: '/assets/music/battle/p3-kessen-no-toki.ogg',
  },
  {
    id: 'p3-kinpaku',
    title: 'Tension (緊迫)',
    jpTitle: '緊迫',
    part: 3,
    src: '/assets/music/battle/p3-kinpaku.ogg',
  },
  {
    id: 'p3-kyuhaku',
    title: 'Imminence (急迫)',
    jpTitle: '急迫',
    part: 3,
    src: '/assets/music/battle/p3-kyuhaku.ogg',
  },
  {
    id: 'p3-makuake',
    title: 'Makuake',
    part: 3,
    src: '/assets/music/battle/p3-makuake.ogg',
  },
  {
    id: 'p3-gambler',
    title: 'Gambler',
    part: 3,
    src: '/assets/music/battle/p3-gambler.ogg',
  },
  {
    id: 'p3-kakero-the-bluff',
    title: 'The Kakero the Bluff',
    part: 3,
    src: '/assets/music/battle/p3-kakero-the-bluff.ogg',
  },
  {
    id: 'p3-fight-to-antagonize',
    title: 'Fight to Antagonize',
    part: 3,
    src: '/assets/music/battle/p3-fight-to-antagonize.ogg',
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

/**
 * Picks a random battle track for Roguelike rooms:
 * - BOSS rooms pull from the intense boss/exclusive themes.
 * - BATTLE / ELITE rooms pull from the full non-exclusive battle playlist.
 * Avoids repeating `lastTrackId` back-to-back whenever more than 1 track is available.
 */
export function pickRandomRoguelikeTrack(
  roomType: 'BATTLE' | 'ELITE' | 'BOSS',
  lastTrackId?: string | null,
): BattleTrack | null {
  const basePool =
    roomType === 'BOSS'
      ? BATTLE_PLAYLIST.filter((t) => Boolean(t.excludeFromCampaignPool))
      : BATTLE_PLAYLIST.filter((t) => !t.excludeFromCampaignPool);
  const pool = basePool.length > 0 ? basePool : BATTLE_PLAYLIST;
  if (pool.length === 0) return null;
  const candidates =
    lastTrackId && pool.length > 1 ? pool.filter((t) => t.id !== lastTrackId) : pool;
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx] ?? candidates[0] ?? null;
}
