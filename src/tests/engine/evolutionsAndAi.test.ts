import { describe, expect, it } from 'vitest';
import { PRESET_DECKS } from '../../data/cardRegistry';
import { chooseAiAction } from '../../engine/ai/tacticalAi';
import { createGame, dispatchAction } from '../../engine/gameEngine';
import { createSeededRng } from '../../engine/rng';
import { buildControlledBattleState, mustDispatch } from '../helpers/testFixtures';

describe('Special Evolutions & Deterministic AI Simulation', () => {
  it('evolves Silver Chariot Requiem (requires Flecha Réquiem) and resolves Intercambio de Almas > maxHp', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-jean-pierre-polnareff', // 130 maxHp
      p1ActiveStandId: 'stand-silver-chariot',
      p1ActiveEnergies: ['PSYCHIC', 'PSYCHIC', 'PSYCHIC'],
      p1Hand: ['evo-silver-chariot-requiem'], // missing Flecha Réquiem!
      p2ActiveId: 'char-dio', // 160 HP (> Polnareff's 130 maxHp!)
      phase: 'PREPARATION',
    });

    // Missing Flecha Réquiem -> rejected
    expect(dispatchAction(state, { type: 'EVOLVE_CARD', playerId: 'P1', handIndex: 0 }).ok).toBe(
      false,
    );

    // Add Flecha Réquiem -> evolves cleanly & consumes arrow
    state.players.P1.hand.push('item-flecha-requiem');
    state.players.P1.active!.currentHp = 40;
    state = mustDispatch(state, { type: 'EVOLVE_CARD', playerId: 'P1', handIndex: 0 });
    expect(state.players.P1.discard).toContain('item-flecha-requiem');

    // Use Intercambio de Almas: Polnareff gets 160 HP (exceeds 130 maxHp!), DIO gets 40 HP!
    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-intercambio-de-almas',
    });
    expect(state.players.P1.active!.currentHp).toBe(160);
    expect(state.players.P2.active!.currentHp).toBe(40);
  });

  it('evolves Killer Queen: Bites The Dust (requires Stray Cat + Flecha de Stand) and bounces enemy bench to deck', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-yoshikage-kira',
      p1ActiveStandId: 'stand-killer-queen',
      p1BenchIds: ['char-stray-cat'],
      p1ActiveEnergies: ['PSYCHIC', 'PSYCHIC', 'FIRE', 'FIRE'],
      p1Hand: ['evo-killer-queen-bites-the-dust', 'item-flecha-de-stand'],
      p2ActiveId: 'char-dio', // 160 HP
      p2BenchIds: ['char-iggy'],
      phase: 'PREPARATION',
    });

    state = mustDispatch(state, { type: 'EVOLVE_CARD', playerId: 'P1', handIndex: 0 });
    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-bites-the-dust',
    });

    // 100 base + 10 from Yoshikage Kira's "Una Vida Tranquila..." synergy = 110 dmg -> DIO 50 HP
    expect(state.players.P2.active!.currentHp).toBe(50);
    expect(state.players.P2.bench).toHaveLength(0);
    expect(state.players.P2.deck).toContain('char-iggy');
  });

  it('evolves Kosaku Kawajiri from Yoshikage Kira and steals opponent attached items on KO (No Quedará Nada...)', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-yoshikage-kira',
      p1ActiveStandId: 'stand-killer-queen',
      p1ActiveEnergies: ['FIRE', 'FIRE'],
      p1Hand: ['evo-kosaku-kawajiri'],
      p2ActiveId: 'char-kars',
      p2BenchIds: ['char-iggy'],
      p2ActiveItems: ['item-mascara-de-piedra', 'item-piedra-roja-de-aja'],
      phase: 'PREPARATION',
    });
    state.players.P2.active!.superiorIntellectUsed = true;
    state.players.P2.active!.currentHp = 40;

    state = mustDispatch(state, { type: 'EVOLVE_CARD', playerId: 'P1', handIndex: 0 });
    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-primera-bomba',
    });

    expect(state.players.P1.hand).toContain('item-mascara-de-piedra');
    expect(state.players.P1.hand).toContain('item-piedra-roja-de-aja');
  });

  it('evolves Star Platinum: The World only on Jotaro Kujo and enforces Za Warudo (1/turn, +2 extra abilities)', () => {
    // Non-Jotaro cannot play Star Platinum: The World
    const wrongUser = buildControlledBattleState({
      p1ActiveId: 'char-josuke-higashikata',
      p2ActiveId: 'char-dio',
      p1Hand: ['evo-star-platinum-the-world'],
    });
    expect(
      dispatchAction(wrongUser, { type: 'EVOLVE_CARD', playerId: 'P1', handIndex: 0 }).ok,
    ).toBe(false);

    // Jotaro Kujo CAN evolve and use Za Warudo -> 2 extra attacks, cannot cast Za Warudo twice in same turn!
    let state = buildControlledBattleState({
      p1ActiveId: 'char-jotaro-kujo',
      p1ActiveStandId: 'stand-star-platinum',
      p1ActiveEnergies: ['PSYCHIC', 'PSYCHIC', 'PSYCHIC', 'COLORLESS'],
      p1Hand: ['evo-star-platinum-the-world'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'PREPARATION',
    });

    state = mustDispatch(state, { type: 'EVOLVE_CARD', playerId: 'P1', handIndex: 0 });
    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });

    // 1. Cast Star Platinum: Za Warudo -> stays in COMBAT with 1 remaining extra (after decrementing to enter next)
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-star-platinum-za-warudo',
    });
    expect(state.phase).toBe('COMBAT');
    expect(state.activePlayerId).toBe('P1');

    // Cannot cast Za Warudo a second time in the same turn!
    const secondZaWarudo = dispatchAction(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-star-platinum-za-warudo',
    });
    expect(secondZaWarudo.ok).toBe(false);

    // Execute 2 extra attacks (Ora Ora 60 + Ora Ora 60 = 120 dmg -> DIO at 40 HP), then turn ends!
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-sptw-ora-ora',
    });
    expect(state.phase).toBe('COMBAT');
    expect(state.activePlayerId).toBe('P1');
    expect(state.players.P2.active!.currentHp).toBe(100);

    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-sptw-ora-ora',
    });
    expect(state.players.P2.active!.currentHp).toBe(40);
    expect(state.activePlayerId).toBe('P2'); // Turn ended after 2nd extra action
  });

  it('runs a full deterministic AI vs AI game to completion without deadlocks or illegal actions', () => {
    const runMatch = (seed: number) => {
      const rng = createSeededRng(seed);
      let state = createGame({
        p1Name: 'AI Crusaders',
        p2Name: 'AI Villains',
        p1Deck: PRESET_DECKS[0]!.cardIds,
        p2Deck: PRESET_DECKS[1]!.cardIds,
        p1IsAi: true,
        p2IsAi: true,
        rng,
      });

      let steps = 0;
      const maxSteps = 500;
      while (state.phase !== 'GAME_OVER' && steps < maxSteps) {
        let actingPlayer: 'P1' | 'P2' = state.activePlayerId;
        if (state.pendingPrompt) {
          actingPlayer = state.pendingPrompt.playerId;
        } else if (state.phase === 'SETUP_MULLIGAN') {
          actingPlayer = !state.players.P1.mulliganConfirmed ? 'P1' : 'P2';
        } else if (state.phase === 'SETUP_ACTIVE') {
          actingPlayer = !state.players.P1.setupActiveChosen ? 'P1' : 'P2';
        }

        const action = chooseAiAction(state, actingPlayer);
        expect(action, `AI deadlocked at step ${steps} phase ${state.phase}`).not.toBeNull();
        const res = dispatchAction(state, action!, rng);
        expect(res.ok, `AI produced illegal action ${action?.type}: ${res.error}`).toBe(true);
        state = res.state;
        steps++;
      }

      expect(state.phase).toBe('GAME_OVER');
      expect(state.winnerId).not.toBeNull();
      return {
        winnerId: state.winnerId,
        turnNumber: state.turnNumber,
        eventCount: state.eventLog.length,
        lastMessage: state.eventLog[state.eventLog.length - 1]?.message,
      };
    };

    const run1 = runMatch(2026);
    const run2 = runMatch(2026);
    expect(run1).toEqual(run2);
  });
});
