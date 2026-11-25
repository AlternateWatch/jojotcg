import { ALL_CARDS, getCardById } from '../data/cardRegistry';
import type { CampaignStageDef } from '../data/campaignData';
import type { TutorialLessonDef } from '../data/tutorialData';
import {
  ALL_MILESTONES,
  getMilestoneById,
  type MilestoneDef,
} from '../data/milestonesData';
import {
  BATTLE_REWARDS,
  getBoosterPackById,
  getCardRarity,
  INITIAL_TEST_COINS,
  RARITY_META,
  STARTER_DECK,
  type BoosterPackDef,
  type CardRarity,
} from '../data/progressionData';
import { DEFAULT_RULES_CONFIG } from '../data/rulesConfig';
import type { AiDifficulty } from '../engine/ai/tacticalAi';
import { createSystemRng, type RngProvider } from '../engine/rng';
import type { SavedDeck } from './storageService';

export interface PlayerProgression {
  coins: number;
  /** Owned copies per collectible cardId (Basic Energies are always unlimited) */
  ownedCards: Record<string, number>;
  /** Holographic / Foil copies owned per collectible cardId */
  foilCards?: Record<string, number>;
  /** Card IDs for which the player has equipped the Holographic / Foil cosmetic variant */
  equippedFoilCardIds?: string[];
  packsOpened: number;
  wins: number;
  losses: number;
  /** Campaign stage IDs already cleared (one-time pickup rewards claimed) */
  completedCampaignStages: string[];
  /** Tutorial lesson IDs already cleared (one-time basic rewards claimed) */
  completedTutorialLessons: string[];
  /** Milestone IDs whose extra coin rewards have already been claimed (one-time pickup) */
  claimedMilestones: string[];
  /** Roguelike starter deck IDs that have cleared Floor 30 */
  completedRoguelikeStarters?: string[];
  /** Highest Roguelike Ascension level cleared (0..5) */
  maxRoguelikeAscensionCleared?: number;
  /** Number of 5-win Draft Arena championships completed */
  draftChampionWins?: number;
  /** Claimed Roguelike/Draft achievement IDs */
  claimedRoguelikeAchievements?: string[];
}

export interface PackPullResult {
  cardId: string;
  rarity: CardRarity;
  isNew: boolean;
  isDuplicate: boolean;
  /** True when this pull rolled a cosmetic Holographic / Foil variant */
  isFoil?: boolean;
  /** Backwards-compatible fields (now always false / 0 since duplicates are stored for crafting) */
  isDuplicateRefund: boolean;
  refundCoins: number;
  newOwnedCount: number;
  slotIndex: number;
}

export interface OpenPackOutcome {
  packId: string;
  pulls: PackPullResult[];
  totalRefundCoins: number;
  nextProgression: PlayerProgression;
}

export type CraftRecipeId =
  | 'COMMON_TO_RARE'
  | 'RARE_TO_SUPER_RARE'
  | 'SUPER_RARE_TO_BIZARRE_RARE'
  | 'BIZARRE_RARE_TO_CHOSEN_UR';

export interface CraftRecipeDef {
  id: CraftRecipeId;
  inputRarity: CardRarity;
  inputCount: number;
  outputRarity: CardRarity;
  selectableTarget?: boolean;
  label: string;
  description: string;
}

export const CRAFT_RECIPES: Record<CraftRecipeId, CraftRecipeDef> = {
  COMMON_TO_RARE: {
    id: 'COMMON_TO_RARE',
    inputRarity: 'COMMON',
    inputCount: 5,
    outputRarity: 'RARE',
    label: '5 Comunes → 1 Rara',
    description: 'Sacrifica 5 cartas Comunes (C) para forjar 1 carta Rara (R) aleatoria.',
  },
  RARE_TO_SUPER_RARE: {
    id: 'RARE_TO_SUPER_RARE',
    inputRarity: 'RARE',
    inputCount: 10,
    outputRarity: 'SUPER_RARE',
    label: '10 Raras → 1 Súper Rara',
    description: 'Sacrifica 10 cartas Raras (R) para forjar 1 carta Súper Rara (SR) aleatoria.',
  },
  SUPER_RARE_TO_BIZARRE_RARE: {
    id: 'SUPER_RARE_TO_BIZARRE_RARE',
    inputRarity: 'SUPER_RARE',
    inputCount: 15,
    outputRarity: 'BIZARRE_RARE',
    label: '15 Súper Raras → 1 Bizarre Rare (UR)',
    description:
      'Sacrifica 15 cartas Súper Raras (SR) para forjar 1 carta Bizarre Rare (UR) aleatoria.',
  },
  BIZARRE_RARE_TO_CHOSEN_UR: {
    id: 'BIZARRE_RARE_TO_CHOSEN_UR',
    inputRarity: 'BIZARRE_RARE',
    inputCount: 5,
    outputRarity: 'BIZARRE_RARE',
    selectableTarget: true,
    label: '5 UR → 1 UR a tu elección',
    description:
      'Sacrifica 5 cartas Bizarre Rare (UR) repetidas para forjar la carta Bizarre Rare (UR) que tú elijas.',
  },
};

