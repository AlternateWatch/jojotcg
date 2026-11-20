import { describe, expect, it } from 'vitest';
import { ALL_CARDS, getCardById, PRESET_DECKS } from '../../data/cardRegistry';
import {
  BOOSTER_PACKS,
  CARD_RARITY_MAP,
  getCardRarity,
  getPacksContainingCard,
  INITIAL_TEST_COINS,
  STARTER_DECK,
} from '../../data/progressionData';
import { createSeededRng } from '../../engine/rng';
import { validateDeck } from '../../services/deckValidator';
import {
  COLLECTIBLE_CARDS,
  computeBattleReward,
  computeEffectivePackRates,
  craftRandomCard,
  createInitialProgression,
  getMissingCardsForDeck,
  getOwnedCount,
  getRarityInventoryStats,
  openBoosterPack,
} from '../../services/progressionService';

describe('Progression, Starter Deck & Booster Pack Shop', () => {
  it('assigns an explicit rarity and at least one booster pack to every collectible card', () => {
    for (const card of COLLECTIBLE_CARDS) {
      expect(CARD_RARITY_MAP[card.id], `Missing rarity for ${card.id}`).toBeDefined();
      const packs = getPacksContainingCard(card.id);
      expect(packs.length, `Card ${card.id} (${card.name}) is not obtainable in any pack`).toBeGreaterThan(0);
    }
    expect(COLLECTIBLE_CARDS.length + 8).toBe(ALL_CARDS.length);
  });

  it('every booster pack references valid cards and preserves exact 0.5% UR drop rate', () => {
    expect(BOOSTER_PACKS.filter((p) => p.series === 'PART')).toHaveLength(5);
    expect(BOOSTER_PACKS.filter((p) => p.series === 'CORRELATION')).toHaveLength(5);

    for (const pack of BOOSTER_PACKS) {
      expect(pack.price).toBeGreaterThan(0);
      expect(getCardById(pack.coverCardId), `Invalid coverCardId in ${pack.id}`).toBeDefined();
      for (const cid of pack.poolCardIds) {
        expect(getCardById(cid), `Invalid poolCardId ${cid} in ${pack.id}`).toBeDefined();
      }
      for (const cid of pack.chaseCardIds) {
        expect(pack.poolCardIds, `Chase card ${cid} missing from pool in ${pack.id}`).toContain(cid);
        expect(CARD_RARITY_MAP[cid]).toBe('BIZARRE_RARE');
      }

      const normalRates = computeEffectivePackRates(pack, false);
      const featuredRates = computeEffectivePackRates(pack, true);
      const sumNormal = Object.values(normalRates).reduce((a, b) => a + b, 0);
      const sumFeatured = Object.values(featuredRates).reduce((a, b) => a + b, 0);
      expect(sumNormal).toBeCloseTo(1, 6);
      expect(sumFeatured).toBeCloseTo(1, 6);

      if (pack.chaseCardIds.length > 0) {
        expect(normalRates.BIZARRE_RARE).toBeCloseTo(0.005, 6);
        expect(featuredRates.BIZARRE_RARE).toBeCloseTo(0.005, 6);
      }
    }
  });

  it('grants every new player the 40-card Starter Deck (legal, 0 warnings) + high test coins, while locking elite cards', () => {
    const val = validateDeck(STARTER_DECK.cardIds);
    expect(val.valid, val.errors.map((e) => e.message).join('; ')).toBe(true);
    expect(val.warnings, val.warnings.map((w) => w.message).join('; ')).toHaveLength(0);

    const prog = createInitialProgression();
    expect(prog.coins).toBe(INITIAL_TEST_COINS);
    expect(getMissingCardsForDeck(prog, STARTER_DECK.cardIds)).toHaveLength(0);

    // Elite preset decks require unlocking cards from packs
    const stardust = PRESET_DECKS.find((d) => d.id === 'preset-stardust-crusaders')!;
    expect(getMissingCardsForDeck(prog, stardust.cardIds).length).toBeGreaterThan(0);
    expect(getOwnedCount(prog, 'char-dio')).toBe(0);
    expect(getOwnedCount(prog, 'energy-psychic')).toBe(Number.POSITIVE_INFINITY);
  });

  it('opens packs, unlocks cards, stores duplicate copies in collection without coin refunds, and matches ~0.5% UR rate', () => {
    const part3 = BOOSTER_PACKS.find((p) => p.id === 'pack-part-3')!;
    let prog = { ...createInitialProgression(), coins: 1_000 };
    const rng = createSeededRng(20261120);

    const firstOpen = openBoosterPack(part3, prog, rng);
    expect(firstOpen.pulls).toHaveLength(5);
    expect(firstOpen.nextProgression.packsOpened).toBe(1);
    expect(firstOpen.totalRefundCoins).toBe(0);
    expect(firstOpen.nextProgression.coins).toBe(prog.coins - part3.price);

    // Statistical check across 1,000 packs (5,000 cards): UR rate should be around 0.5% (10..50 hits)
    prog = { ...createInitialProgression(), coins: 10_000_000 };
    let urHits = 0;
    let totalCards = 0;
    let duplicatesStored = 0;
    for (let i = 0; i < 1000; i++) {
      const res = openBoosterPack(part3, prog, rng);
      expect(res.totalRefundCoins).toBe(0);
      prog = res.nextProgression;
      for (const pull of res.pulls) {
        totalCards++;
        if (pull.rarity === 'BIZARRE_RARE') urHits++;
        if (pull.isDuplicate) {
          duplicatesStored++;
          expect(pull.refundCoins).toBe(0);
          expect(pull.newOwnedCount).toBeGreaterThan(1);
        }
      }
    }
    const empiricalUrRate = urHits / totalCards;
    expect(empiricalUrRate).toBeGreaterThan(0.0015);
    expect(empiricalUrRate).toBeLessThan(0.012);
    expect(duplicatesStored).toBeGreaterThan(0);
  });

  it('crafts random cards using ONLY duplicate copies across all 3 recipes (5 Common -> 1 Rare, 10 Rare -> 1 Super Rare, 15 Super Rare -> 1 Bizarre Rare)', () => {
    const rng = createSeededRng(998877);
    let prog = createInitialProgression();

    // Base starter deck only has 4 duplicate common copies (4 items with 2 copies each), so crafting must fail until 5 duplicates exist!
    const failNotEnoughDups = craftRandomCard(prog, 'COMMON_TO_RARE', undefined, rng);
    expect(failNotEnoughDups.ok).toBe(false);

    // Attempting to sacrifice the only copy of a card is also rejected
    const failSingleCopy = craftRandomCard(
      prog,
      'COMMON_TO_RARE',
      {
        'char-jonathan-joestar': 1,
        'item-brujula-de-energia': 1,
        'item-llamada-del-destino': 1,
        'item-comida-de-tonio': 1,
        'item-suministros-speedwagon': 1,
      },
      rng,
    );
    expect(failSingleCopy.ok).toBe(false);

    // 1. Add 1 extra duplicate Common so we have 5 duplicate Commons -> craft 1 Rare
    prog = {
      ...prog,
      ownedCards: {
        ...prog.ownedCards,
        'char-jonathan-joestar': 2,
      },
    };
    const commonBefore = getRarityInventoryStats(prog, 'COMMON').totalCopies;
    const rareBefore = getRarityInventoryStats(prog, 'RARE').totalCopies;
    expect(getRarityInventoryStats(prog, 'COMMON').surplusCopiesBeyondOne).toBe(5);

    const craft1 = craftRandomCard(prog, 'COMMON_TO_RARE', undefined, rng);
    expect(craft1.ok, craft1.error).toBe(true);
    expect(craft1.rewardRarity).toBe('RARE');
    expect(getCardRarity(craft1.rewardCardId!)).toBe('RARE');
    prog = craft1.nextProgression;
    expect(getRarityInventoryStats(prog, 'COMMON').totalCopies).toBe(commonBefore - 5);
    expect(getRarityInventoryStats(prog, 'RARE').totalCopies).toBe(rareBefore + 1);
    // Base copy of Jonathan is preserved!
    expect(prog.ownedCards['char-jonathan-joestar']).toBe(1);

    // 2. 10 duplicate Rares -> 1 Super Rare
    prog = {
      ...prog,
      ownedCards: {
        ...prog.ownedCards,
        'char-caesar-zeppeli': 7, // 6 duplicates
        'char-muhammad-avdol': 5, // 4 duplicates
      },
    };
    const rBefore = getRarityInventoryStats(prog, 'RARE').totalCopies;
    const srBefore = getRarityInventoryStats(prog, 'SUPER_RARE').totalCopies;
    const craft2 = craftRandomCard(prog, 'RARE_TO_SUPER_RARE', undefined, rng);
    expect(craft2.ok, craft2.error).toBe(true);
    expect(craft2.rewardRarity).toBe('SUPER_RARE');
    expect(getCardRarity(craft2.rewardCardId!)).toBe('SUPER_RARE');
    prog = craft2.nextProgression;
    expect(getRarityInventoryStats(prog, 'RARE').totalCopies).toBe(rBefore - 10);
    expect(getRarityInventoryStats(prog, 'SUPER_RARE').totalCopies).toBe(srBefore + 1);
    expect(prog.ownedCards['char-caesar-zeppeli']).toBeGreaterThanOrEqual(1);
    expect(prog.ownedCards['char-muhammad-avdol']).toBeGreaterThanOrEqual(1);

    // 3. 15 duplicate Super Rares -> 1 Bizarre Rare (UR)
    prog = {
      ...prog,
      ownedCards: {
        ...prog.ownedCards,
        'char-wamuu': 9, // 8 duplicates
        'char-esidisi': 9, // 8 duplicates
      },
    };
    const srBefore3 = getRarityInventoryStats(prog, 'SUPER_RARE').totalCopies;
    const urBefore3 = getRarityInventoryStats(prog, 'BIZARRE_RARE').totalCopies;
    const craft3 = craftRandomCard(prog, 'SUPER_RARE_TO_BIZARRE_RARE', undefined, rng);
    expect(craft3.ok, craft3.error).toBe(true);
    expect(craft3.rewardRarity).toBe('BIZARRE_RARE');
    expect(getCardRarity(craft3.rewardCardId!)).toBe('BIZARRE_RARE');
    prog = craft3.nextProgression;
    expect(getRarityInventoryStats(prog, 'SUPER_RARE').totalCopies).toBe(srBefore3 - 15);
    expect(getRarityInventoryStats(prog, 'BIZARRE_RARE').totalCopies).toBe(urBefore3 + 1);
    expect(prog.ownedCards['char-wamuu']).toBeGreaterThanOrEqual(1);
    expect(prog.ownedCards['char-esidisi']).toBeGreaterThanOrEqual(1);
  });

  it('computes battle rewards scaled by difficulty and outcome', () => {
    const easy = computeBattleReward('VS_AI', 'EASY', true);
    const normal = computeBattleReward('VS_AI', 'NORMAL', true);
    const hard = computeBattleReward('VS_AI', 'HARD', true);
    const loss = computeBattleReward('VS_AI', 'NORMAL', false);

    expect(loss.coins).toBeGreaterThan(0);
    expect(easy.coins).toBeGreaterThan(loss.coins);
    expect(normal.coins).toBeGreaterThan(easy.coins);
    expect(hard.coins).toBeGreaterThan(normal.coins);
  });
});
