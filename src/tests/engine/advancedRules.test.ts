import { describe, expect, it } from 'vitest';
import { dispatchAction } from '../../engine/gameEngine';
import { computeEffectiveMaxHp } from '../../engine/helpers/cardStats';
import { createMockRng } from '../../engine/rng';
import { buildControlledBattleState, mustDispatch } from '../helpers/testFixtures';

describe('Advanced Official Card Abilities & Edge Cases', () => {
  it('Mariah steals up to 3 COLORLESS energies on entering field without touching other energies', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1Hand: ['char-mariah'],
      p2ActiveId: 'char-dio',
      p2ActiveEnergies: ['COLORLESS', 'COLORLESS', 'FIRE', 'COLORLESS', 'COLORLESS'],
      phase: 'PREPARATION',
    });

    state = mustDispatch(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: 0 });
    const mariah = state.players.P1.bench.find((c) => c.cardId === 'char-mariah')!;
    expect(mariah.attachedEnergies).toEqual(['COLORLESS', 'COLORLESS', 'COLORLESS']);
    expect(state.players.P2.active!.attachedEnergies).toEqual(['FIRE', 'COLORLESS']);
  });

  it('Rohan Kishibe reveals opponent hand upon entering the field', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1Hand: ['char-rohan-kishibe'],
      p2ActiveId: 'char-dio',
      p2Hand: ['stand-the-world', 'energy-psychic'],
      phase: 'PREPARATION',
    });

    expect(state.players.P2.handRevealedToOpponent).toBe(false);
    state = mustDispatch(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: 0 });
    expect(state.players.P2.handRevealedToOpponent).toBe(true);
  });

  it('Pet Shop Reconocimiento Aéreo reorders top 3 cards of opponent deck', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1Hand: ['char-pet-shop'],
      p2ActiveId: 'char-dio',
      p2Deck: ['energy-fire', 'stand-the-world', 'item-comida-de-tonio', 'energy-water'],
      phase: 'PREPARATION',
    });

    state = mustDispatch(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: 0 });
    expect(state.pendingPrompt?.kind).toBe('REORDER_OPPONENT_TOP_DECK');

    // Put index 2 (comida) on top, then 0 (fire), then 1 (The World)
    state = mustDispatch(state, {
      type: 'RESPOND_PROMPT',
      playerId: 'P1',
      response: { kind: 'REORDER_OPPONENT_TOP_DECK', orderedIndices: [2, 0, 1] },
    });

    // Next turn P2 immediately drew index 2 (item-comida-de-tonio)!
    expect(state.players.P2.hand).toContain('item-comida-de-tonio');
    expect(state.players.P2.deck[0]).toBe('energy-fire');
    expect(state.players.P2.deck[1]).toBe('stand-the-world');
  });

  it('Silver Chariot Fuera la Armadura trades -10 max HP for permanent +10 Stand damage (stackable)', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-jean-pierre-polnareff', // 130 HP
      p1ActiveStandId: 'stand-silver-chariot',
      p1ActiveEnergies: ['PSYCHIC', 'COLORLESS', 'COLORLESS'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'COMBAT',
    });

    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-fuera-la-armadura',
    });
    expect(computeEffectiveMaxHp(state, 'P1', state.players.P1.active!)).toBe(120);
    expect(state.players.P1.active!.currentHp).toBe(120);
    expect(state.players.P1.active!.attachedStand!.permanentDamageBonus).toBe(10);

    // Next P1 turn: Ráfaga de Acometidas (60 + 10 = 70 damage -> DIO 160 -> 90 HP)
    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P2' });
    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-rafaga-de-acometidas',
    });
    expect(state.players.P2.active!.currentHp).toBe(90);
  });

  it("Heaven's Door Safety Lock stacks -10 damage reduction on enemy Stand attacks", () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-rohan-kishibe',
      p1ActiveStandId: 'stand-heavens-door',
      p1ActiveEnergies: ['PSYCHIC', 'PSYCHIC', 'PSYCHIC', 'PSYCHIC'],
      p2ActiveId: 'char-jotaro-kujo',
      p2ActiveStandId: 'stand-star-platinum',
      p2ActiveEnergies: ['COLORLESS', 'COLORLESS'],
      phase: 'COMBAT',
    });

    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-safety-lock',
    });
    expect(state.players.P2.active!.attachedStand!.damageDebuff).toBe(10);

    // P2 attacks with Star Finger (60 - 10 debuff = 50 -> Rohan 110 -> 60 HP)
    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P2' });
    state = mustDispatch(
      state,
      { type: 'USE_ATTACK', playerId: 'P2', attackId: 'atk-star-finger' },
      createMockRng(['TAILS']),
    );
    expect(state.players.P1.active!.currentHp).toBe(60);
  });

  it('The World Za Warudo deals 90 + grants 1 extra combat action (max 1/turn)', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-dio',
      p1ActiveStandId: 'stand-the-world',
      p1ActiveEnergies: ['PSYCHIC', 'PSYCHIC', 'COLORLESS', 'COLORLESS'],
      p2ActiveId: 'char-kars', // 150 HP
      phase: 'COMBAT',
    });
    state.players.P2.active!.superiorIntellectUsed = true;

    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-za-warudo-cuchillos',
    });
    expect(state.players.P2.active!.currentHp).toBe(60); // 150 - 90
    expect(state.phase).toBe('COMBAT');
    expect(state.activePlayerId).toBe('P1');

    // Cannot use Za Warudo twice in the same turn
    expect(
      dispatchAction(state, {
        type: 'USE_ATTACK',
        playerId: 'P1',
        attackId: 'atk-za-warudo-cuchillos',
      }).ok,
    ).toBe(false);

    // Follow up with Muda Muda (4 tails = 80 dmg -> lethal KO!)
    state = mustDispatch(
      state,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-muda-muda' },
      createMockRng(['TAILS', 'TAILS', 'TAILS', 'TAILS']),
    );
    expect(state.phase).toBe('GAME_OVER');
    expect(state.winnerId).toBe('P1');
  });

  it('Cream Invisibilidad del Vacío dodges next enemy attack and Caesar Bubble Lenses cancels on tails', () => {
    // 1. Cream dodges next enemy attack on HEADS
    let creamState = buildControlledBattleState({
      p1ActiveId: 'char-vanilla-ice',
      p1ActiveStandId: 'stand-cream',
      p1ActiveEnergies: ['PSYCHIC', 'PSYCHIC', 'PSYCHIC'],
      p2ActiveId: 'char-jonathan-joestar',
      p2ActiveEnergies: ['COLORLESS'],
      phase: 'COMBAT',
    });
    creamState = mustDispatch(
      creamState,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-invisibilidad-del-vacio' },
      createMockRng(['HEADS']),
    );
    expect(creamState.players.P1.active!.dodgeNextAttack).toBe(true);

    creamState = mustDispatch(creamState, { type: 'ENTER_COMBAT_PHASE', playerId: 'P2' });
    creamState = mustDispatch(creamState, {
      type: 'USE_ATTACK',
      playerId: 'P2',
      attackId: 'atk-zoom-punch',
    });
    expect(creamState.players.P1.active!.currentHp).toBe(130); // dodged!
    expect(creamState.players.P1.active!.dodgeNextAttack).toBe(false);

    // 2. Caesar Bubble Lenses cancels on TAILS, deals 110 + Burn on HEADS
    const caesarBase = buildControlledBattleState({
      p1ActiveId: 'char-caesar-zeppeli',
      p1ActiveEnergies: ['LIGHT', 'LIGHT', 'LIGHT', 'LIGHT'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'COMBAT',
    });
    const onTails = mustDispatch(
      caesarBase,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-bubble-lenses' },
      createMockRng(['TAILS']),
    );
    expect(onTails.players.P2.active!.currentHp).toBe(160);
    expect(onTails.players.P2.active!.statuses.burn).toBeNull();

    const onHeads = mustDispatch(
      caesarBase,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-bubble-lenses' },
      createMockRng(['HEADS']),
    );
    expect(onHeads.players.P2.active!.currentHp).toBe(50);
    expect(onHeads.players.P2.active!.statuses.burn?.active).toBe(true);
  });

  it('awards victory by deck-out when opponent has 0 cards to draw at turn start', () => {
    const state = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p2ActiveId: 'char-dio-brando',
      p2Deck: [],
      phase: 'PREPARATION',
    });

    const next = mustDispatch(state, { type: 'END_TURN', playerId: 'P1' });
    expect(next.phase).toBe('GAME_OVER');
    expect(next.winnerId).toBe('P1');
    expect(next.winReason).toContain('mazo');
  });
});