export interface CraftOutcome {
  ok: boolean;
  error?: string;
  recipeId: CraftRecipeId;
  consumedCards: Record<string, number>;
  rewardCardId?: string;
  rewardRarity?: CardRarity;
  isNew?: boolean;
  newOwnedCount?: number;
  nextProgression: PlayerProgression;
}

export const COLLECTIBLE_CARDS = ALL_CARDS.filter((c) => c.type !== 'ENERGY');

/** Promotional Holographic / Foil cards granted to player inventories */
export const PROMO_FOIL_CARD_IDS: readonly string[] = ['stand-sticky-fingers'];
/** Uniform 0.1% (1 in 1,000) drop rate for a Holographic / Foil variant on any pulled card */
export const FOIL_DROP_RATE = 0.001;

export function createInitialProgression(): PlayerProgression {
  const ownedCards: Record<string, number> = {};
  const foilCards: Record<string, number> = {};
  for (const cardId of STARTER_DECK.cardIds) {
    const card = getCardById(cardId);
    if (!card || card.type === 'ENERGY') continue;
    const limit = DEFAULT_RULES_CONFIG.maxCopiesByType[card.type] ?? 1;
    ownedCards[cardId] = Math.min(limit, (ownedCards[cardId] ?? 0) + 1);
  }
  for (const foilId of PROMO_FOIL_CARD_IDS) {
    if (getCardById(foilId)) {
      ownedCards[foilId] = Math.max(1, ownedCards[foilId] ?? 0);
      foilCards[foilId] = Math.max(1, foilCards[foilId] ?? 0);
    }
  }
  return {
    coins: INITIAL_TEST_COINS,
    ownedCards,
    foilCards,
    equippedFoilCardIds: [],
    packsOpened: 0,
    wins: 0,
    losses: 0,
    completedCampaignStages: [],
    completedTutorialLessons: [],
    claimedMilestones: [],
    completedRoguelikeStarters: [],
    maxRoguelikeAscensionCleared: 0,
    draftChampionWins: 0,
    claimedRoguelikeAchievements: [],
  };
}

const LEGACY_ITEM_ID_MIGRATION: Record<string, string> = {
  'item-brujula-de-energia': 'item-atraccion-usuarios-stand',
  'item-llamada-del-destino': 'item-flecha-de-stand',
  'item-impulso-espiritual': 'item-comida-de-tonio',
  'item-cambio-tactico': 'item-suministros-speedwagon',
  'char-stray-cat': 'stand-stray-cat',
};

/**
 * Ensures any loaded/saved player progression migrates old item IDs
 * and always owns all cards required by STARTER_DECK so the starter deck is 100% playable.
 */
