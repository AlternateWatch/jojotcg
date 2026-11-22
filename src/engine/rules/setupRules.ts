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
    ? 4
    : null;
  const validHand = hasValidStartingHand(player.hand, effectiveMaxDg, player.deck);
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
        'Tu mano no contiene un personaje inicial válido (sin DG o DG ≤ 4 autosuficiente, o Usuario DG ≤ 4 + Stand compatible). Debes hacer mulligan.',
    };
  }
  return { ok: true };
}

function buildGuaranteedValidStartingHand(
  shuffledPool: string[],
  drawCount: number,
  maxInitialDg: number | null,
  guaranteedCardId?: string,
): { hand: string[]; deck: string[] } | null {
  const includeGuaranteed = (
    requiredIndices: number[],
  ): { hand: string[]; deck: string[] } => {
    const remaining = [...shuffledPool];
    const picked: string[] = [];
    // Splice required cards in descending index order first
    const uniqueSorted = Array.from(new Set(requiredIndices)).sort((a, b) => b - a);
    for (const idx of uniqueSorted) {
      picked.push(remaining.splice(idx, 1)[0]!);
    }
    // Preserve campaign featured card if not already picked
    if (guaranteedCardId && !picked.includes(guaranteedCardId) && picked.length < drawCount) {
      const gIdx = remaining.indexOf(guaranteedCardId);
      if (gIdx !== -1) {
        picked.push(remaining.splice(gIdx, 1)[0]!);
      }
    }
    const restCount = Math.max(0, drawCount - picked.length);
    return {
      hand: [...picked, ...remaining.splice(0, restCount)],
      deck: remaining,
    };
  };

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
      return includeGuaranteed([selfSufficientIdx]);
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
          return includeGuaranteed([uIdx, sIdx]);
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

  // Return hand to deck, shuffle, draw initialHandSize (preserving campaign guaranteed opening card if set)
  player.deck.push(...player.hand);
  player.hand = [];
  player.deck = rng.shuffle(player.deck);

  const drawCount = Math.min(state.rules.initialHandSize, player.deck.length);
  if (player.guaranteedOpeningCardId && drawCount > 0) {
    const gIdx = player.deck.indexOf(player.guaranteedOpeningCardId);
    if (gIdx !== -1) {
      player.hand.push(player.deck.splice(gIdx, 1)[0]!);
    }
  }
  while (player.hand.length < drawCount && player.deck.length > 0) {
    player.hand.push(player.deck.shift()!);
  }
  player.mulliganCount += 1;

  // Anti-brick pity rule: on the 3rd mulligan (or later), guarantee a valid starting hand
  let guaranteedApplied = false;
  const effectiveMaxDg = hasAnyTurnOneEligibleCharacter([...player.hand, ...player.deck])
    ? 4
    : null;
  if (player.mulliganCount >= 3 && !hasValidStartingHand(player.hand, effectiveMaxDg, player.deck)) {
    const pool = rng.shuffle([...player.hand, ...player.deck]);
    const built = buildGuaranteedValidStartingHand(
      pool,
      drawCount,
      effectiveMaxDg,
      player.guaranteedOpeningCardId,
    );
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
  benchHandIndices: readonly number[] = [],
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
  if (enforceInitialDgCap && charCard.dg !== null && charCard.dg > 4) {
    return {
      ok: false,
      reason: `No puedes colocar a ${charCard.name} (DG ${charCard.dg}) como Activo inicial en el Turno 1. Se desbloquea en el Turno ${getCharacterUnlockTurn(charCard.dg)} (límite inicial: DG 4; puedes bajarlo a la banca desde el Turno 1).`,
    };
  }

  if (benchHandIndices.length > state.rules.maxBenchSize) {
    return {
      ok: false,
      reason: `Solo puedes colocar hasta ${state.rules.maxBenchSize} personajes iniciales en la banca.`,
    };
  }
  const seen = new Set<number>([handIndex]);
  for (const bIdx of benchHandIndices) {
    if (seen.has(bIdx)) {
      return { ok: false, reason: 'Índice de banca inicial duplicado o repetido con el Activo.' };
    }
    seen.add(bIdx);
    const bCardId = player.hand[bIdx];
    const bChar = bCardId ? getCharacterCard(bCardId) : undefined;
    if (!bChar) {
      return { ok: false, reason: 'Solo puedes colocar cartas de Personaje en la banca inicial.' };
    }
    if (
      enforceInitialDgCap &&
      !bChar.categories.includes('STAND_USER') &&
      bChar.dg !== null &&
      bChar.dg > 4
    ) {
      return {
        ok: false,
        reason: `${bChar.name} no es elegible para colocación inicial.`,
      };
    }
  }

  return { ok: true };
}

export function applyChooseStartingActive(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  handIndex: number,
  benchHandIndices: readonly number[] = [],
): void {
  const player = state.players[playerId];
  const activeCardId = player.hand[handIndex]!;
  const benchCardIds = benchHandIndices.map((idx) => player.hand[idx]!);

  // Remove selected cards in descending index order so indices stay intact
  const toRemove = [handIndex, ...benchHandIndices].sort((a, b) => b - a);
  for (const idx of toRemove) {
    player.hand.splice(idx, 1);
  }

  const inst = createCharacterInstance(state, activeCardId);
  player.active = inst;
  for (const bId of benchCardIds) {
    player.bench.push(createCharacterInstance(state, bId));
  }
  player.setupActiveChosen = true;

  const charCard = getCharacterCard(activeCardId)!;
  pushEvent(state, eventsOut, {
    type: 'CHARACTER_PLAYED',
    playerId,
    cardId: activeCardId,
    zone: 'ACTIVE',
    message: `${player.name} coloca a ${charCard.name} en el Puesto Activo.`,
  });

  for (const bId of benchCardIds) {
    const bCard = getCharacterCard(bId)!;
    pushEvent(state, eventsOut, {
      type: 'CHARACTER_PLAYED',
      playerId,
      cardId: bId,
      zone: 'BENCH',
      message: `${player.name} coloca a ${bCard.name} en la banca inicial.`,
    });
  }

  // Trigger on-enter abilities once both actives are placed, or start turn 1
  if (state.players.P1.setupActiveChosen && state.players.P2.setupActiveChosen) {
    // Trigger enter-field abilities for initial actives and initial bench
    if (state.players.P1.active) {
      triggerOnEnterFieldAbility(state, eventsOut, 'P1', state.players.P1.active);
    }
    for (const b of state.players.P1.bench) {
      triggerOnEnterFieldAbility(state, eventsOut, 'P1', b);
    }
    if (state.players.P2.active) {
      triggerOnEnterFieldAbility(state, eventsOut, 'P2', state.players.P2.active);
    }
    for (const b of state.players.P2.bench) {
      triggerOnEnterFieldAbility(state, eventsOut, 'P2', b);
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
