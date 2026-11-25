import {
  ALL_CARDS,
  getCardById,
  getCharacterCard,
  getEvolutionCard,
  getStandCard,
  PRESET_DECKS,
} from '../data/cardRegistry';
import { getCardRarity } from '../data/progressionData';
import { DEFAULT_RULES_CONFIG } from '../data/rulesConfig';
import type { AnyCard, EnergyType } from '../data/schemas/cardTypes';
import type { AiDifficulty } from '../engine/ai/tacticalAi';
import { createSeededRng } from '../engine/rng';

export const DRAFT_TOTAL_PICKS = 24;
export const DRAFT_MAX_WINS = 5;
export const DRAFT_MAX_LOSSES = 3;

export type DraftRunStatus = 'DRAFTING' | 'READY' | 'IN_BATTLE' | 'FINISHED';

export interface DraftOpponentDef {
  matchIndex: number;
  name: string;
  subtitle: string;
  deckIds: string[];
  featuredCardId: string;
  difficulty: AiDifficulty;
  aiErrorRate: number;
}

export interface DraftRunState {
  runId: string;
  seed: number;
  status: DraftRunStatus;
  /** 1-based current pick index while DRAFTING (1..24) */
  currentPick: number;
  totalPicks: number;
  currentChoices: string[];
  pickedCardIds: string[];
  /** Completed 46-card legal deck (24 drafted + 22 auto-matched Energies) */
  finalDeckIds: string[];
  wins: number;
  losses: number;
  matchesPlayed: number;
  metaCoinsClaimed: number | null;
}

export interface DraftMetaReward {
  coins: number;
  packCount: number;
  isChampion: boolean;
  breakdown: string;
}

const ENERGY_ID_BY_TYPE: Record<EnergyType, string> = {
  ELECTRIC: 'energy-electric',
  FIRE: 'energy-fire',
  WATER: 'energy-water',
  PSYCHIC: 'energy-psychic',
  LIGHT: 'energy-light',
  NATURE: 'energy-nature',
  COLORLESS: 'energy-colorless',
  STAND: 'energy-stand',
};

const BASIC_ENERGY_TYPES: EnergyType[] = [
  'ELECTRIC',
  'FIRE',
  'WATER',
  'PSYCHIC',
  'LIGHT',
  'NATURE',
];

function getMaxUserDg(cardIds: readonly string[]): number {
  let maxDg = 0;
  for (const id of cardIds) {
    const ch = getCharacterCard(id);
    if (ch && ch.categories.includes('STAND_USER') && ch.dg !== null) {
      maxDg = Math.max(maxDg, ch.dg);
    }
  }
  return maxDg;
}

function canAddDraftCard(card: AnyCard, counts: Map<string, number>): boolean {
  if (card.type === 'ENERGY') return false;
  const limit = DEFAULT_RULES_CONFIG.maxCopiesByType[card.type];
  if (limit === null) return true;
  return (counts.get(card.id) ?? 0) < limit;
}

function isEvolutionBaseDrafted(card: AnyCard, pickedIds: readonly string[]): boolean {
  if (card.type !== 'EVOLUTION') return false;
  const evo = getEvolutionCard(card.id);
  if (!evo) return false;
  return pickedIds.includes(evo.baseCardId);
}

/**
 * Generates 3 legal, synergistic choices for a given Draft pick round (1..24).
 * - Picks 1-5: Guaranteed Turn-1 playable Characters (dg === null || dg <= 4) so the deck never bricks.
 * - Picks 6-9: Characters (any DG), helping unlock higher-DG Stands.
 * - Picks 10-16: Stands (compatible with drafted Stand User DG) + Items + Characters.
 * - Picks 17-20: Items, compatible Stands, Characters, and Evolutions whose base is already drafted.
 * - Picks 21-24: High-rarity finale (SR/UR prioritized, plus any eligible Evolutions).
 */