export function normalizePlayerProgression(progression: PlayerProgression): PlayerProgression {
  const baseline = createInitialProgression();
  const nextOwned: Record<string, number> = {};

  for (const [rawId, count] of Object.entries(progression.ownedCards ?? {})) {
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) continue;
    const mappedId = LEGACY_ITEM_ID_MIGRATION[rawId] ?? rawId;
    const card = getCardById(mappedId);
    if (!card || card.type === 'ENERGY') continue;
    nextOwned[mappedId] = (nextOwned[mappedId] ?? 0) + Math.floor(count);
  }

  for (const [starterId, minCopies] of Object.entries(baseline.ownedCards)) {
    if ((nextOwned[starterId] ?? 0) < minCopies) {
      nextOwned[starterId] = minCopies;
    }
  }

  const nextFoil: Record<string, number> = {};
  for (const [rawId, count] of Object.entries(progression.foilCards ?? {})) {
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) continue;
    const mappedId = LEGACY_ITEM_ID_MIGRATION[rawId] ?? rawId;
    const card = getCardById(mappedId);
    if (!card || card.type === 'ENERGY') continue;
    nextFoil[mappedId] = (nextFoil[mappedId] ?? 0) + Math.floor(count);
  }
  for (const promoFoilId of PROMO_FOIL_CARD_IDS) {
    if (getCardById(promoFoilId)) {
      if ((nextOwned[promoFoilId] ?? 0) < 1) nextOwned[promoFoilId] = 1;
      if ((nextFoil[promoFoilId] ?? 0) < 1) nextFoil[promoFoilId] = 1;
    }
  }

  const completedCampaignStages = Array.isArray(progression.completedCampaignStages)
    ? Array.from(
        new Set(
          progression.completedCampaignStages.filter((id): id is string => typeof id === 'string'),
        ),
      )
    : [];

  const completedTutorialLessons = Array.isArray(progression.completedTutorialLessons)
    ? Array.from(
        new Set(
          progression.completedTutorialLessons.filter((id): id is string => typeof id === 'string'),
        ),
      )
    : [];

  const claimedMilestones = Array.isArray(progression.claimedMilestones)
    ? Array.from(
        new Set(
          progression.claimedMilestones.filter((id): id is string => typeof id === 'string'),
        ),
      )
    : [];

  const equippedFoilCardIds = Array.isArray(progression.equippedFoilCardIds)
    ? Array.from(
        new Set(
          progression.equippedFoilCardIds
            .filter((id): id is string => typeof id === 'string')
            .map((id) => LEGACY_ITEM_ID_MIGRATION[id] ?? id)
            .filter((id) => (nextFoil[id] ?? 0) > 0),
        ),
      )
    : [];

  const completedRoguelikeStarters = Array.isArray(progression.completedRoguelikeStarters)
    ? Array.from(
        new Set(
          progression.completedRoguelikeStarters.filter((id): id is string => typeof id === 'string'),
        ),
      )
    : [];

  const maxRoguelikeAscensionCleared =
    typeof progression.maxRoguelikeAscensionCleared === 'number' &&
    Number.isFinite(progression.maxRoguelikeAscensionCleared)
      ? Math.max(0, Math.min(5, Math.floor(progression.maxRoguelikeAscensionCleared)))
      : 0;

  const draftChampionWins =
    typeof progression.draftChampionWins === 'number' &&
    Number.isFinite(progression.draftChampionWins)
      ? Math.max(0, Math.floor(progression.draftChampionWins))
      : 0;

  const claimedRoguelikeAchievements = Array.isArray(progression.claimedRoguelikeAchievements)
    ? Array.from(
        new Set(
          progression.claimedRoguelikeAchievements.filter(
            (id): id is string => typeof id === 'string',
          ),
        ),
      )
    : [];

  return {
    ...progression,
    ownedCards: nextOwned,
    foilCards: nextFoil,
    equippedFoilCardIds,
    completedCampaignStages,
    completedTutorialLessons,
    claimedMilestones,
    completedRoguelikeStarters,
    maxRoguelikeAscensionCleared,
    draftChampionWins,
    claimedRoguelikeAchievements,
  };
}

/**
 * Migrates legacy/deleted item IDs inside saved custom decks and removes any unknown IDs
 * while respecting copy limits per card type.
 */
export function normalizeSavedDecks(decks: readonly SavedDeck[]): SavedDeck[] {
  return decks.map((deck) => {
    const counts = new Map<string, number>();
    const nextIds: string[] = [];
    for (const rawId of deck.cardIds) {
      const mappedId = LEGACY_ITEM_ID_MIGRATION[rawId] ?? rawId;
      const card = getCardById(mappedId);
      if (!card) continue;
      const limit = DEFAULT_RULES_CONFIG.maxCopiesByType[card.type];
      const current = counts.get(mappedId) ?? 0;
      if (limit !== null && current >= limit) continue;
      counts.set(mappedId, current + 1);
      nextIds.push(mappedId);
    }
    return {
      ...deck,
      cardIds: nextIds,
    };
  });
}

export function getMaxCollectibleCopies(cardId: string): number {
  const card = getCardById(cardId);
  if (!card) return 0;
  if (card.type === 'ENERGY') return Number.POSITIVE_INFINITY;
  return DEFAULT_RULES_CONFIG.maxCopiesByType[card.type] ?? 1;
}

export function getOwnedCount(progression: PlayerProgression, cardId: string): number {
  const card = getCardById(cardId);
  if (!card) return 0;
  if (card.type === 'ENERGY') return Number.POSITIVE_INFINITY;
  return progression.ownedCards[cardId] ?? 0;
}

export function isCardUnlocked(progression: PlayerProgression, cardId: string): boolean {
  return getOwnedCount(progression, cardId) > 0;
}

export function getFoilCount(progression: PlayerProgression, cardId: string): number {
  return progression.foilCards?.[cardId] ?? 0;
}

export function isCardFoilOwned(progression: PlayerProgression, cardId: string): boolean {
  return getFoilCount(progression, cardId) > 0;
}

export function isCardFoilEquipped(progression: PlayerProgression, cardId: string): boolean {
  return (
    isCardFoilOwned(progression, cardId) &&
    Boolean(progression.equippedFoilCardIds?.includes(cardId))
  );
}

export function getCollectionProgress(progression: PlayerProgression): {
  unlocked: number;
  total: number;
  percent: number;
} {
  const total = COLLECTIBLE_CARDS.length;
  let unlocked = 0;
  for (const c of COLLECTIBLE_CARDS) {
    if ((progression.ownedCards[c.id] ?? 0) > 0) unlocked++;
  }
  return {
    unlocked,
    total,
    percent: total > 0 ? Math.round((unlocked / total) * 100) : 0,
  };
}

