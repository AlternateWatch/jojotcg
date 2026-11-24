import { getCardById } from '../data/cardRegistry';
import { DEFAULT_RULES_CONFIG, type GameRulesConfig } from '../data/rulesConfig';
import { getAvailableAttacks } from './helpers/cardStats';
import {
  cloneState,
  createCharacterInstance,
  getOpponentId,
  pushEvent,
  setGameOver,
} from './helpers/stateHelpers';
import { createSystemRng, type RngProvider } from './rng';
import {
  executeAttack,
  finishTurnToEndPhase,
  resolvePendingPrompt,
  validatePromptResponse,
} from './combat/combatResolver';
import {
  applyChooseStartingActive,
  applyConfirmStartingHand,
  applyPerformMulligan,
  validateChooseStartingActive,
  validateMulliganAction,
} from './rules/setupRules';
import {
  applyAttachEnergy,
  applyEquipStand,
  applyEvolveCard,
  applyPlayItem,
  applyPlayToBench,
  applySummonStandFromDeck,
  applySwapOrRetreat,
  applyUsePrepAbility,
  validateAttachEnergy,
  validateEnterCombatPhase,
  validateEquipStand,
  validateEvolveCard,
  validatePlayItem,
  validatePlayToBench,
  validateSummonStandFromDeck,
  validateSwapOrRetreat,
  validateUseAttack,
  validateUsePrepAbility,
} from './rules/turnRules';
import type { ActionResult, GameAction, ValidationResult } from './types/actions';
import type { CombatEvent } from './types/events';
import type { GameState, PlayerId, PlayerState } from './types/state';

export interface CreateGameOptions {
  p1Name: string;
  p2Name: string;
  p1Deck: readonly string[];
  p2Deck: readonly string[];
  p1IsAi?: boolean;
  p2IsAi?: boolean;
  p1GuaranteedOpeningCardId?: string;
  p2GuaranteedOpeningCardId?: string;
  firstPlayerId?: PlayerId;
  rules?: Partial<GameRulesConfig>;
  rng?: RngProvider;
}

/**
 * Sets aside `prizeCount` random face-down Prize Cards from an already-shuffled deck,
 * guaranteeing that:
 * 1) Any campaign `guaranteedOpeningCardId` stays in the playable deck (never prized).
 * 2) At least one Turn-1 playable starter (self-sufficient character with DG <= 3 / null,
 *    or compatible Stand User DG <= 3 + Stand pair; falling back to any starter) remains
 *    in the playable deck so the player can always play on Turn 1.
 */
