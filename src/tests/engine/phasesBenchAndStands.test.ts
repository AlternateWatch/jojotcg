import { describe, expect, it } from 'vitest';
import { chooseAiAction } from '../../engine/ai/tacticalAi';
import { dispatchAction, reviveCharacterFromDiscard } from '../../engine/gameEngine';
import { buildControlledBattleState, mustDispatch } from '../helpers/testFixtures';

describe('Turn Phases, Bench Management, Stands & Energy Rules', () => {
  it('forbids attacking in PREPARATION and forbids bench actions in COMBAT', () => {
    const state = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p2ActiveId: 'char-dio-brando',
      p1Hand: ['char-will-a-zeppeli'],
      p1ActiveEnergies: ['COLORLESS'],
      phase: 'PREPARATION',
    });

    const attackInPrep = dispatchAction(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-zoom-punch',
    });
    expect(attackInPrep.ok).toBe(false);

    const combatState = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    const benchInCombat = dispatchAction(combatState, {
      type: 'PLAY_TO_BENCH',
      playerId: 'P1',
      handIndex: 0,
    });
    expect(benchInCombat.ok).toBe(false);
  });

  it('forbids placing a Stand independently on the bench', () => {
    const state = buildControlledBattleState({
      p1ActiveId: 'char-jotaro-kujo',
      p2ActiveId: 'char-dio-brando',
      p1Hand: ['stand-star-platinum'],
    });

    const res = dispatchAction(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: 0 });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Personaje');
  });

  it('enforces DG requirements, free Stand equip, no Stand replacement, and Stand accompanies user to bench', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-hol-horse', // DG 3
      p2ActiveId: 'char-dio-brando',
      p1BenchIds: ['char-jonathan-joestar'],
      p1Hand: ['stand-star-platinum', 'stand-emperor', 'stand-bastet'],
    });

    // Hol Horse (DG 3) cannot equip Star Platinum (DG 5)
    const tooHighDg = dispatchAction(state, {
      type: 'EQUIP_STAND',
      playerId: 'P1',
      handIndex: 0,
      targetInstanceId: state.players.P1.active!.instanceId,
    });
    expect(tooHighDg.ok).toBe(false);

    // Hol Horse CAN equip Emperor (DG 3) for free without ending turn
    state = mustDispatch(state, {
      type: 'EQUIP_STAND',
      playerId: 'P1',
      handIndex: 1,
      targetInstanceId: state.players.P1.active!.instanceId,
    });
    expect(state.phase).toBe('PREPARATION');
    expect(state.activePlayerId).toBe('P1');
    expect(state.players.P1.active!.attachedStand?.cardId).toBe('stand-emperor');

    // Cannot replace an already equipped Stand (Bastet)
    const replaceRes = dispatchAction(state, {
      type: 'EQUIP_STAND',
      playerId: 'P1',
      handIndex: 1, // Bastet shifted to index 1
      targetInstanceId: state.players.P1.active!.instanceId,
    });
    expect(replaceRes.ok).toBe(false);

    // Swap active with bench: Emperor stays attached to Hol Horse on bench, and turn ends immediately!
    const benchId = state.players.P1.bench[0]!.instanceId;
    state = mustDispatch(state, {
      type: 'SWAP_ACTIVE_WITH_BENCH',
      playerId: 'P1',
      benchInstanceId: benchId,
    });
    expect(state.activePlayerId).toBe('P2');
    const benchedHolHorse = state.players.P1.bench.find((c) => c.cardId === 'char-hol-horse');
    expect(benchedHolHorse?.attachedStand?.cardId).toBe('stand-emperor');
  });

  it('reviving a character from discard returns it without any previous Stand', () => {
    const state = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p2ActiveId: 'char-dio-brando',
    });
    state.players.P1.discard.push('char-hol-horse');

    const revived = reviveCharacterFromDiscard(state, 'P1', 0);
    expect(revived.ok).toBe(true);
    const revivedHolHorse = revived.state.players.P1.bench.find((c) => c.cardId === 'char-hol-horse');
    expect(revivedHolHorse).toBeDefined();
    expect(revivedHolHorse?.attachedStand).toBeNull();
  });

  it('enforces max 1 Energy attachment per turn, unlimited Items, and max 1 Evolution per turn', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-kars',
      p2ActiveId: 'char-dio-brando',
      p1Hand: [
        'energy-light',
        'energy-light',
        'item-mascara-de-piedra',
        'item-piedra-roja-de-aja',
        'evo-kars-ultimate',
      ],
    });

    // Attach 1st energy -> ok
    state = mustDispatch(state, {
      type: 'ATTACH_ENERGY',
      playerId: 'P1',
      handIndex: 0,
      targetInstanceId: state.players.P1.active!.instanceId,
    });
    // Attach 2nd energy same turn -> rejected
    const secondEnergy = dispatchAction(state, {
      type: 'ATTACH_ENERGY',
      playerId: 'P1',
      handIndex: 0,
      targetInstanceId: state.players.P1.active!.instanceId,
    });
    expect(secondEnergy.ok).toBe(false);

    // Play BOTH equippable items in the same turn (unlimited items!)
    state = mustDispatch(state, {
      type: 'PLAY_ITEM',
      playerId: 'P1',
      handIndex: 1, // mascara
      targetInstanceId: state.players.P1.active!.instanceId,
    });
    state = mustDispatch(state, {
      type: 'PLAY_ITEM',
      playerId: 'P1',
      handIndex: 1, // piedra roja
      targetInstanceId: state.players.P1.active!.instanceId,
    });
    expect(state.players.P1.active!.attachedItems).toHaveLength(2);

    // Evolve Kars (1st evolution this turn -> ok)
    state = mustDispatch(state, { type: 'EVOLVE_CARD', playerId: 'P1', handIndex: 1 });
    expect(state.players.P1.evolutionsPlayedThisTurn).toBe(1);

    // Trying a 2nd evolution in the same turn -> rejected
    state.players.P1.hand.push('evo-kosaku-kawajiri');
    const secondEvo = dispatchAction(state, {
      type: 'EVOLVE_CARD',
      playerId: 'P1',
      handIndex: state.players.P1.hand.length - 1,
    });
    expect(secondEvo.ok).toBe(false);
    expect(secondEvo.error).toContain('evolución por turno');
  });

  it('blocks opponent from placing characters on bench while Kakyoin is on the field', () => {
    const state = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p2ActiveId: 'char-noriaki-kakyoin',
      p1Hand: ['char-will-a-zeppeli'],
    });
    const res = dispatchAction(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: 0 });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Kakyoin');
  });

  it('allows equipping a compatible Stand directly onto a Bench Stand User for free without ending turn', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-kars',
      p1BenchIds: ['char-jotaro-kujo', 'char-hol-horse'],
      p1Hand: ['stand-star-platinum'],
      p2ActiveId: 'char-dio-brando',
      phase: 'PREPARATION',
    });

    const jotaroBench = state.players.P1.bench[0]!;
    const holHorseBench = state.players.P1.bench[1]!;

    // Hol Horse (DG 3) on bench cannot equip Star Platinum (DG 5)
    const tooLowDg = dispatchAction(state, {
      type: 'EQUIP_STAND',
      playerId: 'P1',
      handIndex: 0,
      targetInstanceId: holHorseBench.instanceId,
    });
    expect(tooLowDg.ok).toBe(false);

    // Jotaro (DG 5) on bench CAN equip Star Platinum for free without ending P1's turn!
    state = mustDispatch(state, {
      type: 'EQUIP_STAND',
      playerId: 'P1',
      handIndex: 0,
      targetInstanceId: jotaroBench.instanceId,
    });
    expect(state.phase).toBe('PREPARATION');
    expect(state.activePlayerId).toBe('P1');
    expect(state.players.P1.bench[0]!.attachedStand?.cardId).toBe('stand-star-platinum');
  });

  it('AI proactively builds a bench even when Kars already has a payable attack (unless lethal)', () => {
    const state = buildControlledBattleState({
      p1ActiveId: 'char-jotaro-kujo', // 140 HP (non-lethal for Kars's 10-80 dmg)
      p2ActiveId: 'char-kars',
      p2ActiveEnergies: ['LIGHT', 'LIGHT'],
      p2Hand: ['char-wamuu', 'char-dio'],
      phase: 'PREPARATION',
      activePlayerId: 'P2',
    });
    state.players.P2.isAi = true;

    const aiAction = chooseAiAction(state, 'P2');
    expect(aiAction?.type).toBe('PLAY_TO_BENCH');
  });
});