export function getPackCollectionProgress(
  progression: PlayerProgression,
  pack: BoosterPackDef,
): { unlocked: number; total: number } {
  const uniqueIds = Array.from(new Set(pack.poolCardIds));
  let unlocked = 0;
  for (const id of uniqueIds) {
    if ((progression.ownedCards[id] ?? 0) > 0) unlocked++;
  }
  return { unlocked, total: uniqueIds.length };
}

export function getMissingCardsForDeck(
  progression: PlayerProgression,
  cardIds: readonly string[],
): { cardId: string; needed: number; owned: number }[] {
  const neededMap = new Map<string, number>();
  for (const id of cardIds) {
    const card = getCardById(id);
    if (!card || card.type === 'ENERGY') continue;
    neededMap.set(id, (neededMap.get(id) ?? 0) + 1);
  }
  const missing: { cardId: string; needed: number; owned: number }[] = [];
  for (const [cardId, needed] of neededMap.entries()) {
    const owned = progression.ownedCards[cardId] ?? 0;
    if (owned < needed) {
      missing.push({ cardId, needed, owned });
    }
  }
  return missing;
}

export function computeEffectivePackRates(
  pack: BoosterPackDef,
  isFeaturedSlot: boolean,
): Record<CardRarity, number> {
  const byRarity: Record<CardRarity, string[]> = {
    COMMON: [],
    RARE: [],
    SUPER_RARE: [],
    BIZARRE_RARE: [],
  };
  for (const id of pack.poolCardIds) {
    byRarity[getCardRarity(id)].push(id);
  }

  const rates: Record<CardRarity, number> = {
    COMMON: 0,
    RARE: 0,
    SUPER_RARE: 0,
    BIZARRE_RARE: 0,
  };

  // Preserve exact 0.5% UR rate whenever the pack contains BIZARRE_RARE chase cards!
  const hasUr = byRarity.BIZARRE_RARE.length > 0;
  const urRate = hasUr
    ? isFeaturedSlot
      ? RARITY_META.BIZARRE_RARE.featuredSlotRate
      : RARITY_META.BIZARRE_RARE.normalSlotRate
    : 0;
  rates.BIZARRE_RARE = urRate;

  const otherTiers: CardRarity[] = ['COMMON', 'RARE', 'SUPER_RARE'];
  const rawWeights: Record<CardRarity, number> = {
    COMMON:
      byRarity.COMMON.length > 0
        ? isFeaturedSlot
          ? RARITY_META.COMMON.featuredSlotRate
          : RARITY_META.COMMON.normalSlotRate
        : 0,
    RARE:
      byRarity.RARE.length > 0
        ? isFeaturedSlot
          ? RARITY_META.RARE.featuredSlotRate
          : RARITY_META.RARE.normalSlotRate
        : 0,
    SUPER_RARE:
      byRarity.SUPER_RARE.length > 0
        ? isFeaturedSlot
          ? RARITY_META.SUPER_RARE.featuredSlotRate
          : RARITY_META.SUPER_RARE.normalSlotRate
        : 0,
    BIZARRE_RARE: 0,
  };

  let weightSum = otherTiers.reduce((sum, r) => sum + rawWeights[r], 0);

  // Fallback if featured slot has no R/SR (rare edge case) -> use COMMON
  if (weightSum === 0 && byRarity.COMMON.length > 0) {
    rawWeights.COMMON = 1;
    weightSum = 1;
  }

  const remainingProb = Math.max(0, 1 - urRate);
  if (weightSum > 0) {
    for (const tier of otherTiers) {
      rates[tier] = (rawWeights[tier] / weightSum) * remainingProb;
    }
  } else if (hasUr) {
    rates.BIZARRE_RARE = 1;
  }

  return rates;
}

function rollRarity(rates: Record<CardRarity, number>, roll: number): CardRarity {
  const order: CardRarity[] = ['BIZARRE_RARE', 'SUPER_RARE', 'RARE', 'COMMON'];
  let cumulative = 0;
  for (const r of order) {
    cumulative += rates[r];
    if (roll < cumulative) return r;
  }
  return order.find((r) => rates[r] > 0) ?? 'COMMON';
}