function extractPrizeCardsSafely(
  shuffledDeck: string[],
  prizeCount: number,
  initialHandSize: number,
  guaranteedCardId?: string,
): { prizeCards: string[]; remainingDeck: string[] } {
  if (prizeCount <= 0 || shuffledDeck.length < initialHandSize + prizeCount + 1) {
    return { prizeCards: [], remainingDeck: [...shuffledDeck] };
  }

  const protectedIndices = new Set<number>();

  // 1. Protect campaign featured card if present
  if (guaranteedCardId) {
    const gIdx = shuffledDeck.indexOf(guaranteedCardId);
    if (gIdx !== -1) protectedIndices.add(gIdx);
  }

  // 2. Protect at least one Turn-1 playable starter in the deck
  const protectStarter = (dgCap: number | null): boolean => {
    const selfSufficientIdx = shuffledDeck.findIndex((id) => {
      const c = getCardById(id);
      return (
        c?.type === 'CHARACTER' &&
        c.attacks.length > 0 &&
        (dgCap === null || c.dg === null || c.dg <= dgCap)
      );
    });
    if (selfSufficientIdx !== -1) {
      protectedIndices.add(selfSufficientIdx);
      return true;
    }

    for (let uIdx = 0; uIdx < shuffledDeck.length; uIdx++) {
      const user = getCardById(shuffledDeck[uIdx]!);
      if (
        !user ||
        user.type !== 'CHARACTER' ||
        !user.categories.includes('STAND_USER') ||
        user.dg === null ||
        (dgCap !== null && user.dg > dgCap)
      ) {
        continue;
      }
      for (let sIdx = 0; sIdx < shuffledDeck.length; sIdx++) {
        if (sIdx === uIdx) continue;
        const stand = getCardById(shuffledDeck[sIdx]!);
        if (
          stand?.type === 'STAND' &&
          user.dg >= stand.requiredDg &&
          (!stand.compatibleCharacterIds || stand.compatibleCharacterIds.includes(user.id))
        ) {
          protectedIndices.add(uIdx);
          protectedIndices.add(sIdx);
          return true;
        }
      }
    }
    return false;
  };

  if (!protectStarter(4)) {
    protectStarter(null);
  }

  const actualPrizeCount = Math.min(
    prizeCount,
    Math.max(0, shuffledDeck.length - Math.max(initialHandSize, protectedIndices.size)),
  );

  // Smart Prize distribution: avoid placing STAND cards into the 6 face-down Prizes
  // whenever other non-protected cards are available, so Stand combos aren't orphaned.
  const prizeIndices = new Set<number>();
  for (let i = shuffledDeck.length - 1; i >= 0 && prizeIndices.size < actualPrizeCount; i--) {
    if (!protectedIndices.has(i) && getCardById(shuffledDeck[i]!)?.type !== 'STAND') {
      prizeIndices.add(i);
    }
  }
  for (let i = shuffledDeck.length - 1; i >= 0 && prizeIndices.size < actualPrizeCount; i--) {
    if (!protectedIndices.has(i) && !prizeIndices.has(i)) {
      prizeIndices.add(i);
    }
  }

  const prizeCards: string[] = [];
  const remainingDeck: string[] = [];
  for (let i = 0; i < shuffledDeck.length; i++) {
    if (prizeIndices.has(i)) {
      prizeCards.push(shuffledDeck[i]!);
    } else {
      remainingDeck.push(shuffledDeck[i]!);
    }
  }

  return { prizeCards, remainingDeck };
}

function drawOpeningHandWithGuarantee(
  shuffledDeck: string[],
  initialHandSize: number,
  guaranteedCardId?: string,
): { hand: string[]; deck: string[] } {
  const deck = [...shuffledDeck];
  const drawCount = Math.min(initialHandSize, deck.length);
  const hand: string[] = [];

  if (guaranteedCardId && drawCount > 0) {
    const gIdx = deck.indexOf(guaranteedCardId);
    if (gIdx !== -1) {
      hand.push(deck.splice(gIdx, 1)[0]!);
    }
  }

  const remainingToDraw = Math.max(0, drawCount - hand.length);
  hand.push(...deck.splice(0, remainingToDraw));
  return { hand, deck };
}

function createPlayerState(
  id: PlayerId,
  name: string,
  deckIds: readonly string[],
  isAi: boolean,
  initialHandSize: number,
  prizeCardCount: number,
  rng: RngProvider,
  guaranteedOpeningCardId?: string,
): PlayerState {
  const shuffled = rng.shuffle(deckIds);
  const { prizeCards, remainingDeck } = extractPrizeCardsSafely(
    shuffled,
    prizeCardCount,
    initialHandSize,
    guaranteedOpeningCardId,
  );
  const { hand, deck } = drawOpeningHandWithGuarantee(
    remainingDeck,
    initialHandSize,
    guaranteedOpeningCardId,
  );
  return {
    id,
    name,
    isAi,
    deck,
    hand,
    discard: [],
    prizeCards,
    active: null,
    bench: [],
    mulliganConfirmed: false,
    mulliganCount: 0,
    setupActiveChosen: false,
    energyAttachedThisTurn: 0,
    bonusEnergyAttachmentsThisTurn: 0,
    evolutionsPlayedThisTurn: 0,
    itemsPlayedThisTurn: 0,
    extraCombatActionsRemaining: 0,
    usedOncePerTurnKeys: [],
    pendingNextAttackBonus: 0,
    permanentWaterAttackBonus: 0,
    handRevealedToOpponent: false,
    guaranteedOpeningCardId,
  };
}

