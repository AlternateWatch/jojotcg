import { getCardById, getCharacterCard } from '../../data/cardRegistry';
import {
  getCharacterUnlockTurn,
  hasAnyTurnOneEligibleCharacter,
  hasValidStartingHand,
} from '../helpers/cardStats';
import {
  checkImmediateDeckOut,
  createCharacterInstance,
  getOpponentId,
  pushEvent,
} from '../helpers/stateHelpers';
import type { RngProvider } from '../rng';
import type { CombatEvent } from '../types/events';
import type { GameState, PlayerId } from '../types/state';
import { triggerOnEnterFieldAbility } from './turnRules';

export function validateMulliganAction(
  state: GameState,
  playerId: PlayerId,
  actionType: 'PERFORM_MULLIGAN' | 'CONFIRM_STARTING_HAND',
): { ok: boolean; reason?: string } {
  if (state.phase !== 'SETUP_MULLIGAN') {
    return { ok: false, reason: 'No estamos en la fase de revisión de mano inicial (Mulligan).' };
  }
  const player = state.players[playerId];
  if (player.mulliganConfirmed) {
    return { ok: false, reason: 'Ya confirmaste tu mano inicial.' };
  }

  const effectiveMaxDg = hasAnyTurnOneEligibleCharacter([...player.hand, ...player.deck])
    ? 3
    : null;
  const validHand = hasValidStartingHand(player.hand, effectiveMaxDg);
  if (actionType === 'PERFORM_MULLIGAN') {
    if (validHand) {
      return {
        ok: false,
        reason: 'Tu mano inicial ya cumple los requisitos; no necesitas hacer mulligan.',
      };
    }
    return { ok: true };
  }

  // CONFIRM_STARTING_HAND
  if (!validHand) {
    return {
      ok: false,
      reason:
        'Tu mano no contiene un personaje inicial válido (sin DG o DG ≤ 3 autosuficiente, o Usuario DG ≤ 3 + Stand compatible). Debes hacer mulligan.',
    };
  }
  return { ok: true };
}

function buildGuaranteedValidStartingHand(
  shuffledPool: string[],
  drawCount: number,
  maxInitialDg: number | null,
): { hand: string[]; deck: string[] } | null {
  const tryWithCap = (dgCap: number | null): { hand: string[]; deck: string[] } | null => {
    // 1. Prefer a self-sufficient character (attacks.length > 0) within DG cap
    const selfSufficientIdx = shuffledPool.findIndex((id) => {
      const c = getCardById(id);
      return (
        c?.type === 'CHARACTER' &&
        c.attacks.length > 0 &&
        (dgCap === null || c.dg === null || c.dg <= dgCap)
      );
    });
    if (selfSufficientIdx !== -1) {
      const remaining = [...shuffledPool];
      const starter = remaining.splice(selfSufficientIdx, 1)[0]!;
      const hand = [starter, ...remaining.splice(0, Math.max(0, drawCount - 1))];
      return { hand, deck: remaining };
    }

    // 2. Otherwise find a compatible Stand User + Stand pair within DG cap
    for (let uIdx = 0; uIdx < shuffledPool.length; uIdx++) {
      const user = getCardById(shuffledPool[uIdx]!);
      if (
        !user ||
        user.type !== 'CHARACTER' ||
        !user.categories.includes('STAND_USER') ||
        user.dg === null ||
        (dgCap !== null && user.dg > dgCap)
      ) {
        continue;
      }
      for (let sIdx = 0; sIdx < shuffledPool.length; sIdx++) {
        if (sIdx === uIdx) continue;
        const stand = getCardById(shuffledPool[sIdx]!);
        if (
          stand?.type === 'STAND' &&
          user.dg >= stand.requiredDg &&
          (!stand.compatibleCharacterIds || stand.compatibleCharacterIds.includes(user.id))
        ) {
          const remaining = [...shuffledPool];
          const [hi, lo] = uIdx > sIdx ? [uIdx, sIdx] : [sIdx, uIdx];
          const firstRemoved = remaining.splice(hi, 1)[0]!;
          const secondRemoved = remaining.splice(lo, 1)[0]!;
          const hand = [
            secondRemoved,
            firstRemoved,
            ...remaining.splice(0, Math.max(0, drawCount - 2)),
          ];
          return { hand, deck: remaining };
        }
      }
    }

    return null;
  };

  return tryWithCap(maxInitialDg) ?? (maxInitialDg !== null ? tryWithCap(null) : null);
}