export function openBoosterPack(
  pack: BoosterPackDef,
  currentProgression: PlayerProgression,
  rng: RngProvider = createSystemRng(),
  free = false,
  forceFoilSlotIndex?: number,
  bonusFoilRate = 0,
): OpenPackOutcome {
  const byRarity: Record<CardRarity, string[]> = {
    COMMON: [],
    RARE: [],
    SUPER_RARE: [],
    BIZARRE_RARE: [],
  };
  for (const id of Array.from(new Set(pack.poolCardIds))) {
    byRarity[getCardRarity(id)].push(id);
  }

  const nextOwned: Record<string, number> = { ...currentProgression.ownedCards };
  const nextFoil: Record<string, number> = { ...(currentProgression.foilCards ?? {}) };
  const pulls: PackPullResult[] = [];
  const seenInThisPack = new Set<string>();
  let totalRefundCoins = 0;

  const normalRates = computeEffectivePackRates(pack, false);
  const featuredRates = computeEffectivePackRates(pack, true);

  for (let slot = 0; slot < pack.cardsPerPack; slot++) {
    const isFeatured = slot === pack.cardsPerPack - 1;
    const rarity = rollRarity(isFeatured ? featuredRates : normalRates, rng.nextFloat());
    const tierPool = byRarity[rarity];
    const fallbackPool = tierPool.length > 0 ? tierPool : pack.poolCardIds;

    // Avoid duplicate cards inside the exact same booster pack when possible
    const freshChoices = fallbackPool.filter((id) => !seenInThisPack.has(id));
    const pickFrom = freshChoices.length > 0 ? freshChoices : fallbackPool;
    const pickedIdx = Math.floor(rng.nextFloat() * pickFrom.length) % pickFrom.length;
    const cardId = pickFrom[pickedIdx]!;
    seenInThisPack.add(cardId);

    const cardRarity = getCardRarity(cardId);
    const prevOwned = nextOwned[cardId] ?? 0;
    const nextCount = prevOwned + 1;
    nextOwned[cardId] = nextCount;

    const foilChance = Math.min(1, FOIL_DROP_RATE + Math.max(0, bonusFoilRate));
    const isFoil = forceFoilSlotIndex === slot || rng.nextFloat() < foilChance;
    if (isFoil) {
      nextFoil[cardId] = (nextFoil[cardId] ?? 0) + 1;
    }

    pulls.push({
      cardId,
      rarity: cardRarity,
      isNew: prevOwned === 0,
      isDuplicate: prevOwned > 0,
      isFoil,
      isDuplicateRefund: false,
      refundCoins: 0,
      newOwnedCount: nextCount,
      slotIndex: slot,
    });
  }

  return {
    packId: pack.id,
    pulls,
    totalRefundCoins,
    nextProgression: {
      ...currentProgression,
      coins: free ? currentProgression.coins : Math.max(0, currentProgression.coins - pack.price),
      ownedCards: nextOwned,
      foilCards: nextFoil,
      packsOpened: currentProgression.packsOpened + 1,
    },
  };
}

/**
 * Returns total copies owned for a given rarity, plus how many are surplus
 * beyond each card's deck copy limit (or beyond 1 copy).
 */
export function getRarityInventoryStats(
  progression: PlayerProgression,
  rarity: CardRarity,
): {
  totalCopies: number;
  surplusCopiesBeyondDeckLimit: number;
  surplusCopiesBeyondOne: number;
  cards: { cardId: string; owned: number; deckLimit: number; surplusDeck: number; surplusOne: number }[];
} {
  let totalCopies = 0;
  let surplusCopiesBeyondDeckLimit = 0;
  let surplusCopiesBeyondOne = 0;
  const cards: {
    cardId: string;
    owned: number;
    deckLimit: number;
    surplusDeck: number;
    surplusOne: number;
  }[] = [];

  for (const card of COLLECTIBLE_CARDS) {
    if (getCardRarity(card.id) !== rarity) continue;
    const owned = progression.ownedCards[card.id] ?? 0;
    if (owned <= 0) continue;
    const deckLimit = getMaxCollectibleCopies(card.id);
    const surplusDeck = Math.max(0, owned - deckLimit);
    const surplusOne = Math.max(0, owned - 1);
    totalCopies += owned;
    surplusCopiesBeyondDeckLimit += surplusDeck;
    surplusCopiesBeyondOne += surplusOne;
    cards.push({ cardId: card.id, owned, deckLimit, surplusDeck, surplusOne });
  }

  cards.sort((a, b) => b.surplusDeck - a.surplusDeck || b.owned - a.owned);

  return {
    totalCopies,
    surplusCopiesBeyondDeckLimit,
    surplusCopiesBeyondOne,
    cards,
  };
}

/**
 * Automatically selects which duplicate cards (copies beyond 1, prioritizing copies beyond deck limit)
 * of a given rarity to sacrifice for a craft recipe. Never selects the player's base copy (1st copy).
 */