export function generateDraftChoices(
  pickNumber: number,
  pickedCardIds: readonly string[],
  seed: number,
): string[] {
  const rng = createSeededRng(seed + pickNumber * 7919 + pickedCardIds.length * 131);
  const counts = new Map<string, number>();
  for (const id of pickedCardIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const maxUserDg = getMaxUserDg(pickedCardIds);
  const available = ALL_CARDS.filter((c) => canAddDraftCard(c, counts));

  let pool: AnyCard[];
  if (pickNumber <= 5) {
    pool = available.filter(
      (c) => c.type === 'CHARACTER' && (c.dg === null || c.dg <= 4),
    );
  } else if (pickNumber <= 9) {
    pool = available.filter((c) => c.type === 'CHARACTER');
  } else if (pickNumber <= 16) {
    pool = available.filter((c) => {
      if (c.type === 'STAND') return maxUserDg > 0 && c.requiredDg <= maxUserDg;
      if (c.type === 'ITEM' || c.type === 'CHARACTER') return true;
      return false;
    });
  } else if (pickNumber <= 20) {
    pool = available.filter((c) => {
      if (c.type === 'EVOLUTION') return isEvolutionBaseDrafted(c, pickedCardIds);
      if (c.type === 'STAND') return maxUserDg > 0 && c.requiredDg <= maxUserDg;
      return c.type === 'ITEM' || c.type === 'CHARACTER';
    });
  } else {
    // Picks 21-24: high-impact SR/UR finale + unlocked evolutions
    const highImpact = available.filter((c) => {
      if (c.type === 'EVOLUTION') return isEvolutionBaseDrafted(c, pickedCardIds);
      if (c.type === 'STAND' && (maxUserDg <= 0 || c.requiredDg > maxUserDg)) return false;
      const r = getCardRarity(c.id);
      return r === 'SUPER_RARE' || r === 'BIZARRE_RARE';
    });
    pool = highImpact.length >= 3 ? highImpact : available.filter((c) => c.type !== 'EVOLUTION');
  }

  if (pool.length < 3) {
    pool = available.filter((c) => c.type !== 'EVOLUTION');
  }

  // Shuffle deterministically and pick 3 distinct card IDs
  const shuffled = rng.shuffle(pool);

  const chosen: string[] = [];
  for (const c of shuffled) {
    if (!chosen.includes(c.id)) {
      chosen.push(c.id);
      if (chosen.length === 3) break;
    }
  }
  return chosen;
}

/**
 * Completes the 24 drafted non-energy cards up to 46 legal cards by adding 22 optimal
 * Basic Energies (and up to 2 Stand Energies if Stands were drafted) weighted by attack costs.
 */
export function finalizeDraftDeck(pickedCardIds: readonly string[]): string[] {
  const maxDeck = DEFAULT_RULES_CONFIG.maxDeckSize;
  const deck = [...pickedCardIds];
  if (deck.length >= maxDeck) return deck.slice(0, maxDeck);

  const colorWeights = new Map<EnergyType, number>();
  let needsStandEnergy = false;

  for (const id of deck) {
    const card = getCardById(id);
    if (!card) continue;
    if (card.type === 'STAND') needsStandEnergy = true;
    if (card.type === 'CHARACTER' || card.type === 'STAND' || card.type === 'EVOLUTION') {
      for (const atk of card.attacks) {
        for (const e of atk.energyCost) {
          if (e === 'STAND') {
            needsStandEnergy = true;
          } else if (e !== 'COLORLESS') {
            colorWeights.set(e, (colorWeights.get(e) ?? 0) + 1);
          }
        }
      }
    }
  }

  if (needsStandEnergy) {
    const maxStand = Math.min(2, DEFAULT_RULES_CONFIG.maxStandEnergyCopies);
    for (let i = 0; i < maxStand && deck.length < maxDeck; i++) {
      deck.push('energy-stand');
    }
  }

  const remaining = maxDeck - deck.length;
  const entries = Array.from(colorWeights.entries()).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    // Pure colorless attacks: fill with colorless/balanced basic energies
    for (let i = 0; i < remaining; i++) {
      const et = BASIC_ENERGY_TYPES[i % BASIC_ENERGY_TYPES.length]!;
      deck.push(ENERGY_ID_BY_TYPE[et]);
    }
    return deck;
  }

  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
  let added = 0;
  for (const [et, w] of entries) {
    const count = Math.max(1, Math.round((w / totalWeight) * remaining));
    for (let i = 0; i < count && added < remaining; i++) {
      deck.push(ENERGY_ID_BY_TYPE[et]);
      added++;
    }
  }

  // Top off any rounding gap with the primary color
  const primaryEnergyId = ENERGY_ID_BY_TYPE[entries[0]![0]];
  while (deck.length < maxDeck) {
    deck.push(primaryEnergyId);
  }

  return deck;
}

export function createDraftRun(seed = Math.floor(Date.now() % 1_000_000_000)): DraftRunState {
  const currentChoices = generateDraftChoices(1, [], seed);
  return {
    runId: `draft-${seed}-${Math.floor(Math.random() * 10000)}`,
    seed,
    status: 'DRAFTING',
    currentPick: 1,
    totalPicks: DRAFT_TOTAL_PICKS,
    currentChoices,
    pickedCardIds: [],
    finalDeckIds: [],
    wins: 0,
    losses: 0,
    matchesPlayed: 0,
    metaCoinsClaimed: null,
  };
}

