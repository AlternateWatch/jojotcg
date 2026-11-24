import { describe, expect, it } from 'vitest';
import { ALL_CARDS, getCardById } from '../../data/cardRegistry';
import {
  createRoguelikeGeneralPack,
  ROGUELIKE_EVENTS,
  ROGUELIKE_RELICS,
  ROGUELIKE_STARTER_DECKS,
  ROGUELIKE_TOTAL_FLOORS,
} from '../../data/roguelikeData';
import { createGame, dispatchAction } from '../../engine/gameEngine';
import { createSeededRng } from '../../engine/rng';
import {
  buyShopEnergyPack,
  buyShopOffer,
  claimTreasureBonusCard,
  computeRelicRulesOverrides,
  computeRoguelikeMetaReward,
  createRoguelikeRun,
  enterRoguelikeNode,
  generateRoguelikeMap,
  generateRoguelikeShop,
  getRelicChoiceCount,
  getSelectableNodeIds,
  getSkipCardGoldBonus,
  grantRelicToRun,
  pickRoguelikeRewardCard,
  purgeCardFromRunDeck,
  resolveEventPurgeCard,
  resolveRoguelikeBattleOutcome,
  resolveRoguelikeEventChoice,
} from '../../services/roguelikeService';

describe('Roguelike Expedition Mode (30 Floors)', () => {
  it('all 9 starter decks have exactly 16 cards (10 deck + 6 prizes), launch cleanly with 5-card hand, and never lose by deck-out', () => {
    const rng = createSeededRng(12345);
    const rules = computeRelicRulesOverrides([]);
    expect(ROGUELIKE_STARTER_DECKS).toHaveLength(9);
    for (const starter of ROGUELIKE_STARTER_DECKS) {
      expect(starter.cardIds).toHaveLength(16);

      // Verify every colored energy in the starter deck is actually required by at least one attack in the deck
      const requiredColors = new Set<string>();
      const deckColoredEnergies = new Set<string>();
      for (const cid of starter.cardIds) {
        const card = getCardById(cid);
        if (!card) continue;
        if (card.type === 'ENERGY' && card.energyType !== 'COLORLESS' && card.energyType !== 'STAND') {
          deckColoredEnergies.add(card.energyType);
        }
        if (card.type === 'CHARACTER' || card.type === 'STAND') {
          for (const atk of card.attacks) {
            for (const cost of atk.energyCost) {
              if (cost !== 'COLORLESS') requiredColors.add(cost);
            }
          }
        }
      }
      for (const eColor of deckColoredEnergies) {
        expect(
          requiredColors.has(eColor),
          `Starter deck ${starter.id} has unused colored energy ${eColor}`,
        ).toBe(true);
      }

      const state = createGame({
        p1Name: 'Player',
        p2Name: 'Enemy',
        p1Deck: starter.cardIds,
        p2Deck: starter.cardIds,
        rules,
        rng,
      });
      expect(state.players.P1.prizeCards).toHaveLength(6);
      expect(state.players.P1.hand).toHaveLength(5);
      expect(state.players.P1.deck).toHaveLength(5); // 16 - 6 prizes - 5 hand = 5 in deck

      // Verify disableDeckOutLoss: even if both deck and discard are empty on turn start, game continues cleanly!
      state.phase = 'PREPARATION';
      state.activePlayerId = 'P1';
      state.players.P2.deck = [];
      state.players.P2.discard = [];
      const afterEnd = dispatchAction(state, { type: 'END_TURN', playerId: 'P1' }, rng).state;
      expect(afterEnd.phase).toBe('PREPARATION');
      expect(afterEnd.activePlayerId).toBe('P2');
      expect(afterEnd.winnerId).toBeNull();
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
      expect(nodes[0]!.lane).toBe(1);
    }

    // Strict lane adjacency: every edge connects only to adjacent lanes (|nextLane - lane| <= 1)
    // and every non-final node has >= 1 outgoing edge
    for (const node of map) {
      if (node.floor < ROGUELIKE_TOTAL_FLOORS) {
        expect(node.nextNodeIds.length).toBeGreaterThanOrEqual(1);
      }
      for (const nextId of node.nextNodeIds) {
        const target = map.find((n) => n.id === nextId)!;
        expect(target.floor).toBe(node.floor + 1);
        expect(Math.abs(target.lane - node.lane)).toBeLessThanOrEqual(1);
      }
    }

    // Gaps appear across multiple lanes (not only lane 3)
    const gapLanes = new Set<number>();
    for (let f = 2; f <= 28; f++) {
      if (f === 10 || f === 20) continue;
      const present = new Set(map.filter((n) => n.floor === f).map((n) => n.lane));
      for (const l of [0, 1, 2]) {
        if (!present.has(l)) gapLanes.add(l);
      }
    }
    expect(gapLanes.size).toBeGreaterThanOrEqual(2);

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
    let run = createRoguelikeRun('starter-hamon', 'NORMAL', 7777);
    expect(run.deckCardIds).toHaveLength(16);
    expect(run.gold).toBe(30);

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
    expect(run.gold).toBeGreaterThan(30);
    expect(run.pendingReward?.cardChoices).toHaveLength(3);

    // Pick 1st offered card -> permanently added to run deck (17 cards)
    const chosenCard = run.pendingReward!.cardChoices[0]!;
    run = pickRoguelikeRewardCard(run, chosenCard);
    expect(run.status).toBe('MAP');
    expect(run.deckCardIds).toHaveLength(17);
    expect(run.deckCardIds).toContain(chosenCard);

    // Grant relic (Sangre Joestar + Sobrecarga de Hamon) and verify rule overrides
    run = grantRelicToRun(run, 'relic-sangre-joestar');
    run = grantRelicToRun(run, 'relic-sobrecarga-hamon');
    const overrides = computeRelicRulesOverrides(run.relicIds);
    expect(overrides.p1BonusMaxHp).toBe(10);
    expect(overrides.p1BonusDamage).toBe(10);

    // Test Treasure room: grants gold + relic choices (+ optional single bonus card), NO 1-of-3 card draft
    const treasureNode = run.map.find((n) => n.type === 'TREASURE')!;
    const treasureRun = enterRoguelikeNode(run, treasureNode.id).nextRun;
    expect(treasureRun.status).toBe('REWARD');
    expect(treasureRun.pendingReward?.sourceType).toBe('TREASURE');
    expect(treasureRun.pendingReward?.cardChoices).toHaveLength(0);
    expect(treasureRun.pendingReward?.goldAwarded).toBeGreaterThan(0);

    // Claiming a chest bonus card adds it once and marks treasureCardClaimed
    const withChestCard = claimTreasureBonusCard({
      ...treasureRun,
      pendingReward: {
        ...treasureRun.pendingReward!,
        treasureFoundCardId: 'energy-electric',
        treasureCardClaimed: false,
      },
    });
    expect(withChestCard.deckCardIds).toHaveLength(treasureRun.deckCardIds.length + 1);
    expect(withChestCard.pendingReward?.treasureCardClaimed).toBe(true);

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

    // Meta-reward scales with progress and Victory awards General Packs by difficulty (1 / 2 / 3)
    const defeatReward = computeRoguelikeMetaReward({ ...run, status: 'DEFEAT', currentFloor: 12, bossesWon: 1 });
    const easyWin = computeRoguelikeMetaReward({ ...run, difficulty: 'EASY', status: 'VICTORY', currentFloor: 30, bossesWon: 3 });
    const normalWin = computeRoguelikeMetaReward({ ...run, difficulty: 'NORMAL', status: 'VICTORY', currentFloor: 30, bossesWon: 3 });
    const hardWin = computeRoguelikeMetaReward({ ...run, difficulty: 'HARD', status: 'VICTORY', currentFloor: 30, bossesWon: 3 });
    expect(defeatReward.coins).toBeGreaterThan(150);
    expect(defeatReward.packCount).toBe(0);
    expect(easyWin.packCount).toBe(1);
    expect(normalWin.packCount).toBe(2);
    expect(hardWin.packCount).toBe(3);
    expect(hardWin.coins).toBeGreaterThan(normalWin.coins);

    // General Pack includes every single collectible (non-Energy) card in the game
    const generalPack = createRoguelikeGeneralPack();
    const allCollectibleCount = ALL_CARDS.filter((c) => c.type !== 'ENERGY').length;
    expect(generalPack.poolCardIds).toHaveLength(allCollectibleCount);
  });

  it('validates all expanded relics (20) and events (14) and exercises new relic & event mechanics', () => {
    expect(ROGUELIKE_RELICS.length).toBeGreaterThanOrEqual(20);
    expect(ROGUELIKE_EVENTS.length).toBeGreaterThanOrEqual(14);

    // Unique relic IDs and valid granted card IDs
    const relicIds = new Set<string>();
    for (const relic of ROGUELIKE_RELICS) {
      expect(relicIds.has(relic.id)).toBe(false);
      relicIds.add(relic.id);
      for (const cid of relic.grantCardIdsOnPickup ?? []) {
        expect(getCardById(cid), `Relic ${relic.id} references unknown card ${cid}`).toBeDefined();
      }
    }

    // Unique event IDs, valid featuredCardId, and valid ADD_SPECIFIC_CARDS IDs
    const eventIds = new Set<string>();
    for (const evt of ROGUELIKE_EVENTS) {
      expect(eventIds.has(evt.id)).toBe(false);
      eventIds.add(evt.id);
      expect(
        getCardById(evt.featuredCardId),
        `Event ${evt.id} references unknown featuredCardId ${evt.featuredCardId}`,
      ).toBeDefined();
      expect(evt.choices.length).toBeGreaterThanOrEqual(2);
      for (const ch of evt.choices) {
        if (ch.effect.kind === 'ADD_SPECIFIC_CARDS') {
          for (const cid of ch.effect.cardIds) {
            expect(getCardById(cid), `Event ${evt.id} choice ${ch.id} unknown card ${cid}`).toBeDefined();
          }
        }
      }
    }

    // Exercise new relic mechanics: bonusGoldOnPickup, extraShopOffers, skipCardGoldBonus, extraRelicChoices
    let run = createRoguelikeRun('starter-hamon', 'NORMAL', 9001);
    const goldBefore = run.gold;
    run = grantRelicToRun(run, 'relic-harvest-bolsa'); // +60 gold on pickup
    expect(run.gold).toBe(goldBefore + 60);

    run = grantRelicToRun(run, 'relic-ojo-tasador'); // +20 skip gold (35 total)
    expect(getSkipCardGoldBonus(run.relicIds)).toBe(35);
    const goldBeforeSkip = run.gold;
    run = pickRoguelikeRewardCard(run, null);
    expect(run.gold).toBe(goldBeforeSkip + 35);

    run = grantRelicToRun(run, 'relic-brujula-destino'); // +1 relic choice (3 total)
    expect(getRelicChoiceCount(run.relicIds)).toBe(3);

    run = grantRelicToRun(run, 'relic-catalogo-morioh'); // +2 shop card offers (7 card offers)
    const shop = generateRoguelikeShop(run, run.seed);
    const cardOffers = shop.offers.filter((o) => o.kind === 'CARD');
    expect(cardOffers.length).toBeGreaterThan(5);

    // Exercise new event effects: OPEN_PURGE_PICK, ADD_RANDOM_BY_TYPE, ADD_GOLD_AND_RANDOM_CARD, GAMBLE_RELIC
    // Add 1 extra card so deck is 17 (> 16 min) for purge test
    run = { ...run, deckCardIds: [...run.deckCardIds, 'energy-electric'], gold: 300 };

    const rohanEvt = ROGUELIKE_EVENTS.find((e) => e.id === 'evt-rohan-studio')!;
    const afterPurgeOpen = resolveRoguelikeEventChoice(run, rohanEvt, 'rohan-edit');
    expect(afterPurgeOpen.activeEvent?.purgePickOpen).toBe(true);
    const afterPurgeDone = resolveEventPurgeCard(afterPurgeOpen, 0);
    expect(afterPurgeDone.deckCardIds).toHaveLength(run.deckCardIds.length - 1);
    expect(afterPurgeDone.activeEvent?.resolvedMessage).toContain('purgado');

    const afterRohanPose = resolveRoguelikeEventChoice(run, rohanEvt, 'rohan-pose');
    expect(afterRohanPose.gold).toBe(run.gold + 30);
    expect(afterRohanPose.deckCardIds).toHaveLength(run.deckCardIds.length + 1);

    const cairoEvt = ROGUELIKE_EVENTS.find((e) => e.id === 'evt-cairo-bazaar')!;
    const afterStandSearch = resolveRoguelikeEventChoice(run, cairoEvt, 'cairo-stand');
    const addedCardId = afterStandSearch.deckCardIds[afterStandSearch.deckCardIds.length - 1]!;
    expect(getCardById(addedCardId)?.type).toBe('STAND');

    const afterGambleRelic = resolveRoguelikeEventChoice(run, cairoEvt, 'cairo-chest');
    expect(afterGambleRelic.activeEvent?.resolvedMessage).toBeTruthy();

    // Seen events avoid immediate repeats across consecutive EVENT rooms
    const eventNodes = run.map.filter((n) => n.type === 'EVENT');
    if (eventNodes.length >= 2) {
      const firstEvtRun = enterRoguelikeNode(run, eventNodes[0]!.id).nextRun;
      const secondEvtRun = enterRoguelikeNode(firstEvtRun, eventNodes[1]!.id).nextRun;
      expect(secondEvtRun.activeEvent?.eventId).not.toBe(firstEvtRun.activeEvent?.eventId);
    }
  });
});
