import type { StatusType } from '../../data/schemas/cardTypes';
import {
  getEffectiveCharacterProfile,
  hasElementalStatusImmunity,
} from '../helpers/cardStats';
import {
  enqueuePrompt,
  findCharacterOnBoard,
  nextEntityId,
  pushEvent,
} from '../helpers/stateHelpers';
import type { CombatEvent } from '../types/events';
import type { GameState, PlayerId } from '../types/state';

const STATUS_NAMES: Record<StatusType, string> = {
  STUNNED: 'Aturdido',
  BLEED: 'Sangrado',
  BURN: 'Quemado',
};

export function getStatusLabel(status: StatusType): string {
  return STATUS_NAMES[status];
}

export function applyStatusConfirmed(
  state: GameState,
  eventsOut: CombatEvent[],
  targetPlayerId: PlayerId,
  targetInstanceId: string,
  status: StatusType,
): void {
  const found = findCharacterOnBoard(state, targetPlayerId, targetInstanceId);
  if (!found) return;
  const { character } = found;
  const profile = getEffectiveCharacterProfile(character);

  if (status === 'STUNNED') {
    character.statuses.stunned = true;
    pushEvent(state, eventsOut, {
      type: 'STATUS_APPLIED',
      targetPlayerId,
      targetInstanceId,
      status: 'STUNNED',
      message: `${profile.name} pasa a estar Aturdido.`,
    });
  } else if (status === 'BLEED') {
    character.statuses.bleedStacks.push({
      id: nextEntityId(state, 'bleed'),
      turnsRemaining: state.rules.bleedDurationTurns,
      damagePerTurn: state.rules.bleedDamagePerStack,
    });
    const stacks = character.statuses.bleedStacks.length;
    pushEvent(state, eventsOut, {
      type: 'STATUS_APPLIED',
      targetPlayerId,
      targetInstanceId,
      status: 'BLEED',
      message: `${profile.name} sufre Sangrado (acumulaciones activas: ${stacks}).`,
    });
  } else if (status === 'BURN') {
    character.statuses.burn = {
      active: true,
      damagePerTurn: state.rules.burnDamagePerTurn,
    };
    pushEvent(state, eventsOut, {
      type: 'STATUS_APPLIED',
      targetPlayerId,
      targetInstanceId,
      status: 'BURN',
      message: `${profile.name} pasa a estar Quemado (${state.rules.burnDamagePerTurn} daño/turno).`,
    });
  }
}

/**
 * Attempts to apply an elemental status (STUNNED, BLEED, BURN).
 * Respects passive elemental immunities (Kars Ultimate, Polnareff + Kakyoin)
 * and interactive reaction (Jotaro Kujo — Yare Yare Daze).
 * Returns true if a reaction prompt was enqueued (deferred resolution).
 */
export function tryApplyElementalStatus(
  state: GameState,
  eventsOut: CombatEvent[],
  targetPlayerId: PlayerId,
  targetInstanceId: string,
  status: StatusType,
  sourceLabel: string,
): boolean {
  const found = findCharacterOnBoard(state, targetPlayerId, targetInstanceId);
  if (!found) return false;

  const { character } = found;
  const profile = getEffectiveCharacterProfile(character);

  // 0. Anti-stun-lock protection: cannot be stunned two turns in a row
  if (
    status === 'STUNNED' &&
    state.rules.preventConsecutiveStun &&
    character.statuses.stunImmuneNextTurn
  ) {
    pushEvent(state, eventsOut, {
      type: 'STATUS_PREVENTED',
      targetPlayerId,
      targetInstanceId,
      status,
      reason: 'Resistencia a Aturdido consecutivo',
      message: `${profile.name} resiste el Aturdido consecutivo (${sourceLabel}).`,
    });
    return false;
  }

  // 1. Passive elemental status immunity (Evolución Instantánea / Se te ve la ropa interior)
  const immunity = hasElementalStatusImmunity(state, targetPlayerId, character);
  if (immunity.immune) {
    pushEvent(state, eventsOut, {
      type: 'STATUS_PREVENTED',
      targetPlayerId,
      targetInstanceId,
      status,
      reason: immunity.reason ?? 'Inmunidad elemental',
      message: `${profile.name} es inmune a ${STATUS_NAMES[status]} gracias a ${immunity.reason}.`,
    });
    return false;
  }

  // 2. Interactive reaction: Jotaro Kujo — Yare Yare Daze
  if (
    profile.signatureAbility.id === 'YARE_YARE_DAZE' &&
    state.players[targetPlayerId].hand.length > 0
  ) {
    enqueuePrompt(state, {
      kind: 'YARE_YARE_DAZE_REACTION',
      playerId: targetPlayerId,
      targetInstanceId,
      status,
      sourceLabel,
    });
    return true;
  }

  // 3. Apply directly
  applyStatusConfirmed(state, eventsOut, targetPlayerId, targetInstanceId, status);
  return false;
}

export function cleanseBurn(
  state: GameState,
  eventsOut: CombatEvent[],
  targetPlayerId: PlayerId,
  targetInstanceId: string,
  reason: string,
): void {
  const found = findCharacterOnBoard(state, targetPlayerId, targetInstanceId);
  if (!found) return;
  const { character } = found;
  if (!character.statuses.burn?.active) return;

  character.statuses.burn = null;
  const profile = getEffectiveCharacterProfile(character);
  pushEvent(state, eventsOut, {
    type: 'STATUS_CLEARED',
    targetPlayerId,
    targetInstanceId,
    status: 'BURN',
    reason,
    message: `${profile.name} elimina su Quemadura (${reason}).`,
  });
}