export function pickDraftCard(run: DraftRunState, cardId: string): DraftRunState {
  if (run.status !== 'DRAFTING') return run;
  if (!run.currentChoices.includes(cardId)) return run;

  const pickedCardIds = [...run.pickedCardIds, cardId];
  if (pickedCardIds.length >= run.totalPicks) {
    const finalDeckIds = finalizeDraftDeck(pickedCardIds);
    return {
      ...run,
      status: 'READY',
      currentPick: run.totalPicks,
      currentChoices: [],
      pickedCardIds,
      finalDeckIds,
    };
  }

  const nextPick = pickedCardIds.length + 1;
  return {
    ...run,
    currentPick: nextPick,
    currentChoices: generateDraftChoices(nextPick, pickedCardIds, run.seed),
    pickedCardIds,
  };
}

const ARENA_TIERS: {
  title: string;
  difficulty: AiDifficulty;
  aiErrorRate: number;
}[] = [
  { title: 'Aspirante de Arena', difficulty: 'EASY', aiErrorRate: 0.24 },
  { title: 'Duelista de Arena', difficulty: 'NORMAL', aiErrorRate: 0.16 },
  { title: 'Veterano de Arena', difficulty: 'NORMAL', aiErrorRate: 0.1 },
  { title: 'Maestro de Arena', difficulty: 'HARD', aiErrorRate: 0.05 },
  { title: 'Campeón Defensor', difficulty: 'HARD', aiErrorRate: 0 },
];

export function buildDraftOpponent(
  wins: number,
  matchesPlayed: number,
  seed: number,
): DraftOpponentDef {
  const tierIdx = Math.max(0, Math.min(ARENA_TIERS.length - 1, wins));
  const tier = ARENA_TIERS[tierIdx]!;
  const rng = createSeededRng(seed + (matchesPlayed + 1) * 4099 + wins * 257);
  const preset = PRESET_DECKS[Math.floor(rng.nextFloat() * PRESET_DECKS.length)] ?? PRESET_DECKS[0]!;
  const featured =
    preset.cardIds.find((id) => getStandCard(id) !== undefined) ??
    preset.cardIds.find((id) => getCharacterCard(id) !== undefined) ??
    preset.cardIds[0]!;

  return {
    matchIndex: matchesPlayed,
    name: `${tier.title} · ${preset.name}`,
    subtitle: `Ronda ${matchesPlayed + 1} · Dificultad ${tier.difficulty === 'EASY' ? 'Fácil' : tier.difficulty === 'NORMAL' ? 'Normal' : 'Difícil'}`,
    deckIds: [...preset.cardIds],
    featuredCardId: featured,
    difficulty: tier.difficulty,
    aiErrorRate: tier.aiErrorRate,
  };
}

export function resolveDraftBattleOutcome(run: DraftRunState, didWin: boolean): DraftRunState {
  const wins = run.wins + (didWin ? 1 : 0);
  const losses = run.losses + (didWin ? 0 : 1);
  const matchesPlayed = run.matchesPlayed + 1;
  const finished = wins >= DRAFT_MAX_WINS || losses >= DRAFT_MAX_LOSSES;

  return {
    ...run,
    wins,
    losses,
    matchesPlayed,
    status: finished ? 'FINISHED' : 'READY',
  };
}

export function computeDraftMetaReward(run: DraftRunState): DraftMetaReward {
  const w = Math.max(0, Math.min(DRAFT_MAX_WINS, run.wins));
  const table: Record<number, { coins: number; packs: number }> = {
    0: { coins: 40, packs: 0 },
    1: { coins: 90, packs: 0 },
    2: { coins: 160, packs: 0 },
    3: { coins: 240, packs: 1 },
    4: { coins: 340, packs: 1 },
    5: { coins: 500, packs: 2 },
  };
  const entry = table[w] ?? table[0]!;
  const isChampion = w >= DRAFT_MAX_WINS;
  const packLabel =
    entry.packs > 0
      ? ` + ${entry.packs}× Sobre General`
      : '';

  return {
    coins: entry.coins,
    packCount: entry.packs,
    isChampion,
    breakdown: `${w} victoria${w === 1 ? '' : 's'} en Arena Draft (${w}V - ${run.losses}D) → +${entry.coins} Monedas${packLabel}`,
  };
}
