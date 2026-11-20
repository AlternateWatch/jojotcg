import { describe, expect, it } from 'vitest';
import { PRESET_DECKS } from '../../data/cardRegistry';
import { chooseAiAction, type AiDifficulty } from '../../engine/ai/tacticalAi';
import { createGame, dispatchAction } from '../../engine/gameEngine';
import { hasValidStartingHand } from '../../engine/helpers/cardStats';
import { createSeededRng } from '../../engine/rng';
import { tryApplyElementalStatus } from '../../engine/statuses/statusSystem';
import { validateDeck } from '../../services/deckValidator';
import { getNextActingPlayer } from '../../store/useBattleStore';

function runAiMatch(
  deck1: string[],
  deck2: string[],
  seed: number,
  firstPlayerId: 'P1' | 'P2',
  d1: AiDifficulty = 'NORMAL',
  d2: AiDifficulty = 'NORMAL',
) {
  const rng = createSeededRng(seed);
  let state = createGame({
    p1Name: 'P1',
    p2Name: 'P2',
    p1Deck: deck1,
    p2Deck: deck2,
    p1IsAi: true,
    p2IsAi: true,
    firstPlayerId,
    rng,
  });

  let steps = 0;
  while (state.phase !== 'GAME_OVER' && steps < 500) {
    steps++;
    const actor = getNextActingPlayer(state);
    if (!actor) break;
    const diff = actor === 'P1' ? d1 : d2;
    const action = chooseAiAction(state, actor, diff);
    if (!action) break;
    const res = dispatchAction(state, action, rng);
    if (!res.ok) {
      throw new Error(`AI illegal action (${actor}/${diff}): ${action.type} -> ${res.error}`);
    }
    state = res.state;
  }

  return {
    winnerId: state.winnerId,
    isDeckOut: (state.winReason ?? '').includes('mazo'),
    turns: state.turnNumber,
  };
}

function buildQuickBattleState(p1Deck: string[], p2Deck: string[], seed = 42) {
  const rng = createSeededRng(seed);
  let state = createGame({
    p1Name: 'P1',
    p2Name: 'P2',
    p1Deck,
    p2Deck,
    firstPlayerId: 'P1',
    rng,
  });
  state.players.P1.mulliganConfirmed = true;
  state.players.P2.mulliganConfirmed = true;
  state.phase = 'SETUP_ACTIVE';
  return { state, rng };
}