export function buildAutoCraftSelection(
  progression: PlayerProgression,
  recipeId: CraftRecipeId,
): Record<string, number> {
  const recipe = CRAFT_RECIPES[recipeId];
  const stats = getRarityInventoryStats(progression, recipe.inputRarity);
  const selected: Record<string, number> = {};
  let remaining = recipe.inputCount;

  // Pass 1: consume copies exceeding deck copy limit (1 for CHAR/STAND/EVO, 3 for ITEM)
  for (const entry of stats.cards) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, entry.surplusDeck);
    if (take > 0) {
      selected[entry.cardId] = (selected[entry.cardId] ?? 0) + take;
      remaining -= take;
    }
  }

  // Pass 2: consume any remaining duplicate copies exceeding 1 (e.g. 2nd/3rd copy of an ITEM)
  for (const entry of stats.cards) {
    if (remaining <= 0) break;
    const already = selected[entry.cardId] ?? 0;
    const availAboveOne = Math.max(0, entry.owned - 1 - already);
    const take = Math.min(remaining, availAboveOne);
    if (take > 0) {
      selected[entry.cardId] = already + take;
      remaining -= take;
    }
  }

  return selected;
}

/**
 * Crafts a card of the target rarity (random or player-chosen when recipe.selectableTarget is true)
 * by sacrificing the required number of DUPLICATE cards of the input rarity
 * (at least 1 base copy of every card must remain in the player's collection).
 */
export function craftRandomCard(
  currentProgression: PlayerProgression,
  recipeId: CraftRecipeId,
  customSelection?: Record<string, number>,
  rng: RngProvider = createSystemRng(),
  targetCardId?: string,
): CraftOutcome {
  const recipe = CRAFT_RECIPES[recipeId];
  const selection = customSelection ?? buildAutoCraftSelection(currentProgression, recipeId);

  let totalSelected = 0;
  const consumedCards: Record<string, number> = {};

  for (const [cardId, count] of Object.entries(selection)) {
    const n = Math.floor(count);
    if (n <= 0) continue;
    const card = getCardById(cardId);
    if (!card || card.type === 'ENERGY') {
      return {
        ok: false,
        error: `Carta inválida seleccionada: ${cardId}`,
        recipeId,
        consumedCards: {},
        nextProgression: currentProgression,
      };
    }
    if (getCardRarity(cardId) !== recipe.inputRarity) {
      return {
        ok: false,
        error: `La carta ${card.name} no es de rareza ${RARITY_META[recipe.inputRarity].label}.`,
        recipeId,
        consumedCards: {},
        nextProgression: currentProgression,
      };
    }
    const owned = currentProgression.ownedCards[cardId] ?? 0;
    const availableDuplicates = Math.max(0, owned - 1);
    if (n > availableDuplicates) {
      return {
        ok: false,
        error: `Solo puedes usar cartas repetidas para craftear. De ${card.name} tienes ${availableDuplicates} repetida(s) disponible(s).`,
        recipeId,
        consumedCards: {},
        nextProgression: currentProgression,
      };
    }
    consumedCards[cardId] = n;
    totalSelected += n;
  }

  if (totalSelected !== recipe.inputCount) {
    return {
      ok: false,
      error: `Necesitas seleccionar exactamente ${recipe.inputCount} cartas repetidas de rareza ${RARITY_META[recipe.inputRarity].label} (seleccionadas: ${totalSelected}).`,
      recipeId,
      consumedCards: {},
      nextProgression: currentProgression,
    };
  }

  const candidatePool = COLLECTIBLE_CARDS.filter(
    (c) => getCardRarity(c.id) === recipe.outputRarity,
  );
  if (candidatePool.length === 0) {
    return {
      ok: false,
      error: 'No existen cartas de la rareza objetivo en el catálogo.',
      recipeId,
      consumedCards: {},
      nextProgression: currentProgression,
    };
  }

  let rewardCard = candidatePool[0]!;
  if (recipe.selectableTarget) {
    if (!targetCardId) {
      return {
        ok: false,
        error: `Debes elegir qué carta ${RARITY_META[recipe.outputRarity].label} deseas forjar.`,
        recipeId,
        consumedCards: {},
        nextProgression: currentProgression,
      };
    }
    const chosen = candidatePool.find((c) => c.id === targetCardId);
    if (!chosen) {
      return {
        ok: false,
        error: `La carta elegida no es una carta ${RARITY_META[recipe.outputRarity].label} válida.`,
        recipeId,
        consumedCards: {},
        nextProgression: currentProgression,
      };
    }
    rewardCard = chosen;
  } else {
    const pickedIdx = Math.floor(rng.nextFloat() * candidatePool.length) % candidatePool.length;
    rewardCard = candidatePool[pickedIdx]!;
  }

  const nextOwned: Record<string, number> = { ...currentProgression.ownedCards };
  for (const [cardId, count] of Object.entries(consumedCards)) {
    const remaining = (nextOwned[cardId] ?? 0) - count;
    if (remaining > 0) {
      nextOwned[cardId] = remaining;
    } else {
      delete nextOwned[cardId];
    }
  }

  const prevRewardOwned = nextOwned[rewardCard.id] ?? 0;
  const newRewardOwned = prevRewardOwned + 1;
  nextOwned[rewardCard.id] = newRewardOwned;

  const nextProgression: PlayerProgression = {
    ...currentProgression,
    ownedCards: nextOwned,
  };

  return {
    ok: true,
    recipeId,
    consumedCards,
    rewardCardId: rewardCard.id,
    rewardRarity: recipe.outputRarity,
    isNew: prevRewardOwned === 0,
    newOwnedCount: newRewardOwned,
    nextProgression,
  };
}