export function applyPerformMulligan(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  rng: RngProvider,
): void {
  const player = state.players[playerId];
  const opponent = state.players[getOpponentId(playerId)];

  // Return hand to deck, shuffle, draw initialHandSize
  player.deck.push(...player.hand);
  player.hand = [];
  player.deck = rng.shuffle(player.deck);

  const drawCount = Math.min(state.rules.initialHandSize, player.deck.length);
  for (let i = 0; i < drawCount; i++) {
    player.hand.push(player.deck.shift()!);
  }
  player.mulliganCount += 1;

  // Anti-brick pity rule: on the 3rd mulligan (or later), guarantee a valid starting hand
  let guaranteedApplied = false;
  const effectiveMaxDg = hasAnyTurnOneEligibleCharacter([...player.hand, ...player.deck])
    ? 3
    : null;
  if (player.mulliganCount >= 3 && !hasValidStartingHand(player.hand, effectiveMaxDg)) {
    const pool = rng.shuffle([...player.hand, ...player.deck]);
    const built = buildGuaranteedValidStartingHand(pool, drawCount, effectiveMaxDg);
    if (built) {
      player.hand = built.hand;
      player.deck = built.deck;
      guaranteedApplied = true;
    }
  }

  // Opponent draws 1 extra card when player mulligans
  let opponentDrew = false;
  const opponentId = getOpponentId(playerId);
  if (opponent.deck.length > 0) {
    opponent.hand.push(opponent.deck.shift()!);
    opponentDrew = true;
  }

  pushEvent(state, eventsOut, {
    type: 'MULLIGAN',
    playerId,
    opponentDrewCard: opponentDrew,
    message: `${player.name} hace Mulligan (#${player.mulliganCount}).${
      guaranteedApplied ? ' Mano válida garantizada tras 3 mulligans.' : ''
    }${opponentDrew ? ` ${opponent.name} roba 1 carta adicional.` : ''}`,
  });

  if (opponentDrew) {
    checkImmediateDeckOut(state, eventsOut, opponentId);
  }
}

export function applyConfirmStartingHand(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
): void {
  state.players[playerId].mulliganConfirmed = true;

  if (state.players.P1.mulliganConfirmed && state.players.P2.mulliganConfirmed) {
    state.phase = 'SETUP_ACTIVE';
    pushEvent(state, eventsOut, {
      type: 'PHASE_CHANGED',
      playerId: state.firstPlayerId,
      phase: 'SETUP_ACTIVE',
      message: 'Ambos jugadores tienen mano válida. Elegid vuestro Personaje Activo inicial.',
    });
  }
}

export function validateChooseStartingActive(
  state: GameState,
  playerId: PlayerId,
  handIndex: number,
): { ok: boolean; reason?: string } {
  if (state.phase !== 'SETUP_ACTIVE') {
    return { ok: false, reason: 'No estamos en la fase de elección de Personaje Activo inicial.' };
  }
  const player = state.players[playerId];
  if (player.setupActiveChosen) {
    return { ok: false, reason: 'Ya elegiste tu Personaje Activo inicial.' };
  }
  const cardId = player.hand[handIndex];
  if (!cardId) {
    return { ok: false, reason: 'Índice de mano inválido.' };
  }
  const charCard = getCharacterCard(cardId);
  if (!charCard) {
    return { ok: false, reason: 'Solo puedes colocar una carta de Personaje en el Puesto Activo.' };
  }
  const enforceInitialDgCap = hasAnyTurnOneEligibleCharacter([...player.hand, ...player.deck]);
  if (enforceInitialDgCap && charCard.dg !== null && charCard.dg > 3) {
    return {
      ok: false,
      reason: `No puedes colocar a ${charCard.name} (DG ${charCard.dg}) en el Turno 1. Se desbloquea en el Turno ${getCharacterUnlockTurn(charCard.dg)} (límite inicial: DG 3).`,
    };
  }
  return { ok: true };
}

export function applyChooseStartingActive(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  handIndex: number,
): void {
  const player = state.players[playerId];
  const cardId = player.hand.splice(handIndex, 1)[0]!;
  const inst = createCharacterInstance(state, cardId);
  player.active = inst;
  player.setupActiveChosen = true;

  const charCard = getCharacterCard(cardId)!;
  pushEvent(state, eventsOut, {
    type: 'CHARACTER_PLAYED',
    playerId,
    cardId,
    zone: 'ACTIVE',
    message: `${player.name} coloca a ${charCard.name} en el Puesto Activo.`,
  });

  // Trigger on-enter abilities once both actives are placed, or start turn 1
  if (state.players.P1.setupActiveChosen && state.players.P2.setupActiveChosen) {
    // Trigger enter-field abilities for initial actives (e.g. Rohan / Mariah / Pet Shop)
    if (state.players.P1.active) {
      triggerOnEnterFieldAbility(state, eventsOut, 'P1', state.players.P1.active);
    }
    if (state.players.P2.active) {
      triggerOnEnterFieldAbility(state, eventsOut, 'P2', state.players.P2.active);
    }

    // Begin Turn 1 for firstPlayerId
    state.turnNumber = 1;
    state.activePlayerId = state.firstPlayerId;
    const firstPlayer = state.players[state.firstPlayerId];

    state.phase = 'DRAW';
    pushEvent(state, eventsOut, {
      type: 'PHASE_CHANGED',
      playerId: firstPlayer.id,
      phase: 'DRAW',
      message: `Turno 1 — Fase de Robo de ${firstPlayer.name}.`,
    });

    if (firstPlayer.deck.length > 0) {
      firstPlayer.hand.push(firstPlayer.deck.shift()!);
      pushEvent(state, eventsOut, {
        type: 'CARD_DRAWN',
        playerId: firstPlayer.id,
        count: 1,
        message: `${firstPlayer.name} roba su primera carta del turno.`,
      });
    }

    if (checkImmediateDeckOut(state, eventsOut, firstPlayer.id)) {
      return;
    }

    state.phase = 'PREPARATION';
    pushEvent(state, eventsOut, {
      type: 'PHASE_CHANGED',
      playerId: firstPlayer.id,
      phase: 'PREPARATION',
      message: `Fase de Preparación de ${firstPlayer.name}.${
        !state.rules.firstPlayerCanAttackTurnOne
          ? ' (El primer jugador no puede atacar en el Turno 1).'
          : ''
      }`,
    });
  }
}
