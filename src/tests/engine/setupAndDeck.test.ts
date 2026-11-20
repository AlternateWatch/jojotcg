import { describe, expect, it } from 'vitest';
import { PRESET_DECKS } from '../../data/cardRegistry';
import { validateDeck } from '../../services/deckValidator';
import { createGame, dispatchAction } from '../../engine/gameEngine';
import {
  getMaxPlayableCharacterDg,
  hasValidStartingHand,
} from '../../engine/helpers/cardStats';
import { createSeededRng } from '../../engine/rng';

describe('Deck Validation & Setup/Mulligan Rules', () => {
  it('validates all 4 preset 40-card decks as completely legal', () => {
    for (const deck of PRESET_DECKS) {
      const result = validateDeck(deck.cardIds);
      expect(result.errors, `Preset ${deck.name} had errors`).toEqual([]);
      expect(result.valid).toBe(true);
      expect(result.stats.totalCards).toBe(40);
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

  it('enforces progressive character DG unlock by turn (T1: DG 3, T2: DG 4, T3: DG 5, T4+: DG 6)', () => {
    expect(getMaxPlayableCharacterDg(0)).toBe(3);
    expect(getMaxPlayableCharacterDg(1)).toBe(3);
    expect(getMaxPlayableCharacterDg(2)).toBe(4);
    expect(getMaxPlayableCharacterDg(3)).toBe(5);
    expect(getMaxPlayableCharacterDg(4)).toBe(6);
    expect(getMaxPlayableCharacterDg(8)).toBe(6);

    const p1Deck = [
      'char-jonathan-joestar', // dg: null (T1)
      'char-muhammad-avdol',   // dg: 4 (T2)
      'char-jotaro-kujo',      // dg: 5 (T3)
      'char-dio',              // dg: 6 (T4)
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

    // Cannot pick DG 4/5/6 as starting Active on Turn 1 setup
    expect(
      dispatchAction(state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P1', handIndex: 1 }, noShuffle).ok,
    ).toBe(false); // Avdol (DG 4)
    expect(
      dispatchAction(state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P1', handIndex: 3 }, noShuffle).ok,
    ).toBe(false); // DIO (DG 6)

    // Pick Jonathan (dg: null) & Dio Brando (dg: null) -> enters Turn 1
    state = dispatchAction(state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P1', handIndex: 0 }, noShuffle).state;
    state = dispatchAction(state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P2', handIndex: 0 }, noShuffle).state;
    expect(state.turnNumber).toBe(1);

    const avdolIdx = state.players.P1.hand.indexOf('char-muhammad-avdol');
    const jotaroIdx = state.players.P1.hand.indexOf('char-jotaro-kujo');
    const dioIdx = state.players.P1.hand.indexOf('char-dio');
    const iggyIdx = state.players.P1.hand.indexOf('char-iggy');

    // Turn 1: DG 4, 5, 6 blocked; DG 3 allowed
    expect(dispatchAction(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: avdolIdx }, noShuffle).ok).toBe(false);
    expect(dispatchAction(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: jotaroIdx }, noShuffle).ok).toBe(false);
    expect(dispatchAction(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: dioIdx }, noShuffle).ok).toBe(false);
    expect(dispatchAction(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: iggyIdx }, noShuffle).ok).toBe(true);

    // Advance to Turn 2 (P1 ends T1 -> P2 ends T1 -> Turn 2 P1)
    state = dispatchAction(state, { type: 'END_TURN', playerId: 'P1' }, noShuffle).state;
    state = dispatchAction(state, { type: 'END_TURN', playerId: 'P2' }, noShuffle).state;
    expect(state.turnNumber).toBe(2);

    // Turn 2: DG 4 unlocked, DG 5 & 6 still blocked
    expect(dispatchAction(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: state.players.P1.hand.indexOf('char-muhammad-avdol') }, noShuffle).ok).toBe(true);
    expect(dispatchAction(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: state.players.P1.hand.indexOf('char-jotaro-kujo') }, noShuffle).ok).toBe(false);
    expect(dispatchAction(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: state.players.P1.hand.indexOf('char-dio') }, noShuffle).ok).toBe(false);

    // Advance to Turn 3
    state = dispatchAction(state, { type: 'END_TURN', playerId: 'P1' }, noShuffle).state;
    state = dispatchAction(state, { type: 'END_TURN', playerId: 'P2' }, noShuffle).state;
    expect(state.turnNumber).toBe(3);

    // Turn 3: DG 5 unlocked, DG 6 still blocked
    expect(dispatchAction(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: state.players.P1.hand.indexOf('char-jotaro-kujo') }, noShuffle).ok).toBe(true);
    expect(dispatchAction(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: state.players.P1.hand.indexOf('char-dio') }, noShuffle).ok).toBe(false);

    // Advance to Turn 4
    state = dispatchAction(state, { type: 'END_TURN', playerId: 'P1' }, noShuffle).state;
    state = dispatchAction(state, { type: 'END_TURN', playerId: 'P2' }, noShuffle).state;
    expect(state.turnNumber).toBe(4);

    // Turn 4: DG 6 unlocked!
    expect(dispatchAction(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: state.players.P1.hand.indexOf('char-dio') }, noShuffle).ok).toBe(true);
  });

  it('guarantees a valid starting hand automatically on the 3rd mulligan', () => {
    const p1Deck = [
      ...Array.from({ length: 18 }, () => 'energy-colorless'),
      'char-hol-horse',
      'stand-emperor',
    ]; // 20 cards, valid pair buried at the very bottom
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
    expect(hasValidStartingHand(state.players.P1.hand, 3)).toBe(false);

    // Mulligan #1 & #2: still invalid with noShuffle
    state = dispatchAction(state, { type: 'PERFORM_MULLIGAN', playerId: 'P1' }, noShuffle).state;
    expect(state.players.P1.mulliganCount).toBe(1);
    expect(hasValidStartingHand(state.players.P1.hand, 3)).toBe(false);

    state = dispatchAction(state, { type: 'PERFORM_MULLIGAN', playerId: 'P1' }, noShuffle).state;
    expect(state.players.P1.mulliganCount).toBe(2);
    expect(hasValidStartingHand(state.players.P1.hand, 3)).toBe(false);

    // Mulligan #3: pity rule guarantees a valid Turn-1 hand (Hol Horse + Emperor) & preserves all 20 cards!
    state = dispatchAction(state, { type: 'PERFORM_MULLIGAN', playerId: 'P1' }, noShuffle).state;
    expect(state.players.P1.mulliganCount).toBe(3);
    expect(hasValidStartingHand(state.players.P1.hand, 3)).toBe(true);
    expect(state.players.P1.hand).toHaveLength(5);
    expect(state.players.P1.hand.length + state.players.P1.deck.length).toBe(20);
    expect(
      dispatchAction(state, { type: 'CONFIRM_STARTING_HAND', playerId: 'P1' }, noShuffle).ok,
    ).toBe(true);
  });
});
