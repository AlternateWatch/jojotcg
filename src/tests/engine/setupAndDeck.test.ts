import { describe, expect, it } from 'vitest';
import { PRESET_DECKS } from '../../data/cardRegistry';
import { validateDeck } from '../../services/deckValidator';
import { createGame, dispatchAction } from '../../engine/gameEngine';
import {
  getMaxPlayableCharacterDg,
  hasValidStartingHand,
} from '../../engine/helpers/cardStats';
import { createSeededRng } from '../../engine/rng';
import { buildControlledBattleState, mustDispatch } from '../helpers/testFixtures';

describe('Deck Validation & Setup/Mulligan Rules', () => {
  it('validates all preset 46-card decks as completely legal', () => {
    for (const deck of PRESET_DECKS) {
      const result = validateDeck(deck.cardIds);
      expect(result.errors, `Preset ${deck.name} had errors`).toEqual([]);
      expect(result.valid).toBe(true);
      expect(result.stats.totalCards).toBe(46);
    }
  });

  it('rejects duplicate Characters/Stands (>1) and excess Items (>3), while allowing unlimited Energies', () => {
    const illegalDeck = [
      'char-jotaro-kujo',
      'char-jotaro-kujo', // illegal duplicate character
      'stand-star-platinum',
      'stand-star-platinum', // illegal duplicate stand
      'item-comida-de-tonio',
      'item-comida-de-tonio',
      'item-comida-de-tonio',
      'item-comida-de-tonio', // illegal 4th item copy
      ...Array.from({ length: 32 }, () => 'energy-colorless'),
    ];
    const res = validateDeck(illegalDeck);
    expect(res.valid).toBe(false);
    expect(res.errors.filter((e) => e.code === 'COPY_LIMIT_EXCEEDED')).toHaveLength(3);
  });

  it('correctly evaluates Mulligan starting hand rules', () => {
    // Only energies/items -> invalid
    expect(hasValidStartingHand(['energy-fire', 'item-comida-de-tonio', 'energy-psychic'])).toBe(
      false,
    );
    // Stand User alone without compatible Stand -> invalid
    expect(hasValidStartingHand(['char-jotaro-kujo', 'energy-colorless'])).toBe(false);
    // Stand User with DG 3 + Stand requiring DG 5 -> invalid
    expect(hasValidStartingHand(['char-hol-horse', 'stand-star-platinum'])).toBe(false);
    // Stand User with DG 3 + Stand requiring DG 3 -> valid!
    expect(hasValidStartingHand(['char-hol-horse', 'stand-emperor'])).toBe(true);
    // Self-sufficient Vampire / Pillar Man / Hamon / Conventional -> valid!
    expect(hasValidStartingHand(['char-dio-brando'])).toBe(true);
    expect(hasValidStartingHand(['char-kars'])).toBe(true);
    expect(hasValidStartingHand(['char-jonathan-joestar'])).toBe(true);
    expect(hasValidStartingHand(['char-robert-e-o-speedwagon'])).toBe(true);
  });

  it('performs mulligan when hand is invalid and grants opponent +1 card', () => {
    const p1Deck = [
      'energy-colorless',
      'energy-colorless',
      'energy-colorless',
      'energy-colorless',
      'energy-colorless',
      'char-jonathan-joestar',
      ...Array.from({ length: 14 }, () => 'energy-electric'),
    ];
    const p2Deck = [
      'char-dio-brando',
      ...Array.from({ length: 19 }, () => 'energy-psychic'),
    ];
    let state = createGame({
      p1Name: 'P1',
      p2Name: 'P2',
      p1Deck,
      p2Deck,
      rng: {
        nextFloat: () => 0.5,
        flipCoin: () => 'HEADS',
        shuffle: (items) => [...items],
      },
    });

    // P1 cannot confirm invalid hand
    const badConfirm = dispatchAction(state, { type: 'CONFIRM_STARTING_HAND', playerId: 'P1' });
    expect(badConfirm.ok).toBe(false);

    // P2 starts with 5 cards; after P1 mulligans, P2 gets +1 card (6 cards)
    expect(state.players.P2.hand).toHaveLength(5);
    const mulliganRes = dispatchAction(
      state,
      { type: 'PERFORM_MULLIGAN', playerId: 'P1' },
      createSeededRng(7),
    );
    expect(mulliganRes.ok).toBe(true);
    state = mulliganRes.state;
    expect(state.players.P1.mulliganCount).toBe(1);
    expect(state.players.P1.hand).toHaveLength(5);
    expect(state.players.P2.hand).toHaveLength(6);
  });

  it('prevents First Player from attacking on Turn 1 (Pokémon TCG rule)', () => {
    const p1Deck = ['char-jonathan-joestar', ...Array.from({ length: 19 }, () => 'energy-colorless')];
    const p2Deck = ['char-dio-brando', ...Array.from({ length: 19 }, () => 'energy-colorless')];
    const noShuffle = { nextFloat: () => 0.5, flipCoin: () => 'HEADS' as const, shuffle: <T,>(a: readonly T[]) => [...a] };

    let state = createGame({ p1Name: 'P1', p2Name: 'P2', p1Deck, p2Deck, rng: noShuffle });
    state = dispatchAction(state, { type: 'CONFIRM_STARTING_HAND', playerId: 'P1' }, noShuffle).state;
    state = dispatchAction(state, { type: 'CONFIRM_STARTING_HAND', playerId: 'P2' }, noShuffle).state;
    state = dispatchAction(state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P1', handIndex: 0 }, noShuffle).state;
    state = dispatchAction(state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P2', handIndex: 0 }, noShuffle).state;

    expect(state.turnNumber).toBe(1);
    expect(state.phase).toBe('PREPARATION');
    expect(state.activePlayerId).toBe('P1');

    // P1 tries to enter combat on Turn 1 -> rejected
    const combatTurn1 = dispatchAction(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    expect(combatTurn1.ok).toBe(false);

    // P1 ends turn -> still Turn 1 (P2's half of Turn 1), and P2 CAN enter combat
    state = dispatchAction(state, { type: 'END_TURN', playerId: 'P1' }, noShuffle).state;
    expect(state.turnNumber).toBe(1);
    expect(state.activePlayerId).toBe('P2');
    const combatTurn1P2 = dispatchAction(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P2' });
    expect(combatTurn1P2.ok).toBe(true);

    // P2 ends turn -> both players have played once, so Turn 2 begins with P1!
    state = dispatchAction(state, { type: 'END_TURN', playerId: 'P2' }, noShuffle).state;
    expect(state.turnNumber).toBe(2);
    expect(state.activePlayerId).toBe('P1');
    const combatTurn2P1 = dispatchAction(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    expect(combatTurn2P1.ok).toBe(true);
  });

  it('keeps VS_AI perspective locked on P1 even when AI has pending prompts or setup steps', async () => {
    const { getControllingPlayerId } = await import('../../store/useBattleStore');
    const p1Deck = ['char-jonathan-joestar', ...Array.from({ length: 19 }, () => 'energy-electric')];
    const p2Deck = ['char-dio-brando', ...Array.from({ length: 19 }, () => 'energy-psychic')];
    const noShuffle = { nextFloat: () => 0.5, flipCoin: () => 'HEADS' as const, shuffle: <T,>(a: readonly T[]) => [...a] };

    let state = createGame({ p1Name: 'P1', p2Name: 'IA', p1Deck, p2Deck, p2IsAi: true, rng: noShuffle });
    // After P1 confirms mulligan, P2 still needs to confirm -> VS_AI view MUST stay P1
    state = dispatchAction(state, { type: 'CONFIRM_STARTING_HAND', playerId: 'P1' }, noShuffle).state;
    expect(getControllingPlayerId(state, 'VS_AI')).toBe('P1');
    expect(getControllingPlayerId(state, 'HOTSEAT')).toBe('P2');

    // During P2's turn and P2 pendingPrompt -> VS_AI view MUST stay P1
    state = dispatchAction(state, { type: 'CONFIRM_STARTING_HAND', playerId: 'P2' }, noShuffle).state;
    state = dispatchAction(state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P1', handIndex: 0 }, noShuffle).state;
    expect(getControllingPlayerId(state, 'VS_AI')).toBe('P1');
    state = dispatchAction(state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P2', handIndex: 0 }, noShuffle).state;
    state = dispatchAction(state, { type: 'END_TURN', playerId: 'P1' }, noShuffle).state;
    state.pendingPrompt = {
      kind: 'SEARCH_DECK_CARDS',
      playerId: 'P2',
      filter: 'ENERGY',
      maxPickCount: 2,
      sourceLabel: 'Brújula de Energía',
    };
    expect(getControllingPlayerId(state, 'VS_AI')).toBe('P1');
    expect(getControllingPlayerId(state, 'HOTSEAT')).toBe('P2');
  });

  it('triggers immediate deck-out loss as soon as a player empties their deck (draw, item, or ability)', () => {
    const p1Deck = [
      'char-jonathan-joestar',
      'item-suministros-speedwagon',
      'energy-electric',
      'energy-electric',
      'energy-electric',
      'energy-electric',
      'energy-electric',
    ]; // 7 cards total: 5 initial hand + 1 T1 draw + 1 left in deck
    const p2Deck = [
      'char-dio-brando',
      ...Array.from({ length: 19 }, () => 'energy-psychic'),
    ];
    const noShuffle = {
      nextFloat: () => 0.5,
      flipCoin: () => 'HEADS' as const,
      shuffle: <T,>(a: readonly T[]) => [...a],
    };

    let state = createGame({ p1Name: 'Basildo', p2Name: 'Rival', p1Deck, p2Deck, rng: noShuffle });
    state = dispatchAction(state, { type: 'CONFIRM_STARTING_HAND', playerId: 'P1' }, noShuffle).state;
    state = dispatchAction(state, { type: 'CONFIRM_STARTING_HAND', playerId: 'P2' }, noShuffle).state;
    state = dispatchAction(state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P1', handIndex: 0 }, noShuffle).state;
    state = dispatchAction(state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P2', handIndex: 0 }, noShuffle).state;

    // P1 now has 1 card left in deck. Playing Suministros de la Fundación draws it and hits 0 cards -> P1 immediately loses!
    expect(state.players.P1.deck).toHaveLength(1);
    const itemIdx = state.players.P1.hand.indexOf('item-suministros-speedwagon');
    state = dispatchAction(state, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: itemIdx }, noShuffle).state;

    expect(state.players.P1.deck).toHaveLength(0);
    expect(state.phase).toBe('GAME_OVER');
    expect(state.winnerId).toBe('P2');
    expect(state.winReason).toContain('Basildo se ha quedado sin cartas en el mazo');
  });

  it('enforces progressive Active DG unlock (T1: DG 4, T2: DG 5, T3+: DG 6) while allowing high-DG Stand Users on Bench from T1', () => {
    expect(getMaxPlayableCharacterDg(0)).toBe(4);
    expect(getMaxPlayableCharacterDg(1)).toBe(4);
    expect(getMaxPlayableCharacterDg(2)).toBe(5);
    expect(getMaxPlayableCharacterDg(3)).toBe(6);
    expect(getMaxPlayableCharacterDg(4)).toBe(6);
    expect(getMaxPlayableCharacterDg(8)).toBe(6);

    const p1Deck = [
      'char-jonathan-joestar', // dg: null (T1)
      'char-muhammad-avdol',   // dg: 4 (T1 Active allowed)
      'char-jotaro-kujo',      // dg: 5 (T2 Active, T1 Bench allowed)
      'char-dio',              // dg: 6 (T3 Active, T1 Bench allowed)
      'char-iggy',             // dg: 3 (T1)
      ...Array.from({ length: 15 }, () => 'energy-psychic'),
    ];
    const p2Deck = [
      'char-dio-brando',
      ...Array.from({ length: 19 }, () => 'energy-psychic'),
    ];
    const noShuffle = {
      nextFloat: () => 0.5,
      flipCoin: () => 'HEADS' as const,
      shuffle: <T,>(a: readonly T[]) => [...a],
    };

    let state = createGame({ p1Name: 'P1', p2Name: 'P2', p1Deck, p2Deck, rng: noShuffle });
    state = dispatchAction(state, { type: 'CONFIRM_STARTING_HAND', playerId: 'P1' }, noShuffle).state;
    state = dispatchAction(state, { type: 'CONFIRM_STARTING_HAND', playerId: 'P2' }, noShuffle).state;

    // Cannot pick DG 5/6 as starting Active on Turn 1 setup; DG 4 (Avdol) IS allowed
    expect(
      dispatchAction(state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P1', handIndex: 2 }, noShuffle).ok,
    ).toBe(false); // Jotaro (DG 5)
    expect(
      dispatchAction(state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P1', handIndex: 3 }, noShuffle).ok,
    ).toBe(false); // DIO (DG 6)
    expect(
      dispatchAction(state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P1', handIndex: 1 }, noShuffle).ok,
    ).toBe(true); // Avdol (DG 4) allowed on T1!

    // Pick Jonathan (dg: null) & Dio Brando (dg: null) -> enters Turn 1
    state = dispatchAction(state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P1', handIndex: 0 }, noShuffle).state;
    state = dispatchAction(state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P2', handIndex: 0 }, noShuffle).state;
    expect(state.turnNumber).toBe(1);

    // Stand Users of high DG (Jotaro DG 5, DIO DG 6) CAN be placed on Bench from Turn 1!
    const jotaroIdx = state.players.P1.hand.indexOf('char-jotaro-kujo');
    const dioIdx = state.players.P1.hand.indexOf('char-dio');
    expect(dispatchAction(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: jotaroIdx }, noShuffle).ok).toBe(true);
    expect(dispatchAction(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: dioIdx }, noShuffle).ok).toBe(true);
  });

  it('guarantees a valid starting hand automatically on the 3rd mulligan', () => {
    const p1Deck = [
      ...Array.from({ length: 24 }, () => 'energy-colorless'),
      'char-hol-horse',
      'stand-emperor',
    ]; // 26 cards (6 prizes + 20 playable), valid pair buried at the very bottom
    const p2Deck = [
      'char-dio-brando',
      ...Array.from({ length: 25 }, () => 'energy-psychic'),
    ];
    const noShuffle = {
      nextFloat: () => 0.5,
      flipCoin: () => 'HEADS' as const,
      shuffle: <T,>(a: readonly T[]) => [...a],
    };

    let state = createGame({ p1Name: 'P1', p2Name: 'P2', p1Deck, p2Deck, rng: noShuffle });
    expect(hasValidStartingHand(state.players.P1.hand, 3)).toBe(false);

    // Mulligan #1 & #2: still invalid with noShuffle
    state = dispatchAction(state, { type: 'PERFORM_MULLIGAN', playerId: 'P1' }, noShuffle).state;
    expect(state.players.P1.mulliganCount).toBe(1);
    expect(hasValidStartingHand(state.players.P1.hand, 3)).toBe(false);

    state = dispatchAction(state, { type: 'PERFORM_MULLIGAN', playerId: 'P1' }, noShuffle).state;
    expect(state.players.P1.mulliganCount).toBe(2);
    expect(hasValidStartingHand(state.players.P1.hand, 3)).toBe(false);

    // Mulligan #3: pity rule guarantees a valid Turn-1 hand (Hol Horse + Emperor) & preserves all 26 cards!
    state = dispatchAction(state, { type: 'PERFORM_MULLIGAN', playerId: 'P1' }, noShuffle).state;
    expect(state.players.P1.mulliganCount).toBe(3);
    expect(hasValidStartingHand(state.players.P1.hand, 3)).toBe(true);
    expect(state.players.P1.hand).toHaveLength(5);
    expect(
      state.players.P1.hand.length + state.players.P1.deck.length + state.players.P1.prizeCards.length,
    ).toBe(26);
    expect(
      dispatchAction(state, { type: 'CONFIRM_STARTING_HAND', playerId: 'P1' }, noShuffle).ok,
    ).toBe(true);
  });

  it('guarantees campaign AI featured card in its opening hand (even across mulligans)', () => {
    const p1Deck = ['char-jonathan-joestar', ...Array.from({ length: 19 }, () => 'energy-electric')];
    const p2Deck = [
      ...Array.from({ length: 18 }, () => 'energy-light'),
      'char-kars',
      'evo-kars-ultimate',
    ]; // Both Kars & Kars Ultimate buried at the bottom
    const noShuffle = {
      nextFloat: () => 0.5,
      flipCoin: () => 'HEADS' as const,
      shuffle: <T,>(a: readonly T[]) => [...a],
    };

    let state = createGame({
      p1Name: 'P1',
      p2Name: 'Kars Jefe',
      p1Deck,
      p2Deck,
      p2IsAi: true,
      p2GuaranteedOpeningCardId: 'evo-kars-ultimate',
      rng: noShuffle,
    });

    // Featured card is immediately guaranteed in P2's 5-card opening hand
    expect(state.players.P2.hand).toHaveLength(5);
    expect(state.players.P2.hand).toContain('evo-kars-ultimate');
    expect(state.players.P2.prizeCards).toHaveLength(6);
    expect(
      state.players.P2.hand.length + state.players.P2.deck.length + state.players.P2.prizeCards.length,
    ).toBe(20);

    // Even after 3 mulligans, P2 gets a valid starting hand AND keeps evo-kars-ultimate in hand!
    state = dispatchAction(state, { type: 'PERFORM_MULLIGAN', playerId: 'P2' }, noShuffle).state;
    expect(state.players.P2.hand).toContain('evo-kars-ultimate');
    state = dispatchAction(state, { type: 'PERFORM_MULLIGAN', playerId: 'P2' }, noShuffle).state;
    expect(state.players.P2.hand).toContain('evo-kars-ultimate');
    state = dispatchAction(state, { type: 'PERFORM_MULLIGAN', playerId: 'P2' }, noShuffle).state;
    expect(state.players.P2.hand).toContain('evo-kars-ultimate');
    expect(state.players.P2.hand).toContain('char-kars');
    expect(hasValidStartingHand(state.players.P2.hand, 3)).toBe(true);
    expect(state.players.P2.hand).toHaveLength(5);
    expect(
      state.players.P2.hand.length + state.players.P2.deck.length + state.players.P2.prizeCards.length,
    ).toBe(20);
  });

  it('sets aside 6 face-down Prize Cards at game start while guaranteeing a Turn-1 playable starter remains in deck/hand', () => {
    // Only 1 Turn-1 playable character in the entire 46-card deck (placed right at index 0!)
    const singleStarterDeck = [
      'char-jonathan-joestar',
      ...Array.from({ length: 45 }, () => 'energy-electric'),
    ];
    const noShuffle = {
      nextFloat: () => 0.5,
      flipCoin: () => 'HEADS' as const,
      shuffle: <T,>(a: readonly T[]) => [...a],
    };

    const state = createGame({
      p1Name: 'P1',
      p2Name: 'P2',
      p1Deck: singleStarterDeck,
      p2Deck: PRESET_DECKS[0]!.cardIds,
      rng: noShuffle,
    });

    expect(state.players.P1.prizeCards).toHaveLength(6);
    expect(state.players.P1.hand).toHaveLength(5);
    expect(state.players.P1.deck).toHaveLength(35);
    // Jonathan must NOT be trapped in Prize Cards!
    expect(state.players.P1.prizeCards).not.toContain('char-jonathan-joestar');
    expect([...state.players.P1.hand, ...state.players.P1.deck]).toContain('char-jonathan-joestar');

    // Preset 46-card deck splits cleanly into 6 prize + 5 hand + 35 deck
    expect(state.players.P2.prizeCards).toHaveLength(6);
    expect(state.players.P2.hand).toHaveLength(5);
    expect(state.players.P2.deck).toHaveLength(35);
  });

  it('prompts human to pick a Prize Card on enemy KO and wins immediately upon taking the last Prize Card even if opponent has bench characters', () => {
    // 1. Taking 1 of 2 remaining prize cards prompts human P1, adds chosen prize to hand, and continues match
    let state = buildControlledBattleState({
      p1ActiveId: 'char-dio-brando',
      p1ActiveEnergies: ['ELECTRIC', 'ELECTRIC'],
      p1PrizeCards: ['item-comida-de-tonio', 'item-pluck'],
      p2ActiveId: 'char-jonathan-joestar',
      p2BenchIds: ['char-will-a-zeppeli', 'char-robert-e-o-speedwagon'],
      phase: 'COMBAT',
    });
    state.players.P2.active!.currentHp = 50;

    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-space-ripper-stingy-eyes', // 50 dmg -> KO
    });
    expect(state.pendingPrompt?.kind).toBe('CHOOSE_PRIZE_CARD');
    // Pick index 1 (item-pluck) instead of index 0!
    state = mustDispatch(state, {
      type: 'RESPOND_PROMPT',
      playerId: 'P1',
      response: { kind: 'CHOOSE_PRIZE_CARD', prizeIndex: 1 },
    });
    expect(state.phase).not.toBe('GAME_OVER');
    expect(state.players.P1.prizeCards).toEqual(['item-comida-de-tonio']);
    expect(state.players.P1.hand).toContain('item-pluck');

    // 2. Taking the LAST prize card wins immediately even though P2 still has bench characters!
    let winState = buildControlledBattleState({
      p1ActiveId: 'char-dio-brando',
      p1ActiveEnergies: ['ELECTRIC', 'ELECTRIC'],
      p1PrizeCards: ['item-pluck'],
      p2ActiveId: 'char-jonathan-joestar',
      p2BenchIds: ['char-will-a-zeppeli'],
      phase: 'COMBAT',
    });
    winState.players.P2.active!.currentHp = 50;

    winState = mustDispatch(winState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-space-ripper-stingy-eyes',
    });
    expect(winState.pendingPrompt?.kind).toBe('CHOOSE_PRIZE_CARD');
    winState = mustDispatch(winState, {
      type: 'RESPOND_PROMPT',
      playerId: 'P1',
      response: { kind: 'CHOOSE_PRIZE_CARD', prizeIndex: 0 },
    });
    expect(winState.phase).toBe('GAME_OVER');
    expect(winState.winnerId).toBe('P1');
    expect(winState.winReason).toContain('Cartas de Premio');
    expect(winState.players.P1.prizeCards).toHaveLength(0);
    expect(winState.players.P1.hand).toContain('item-pluck');
  });
});
