import { describe, expect, it } from 'vitest';
import {
  getRoguelikeAchievements,
  ROGUELIKE_ASCENSION_LEVELS,
  ROGUELIKE_MAX_ASCENSION,
  ROGUELIKE_STARTER_DECKS,
} from '../../data/roguelikeData';
import { DEFAULT_RULES_CONFIG } from '../../data/rulesConfig';
import { computeBattlePostSummary } from '../../services/battleStatsService';
import {
  COMPETITIVE_ENTRY_FEE,
  computeCompetitivePointsDelta,
  computeWeeklyRankReward,
  getCompetitiveClaimKey,
  getIsoWeekKey,
  getPreviousIsoWeekKey,
} from '../../services/competitiveService';
import {
  buildDraftOpponent,
  computeDraftMetaReward,
  createDraftRun,
  DRAFT_MAX_LOSSES,
  DRAFT_MAX_WINS,
  DRAFT_TOTAL_PICKS,
  pickDraftCard,
  resolveDraftBattleOutcome,
} from '../../services/draftService';
import {
  buildRoguelikeEnemy,
  computeRoguelikeMetaReward,
  createRoguelikeRun,
  getShopDiscountMultiplier,
} from '../../services/roguelikeService';
import type { GameState } from '../../engine/types/state';

describe('Post-Battle MVP Summary Service', () => {
  it('computes damage, KOs, healing, coin flips, and Match MVP from eventLog', () => {
    const fakeState = {
      turnNumber: 7,
      winnerId: 'P1',
      eventLog: [
        {
          id: 'e0',
          type: 'CHARACTER_PLAYED',
          turn: 1,
          playerId: 'P1',
          cardId: 'char-jotaro-kujo',
          zone: 'ACTIVE',
          message: 'Jotaro entra al activo',
        },
        {
          id: 'e0b',
          type: 'STAND_EQUIPPED',
          turn: 1,
          playerId: 'P1',
          characterCardId: 'char-jotaro-kujo',
          standCardId: 'stand-star-platinum',
          message: 'Star Platinum equipado',
        },
        {
          id: 'e1',
          type: 'ATTACK_DECLARED',
          turn: 2,
          playerId: 'P1',
          attackName: 'Ora Ora',
          message: 'Star Platinum ataca',
        },
        {
          id: 'e2',
          type: 'DAMAGE_DEALT',
          turn: 2,
          source: 'ATTACK',
          targetPlayerId: 'P2',
          targetCardId: 'char-dio',
          amount: 90,
          message: '90 daño',
        },
        {
          id: 'e3',
          type: 'CHARACTER_KO',
          turn: 2,
          ownerPlayerId: 'P2',
          cardId: 'char-dio',
          reason: 'ATTACK',
          message: 'DIO K.O.',
        },
        {
          id: 'e4',
          type: 'HEALED',
          turn: 3,
          targetPlayerId: 'P1',
          targetCardId: 'char-jotaro-kujo',
          amount: 30,
          message: 'Curado 30',
        },
        {
          id: 'e5',
          type: 'COIN_FLIPPED',
          turn: 4,
          playerId: 'P1',
          attackName: 'Ora Ora',
          results: ['HEADS', 'TAILS', 'HEADS'],
          message: 'Monedas',
        },
        {
          id: 'e6',
          type: 'DAMAGE_DEALT',
          turn: 5,
          source: 'ATTACK',
          targetPlayerId: 'P1',
          targetCardId: 'char-jotaro-kujo',
          amount: 40,
          message: '40 daño',
        },
      ],
    } as unknown as GameState;

    const summary = computeBattlePostSummary(fakeState);
    expect(summary.turnsPlayed).toBe(7);
    expect(summary.p1.damageDealt).toBe(90);
    expect(summary.p1.kosScored).toBe(1);
    expect(summary.p1.hpHealed).toBe(30);
    expect(summary.p1.coinHeads).toBe(2);
    expect(summary.p1.coinTails).toBe(1);
    expect(summary.p2.damageDealt).toBe(40);
    expect(summary.mvp).not.toBeNull();
    expect(summary.mvp?.cardId).toBe('stand-star-platinum');
    expect(summary.mvp?.ownerId).toBe('P1');
    expect(summary.mvp?.damageDealt).toBe(90);
    expect(summary.mvp?.kosScored).toBe(1);
  });
});

