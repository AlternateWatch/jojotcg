import { describe, expect, it } from 'vitest';
import { dispatchAction } from '../../engine/gameEngine';
import { createMockRng } from '../../engine/rng';
import { buildControlledBattleState, mustDispatch } from '../helpers/testFixtures';

describe('Coin Flips, Multi-Coin Damage & Bench Damage Distribution', () => {
  it('resolves The World Muda Muda (4 coins: 30 heads, 20 tails) deterministically', () => {
    const state = buildControlledBattleState({
      p1ActiveId: 'char-dio',
      p1ActiveStandId: 'stand-the-world',
      p1ActiveEnergies: ['COLORLESS', 'COLORLESS', 'COLORLESS'],
      p2ActiveId: 'char-jonathan-joestar', // 130 HP
      phase: 'COMBAT',
    });

    // 2 HEADS (60) + 2 TAILS (40) = 100 damage -> Jonathan goes from 130 to 30 HP
    const rng = createMockRng(['HEADS', 'TAILS', 'HEADS', 'TAILS']);
    const res = dispatchAction(
      state,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-muda-muda' },
      rng,
    );
    expect(res.ok).toBe(true);
    expect(res.state.players.P2.active!.currentHp).toBe(30);
    const coinEvent = res.events.find((e) => e.type === 'COIN_FLIPPED');
    expect(coinEvent?.type === 'COIN_FLIPPED' && coinEvent.results).toEqual([
      'HEADS',
      'TAILS',
      'HEADS',
      'TAILS',
    ]);
  });

  it('resolves Kars Light Blades (4 coins: 20 enemy on heads, 10 self on tails)', () => {
    const state = buildControlledBattleState({
      p1ActiveId: 'char-kars', // 150 HP
      p1ActiveEnergies: ['LIGHT', 'LIGHT'],
      p2ActiveId: 'char-jonathan-joestar', // 130 HP
      phase: 'COMBAT',
    });

    // 3 HEADS (60 to Jonathan -> 70 HP) + 1 TAILS (10 to Kars -> 140 HP)
    const rng = createMockRng(['HEADS', 'HEADS', 'TAILS', 'HEADS']);
    const next = mustDispatch(
      state,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-light-blades' },
      rng,
    );
    expect(next.players.P2.active!.currentHp).toBe(70);
    expect(next.players.P1.active!.currentHp).toBe(140);
  });

  it('resolves Cream Esfera del Vacío (heads KO rival, tails KO self)', () => {
    const base = buildControlledBattleState({
      p1ActiveId: 'char-vanilla-ice',
      p1ActiveStandId: 'stand-cream',
      p1ActiveEnergies: ['PSYCHIC', 'PSYCHIC', 'PSYCHIC', 'PSYCHIC'],
      p2ActiveId: 'char-jonathan-joestar',
      phase: 'COMBAT',
    });

    const headsRes = mustDispatch(
      base,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-esfera-del-vacio' },
      createMockRng(['HEADS']),
    );
    expect(headsRes.phase).toBe('GAME_OVER');
    expect(headsRes.winnerId).toBe('P1');

    const tailsRes = mustDispatch(
      base,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-esfera-del-vacio' },
      createMockRng(['TAILS']),
    );
    expect(tailsRes.phase).toBe('GAME_OVER');
    expect(tailsRes.winnerId).toBe('P2');
  });

  it('distributes bench damage in 10-point increments (Star Platinum Ora Ora) and rejects non-10 multiples', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-jotaro-kujo',
      p1ActiveStandId: 'stand-star-platinum',
      p1ActiveEnergies: ['COLORLESS', 'COLORLESS'],
      p2ActiveId: 'char-dio-brando', // 140 HP
      p2BenchIds: ['char-robert-e-o-speedwagon', 'char-iggy'],
      phase: 'COMBAT',
    });

    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-ora-ora',
    });
    expect(state.pendingPrompt?.kind).toBe('DISTRIBUTE_BENCH_DAMAGE');

    const activeId = state.players.P2.active!.instanceId;
    const bench0 = state.players.P2.bench[0]!.instanceId;
    const bench1 = state.players.P2.bench[1]!.instanceId;

    // Non-multiple of 10 -> rejected
    const badMultiple = dispatchAction(state, {
      type: 'RESPOND_PROMPT',
      playerId: 'P1',
      response: {
        kind: 'DISTRIBUTE_BENCH_DAMAGE',
        allocation: { [activeId]: 25, [bench0]: 25, [bench1]: 10 },
      },
    });
    expect(badMultiple.ok).toBe(false);

    // Valid distribution totaling 60: 20 active, 30 bench0, 10 bench1
    state = mustDispatch(state, {
      type: 'RESPOND_PROMPT',
      playerId: 'P1',
      response: {
        kind: 'DISTRIBUTE_BENCH_DAMAGE',
        allocation: { [activeId]: 20, [bench0]: 30, [bench1]: 10 },
      },
    });

    expect(state.players.P2.active!.currentHp).toBe(120);
    expect(state.players.P2.bench[0]!.currentHp).toBe(60); // Speedwagon 90 - 30
    expect(state.players.P2.bench[1]!.currentHp).toBe(90); // Iggy 100 - 10
  });

  it('handles global bench damage (Sendō Hamon Overdrive) eliminating low-HP bench characters', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1ActiveEnergies: ['ELECTRIC', 'ELECTRIC', 'ELECTRIC'],
      p2ActiveId: 'char-dio-brando',
      p2BenchIds: ['char-robert-e-o-speedwagon', 'char-iggy'],
      phase: 'COMBAT',
    });
    // Set Speedwagon to 10 HP so collateral 10 damage eliminates him!
    state.players.P2.bench[0]!.currentHp = 10;

    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-sendo-hamon-overdrive',
    });

    expect(state.players.P2.active!.currentHp).toBe(70); // 140 - 70
    expect(state.players.P2.bench).toHaveLength(1); // Speedwagon KO'd
    expect(state.players.P2.bench[0]!.cardId).toBe('char-iggy');
    expect(state.players.P2.bench[0]!.currentHp).toBe(90); // 100 - 10
  });
});