export function createGame(options: CreateGameOptions): GameState {
  const rng = options.rng ?? createSystemRng();
  const rules: GameRulesConfig = { ...DEFAULT_RULES_CONFIG, ...options.rules };
  const firstPlayerId = options.firstPlayerId ?? 'P1';

  const p1 = createPlayerState(
    'P1',
    options.p1Name,
    options.p1Deck,
    options.p1IsAi ?? false,
    rules.initialHandSize + (rules.p1ExtraInitialHand ?? 0),
    rules.prizeCardCount,
    rng,
    options.p1GuaranteedOpeningCardId,
  );
  const p2 = createPlayerState(
    'P2',
    options.p2Name,
    options.p2Deck,
    options.p2IsAi ?? false,
    rules.initialHandSize,
    rules.prizeCardCount,
    rng,
    options.p2GuaranteedOpeningCardId,
  );

  const state: GameState = {
    rules,
    phase: 'SETUP_MULLIGAN',
    turnNumber: 0,
    activePlayerId: firstPlayerId,
    firstPlayerId,
    winnerId: null,
    winReason: null,
    players: { P1: p1, P2: p2 },
    pendingPrompt: null,
    queuedPrompts: [],
    promptContinuation: 'NONE',
    nextEntitySeq: 0,
    eventLog: [],
  };

  const initialEvents: CombatEvent[] = [];
  pushEvent(state, initialEvents, {
    type: 'PHASE_CHANGED',
    playerId: firstPlayerId,
    phase: 'SETUP_MULLIGAN',
    message: '¡Comienza el duelo! Revisad vuestras manos iniciales (Mulligan si no cumple requisitos).',
  });

  return state;
}

export function validateAction(state: GameState, action: GameAction): ValidationResult {
  if (state.phase === 'GAME_OVER') {
    return { ok: false, reason: 'La partida ya ha finalizado.' };
  }

  if (action.type === 'CONCEDE') {
    return { ok: true };
  }

  // While a pendingPrompt is active, ONLY RESPOND_PROMPT is permitted!
  if (state.pendingPrompt) {
    if (action.type !== 'RESPOND_PROMPT') {
      return {
        ok: false,
        reason: `Debes resolver primero la decisión pendiente (${state.pendingPrompt.kind}).`,
      };
    }
    return validatePromptResponse(state, action.playerId, action.response);
  }

  if (action.type === 'RESPOND_PROMPT') {
    return { ok: false, reason: 'No hay ninguna decisión pendiente que responder.' };
  }

  switch (action.type) {
    case 'PERFORM_MULLIGAN':
    case 'CONFIRM_STARTING_HAND':
      return validateMulliganAction(state, action.playerId, action.type);

    case 'CHOOSE_STARTING_ACTIVE':
      return validateChooseStartingActive(
        state,
        action.playerId,
        action.handIndex,
        action.benchHandIndices,
      );

    case 'EQUIP_STAND':
      return validateEquipStand(state, action.playerId, action.handIndex, action.targetInstanceId);

    case 'SUMMON_STAND_FROM_DECK':
      return validateSummonStandFromDeck(
        state,
        action.playerId,
        action.targetInstanceId,
        action.standCardId,
      );

    case 'ATTACH_ENERGY':
      return validateAttachEnergy(state, action.playerId, action.handIndex, action.targetInstanceId);

    case 'PLAY_ITEM':
      return validatePlayItem(state, action.playerId, action.handIndex, action.targetInstanceId);

    case 'EVOLVE_CARD':
      return validateEvolveCard(state, action.playerId, action.handIndex);

    case 'USE_PREP_ABILITY':
      return validateUsePrepAbility(state, action.playerId, action.sourceInstanceId);

    case 'PLAY_TO_BENCH':
      return validatePlayToBench(state, action.playerId, action.handIndex);

    case 'SWAP_ACTIVE_WITH_BENCH':
    case 'RETREAT_ACTIVE':
      return validateSwapOrRetreat(state, action.playerId, action.benchInstanceId);

    case 'ENTER_COMBAT_PHASE':
      return validateEnterCombatPhase(state, action.playerId);

    case 'USE_ATTACK':
      return validateUseAttack(state, action.playerId, action.attackId);

    case 'END_TURN':
      if (state.activePlayerId !== action.playerId) {
        return { ok: false, reason: 'No es tu turno.' };
      }
      if (state.phase !== 'PREPARATION' && state.phase !== 'COMBAT') {
        return { ok: false, reason: 'No puedes finalizar el turno en esta fase.' };
      }
      return { ok: true };
  }
}