describe('Roguelike Ascension 1-5 & Achievements', () => {
  it('defines 5 cumulative Ascension levels and 14 specific achievements', () => {
    expect(ROGUELIKE_MAX_ASCENSION).toBe(5);
    expect(ROGUELIKE_ASCENSION_LEVELS).toHaveLength(5);

    const achievements = getRoguelikeAchievements();
    // 9 starters + 3 ascension (1, 3, 5) + 2 draft (1 champ, 3 champs) = 14
    expect(achievements.length).toBe(ROGUELIKE_STARTER_DECKS.length + 5);
  });

  it('applies Ascension modifiers to starting gold, shop pricing, enemy scaling, and end rewards', () => {
    const baseRun = createRoguelikeRun('starter-joestar-hamon', 'HARD', 12345, 0);
    const asc2Run = createRoguelikeRun('starter-joestar-hamon', 'HARD', 12345, 2);
    expect(asc2Run.gold).toBe(baseRun.gold - 5);

    expect(getShopDiscountMultiplier([], 0)).toBe(1);
    expect(getShopDiscountMultiplier([], 2)).toBeCloseTo(1.2, 5);

    const bossA0 = buildRoguelikeEnemy(30, 'BOSS', 12345, 'HARD', 0);
    const bossA5 = buildRoguelikeEnemy(30, 'BOSS', 12345, 'HARD', 5);
    // A1 (+10 HP) + A5 (+20 HP on Boss) = +30 HP
    expect(bossA5.bonusMaxHp).toBe(bossA0.bonusMaxHp + 30);
    // A3 (+10 dmg on Elites/Bosses)
    expect(bossA5.bonusDamage).toBe(bossA0.bonusDamage + 10);
    // A4 (0% error on Act II/III)
    expect(bossA5.aiErrorRate).toBe(0);

    const rewardA0 = computeRoguelikeMetaReward({
      ...baseRun,
      status: 'VICTORY',
      currentFloor: 30,
      battlesWon: 18,
      bossesWon: 3,
    });
    const rewardA5 = computeRoguelikeMetaReward({
      ...baseRun,
      ascensionLevel: 5,
      status: 'VICTORY',
      currentFloor: 30,
      battlesWon: 18,
      bossesWon: 3,
    });
    expect(rewardA5.coins).toBeGreaterThan(rewardA0.coins);
    expect(rewardA5.bonusFoilRate).toBeCloseTo(0.025, 5);
    expect(rewardA5.packCount).toBe(3);
  });
});

describe('Draft Arena Mode', () => {
  it('drafts 24 cards from 3 choices each round and auto-completes a legal 46-card deck', () => {
    let run = createDraftRun(987654);
    expect(run.status).toBe('DRAFTING');
    expect(run.currentPick).toBe(1);
    expect(run.currentChoices).toHaveLength(3);

    for (let i = 0; i < DRAFT_TOTAL_PICKS; i++) {
      expect(run.status).toBe('DRAFTING');
      expect(run.currentChoices).toHaveLength(3);
      run = pickDraftCard(run, run.currentChoices[0]!);
    }

    expect(run.status).toBe('READY');
    expect(run.pickedCardIds).toHaveLength(DRAFT_TOTAL_PICKS);
    expect(run.finalDeckIds).toHaveLength(DEFAULT_RULES_CONFIG.maxDeckSize);

    const opp = buildDraftOpponent(run.wins, run.matchesPlayed, run.seed);
    expect(opp.deckIds).toHaveLength(DEFAULT_RULES_CONFIG.maxDeckSize);
  });

  it('tracks 5-win Championship and 3-loss elimination with General Pack rewards', () => {
    let run = createDraftRun(424242);
    for (let i = 0; i < DRAFT_TOTAL_PICKS; i++) {
      run = pickDraftCard(run, run.currentChoices[0]!);
    }

    // Win 5 matches -> Champion (500 coins + 2 General Packs)
    let champRun = run;
    for (let w = 0; w < DRAFT_MAX_WINS; w++) {
      champRun = resolveDraftBattleOutcome(champRun, true);
    }
    expect(champRun.status).toBe('FINISHED');
    const champReward = computeDraftMetaReward(champRun);
    expect(champReward.isChampion).toBe(true);
    expect(champReward.coins).toBe(500);
    expect(champReward.packCount).toBe(2);

    // Win 3 then lose 3 -> Finished (240 coins + 1 General Pack)
    let midRun = run;
    for (let w = 0; w < 3; w++) midRun = resolveDraftBattleOutcome(midRun, true);
    for (let l = 0; l < DRAFT_MAX_LOSSES; l++) midRun = resolveDraftBattleOutcome(midRun, false);
    expect(midRun.status).toBe('FINISHED');
    const midReward = computeDraftMetaReward(midRun);
    expect(midReward.isChampion).toBe(false);
    expect(midReward.coins).toBe(240);
    expect(midReward.packCount).toBe(1);
  });
});

describe('Competitive Weekly Rankings & Rewards', () => {
  it('computes ISO week keys, entry fees, points deltas, and weekly reward tiers', () => {
    const sampleDate = new Date(Date.UTC(2026, 10, 25, 12, 0, 0)); // Wed 2026-11-25
    const curWeek = getIsoWeekKey(sampleDate);
    const prevWeek = getPreviousIsoWeekKey(sampleDate);
    expect(curWeek).toMatch(/^\d{4}-W\d{2}$/);
    expect(prevWeek).toMatch(/^\d{4}-W\d{2}$/);
    expect(prevWeek).not.toBe(curWeek);

    expect(COMPETITIVE_ENTRY_FEE.AI).toBeGreaterThan(0);
    expect(COMPETITIVE_ENTRY_FEE.PVP).toBeGreaterThan(0);

    expect(computeCompetitivePointsDelta(true, 0)).toBe(40);
    expect(computeCompetitivePointsDelta(true, 2)).toBe(50);
    expect(computeCompetitivePointsDelta(false, 3)).toBe(-15);

    const first = computeWeeklyRankReward(1);
    const third = computeWeeklyRankReward(3);
    const top10 = computeWeeklyRankReward(8);
    const participant = computeWeeklyRankReward(40);
    expect(first?.coins).toBe(1500);
    expect(first?.packCount).toBe(3);
    expect(third?.packCount).toBe(2);
    expect(top10?.packCount).toBe(1);
    expect(participant?.coins).toBe(100);
    expect(getCompetitiveClaimKey(curWeek, 'PVP')).toBe(`${curWeek}:PVP`);
  });
});