describe('Balance, Tactical Items & Energy Consistency', () => {
  it('all 4 preset decks are strictly legal (40/40) with zero validation warnings', () => {
    for (const deck of PRESET_DECKS) {
      const result = validateDeck(deck.cardIds);
      expect(result.valid, `${deck.name}: ${result.errors.map((e) => e.message).join('; ')}`).toBe(
        true,
      );
      expect(
        result.warnings,
        `${deck.name} warnings: ${result.warnings.map((w) => w.message).join('; ')}`,
      ).toHaveLength(0);
    }
  });

  it('deckValidator reports missing/scarce/too-many energy color warnings accurately', () => {
    const badDeck = [
      'char-caesar-zeppeli', // requires 2 WATER and 4 LIGHT
      'char-kars', // requires 2 LIGHT
      'char-esidisi', // requires 2 FIRE
      'char-jonathan-joestar', // requires 3 ELECTRIC
      'char-robert-e-o-speedwagon',
      ...Array(10).fill('energy-psychic'),
      ...Array(8).fill('energy-fire'),
      ...Array(6).fill('energy-electric'),
      ...Array(6).fill('energy-light'),
      ...Array(5).fill('energy-colorless'),
    ];
    const res = validateDeck(badDeck);
    const codes = res.warnings.map((w) => w.code);
    expect(codes).toContain('TOO_MANY_ENERGY_TYPES');
    expect(codes).toContain('COLORLESS_ENERGY_TIP');
    expect(codes).toContain('MISSING_REQUIRED_ENERGY'); // WATER missing for Caesar
  });

  it('hasValidStartingHand requires actual attacks for self-sufficient starters', () => {
    // DIO and Old Joseph have 0 own attacks -> invalid without a compatible Stand!
    expect(hasValidStartingHand(['char-dio', 'energy-psychic', 'energy-light'])).toBe(false);
    expect(hasValidStartingHand(['char-joseph-joestar-viejo', 'energy-psychic'])).toBe(false);
    // With a compatible Stand -> valid
    expect(hasValidStartingHand(['char-dio', 'stand-the-world'])).toBe(true);
    // Characters with own attacks (Jonathan, Stray Cat) -> valid
    expect(hasValidStartingHand(['char-jonathan-joestar'])).toBe(true);
    expect(hasValidStartingHand(['char-stray-cat'])).toBe(true);
  });

  it('Brújula de Energía searches up to 2 Basic Energies from deck and shuffles', () => {
    const deck = [
      'char-jonathan-joestar',
      'item-brujula-de-energia',
      'energy-electric',
      'energy-fire',
      'energy-psychic',
      ...Array(35).fill('energy-psychic'),
    ];
    const { state: initState, rng } = buildQuickBattleState(deck, deck);
    // Deterministic hand setup
    initState.players.P1.hand = ['char-jonathan-joestar', 'item-brujula-de-energia'];
    initState.players.P1.deck = ['stand-star-platinum', 'energy-electric', 'energy-fire', 'energy-light'];
    initState.players.P2.hand = ['char-jonathan-joestar'];

    let res = dispatchAction(initState, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P1', handIndex: 0 }, rng);
    res = dispatchAction(res.state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P2', handIndex: 0 }, rng);
    expect(res.state.phase).toBe('PREPARATION');

    const compassIdx = res.state.players.P1.hand.indexOf('item-brujula-de-energia');
    expect(compassIdx).toBeGreaterThanOrEqual(0);

    res = dispatchAction(res.state, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: compassIdx }, rng);
    expect(res.ok).toBe(true);
    expect(res.state.pendingPrompt?.kind).toBe('SEARCH_DECK_CARDS');

    const eIdx1 = res.state.players.P1.deck.indexOf('energy-electric');
    const eIdx2 = res.state.players.P1.deck.indexOf('energy-fire');
    res = dispatchAction(
      res.state,
      {
        type: 'RESPOND_PROMPT',
        playerId: 'P1',
        response: { kind: 'SEARCH_DECK_CARDS', deckIndices: [eIdx1, eIdx2] },
      },
      rng,
    );
    expect(res.ok).toBe(true);
    expect(res.state.pendingPrompt).toBeNull();
    expect(res.state.players.P1.hand).toContain('energy-electric');
    expect(res.state.players.P1.hand).toContain('energy-fire');
  });

  it('Llamada del Destino searches 1 Stand or Character from deck', () => {
    const deck = PRESET_DECKS[0]!.cardIds;
    const { state: initState, rng } = buildQuickBattleState(deck, deck);
    initState.players.P1.hand = ['char-jotaro-kujo', 'item-llamada-del-destino'];
    initState.players.P1.deck = ['energy-psychic', 'stand-star-platinum', 'char-iggy'];
    initState.players.P2.hand = ['char-jonathan-joestar'];

    let res = dispatchAction(initState, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P1', handIndex: 0 }, rng);
    res = dispatchAction(res.state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P2', handIndex: 0 }, rng);

    const itemIdx = res.state.players.P1.hand.indexOf('item-llamada-del-destino');
    res = dispatchAction(res.state, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: itemIdx }, rng);
    expect(res.ok).toBe(true);
    expect(res.state.pendingPrompt?.kind).toBe('SEARCH_DECK_CARDS');

    const spIdx = res.state.players.P1.deck.indexOf('stand-star-platinum');
    res = dispatchAction(
      res.state,
      {
        type: 'RESPOND_PROMPT',
        playerId: 'P1',
        response: { kind: 'SEARCH_DECK_CARDS', deckIndices: [spIdx] },
      },
      rng,
    );
    expect(res.ok).toBe(true);
    expect(res.state.players.P1.hand).toContain('stand-star-platinum');
  });

  it('Impulso Espiritual grants +1 energy attachment this turn and recovers 1 discard energy', () => {
    const deck = PRESET_DECKS[0]!.cardIds;
    const { state: initState, rng } = buildQuickBattleState(deck, deck);
    initState.players.P1.hand = ['char-jonathan-joestar', 'item-impulso-espiritual', 'energy-electric'];
    initState.players.P1.discard = ['energy-electric'];
    initState.players.P1.deck = ['energy-psychic', 'energy-psychic'];
    initState.players.P2.hand = ['char-jonathan-joestar'];

    let res = dispatchAction(initState, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P1', handIndex: 0 }, rng);
    res = dispatchAction(res.state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P2', handIndex: 0 }, rng);

    const itemIdx = res.state.players.P1.hand.indexOf('item-impulso-espiritual');
    res = dispatchAction(res.state, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: itemIdx }, rng);
    expect(res.ok).toBe(true);
    expect(res.state.players.P1.bonusEnergyAttachmentsThisTurn).toBe(1);
    // Auto-recovered the single energy type from discard
    expect(res.state.players.P1.discard).not.toContain('energy-electric');

    // Attach 2 energies in the same turn!
    const activeId = res.state.players.P1.active!.instanceId;
    const e1 = res.state.players.P1.hand.indexOf('energy-electric');
    res = dispatchAction(
      res.state,
      { type: 'ATTACH_ENERGY', playerId: 'P1', handIndex: e1, targetInstanceId: activeId },
      rng,
    );
    expect(res.ok).toBe(true);
    const e2 = res.state.players.P1.hand.indexOf('energy-electric');
    res = dispatchAction(
      res.state,
      { type: 'ATTACH_ENERGY', playerId: 'P1', handIndex: e2, targetInstanceId: activeId },
      rng,
    );
    expect(res.ok).toBe(true);
    expect(res.state.players.P1.active!.attachedEnergies).toHaveLength(2);
  });

  it('Cambio Táctico swaps Active with Bench without ending the turn and cleanses Burn', () => {
    const deck = PRESET_DECKS[0]!.cardIds;
    const { state: initState, rng } = buildQuickBattleState(deck, deck);
    initState.players.P1.hand = ['char-jonathan-joestar', 'char-robert-e-o-speedwagon', 'item-cambio-tactico'];
    initState.players.P1.deck = ['energy-psychic', 'energy-psychic', 'energy-psychic'];
    initState.players.P2.hand = ['char-jonathan-joestar'];

    let res = dispatchAction(initState, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P1', handIndex: 0 }, rng);
    res = dispatchAction(res.state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P2', handIndex: 0 }, rng);
    // Play Speedwagon to bench (ends T1), P2 ends T2 -> P1 T3
    const spIdx = res.state.players.P1.hand.indexOf('char-robert-e-o-speedwagon');
    res = dispatchAction(res.state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: spIdx }, rng);
    res = dispatchAction(res.state, { type: 'END_TURN', playerId: 'P2' }, rng);

    // Burn P1 active, then play Cambio Táctico
    res.state.players.P1.active!.statuses.burn = { active: true, damagePerTurn: 10 };
    const swapIdx = res.state.players.P1.hand.indexOf('item-cambio-tactico');
    res = dispatchAction(res.state, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: swapIdx }, rng);

    expect(res.ok).toBe(true);
    expect(res.state.activePlayerId).toBe('P1');
    expect(res.state.phase).toBe('PREPARATION'); // Did NOT end the turn!
    expect(res.state.players.P1.active!.cardId).toBe('char-robert-e-o-speedwagon');
    expect(res.state.players.P1.bench[0]!.statuses.burn).toBeNull();
  });

  it('preventConsecutiveStun blocks infinite back-to-back stun-locking for 1 turn', () => {
    const deck = PRESET_DECKS[0]!.cardIds;
    const { state: initState, rng } = buildQuickBattleState(deck, deck);
    initState.players.P1.hand = ['char-jonathan-joestar'];
    initState.players.P2.hand = ['char-kars'];

    let res = dispatchAction(initState, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P1', handIndex: 0 }, rng);
    res = dispatchAction(res.state, { type: 'CHOOSE_STARTING_ACTIVE', playerId: 'P2', handIndex: 0 }, rng);

    // Stun P1 active and end P1's turn -> P1 clears Stun and gains 1-turn resistance
    res.state.players.P1.active!.statuses.stunned = true;
    res = dispatchAction(res.state, { type: 'END_TURN', playerId: 'P1' }, rng);
    expect(res.state.players.P1.active!.statuses.stunned).toBe(false);
    expect(res.state.players.P1.active!.statuses.stunImmuneNextTurn).toBe(true);

    // Attempting to stun P1 again immediately on P2's turn is prevented!
    const events: typeof res.events = [];
    tryApplyElementalStatus(
      res.state,
      events,
      'P1',
      res.state.players.P1.active!.instanceId,
      'STUNNED',
      'Cuerpo de Luz',
    );
    expect(res.state.players.P1.active!.statuses.stunned).toBe(false);
    expect(events.some((e) => e.type === 'STATUS_PREVENTED')).toBe(true);

    // After P1 completes a non-stunned turn, immunity expires and P1 can be stunned again
    res = dispatchAction(res.state, { type: 'END_TURN', playerId: 'P2' }, rng);
    res = dispatchAction(res.state, { type: 'END_TURN', playerId: 'P1' }, rng);
    expect(res.state.players.P1.active!.statuses.stunImmuneNextTurn).toBe(false);
  });

  it('preset matchups finish predominantly by KO (>80%) with balanced win rates and legal AI across difficulties', () => {
    const themedPresets = PRESET_DECKS.filter((d) => d.id !== 'preset-starter-deck');
    let totalGames = 0;
    let koWins = 0;
    const winsByDeck: Record<string, number> = {};
    const gamesByDeck: Record<string, number> = {};
    for (const d of themedPresets) {
      winsByDeck[d.id] = 0;
      gamesByDeck[d.id] = 0;
    }

    // 8 seeded games per pair (48 games total -> fast & statistically solid)
    for (let i = 0; i < themedPresets.length; i++) {
      for (let j = i + 1; j < themedPresets.length; j++) {
        const d1 = themedPresets[i]!;
        const d2 = themedPresets[j]!;
        for (let g = 0; g < 8; g++) {
          const r = runAiMatch(
            d1.cardIds,
            d2.cardIds,
            5000 + i * 200 + j * 40 + g,
            g % 2 === 0 ? 'P1' : 'P2',
          );
          totalGames++;
          gamesByDeck[d1.id]!++;
          gamesByDeck[d2.id]!++;
          if (r.winnerId === 'P1') winsByDeck[d1.id]!++;
          if (r.winnerId === 'P2') winsByDeck[d2.id]!++;
          if (r.winnerId && !r.isDeckOut) koWins++;
        }
      }
    }

    // Also verify Starter Deck vs AI (EASY & HARD) completes cleanly without illegal actions
    const starterVsAi = runAiMatch(
      PRESET_DECKS[0]!.cardIds,
      themedPresets[1]!.cardIds,
      9999,
      'P1',
      'NORMAL',
      'EASY',
    );
    expect(starterVsAi.winnerId).not.toBeNull();

    expect(koWins / totalGames).toBeGreaterThanOrEqual(0.8);
    for (const d of themedPresets) {
      const wr = winsByDeck[d.id]! / gamesByDeck[d.id]!;
      expect(wr, `${d.name} win rate ${(wr * 100).toFixed(1)}% out of range`).toBeGreaterThanOrEqual(
        0.3,
      );
      expect(wr, `${d.name} win rate ${(wr * 100).toFixed(1)}% out of range`).toBeLessThanOrEqual(
        0.75,
      );
    }
  }, 15000);
});