export function dispatchAction(
  currentState: GameState,
  action: GameAction,
  rng: RngProvider = createSystemRng(),
): ActionResult {
  const validation = validateAction(currentState, action);
  if (!validation.ok) {
    return {
      ok: false,
      state: currentState,
      events: [],
      error: validation.reason ?? 'Acción inválida.',
    };
  }

  const state = cloneState(currentState);
  const events: CombatEvent[] = [];

  switch (action.type) {
    case 'CONCEDE':
      setGameOver(
        state,
        events,
        getOpponentId(action.playerId),
        `${state.players[action.playerId].name} se ha rendido.`,
      );
      break;

    case 'PERFORM_MULLIGAN':
      applyPerformMulligan(state, events, action.playerId, rng);
      break;

    case 'CONFIRM_STARTING_HAND':
      applyConfirmStartingHand(state, events, action.playerId);
      break;

    case 'CHOOSE_STARTING_ACTIVE':
      applyChooseStartingActive(
        state,
        events,
        action.playerId,
        action.handIndex,
        action.benchHandIndices,
      );
      break;

    case 'EQUIP_STAND':
      applyEquipStand(state, events, action.playerId, action.handIndex, action.targetInstanceId);
      break;

    case 'SUMMON_STAND_FROM_DECK':
      applySummonStandFromDeck(
        state,
        events,
        action.playerId,
        action.targetInstanceId,
        rng,
      );
      break;

    case 'ATTACH_ENERGY':
      applyAttachEnergy(state, events, action.playerId, action.handIndex, action.targetInstanceId);
      break;

    case 'PLAY_ITEM':
      applyPlayItem(state, events, action.playerId, action.handIndex, action.targetInstanceId, rng);
      break;

    case 'EVOLVE_CARD':
      applyEvolveCard(state, events, action.playerId, action.handIndex);
      break;

    case 'USE_PREP_ABILITY':
      applyUsePrepAbility(state, events, action.playerId, action.sourceInstanceId);
      break;

    case 'PLAY_TO_BENCH':
      applyPlayToBench(state, events, action.playerId, action.handIndex, rng);
      break;

    case 'SWAP_ACTIVE_WITH_BENCH':
    case 'RETREAT_ACTIVE':
      applySwapOrRetreat(state, events, action.playerId, action.benchInstanceId, rng);
      break;

    case 'ENTER_COMBAT_PHASE':
      state.phase = 'COMBAT';
      pushEvent(state, events, {
        type: 'PHASE_CHANGED',
        playerId: action.playerId,
        phase: 'COMBAT',
        message: `Fase de Combate de ${state.players[action.playerId].name}.`,
      });
      break;

    case 'USE_ATTACK':
      executeAttack(state, events, action.playerId, action.attackId, rng);
      break;

    case 'END_TURN':
      finishTurnToEndPhase(state, events, rng);
      break;

    case 'RESPOND_PROMPT':
      resolvePendingPrompt(state, events, action.playerId, action.response, rng);
      break;
  }

  return { ok: true, state, events };
}

/**
 * Revives a character card from a player's discard pile onto their bench.
 * Per confirmed rules (C6 & D12-C): returns WITHOUT any previous Stand attached
 * and with fresh life-scoped flags (e.g. Wamuu's Wind Sense resets!).
 */