export function computeBattleReward(
  mode: 'VS_AI' | 'HOTSEAT' | 'ONLINE',
  difficulty: AiDifficulty,
  didWin: boolean,
): { coins: number; label: string } {
  if (mode === 'ONLINE') {
    return didWin
      ? {
          coins: BATTLE_REWARDS.ONLINE_WIN,
          label: 'Victoria Online 1v1',
        }
      : {
          coins: BATTLE_REWARDS.ONLINE_LOSS,
          label: 'Combate Online 1v1 (Participación)',
        };
  }
  if (mode === 'HOTSEAT') {
    return {
      coins: BATTLE_REWARDS.HOTSEAT_WIN,
      label: 'Recompensa de Duelo Local',
    };
  }
  if (!didWin) {
    return {
      coins: BATTLE_REWARDS.LOSS_CONSOLATION,
      label: 'Recompensa de combate (Experiencia)',
    };
  }
  if (difficulty === 'HARD') {
    return {
      coins: BATTLE_REWARDS.VS_AI_HARD_WIN,
      label: 'Victoria vs IA Difícil',
    };
  }
  if (difficulty === 'EASY') {
    return {
      coins: BATTLE_REWARDS.VS_AI_EASY_WIN,
      label: 'Victoria vs IA Fácil',
    };
  }
  return {
    coins: BATTLE_REWARDS.VS_AI_NORMAL_WIN,
    label: 'Victoria vs IA Normal',
  };
}

export interface CampaignClearResult {
  firstClear: boolean;
  coinsAwarded: number;
  pack: BoosterPackDef | null;
  packOutcomes: OpenPackOutcome[] | null;
  nextProgression: PlayerProgression;
}

/**
 * Strictly one-time pickup campaign reward processor.
 * First clear awards stage coins + any free booster packs (Stage 5: 1 pack, Stage 10: 2 packs).
 * Subsequent clears record the win without granting duplicate stage rewards.
 */
export function claimCampaignStageReward(
  stage: CampaignStageDef,
  progression: PlayerProgression,
  rng: RngProvider = createSystemRng(),
): CampaignClearResult {
  const completed = progression.completedCampaignStages ?? [];
  if (completed.includes(stage.id)) {
    return {
      firstClear: false,
      coinsAwarded: 0,
      pack: null,
      packOutcomes: null,
      nextProgression: {
        ...progression,
        wins: progression.wins + 1,
      },
    };
  }

  let current: PlayerProgression = {
    ...progression,
    coins: progression.coins + stage.rewardCoins,
    wins: progression.wins + 1,
    completedCampaignStages: [...completed, stage.id],
  };

  let rewardPack: BoosterPackDef | null = null;
  let packOutcomes: OpenPackOutcome[] | null = null;

  if (stage.rewardPackId && stage.rewardPackCount && stage.rewardPackCount > 0) {
    const foundPack = getBoosterPackById(stage.rewardPackId);
    if (foundPack) {
      rewardPack = foundPack;
      packOutcomes = [];
      for (let i = 0; i < stage.rewardPackCount; i++) {
        const out = openBoosterPack(foundPack, current, rng, true);
        packOutcomes.push(out);
        current = out.nextProgression;
      }
    }
  }

  return {
    firstClear: true,
    coinsAwarded: stage.rewardCoins,
    pack: rewardPack,
    packOutcomes,
    nextProgression: current,
  };
}

/**
 * Claims one-time basic rewards for completing a Tutorial Lesson.
 */
export function claimTutorialLessonReward(
  lesson: TutorialLessonDef,
  progression: PlayerProgression,
  rng: RngProvider = createSystemRng(),
): CampaignClearResult {
  const completed = progression.completedTutorialLessons ?? [];
  if (completed.includes(lesson.id)) {
    return {
      firstClear: false,
      coinsAwarded: 0,
      pack: null,
      packOutcomes: null,
      nextProgression: {
        ...progression,
        wins: progression.wins + 1,
      },
    };
  }

  let current: PlayerProgression = {
    ...progression,
    coins: progression.coins + lesson.rewardCoins,
    wins: progression.wins + 1,
    completedTutorialLessons: [...completed, lesson.id],
  };

  let rewardPack: BoosterPackDef | null = null;
  let packOutcomes: OpenPackOutcome[] | null = null;

  if (lesson.rewardPackId && lesson.rewardPackCount && lesson.rewardPackCount > 0) {
    const foundPack = getBoosterPackById(lesson.rewardPackId);
    if (foundPack) {
      rewardPack = foundPack;
      packOutcomes = [];
      for (let i = 0; i < lesson.rewardPackCount; i++) {
        const out = openBoosterPack(foundPack, current, rng, true);
        packOutcomes.push(out);
        current = out.nextProgression;
      }
    }
  }

  return {
    firstClear: true,
    coinsAwarded: lesson.rewardCoins,
    pack: rewardPack,
    packOutcomes,
    nextProgression: current,
  };
}

