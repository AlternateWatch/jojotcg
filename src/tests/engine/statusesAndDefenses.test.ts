import { describe, expect, it } from 'vitest';
import { chooseAiAction } from '../../engine/ai/tacticalAi';
import { dispatchAction, reviveCharacterFromDiscard } from '../../engine/gameEngine';
import { computeEffectiveMaxHp } from '../../engine/helpers/cardStats';
import { createMockRng } from '../../engine/rng';
import { getNextActingPlayer } from '../../store/useBattleStore';
import { buildControlledBattleState, mustDispatch } from '../helpers/testFixtures';

describe('Statuses (Bleed, Burn, Stun) & Defensive Abilities / Synergies', () => {
  it('stacks Bleed independently for 3 turns (Turn 1 + Turn 3 -> 20 dmg on T3, 10 dmg on T4) and triggers lethal KO', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-mariah',
      p1ActiveStandId: 'stand-bastet',
      p1ActiveEnergies: ['COLORLESS', 'PSYCHIC'],
      p2ActiveId: 'char-dio-brando',
      p2BenchIds: ['char-iggy'],
      phase: 'COMBAT',
      activePlayerId: 'P1',
    });

    // Stack 1 applied on P2 (Dio Brando: 140 - 40 = 100 HP, 1 bleed stack [3])
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-bastet-cuchillos',
    });
    expect(state.players.P2.active!.currentHp).toBe(100);
    expect(state.players.P2.active!.statuses.bleedStacks).toHaveLength(1);

    // P2 ends turn 1 -> Stack 1 ticks (-10 -> 90 HP, remaining 2)
    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P2' });
    expect(state.players.P2.active!.currentHp).toBe(90);
    expect(state.players.P2.active!.statuses.bleedStacks[0]!.turnsRemaining).toBe(2);

    // P1 ends turn without attacking
    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P1' });
    // P2 ends turn 2 -> Stack 1 ticks (-10 -> 80 HP, remaining 1)
    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P2' });
    expect(state.players.P2.active!.currentHp).toBe(80);
    expect(state.players.P2.active!.statuses.bleedStacks[0]!.turnsRemaining).toBe(1);

    // P1 applies Stack 2 on Turn 3 (80 - 40 = 40 HP; stacks: [rem 1], [rem 3])
    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-bastet-cuchillos',
    });
    expect(state.players.P2.active!.currentHp).toBe(40);
    expect(state.players.P2.active!.statuses.bleedStacks).toHaveLength(2);

    // P2 ends turn 3 -> BOTH stacks tick (-20 -> 20 HP); Stack 1 expires, Stack 2 remains at 2!
    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P2' });
    expect(state.players.P2.active!.currentHp).toBe(20);
    expect(state.players.P2.active!.statuses.bleedStacks).toHaveLength(1);
    expect(state.players.P2.active!.statuses.bleedStacks[0]!.turnsRemaining).toBe(2);

    // Set Dio Brando to 10 HP so next Bleed tick is LETHAL -> auto-promotes Iggy!
    state.players.P2.active!.currentHp = 10;
    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P1' });
    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P2' });
    expect(state.players.P2.active!.cardId).toBe('char-iggy');
    expect(state.players.P2.bench).toHaveLength(0);
  });

  it('Burn deals 10 fixed damage and is immediately cleansed on healing, bench retreat, or promotion', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1Hand: ['item-comida-de-tonio'],
      p1BenchIds: ['char-will-a-zeppeli'],
      p2ActiveId: 'char-dio-brando',
      phase: 'PREPARATION',
      activePlayerId: 'P1',
    });
    state.players.P1.active!.currentHp = 90;
    state.players.P1.active!.statuses.burn = { active: true, damagePerTurn: 10 };

    // Case 1: Healing cleanses Burn immediately
    const healed = mustDispatch(state, {
      type: 'PLAY_ITEM',
      playerId: 'P1',
      handIndex: 0,
      targetInstanceId: state.players.P1.active!.instanceId,
    });
    expect(healed.players.P1.active!.currentHp).toBe(130);
    expect(healed.players.P1.active!.statuses.burn).toBeNull();

    // Case 2: Swapping/retreating cleanses Burn from both outgoing and promoted incoming!
    state.players.P1.bench[0]!.statuses.burn = { active: true, damagePerTurn: 10 };
    const swapped = mustDispatch(state, {
      type: 'SWAP_ACTIVE_WITH_BENCH',
      playerId: 'P1',
      benchInstanceId: state.players.P1.bench[0]!.instanceId,
    });
    expect(swapped.players.P1.active!.statuses.burn).toBeNull();
    expect(swapped.players.P1.bench[0]!.statuses.burn).toBeNull();

    // Case 3: Without cleanse, Burn ticks 10 fixed damage at end of affected player's turn
    const burned = mustDispatch(state, { type: 'END_TURN', playerId: 'P1' });
    expect(burned.players.P1.active!.currentHp).toBe(80); // 90 - 10
  });

  it('Stunned blocks attacks and prep abilities, but ALLOWS retreating/swapping to bench', () => {
    const state = buildControlledBattleState({
      p1ActiveId: 'char-robert-e-o-speedwagon',
      p1BenchIds: ['char-jonathan-joestar'],
      p2ActiveId: 'char-dio-brando',
      phase: 'PREPARATION',
      activePlayerId: 'P1',
    });
    state.players.P1.active!.statuses.stunned = true;
    state.players.P1.discard.push('item-comida-de-tonio');

    // Cannot enter combat
    expect(dispatchAction(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' }).ok).toBe(false);
    // Cannot use prep ability while stunned
    expect(
      dispatchAction(state, {
        type: 'USE_PREP_ABILITY',
        playerId: 'P1',
        sourceInstanceId: state.players.P1.active!.instanceId,
      }).ok,
    ).toBe(false);
    // CAN retreat/swap to bench!
    const swapped = mustDispatch(state, {
      type: 'SWAP_ACTIVE_WITH_BENCH',
      playerId: 'P1',
      benchInstanceId: state.players.P1.bench[0]!.instanceId,
    });
    expect(swapped.players.P1.active!.cardId).toBe('char-jonathan-joestar');
  });

  it('Yare Yare Daze prompts Jotaro to discard 1 card and cancel an incoming elemental status', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-noriaki-kakyoin',
      p1ActiveStandId: 'stand-hierophant-green',
      p1ActiveEnergies: ['COLORLESS'],
      p2ActiveId: 'char-jotaro-kujo',
      p2Hand: ['energy-colorless'],
      phase: 'COMBAT',
    });

    // Kakyoin uses Cuerpo Flexible (instant Stun)
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-cuerpo-flexible',
    });
    expect(state.pendingPrompt?.kind).toBe('YARE_YARE_DAZE_REACTION');
    expect(state.pendingPrompt?.playerId).toBe('P2');

    // Jotaro accepts & discards index 0 -> Stun prevented!
    // (After P1's attack resolves, P2 starts their turn and draws 1 card from deck)
    state = mustDispatch(state, {
      type: 'RESPOND_PROMPT',
      playerId: 'P2',
      response: { kind: 'YARE_YARE_DAZE_REACTION', accept: true, discardHandIndex: 0 },
    });
    expect(state.players.P2.active!.statuses.stunned).toBe(false);
    expect(state.players.P2.discard).toContain('energy-colorless');
    expect(state.activePlayerId).toBe('P2');
    expect(state.players.P2.hand).toHaveLength(1); // drew 1 card on start of P2 turn
  });

  it('enforces Control del Agua (N-Doul), Se te ve la ropa interior (Polnareff+Kakyoin), Stroheim (-10 attacks only)', () => {
    // 1. N'Doul immune to Water attacks (Geb Garra de Agua)
    const ndoulState = buildControlledBattleState({
      p1ActiveId: 'char-dio-brando',
      p1ActiveEnergies: ['WATER'],
      p2ActiveId: 'char-n-doul',
      phase: 'COMBAT',
    });
    const afterWater = mustDispatch(ndoulState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-vaporization-freezing',
    });
    expect(afterWater.players.P2.active!.currentHp).toBe(100); // took 0 damage

    // 2. Polnareff + Kakyoin on bench -> immune to elemental statuses (Stun)
    const polState = buildControlledBattleState({
      p1ActiveId: 'char-noriaki-kakyoin',
      p1ActiveStandId: 'stand-hierophant-green',
      p1ActiveEnergies: ['COLORLESS'],
      p2ActiveId: 'char-jean-pierre-polnareff',
      p2BenchIds: ['char-noriaki-kakyoin'],
      phase: 'COMBAT',
    });
    const afterStun = mustDispatch(polState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-cuerpo-flexible',
    });
    expect(afterStun.players.P2.active!.statuses.stunned).toBe(false);

    // 3. Stroheim reduces -10 ONLY on attacks, NOT on Bleed/Burn
    let stroState = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1ActiveEnergies: ['COLORLESS'],
      p2ActiveId: 'char-rudol-von-stroheim', // 100 HP
      phase: 'COMBAT',
    });
    stroState.players.P2.active!.statuses.burn = { active: true, damagePerTurn: 10 };
    // Zoom Punch (20 dmg) -> reduced to 10 -> 90 HP
    stroState = mustDispatch(stroState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-zoom-punch',
    });
    expect(stroState.players.P2.active!.currentHp).toBe(90);
    // P2 ends turn -> Burn deals full 10 (NOT reduced by Stroheim) -> 80 HP
    stroState = mustDispatch(stroState, { type: 'END_TURN', playerId: 'P2' });
    expect(stroState.players.P2.active!.currentHp).toBe(80);
  });

  it('enforces Wamuu Sentido del Viento (no reset on bench, DOES reset on revive) and Kars Intelecto Superior (saves ALL KO types)', () => {
    // Wamuu dodges 1st attack, swaps to bench & back -> does NOT dodge 2nd attack!
    let wamuuState = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1ActiveEnergies: ['COLORLESS'],
      p2ActiveId: 'char-wamuu', // 130 HP
      p2BenchIds: ['char-iggy'],
      phase: 'COMBAT',
    });
    wamuuState = mustDispatch(wamuuState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-zoom-punch',
    });
    expect(wamuuState.players.P2.active!.currentHp).toBe(130); // dodged!
    expect(wamuuState.players.P2.active!.windSenseUsed).toBe(true);

    // Swap Wamuu to bench & back (two turns) -> windSenseUsed remains true
    wamuuState = mustDispatch(wamuuState, {
      type: 'SWAP_ACTIVE_WITH_BENCH',
      playerId: 'P2',
      benchInstanceId: wamuuState.players.P2.bench[0]!.instanceId,
    });
    expect(wamuuState.players.P2.bench[0]!.windSenseUsed).toBe(true);

    // Revived Wamuu from discard DOES reset windSenseUsed to false!
    wamuuState.players.P2.discard.push('char-wamuu');
    const revived = reviveCharacterFromDiscard(wamuuState, 'P2', 0);
    expect(revived.ok).toBe(true);
    const freshWamuu = revived.state.players.P2.bench[revived.state.players.P2.bench.length - 1]!;
    expect(freshWamuu.windSenseUsed).toBe(false);

    // Kars Intelecto Superior saves against Cream Esfera del Vacío instant KO AND lethal Bleed!
    const karsInstantKo = buildControlledBattleState({
      p1ActiveId: 'char-vanilla-ice',
      p1ActiveStandId: 'stand-cream',
      p1ActiveEnergies: ['PSYCHIC', 'PSYCHIC', 'PSYCHIC', 'PSYCHIC'],
      p2ActiveId: 'char-kars',
      phase: 'COMBAT',
    });
    const afterVoid = mustDispatch(
      karsInstantKo,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-esfera-del-vacio' },
      createMockRng(['HEADS']),
    );
    expect(afterVoid.phase).not.toBe('GAME_OVER');
    expect(afterVoid.players.P2.active!.currentHp).toBe(1);
    expect(afterVoid.players.P2.active!.superiorIntellectUsed).toBe(true);

    // Second lethal hit (Bleed) NOW KOs Kars
    afterVoid.players.P2.active!.statuses.bleedStacks.push({
      id: 'b-1',
      turnsRemaining: 3,
      damagePerTurn: 10,
    });
    const afterBleed = mustDispatch(afterVoid, { type: 'END_TURN', playerId: 'P2' });
    expect(afterBleed.phase).toBe('GAME_OVER');
    expect(afterBleed.winnerId).toBe('P1');
  });

  it('applies dynamic bench synergies (Will Zeppeli / Lisa Lisa Hamon +20 max non-stacking, Okuyasu + Josuke +20 HP)', () => {
    const hamonState = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1BenchIds: ['char-will-a-zeppeli', 'char-lisa-lisa'],
      p1ActiveEnergies: ['COLORLESS'],
      p2ActiveId: 'char-dio-brando', // 140 HP
      phase: 'COMBAT',
    });
    // Zoom Punch (20) + Hamon Master Bench (+20 non-stacking) = 40 damage -> 100 HP
    const afterHamon = mustDispatch(hamonState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-zoom-punch',
    });
    expect(afterHamon.players.P2.active!.currentHp).toBe(100);

    const okuState = buildControlledBattleState({
      p1ActiveId: 'char-okuyasu-nijimura', // base 130
      p1BenchIds: ['char-josuke-higashikata'],
      p2ActiveId: 'char-dio-brando',
    });
    expect(computeEffectiveMaxHp(okuState, 'P1', okuState.players.P1.active!)).toBe(150);
  });

  it('stunning sole enemy active (Silver Chariot vs Wamuu 110 HP) does NOT KO or end the game, and sole Wamuu AI never self-KOs into a loss', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-jean-pierre-polnareff',
      p1ActiveStandId: 'stand-silver-chariot',
      p1ActiveEnergies: ['PSYCHIC', 'PSYCHIC'],
      p1BenchIds: ['char-jotaro-kujo'],
      p2ActiveId: 'char-wamuu',
      p2ActiveEnergies: ['LIGHT', 'LIGHT', 'PSYCHIC', 'PSYCHIC'],
      p2BenchIds: [],
      phase: 'COMBAT',
      activePlayerId: 'P1',
    });
    state.players.P2.isAi = true;
    state.players.P2.active!.currentHp = 110;
    state.players.P2.active!.windSenseUsed = true;

    // 1. Silver Chariot uses Lanzamiento del Estoque (60 dmg + Heads = Stunned)
    const rngHeads = createMockRng(['HEADS']);
    state = mustDispatch(
      state,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-lanzamiento-del-estoque' },
      rngHeads,
    );
    expect(state.phase).toBe('PREPARATION');
    expect(state.activePlayerId).toBe('P2');
    expect(state.players.P2.active).not.toBeNull();
    expect(state.players.P2.active!.currentHp).toBe(50);
    expect(state.players.P2.active!.statuses.stunned).toBe(true);

    // 2. Wamuu AI plays its stunned turn cleanly (ends turn, clears stun, stays alive)
    let guard = 0;
    while (state.phase !== 'GAME_OVER' && getNextActingPlayer(state) === 'P2' && guard < 10) {
      guard++;
      const act = chooseAiAction(state, 'P2', 'HARD');
      if (!act) break;
      state = mustDispatch(state, act, rngHeads);
    }
    expect(state.phase).toBe('PREPARATION');
    expect(state.activePlayerId).toBe('P1');
    expect(state.players.P2.active).not.toBeNull();
    expect(state.players.P2.active!.statuses.stunned).toBe(false);

    // 3. On Wamuu's next non-stunned turn (with 4 energies and NO bench vs Polnareff with bench),
    // AI must NOT pick Final Mode: Atmospheric Rift (which would self-KO and lose the game!)
    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P1' }, rngHeads);
    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P2' }, rngHeads);
    const chosenAttack = chooseAiAction(state, 'P2', 'HARD');
    expect(chosenAttack?.type).toBe('USE_ATTACK');
    if (chosenAttack?.type === 'USE_ATTACK') {
      expect(chosenAttack.attackId).toBe('atk-divine-sandstorm');
    }
  });
});
