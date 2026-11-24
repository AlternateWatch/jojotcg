import { describe, expect, it } from 'vitest';
import {
  ROGUELIKE_MIN_DECK_SIZE,
  ROGUELIKE_STARTER_DECKS,
  ROGUELIKE_TOTAL_FLOORS,
} from '../../data/roguelikeData';
import { createGame } from '../../engine/gameEngine';
import { createSeededRng } from '../../engine/rng';
import {
  buyShopEnergyPack,
  buyShopOffer,
  computeRelicRulesOverrides,
  computeRoguelikeMetaReward,
  createRoguelikeRun,
  enterRoguelikeNode,
  generateRoguelikeMap,
  getSelectableNodeIds,
  grantRelicToRun,
  pickRoguelikeRewardCard,
  purgeCardFromRunDeck,
  resolveRoguelikeBattleOutcome,
} from '../../services/roguelikeService';

describe('Roguelike Expedition Mode (30 Floors)', () => {
  it('all 3 starter decks have exactly 16 cards (10 deck + 6 prizes) and launch cleanly in createGame', () => {
    const rng = createSeededRng(12345);
    for (const starter of ROGUELIKE_STARTER_DECKS) {
      expect(starter.cardIds).toHaveLength(16);
      const state = createGame({
        p1Name: 'Player',
        p2Name: 'Enemy',
        p1Deck: starter.cardIds,
        p2Deck: starter.cardIds,
        rules: { minDeckSize: ROGUELIKE_MIN_DECK_SIZE, maxDeckSize: 60 },
        rng,
      });
      expect(state.players.P1.prizeCards).toHaveLength(6);
      expect(state.players.P1.hand).toHaveLength(7);
      expect(state.players.P1.deck).toHaveLength(3); // 16 - 6 prizes - 7 hand = 3 in deck
    }
  });

  it('generates a connected 30-floor branching roadmap with Bosses at Floors 10, 20, and 30', () => {
    const map = generateRoguelikeMap(424242);
    const floors = new Set(map.map((n) => n.floor));
    expect(floors.size).toBe(ROGUELIKE_TOTAL_FLOORS);

    for (const bossFloor of [10, 20, 30]) {
      const nodes = map.filter((n) => n.floor === bossFloor);
      expect(nodes).toHaveLength(1);
      expect(nodes[0]!.type).toBe('BOSS');
    }

    // BFS reachability from Floor 1 reaches Floor 30 Boss
    const visited = new Set<string>();
    const queue = map.filter((n) => n.floor === 1).map((n) => n.id);
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = map.find((n) => n.id === id);
      for (const nextId of node?.nextNodeIds ?? []) {
        queue.push(nextId);
      }
    }
    const boss30 = map.find((n) => n.floor === 30)!;
    expect(visited.has(boss30.id)).toBe(true);
  });

  it('resolves battle victory -> 1-of-3 card draft + exclusive gold, shop purchases/purge, relics, and end-of-run meta coins', () => {
    let run = createRoguelikeRun('starter-hamon', 7777);
    expect(run.deckCardIds).toHaveLength(16);
    expect(run.gold).toBe(60);

    // Pick Floor 1 battle node
    const floor1Ids = Array.from(getSelectableNodeIds(run));
    expect(floor1Ids.length).toBeGreaterThanOrEqual(2);
    const entered = enterRoguelikeNode(run, floor1Ids[0]!);
    expect(entered.enemy).toBeDefined();
    expect(entered.nextRun.status).toBe('IN_BATTLE');
    run = entered.nextRun;

    // Win Floor 1 battle -> grants gold + 3 card choices
    run = resolveRoguelikeBattleOutcome(run, true);
    expect(run.status).toBe('REWARD');
    expect(run.gold).toBeGreaterThan(60);
    expect(run.pendingReward?.cardChoices).toHaveLength(3);

    // Pick 1st offered card -> permanently added to run deck (17 cards)
    const chosenCard = run.pendingReward!.cardChoices[0]!;
    run = pickRoguelikeRewardCard(run, chosenCard);
    expect(run.status).toBe('MAP');
    expect(run.deckCardIds).toHaveLength(17);
    expect(run.deckCardIds).toContain(chosenCard);

    // Grant relic (Gravedad del Destino + Sangre Joestar) and verify rule overrides
    run = grantRelicToRun(run, 'relic-sangre-joestar');
    run = grantRelicToRun(run, 'relic-sobrecarga-hamon');
    const overrides = computeRelicRulesOverrides(run.relicIds);
    expect(overrides.p1BonusMaxHp).toBe(15);
    expect(overrides.p1BonusDamage).toBe(10);

    // Test Shop node: buy offer, buy energy pack, purge card (allowed when > 16 cards)
    const shopNode = run.map.find((n) => n.type === 'SHOP')!;
    run = { ...run, gold: 500 };
    run = enterRoguelikeNode(run, shopNode.id).nextRun;
    expect(run.status).toBe('SHOP');
    expect(run.activeShop).not.toBeNull();
    const firstOffer = run.activeShop!.offers[0]!;
    run = buyShopOffer(run, firstOffer.id);
    expect(run.activeShop!.offers[0]!.purchased).toBe(true);
    const deckBeforeEnergy = run.deckCardIds.length;
    run = buyShopEnergyPack(run, 'energy-electric');
    expect(run.deckCardIds).toHaveLength(deckBeforeEnergy + 2);
    run = purgeCardFromRunDeck(run, 0);
    expect(run.deckCardIds).toHaveLength(deckBeforeEnergy + 1);

    // Meta-reward scales with progress and Victory gives huge bonus
    const defeatReward = computeRoguelikeMetaReward({ ...run, status: 'DEFEAT', currentFloor: 12, bossesWon: 1 });
    const victoryReward = computeRoguelikeMetaReward({ ...run, status: 'VICTORY', currentFloor: 30, bossesWon: 3 });
    expect(defeatReward.coins).toBeGreaterThan(150);
    expect(victoryReward.coins).toBeGreaterThan(defeatReward.coins + 400);
  });
});
