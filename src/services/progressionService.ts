import { ALL_CARDS, getCardById } from '../data/cardRegistry';
import {
  BATTLE_REWARDS,
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

export interface PlayerProgression {
  coins: number;
  /** Owned copies per collectible cardId (Basic Energies are always unlimited) */
  ownedCards: Record<string, number>;
  packsOpened: number;
  wins: number;
  losses: number;
}

export interface PackPullResult {
  cardId: string;
  rarity: CardRarity;
  isNew: boolean;
  isDuplicate: boolean;
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

export type CraftRecipeId = 'COMMON_TO_RARE' | 'RARE_TO_SUPER_RARE' | 'SUPER_RARE_TO_BIZARRE_RARE';

export interface CraftRecipeDef {
  id: CraftRecipeId;
  inputRarity: CardRarity;
  inputCount: number;
  outputRarity: CardRarity;
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

export function createInitialProgression(): PlayerProgression {
  const ownedCards: Record<string, number> = {};
  for (const cardId of STARTER_DECK.cardIds) {
    const card = getCardById(cardId);
    if (!card || card.type === 'ENERGY') continue;
    const limit = DEFAULT_RULES_CONFIG.maxCopiesByType[card.type] ?? 1;
    ownedCards[cardId] = Math.min(limit, (ownedCards[cardId] ?? 0) + 1);
  }
  return {
    coins: INITIAL_TEST_COINS,
    ownedCards,
    packsOpened: 0,
    wins: 0,
    losses: 0,
  };
}

const LEGACY_ITEM_ID_MIGRATION: Record<string, string> = {
  'item-brujula-de-energia': 'item-atraccion-usuarios-stand',
  'item-llamada-del-destino': 'item-flecha-de-stand',
  'item-impulso-espiritual': 'item-comida-de-tonio',
  'item-cambio-tactico': 'item-suministros-speedwagon',
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

  return {
    ...progression,
    ownedCards: nextOwned,
  };
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

    pulls.push({
      cardId,
      rarity: cardRarity,
      isNew: prevOwned === 0,
      isDuplicate: prevOwned > 0,
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
      coins: Math.max(0, currentProgression.coins - pack.price),
      ownedCards: nextOwned,
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
 * Crafts a random card of the target rarity by sacrificing the required number of DUPLICATE cards
 * of the input rarity (at least 1 base copy of every card must remain in the player's collection).
 */
export function craftRandomCard(
  currentProgression: PlayerProgression,
  recipeId: CraftRecipeId,
  customSelection?: Record<string, number>,
  rng: RngProvider = createSystemRng(),
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

  const nextOwned: Record<string, number> = { ...currentProgression.ownedCards };
  for (const [cardId, count] of Object.entries(consumedCards)) {
    const remaining = (nextOwned[cardId] ?? 0) - count;
    if (remaining > 0) {
      nextOwned[cardId] = remaining;
    } else {
      delete nextOwned[cardId];
    }
  }

  const pickedIdx = Math.floor(rng.nextFloat() * candidatePool.length) % candidatePool.length;
  const rewardCard = candidatePool[pickedIdx]!;
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