export function reviveCharacterFromDiscard(
  currentState: GameState,
  playerId: PlayerId,
  discardIndex: number,
): ActionResult {
  const player = currentState.players[playerId];
  const cardId = player.discard[discardIndex];
  if (!cardId) {
    return { ok: false, state: currentState, events: [], error: 'Carta no encontrada en descartes.' };
  }
  if (player.bench.length >= currentState.rules.maxBenchSize) {
    return { ok: false, state: currentState, events: [], error: 'La banca está llena.' };
  }

  const state = cloneState(currentState);
  const events: CombatEvent[] = [];
  const nextPlayer = state.players[playerId];
  const removedId = nextPlayer.discard.splice(discardIndex, 1)[0]!;
  const freshInst = createCharacterInstance(state, removedId);
  nextPlayer.bench.push(freshInst);

  pushEvent(state, events, {
    type: 'CHARACTER_PLAYED',
    playerId,
    cardId: removedId,
    zone: 'BENCH',
    message: `${nextPlayer.name} revive a ${removedId} desde descartes a la banca (sin Stand previo).`,
  });

  return { ok: true, state, events };
}

/**
 * Enumerates legal non-prompt actions for a given player (used by UI highlights and AI).
 */
export function getLegalActions(state: GameState, playerId: PlayerId): GameAction[] {
  if (state.phase === 'GAME_OVER' || state.pendingPrompt) return [];

  const actions: GameAction[] = [];
  const player = state.players[playerId];

  const tryAdd = (action: GameAction) => {
    if (validateAction(state, action).ok) actions.push(action);
  };

  if (state.phase === 'SETUP_MULLIGAN') {
    tryAdd({ type: 'PERFORM_MULLIGAN', playerId });
    tryAdd({ type: 'CONFIRM_STARTING_HAND', playerId });
    return actions;
  }

  if (state.phase === 'SETUP_ACTIVE') {
    for (let i = 0; i < player.hand.length; i++) {
      tryAdd({ type: 'CHOOSE_STARTING_ACTIVE', playerId, handIndex: i });
    }
    return actions;
  }

  if (state.activePlayerId !== playerId) return [];

  if (state.phase === 'PREPARATION') {
    const boardChars = [...(player.active ? [player.active] : []), ...player.bench];

    for (let i = 0; i < player.hand.length; i++) {
      for (const ch of boardChars) {
        tryAdd({
          type: 'EQUIP_STAND',
          playerId,
          handIndex: i,
          targetInstanceId: ch.instanceId,
        });
        tryAdd({
          type: 'ATTACH_ENERGY',
          playerId,
          handIndex: i,
          targetInstanceId: ch.instanceId,
        });
        tryAdd({
          type: 'PLAY_ITEM',
          playerId,
          handIndex: i,
          targetInstanceId: ch.instanceId,
        });
      }
      tryAdd({ type: 'PLAY_ITEM', playerId, handIndex: i });
      tryAdd({ type: 'EVOLVE_CARD', playerId, handIndex: i });
      tryAdd({ type: 'PLAY_TO_BENCH', playerId, handIndex: i });
    }

    for (const ch of boardChars) {
      tryAdd({ type: 'SUMMON_STAND_FROM_DECK', playerId, targetInstanceId: ch.instanceId });
      tryAdd({ type: 'USE_PREP_ABILITY', playerId, sourceInstanceId: ch.instanceId });
    }

    for (const b of player.bench) {
      tryAdd({ type: 'SWAP_ACTIVE_WITH_BENCH', playerId, benchInstanceId: b.instanceId });
    }

    tryAdd({ type: 'ENTER_COMBAT_PHASE', playerId });
    tryAdd({ type: 'END_TURN', playerId });
    return actions;
  }

  if (state.phase === 'COMBAT' && player.active) {
    for (const entry of getAvailableAttacks(player.active)) {
      tryAdd({ type: 'USE_ATTACK', playerId, attackId: entry.attack.id });
    }
    tryAdd({ type: 'END_TURN', playerId });
    return actions;
  }

  return actions;
}

export { getOpponentId };
