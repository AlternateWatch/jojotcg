import { requireCardById } from '../../data/cardRegistry';
import type { RngProvider } from '../rng';
import type { CombatEvent } from '../types/events';
import type {
  CharacterInstance,
  GameState,
  PlayerId,
  PlayerPrompt,
} from '../types/state';

export function getOpponentId(playerId: PlayerId): PlayerId {
  return playerId === 'P1' ? 'P2' : 'P1';
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export function nextEntityId(state: GameState, prefix: string): string {
  state.nextEntitySeq += 1;
  return `${prefix}-${state.nextEntitySeq}`;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type CombatEventPayload = DistributiveOmit<CombatEvent, 'id' | 'turn'>;

export function pushEvent(
  state: GameState,
  eventsOut: CombatEvent[],
  payload: CombatEventPayload,
): void {
  const event = {
    ...payload,
    id: nextEntityId(state, 'evt'),
    turn: state.turnNumber,
  } as CombatEvent;
  state.eventLog.push(event);
  eventsOut.push(event);
  if (payload.type === 'CARD_DRAWN') {
    const p = state.players[payload.playerId];
    p.cardsDrawnThisTurn = (p.cardsDrawnThisTurn ?? 0) + payload.count;
  }
}

export function createCharacterInstance(
  state: GameState,
  cardId: string,
): CharacterInstance {
  const card = requireCardById(cardId);
  if (card.type !== 'CHARACTER') {
    throw new Error(`Expected CHARACTER card, got ${card.type}: ${cardId}`);
  }
  return {
    instanceId: nextEntityId(state, 'chr'),
    cardId: card.id,
    evolvedCardIds: [],
    currentHp: card.maxHp,
    maxHpPenalty: 0,
    attachedStand: null,
    attachedItems: [],
    attachedEnergies: [],
    statuses: {
      stunned: false,
      stunImmuneNextTurn: false,
      bleedStacks: [],
      burn: null,
    },
    tookDamageThisTurn: false,
    windSenseUsed: false,
    superiorIntellectUsed: false,
    dodgeNextAttack: false,
    hotBloodBonusReady: false,
    luckyShotUsed: false,
    hairRageTriggered: false,
    usedPrepAbilityThisTurn: false,
    usedOnceEnterPrepAbility: false,
  };
}

export function findCharacterOnBoard(
  state: GameState,
  playerId: PlayerId,
  instanceId: string,
): { character: CharacterInstance; zone: 'ACTIVE' | 'BENCH'; benchIndex: number } | null {
  const player = state.players[playerId];
  if (player.active?.instanceId === instanceId) {
    return { character: player.active, zone: 'ACTIVE', benchIndex: -1 };
  }
  const idx = player.bench.findIndex((b) => b.instanceId === instanceId);
  if (idx !== -1) {
    return { character: player.bench[idx]!, zone: 'BENCH', benchIndex: idx };
  }
  return null;
}

export function enqueuePrompt(state: GameState, prompt: PlayerPrompt): void {
  if (!state.pendingPrompt) {
    state.pendingPrompt = prompt;
  } else {
    state.queuedPrompts.push(prompt);
  }
}

export function isGameOver(state: GameState): boolean {
  return state.phase === 'GAME_OVER';
}

export function setGameOver(
  state: GameState,
  eventsOut: CombatEvent[],
  winnerId: PlayerId,
  reason: string,
): void {
  if (state.phase === 'GAME_OVER') return;
  state.phase = 'GAME_OVER';
  state.winnerId = winnerId;
  state.winReason = reason;
  state.pendingPrompt = null;
  state.queuedPrompts = [];
  state.promptContinuation = 'NONE';
  const winnerName = state.players[winnerId].name;
  pushEvent(state, eventsOut, {
    type: 'GAME_OVER',
    winnerId,
    reason,
    message: `¡${winnerName} gana la partida! (${reason})`,
  });
}

/**
 * Checks whether a player's deck has reached 0 cards.
 * If the player has cards in their discard pile, reshuffles the entire discard pile back into the deck.
 * Only triggers a deck-out loss when BOTH deck and discard pile are completely empty.
 */
export function checkImmediateDeckOut(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  rng?: RngProvider,
): boolean {
  if (state.phase === 'GAME_OVER') return true;
  const player = state.players[playerId];
  if (player.deck.length === 0) {
    if (player.discard.length > 0) {
      const recycledCount = player.discard.length;
      const recycled = rng
        ? rng.shuffle(player.discard)
        : [...player.discard].sort(() => Math.random() - 0.5);
      player.deck.push(...recycled);
      player.discard = [];
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId,
        abilityName: 'Reciclaje de Mazo',
        message: `¡Mazo vacío! ${player.name} baraja sus ${recycledCount} carta(s) del descarte de vuelta al mazo.`,
      });
      return false;
    }
    if (state.rules.disableDeckOutLoss) {
      return false;
    }
    setGameOver(
      state,
      eventsOut,
      getOpponentId(playerId),
      `${player.name} se ha quedado sin cartas en el mazo ni en el descarte.`,
    );
    return true;
  }
  return false;
}