export interface MilestoneProgress {
  milestone: MilestoneDef;
  unlocked: number;
  total: number;
  percent: number;
  isCompleted: boolean;
  isClaimed: boolean;
  canClaim: boolean;
  missingCardIds: string[];
}

export function getMilestoneProgress(
  progression: PlayerProgression,
  milestone: MilestoneDef,
): MilestoneProgress {
  const uniqueIds = Array.from(new Set(milestone.requiredCardIds));
  const missingCardIds: string[] = [];
  let unlocked = 0;
  for (const cardId of uniqueIds) {
    if ((progression.ownedCards[cardId] ?? 0) > 0) {
      unlocked++;
    } else {
      missingCardIds.push(cardId);
    }
  }
  const total = uniqueIds.length;
  const isCompleted = total > 0 && unlocked === total;
  const isClaimed = (progression.claimedMilestones ?? []).includes(milestone.id);
  return {
    milestone,
    unlocked,
    total,
    percent: total > 0 ? Math.round((unlocked / total) * 100) : 0,
    isCompleted,
    isClaimed,
    canClaim: isCompleted && !isClaimed,
    missingCardIds,
  };
}

export function getAllMilestonesProgress(progression: PlayerProgression): MilestoneProgress[] {
  return ALL_MILESTONES.map((m) => getMilestoneProgress(progression, m));
}

export function getClaimableMilestonesCount(progression: PlayerProgression): number {
  let count = 0;
  for (const m of ALL_MILESTONES) {
    if (getMilestoneProgress(progression, m).canClaim) count++;
  }
  return count;
}

export interface ClaimMilestoneResult {
  ok: boolean;
  error?: string;
  coinsAwarded: number;
  milestone?: MilestoneDef;
  nextProgression: PlayerProgression;
}

/**
 * Claims the one-time extra coin reward for a completed milestone.
 */
export function claimMilestoneReward(
  milestoneId: string,
  progression: PlayerProgression,
): ClaimMilestoneResult {
  const milestone = getMilestoneById(milestoneId);
  if (!milestone) {
    return {
      ok: false,
      error: 'Hito no encontrado.',
      coinsAwarded: 0,
      nextProgression: progression,
    };
  }
  const status = getMilestoneProgress(progression, milestone);
  if (status.isClaimed) {
    return {
      ok: false,
      error: 'Este hito ya fue reclamado.',
      coinsAwarded: 0,
      milestone,
      nextProgression: progression,
    };
  }
  if (!status.isCompleted) {
    return {
      ok: false,
      error: `Todavía te faltan ${status.missingCardIds.length} carta(s) para completar este hito.`,
      coinsAwarded: 0,
      milestone,
      nextProgression: progression,
    };
  }

  const nextProgression: PlayerProgression = {
    ...progression,
    coins: progression.coins + milestone.rewardCoins,
    claimedMilestones: [...(progression.claimedMilestones ?? []), milestone.id],
  };

  return {
    ok: true,
    coinsAwarded: milestone.rewardCoins,
    milestone,
    nextProgression,
  };
}

export interface ClaimAllMilestonesResult {
  claimedIds: string[];
  totalCoinsAwarded: number;
  nextProgression: PlayerProgression;
}

/**
 * Claims all completed, unclaimed milestones at once.
 */
export function claimAllReadyMilestones(
  progression: PlayerProgression,
): ClaimAllMilestonesResult {
  const ready = getAllMilestonesProgress(progression).filter((p) => p.canClaim);
  if (ready.length === 0) {
    return {
      claimedIds: [],
      totalCoinsAwarded: 0,
      nextProgression: progression,
    };
  }

  const claimedIds = ready.map((p) => p.milestone.id);
  const totalCoinsAwarded = ready.reduce((sum, p) => sum + p.milestone.rewardCoins, 0);
  const nextProgression: PlayerProgression = {
    ...progression,
    coins: progression.coins + totalCoinsAwarded,
    claimedMilestones: [...(progression.claimedMilestones ?? []), ...claimedIds],
  };

  return {
    claimedIds,
    totalCoinsAwarded,
    nextProgression,
  };
}
