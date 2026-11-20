import {
  getCardById,
  getCharacterCard,
  getEnergyCard,
  getEvolutionCard,
  getItemCard,
  getStandCard,
} from '../../data/cardRegistry';
import {
  canPayEnergyCost,
  checkEvolutionRequirements,
  computeEffectiveMaxHp,
  getAvailableAttacks,
  getEffectiveCharacterProfile,
  getMaxEnergyAttachmentsThisTurn,
  isOpponentBenchLockedByKakyoin,
  isStandCompatibleWithCharacter,
} from '../helpers/cardStats';
import {
  checkImmediateDeckOut,
  createCharacterInstance,
  enqueuePrompt,
  findCharacterOnBoard,
  getOpponentId,
  nextEntityId,
  pushEvent,
} from '../helpers/stateHelpers';
import type { RngProvider } from '../rng';
import { cleanseBurn, tryApplyElementalStatus } from '../statuses/statusSystem';
import { healCharacter } from '../effects/effectPipeline';
import { finishTurnToEndPhase } from '../combat/combatResolver';
import type { CombatEvent } from '../types/events';
import type { CharacterInstance, GameState, PlayerId } from '../types/state';

export function triggerOnEnterFieldAbility(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  inst: CharacterInstance,
): void {
  const profile = getEffectiveCharacterProfile(inst);
  const opponentId = getOpponentId(playerId);
  const opponent = state.players[opponentId];

  if (profile.signatureAbility.id === 'MAGNETIC_ATTRACTION_MARIAH' && opponent.active) {
    let stolen = 0;
    const remaining: typeof opponent.active.attachedEnergies = [];
    for (const energy of opponent.active.attachedEnergies) {
      if (energy === 'METAL' && stolen < 3) {
        inst.attachedEnergies.push('METAL');
        stolen++;
      } else {
        remaining.push(energy);
      }
    }
    if (stolen > 0) {
      opponent.active.attachedEnergies = remaining;
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId,
        abilityName: 'Atracción Magnética',
        message: `Mariah roba ${stolen} energía(s) Metal del rival y las une a sí misma.`,
      });
    }
  } else if (profile.signatureAbility.id === 'READ_INSIDE_ROHAN') {
    opponent.handRevealedToOpponent = true;
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId,
      abilityName: 'Te leeré tus adentros...',
      message: `Rohan Kishibe revela la mano de ${opponent.name}.`,
    });
  } else if (profile.signatureAbility.id === 'AERIAL_RECON_PET_SHOP') {
    const count = Math.min(3, opponent.deck.length);
    if (count > 0) {
      const topCards = opponent.deck.splice(0, count);
      enqueuePrompt(state, {
        kind: 'REORDER_OPPONENT_TOP_DECK',
        playerId,
        targetPlayerId: opponentId,
        cards: topCards,
        sourceLabel: 'Reconocimiento Aéreo',
      });
    }
  }
}

export function validateEquipStand(
  state: GameState,
  playerId: PlayerId,
  handIndex: number,
  targetInstanceId: string,
): { ok: boolean; reason?: string } {
  if (state.phase !== 'PREPARATION' || state.activePlayerId !== playerId) {
    return { ok: false, reason: 'Solo puedes equipar Stands en tu Fase de Preparación.' };
  }
  const player = state.players[playerId];
  const cardId = player.hand[handIndex];
  if (!cardId) return { ok: false, reason: 'Carta no encontrada en mano.' };

  const stand = getStandCard(cardId);
  if (!stand) return { ok: false, reason: 'La carta seleccionada no es un Stand.' };

  const target = findCharacterOnBoard(state, playerId, targetInstanceId);
  if (!target) {
    return {
      ok: false,
      reason: 'El Usuario de Stand objetivo debe estar en tu Puesto Activo o en tu Banca.',
    };
  }

  return isStandCompatibleWithCharacter(stand, target.character);
}

export function applyEquipStand(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  handIndex: number,
  targetInstanceId: string,
): void {
  const player = state.players[playerId];
  const standCardId = player.hand.splice(handIndex, 1)[0]!;
  const standCard = getStandCard(standCardId)!;
  const target = findCharacterOnBoard(state, playerId, targetInstanceId)!;
  const character = target.character;
  const prevMax = computeEffectiveMaxHp(state, playerId, character);

  character.attachedStand = {
    instanceId: nextEntityId(state, 'std'),
    cardId: standCard.id,
    evolvedCardIds: [],
    permanentDamageBonus: 0,
    damageDebuff: 0,
  };

  // If Kira equips Killer Queen, increase currentHp by +10 maxHp delta cleanly
  const newMax = computeEffectiveMaxHp(state, playerId, character);
  if (newMax > prevMax) {
    character.currentHp += newMax - prevMax;
  }

  const charProfile = getEffectiveCharacterProfile(character);
  const zoneLabel = target.zone === 'ACTIVE' ? 'Puesto Activo' : 'Banca';
  pushEvent(state, eventsOut, {
    type: 'STAND_EQUIPPED',
    playerId,
    standCardId: standCard.id,
    characterCardId: charProfile.currentCardId,
    message: `${player.name} equipa a ${standCard.name} en ${charProfile.name} (${zoneLabel}, acción gratuita).`,
  });
}

export function validateAttachEnergy(
  state: GameState,
  playerId: PlayerId,
  handIndex: number,
  targetInstanceId: string,
): { ok: boolean; reason?: string } {
  if (state.phase !== 'PREPARATION' || state.activePlayerId !== playerId) {
    return { ok: false, reason: 'Solo puedes adjuntar Energía en tu Fase de Preparación.' };
  }
  const player = state.players[playerId];
  const maxAllowed = getMaxEnergyAttachmentsThisTurn(state, playerId);
  if (player.energyAttachedThisTurn >= maxAllowed) {
    return {
      ok: false,
      reason: `Solo puedes adjuntar ${maxAllowed} carta(s) de Energía este turno.`,
    };
  }
  const cardId = player.hand[handIndex];
  if (!cardId || !getEnergyCard(cardId)) {
    return { ok: false, reason: 'La carta seleccionada no es una carta de Energía.' };
  }
  if (!findCharacterOnBoard(state, playerId, targetInstanceId)) {
    return { ok: false, reason: 'El personaje objetivo no está en tu campo.' };
  }
  return { ok: true };
}

export function applyAttachEnergy(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  handIndex: number,
  targetInstanceId: string,
): void {
  const player = state.players[playerId];
  const cardId = player.hand.splice(handIndex, 1)[0]!;
  const energyCard = getEnergyCard(cardId)!;
  const target = findCharacterOnBoard(state, playerId, targetInstanceId)!;

  target.character.attachedEnergies.push(energyCard.energyType);
  player.energyAttachedThisTurn += 1;

  const profile = getEffectiveCharacterProfile(target.character);
  pushEvent(state, eventsOut, {
    type: 'ENERGY_ATTACHED',
    playerId,
    energyType: energyCard.energyType,
    targetCardId: profile.currentCardId,
    message: `${player.name} une ${energyCard.name} a ${profile.name}.`,
  });
}

export function validatePlayItem(
  state: GameState,
  playerId: PlayerId,
  handIndex: number,
  targetInstanceId?: string,
): { ok: boolean; reason?: string } {
  if (state.phase !== 'PREPARATION' || state.activePlayerId !== playerId) {
    return { ok: false, reason: 'Solo puedes jugar Objetos en tu Fase de Preparación.' };
  }
  const player = state.players[playerId];
  const cardId = player.hand[handIndex];
  if (!cardId) return { ok: false, reason: 'Carta no encontrada en mano.' };

  const item = getItemCard(cardId);
  if (!item) return { ok: false, reason: 'La carta seleccionada no es un Objeto.' };

  // Pure catalyst consumables without standalone effects cannot be played by themselves
  if (
    item.itemKind === 'CONSUMABLE' &&
    item.effects.every((e) => e.kind === 'EVOLUTION_CATALYST')
  ) {
    return {
      ok: false,
      reason: `${item.name} se consume automáticamente al jugar la carta de Evolución correspondiente.`,
    };
  }

  // Dual-mode item (Piedra Roja de Aja): standalone (!targetInstanceId) burns enemy active; with targetInstanceId equips on ally
  const hasStandaloneBurn = item.effects.some((e) => e.kind === 'BURN_ENEMY_ACTIVE');
  if (hasStandaloneBurn && !targetInstanceId) {
    const opponent = state.players[getOpponentId(playerId)];
    if (!opponent.active) {
      return { ok: false, reason: 'El oponente no tiene un personaje activo al que quemar.' };
    }
    return { ok: true };
  }

  if (item.targetScope === 'ACTIVE_ALLY') {
    if (!player.active) return { ok: false, reason: 'No tienes personaje activo.' };
    if (targetInstanceId && targetInstanceId !== player.active.instanceId) {
      return { ok: false, reason: `${item.name} solo puede usarse en tu Personaje Activo.` };
    }
  } else if (item.targetScope === 'ANY_ALLY') {
    const resolvedTarget = targetInstanceId ?? player.active?.instanceId;
    if (!resolvedTarget || !findCharacterOnBoard(state, playerId, resolvedTarget)) {
      return { ok: false, reason: 'Selecciona un personaje aliado válido en el campo.' };
    }
  }

  // Validate item-specific requirements (search targets / bench swap)
  for (const eff of item.effects) {
    if (eff.kind === 'SEARCH_DECK') {
      const hasMatch = player.deck.some((id) => {
        const c = getCardById(id);
        if (!c) return false;
        if (eff.filter === 'ENERGY') return c.type === 'ENERGY';
        if (eff.filter === 'STAND') return c.type === 'STAND';
        if (eff.filter === 'STAND_EVOLUTION') {
          return c.type === 'EVOLUTION' && c.evolutionTarget === 'STAND';
        }
        return c.type === 'CHARACTER' || c.type === 'STAND';
      });
      if (!hasMatch) {
        return {
          ok: false,
          reason:
            eff.filter === 'ENERGY'
              ? 'No quedan cartas de Energía en tu mazo.'
              : eff.filter === 'STAND'
                ? 'No quedan cartas de Stand en tu mazo.'
                : eff.filter === 'STAND_EVOLUTION'
                  ? 'No quedan cartas de evolución de Stand en tu mazo.'
                  : 'No quedan cartas de Personaje ni Stand en tu mazo.',
        };
      }
    } else if (eff.kind === 'FREE_BENCH_SWAP') {
      if (!player.active || player.bench.length === 0) {
        return {
          ok: false,
          reason: 'Necesitas al menos 1 personaje en tu banca para usar Cambio Táctico.',
        };
      }
    }
  }

  return { ok: true };
}

export function applyPlayItem(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  handIndex: number,
  targetInstanceId?: string,
  rng?: RngProvider,
): void {
  const player = state.players[playerId];
  const cardId = player.hand.splice(handIndex, 1)[0]!;
  const item = getItemCard(cardId)!;

  pushEvent(state, eventsOut, {
    type: 'ITEM_PLAYED',
    playerId,
    itemCardId: item.id,
    message: `${player.name} juega el objeto ${item.name}.`,
  });

  // Piedra Roja de Aja played standalone (!targetInstanceId): burns opponent active and goes to discard
  if (item.effects.some((e) => e.kind === 'BURN_ENEMY_ACTIVE') && !targetInstanceId) {
    const opponentId = getOpponentId(playerId);
    const opponent = state.players[opponentId];
    if (opponent.active) {
      tryApplyElementalStatus(
        state,
        eventsOut,
        opponentId,
        opponent.active.instanceId,
        'BURN',
        item.name,
      );
    }
    player.discard.push(item.id);
    return;
  }

  if (item.itemKind === 'EQUIPPABLE') {
    const resolvedId = targetInstanceId ?? player.active!.instanceId;
    const target = findCharacterOnBoard(state, playerId, resolvedId)!;
    const prevMax = computeEffectiveMaxHp(state, playerId, target.character);
    target.character.attachedItems.push({
      instanceId: nextEntityId(state, 'itm'),
      cardId: item.id,
    });
    const newMax = computeEffectiveMaxHp(state, playerId, target.character);
    if (newMax > prevMax) {
      target.character.currentHp += newMax - prevMax;
    }
    return;
  }

  // Consumable item
  for (const eff of item.effects) {
    if (eff.kind === 'HEAL_TARGET') {
      const healTargetId = targetInstanceId ?? player.active?.instanceId;
      if (healTargetId) {
        healCharacter(state, eventsOut, playerId, healTargetId, eff.amount, item.name);
      }
    } else if (eff.kind === 'BURN_ENEMY_ACTIVE') {
      const opponentId = getOpponentId(playerId);
      const opponent = state.players[opponentId];
      if (opponent.active) {
        tryApplyElementalStatus(
          state,
          eventsOut,
          opponentId,
          opponent.active.instanceId,
          'BURN',
          item.name,
        );
      }
    } else if (eff.kind === 'DRAW_CARDS') {
      const drawnCount = Math.min(eff.count, player.deck.length);
      for (let i = 0; i < drawnCount; i++) {
        player.hand.push(player.deck.shift()!);
      }
      if (drawnCount > 0) {
        pushEvent(state, eventsOut, {
          type: 'CARD_DRAWN',
          playerId,
          count: drawnCount,
          message: `${player.name} roba ${drawnCount} carta(s) gracias a ${item.name}.`,
        });
      }
    } else if (eff.kind === 'SEARCH_DECK') {
      enqueuePrompt(state, {
        kind: 'SEARCH_DECK_CARDS',
        playerId,
        filter: eff.filter,
        maxPickCount: eff.maxCount,
        sourceLabel: item.name,
      });
    } else if (eff.kind === 'EXTRA_ENERGY_ALLOWANCE') {
      player.bonusEnergyAttachmentsThisTurn += eff.bonusAttachments;
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId,
        abilityName: item.name,
        message: `${player.name} puede unir +${eff.bonusAttachments} Energía adicional este turno.`,
      });
      if (eff.recoverDiscardEnergy) {
        const energyEntries = player.discard
          .map((id, index) => ({ id, index }))
          .filter((entry) => getCardById(entry.id)?.type === 'ENERGY');
        if (energyEntries.length > 0) {
          const uniqueTypes = new Set(energyEntries.map((e) => e.id));
          if (uniqueTypes.size === 1) {
            const picked = energyEntries[0]!;
            const recoveredId = player.discard.splice(picked.index, 1)[0]!;
            player.hand.push(recoveredId);
            pushEvent(state, eventsOut, {
              type: 'CARD_DRAWN',
              playerId,
              count: 1,
              message: `${player.name} recupera ${getCardById(recoveredId)?.name ?? recoveredId} desde descartes.`,
            });
          } else {
            enqueuePrompt(state, {
              kind: 'RECOVER_ENERGY_FROM_DISCARD',
              playerId,
              eligibleCardIds: energyEntries.map((e) => e.id),
              sourceLabel: item.name,
            });
          }
        }
      }
    } else if (eff.kind === 'FREE_BENCH_SWAP' && player.active && player.bench.length > 0) {
      if (player.bench.length === 1) {
        const outgoing = player.active;
        const incoming = player.bench.splice(0, 1)[0]!;
        player.active = incoming;
        player.bench.push(outgoing);
        cleanseBurn(state, eventsOut, playerId, outgoing.instanceId, 'Cambio Táctico');
        cleanseBurn(state, eventsOut, playerId, incoming.instanceId, 'Cambio Táctico');
        const outProf = getEffectiveCharacterProfile(outgoing);
        const inProf = getEffectiveCharacterProfile(incoming);
        pushEvent(state, eventsOut, {
          type: 'BENCH_SWAP',
          playerId,
          newActiveCardId: inProf.currentCardId,
          endedTurn: false,
          message: `¡Cambio Táctico! ${outProf.name} se retira y entra ${inProf.name} sin finalizar el turno.`,
        });
      } else {
        enqueuePrompt(state, {
          kind: 'RETREAT_CHOOSE_NEW_ACTIVE',
          playerId,
          sourceLabel: item.name,
        });
      }
    }
  }

  void rng;
  player.discard.push(item.id);
  if (!state.pendingPrompt) {
    checkImmediateDeckOut(state, eventsOut, playerId);
  }
}

export function validateEvolveCard(
  state: GameState,
  playerId: PlayerId,
  handIndex: number,
): { ok: boolean; reason?: string } {
  if (state.phase !== 'PREPARATION' || state.activePlayerId !== playerId) {
    return { ok: false, reason: 'Solo puedes evolucionar en tu Fase de Preparación.' };
  }
  const player = state.players[playerId];
  const cardId = player.hand[handIndex];
  if (!cardId) return { ok: false, reason: 'Carta no encontrada en mano.' };

  const evo = getEvolutionCard(cardId);
  if (!evo) return { ok: false, reason: 'La carta seleccionada no es una Evolución.' };

  const reqCheck = checkEvolutionRequirements(state, playerId, evo);
  return { ok: reqCheck.ok, reason: reqCheck.reason };
}

export function applyEvolveCard(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  handIndex: number,
): void {
  const player = state.players[playerId];
  const evoCardId = player.hand[handIndex]!;
  const evo = getEvolutionCard(evoCardId)!;
  const reqCheck = checkEvolutionRequirements(state, playerId, evo);
  const active = player.active!;

  // Remove evolution card + any consumed hand catalysts (descending index order)
  const indicesToRemove = [handIndex, ...reqCheck.handCatalystIndices].sort((a, b) => b - a);
  for (const idx of indicesToRemove) {
    const removedId = player.hand.splice(idx, 1)[0]!;
    if (idx !== handIndex) {
      player.discard.push(removedId);
    }
  }

  player.evolutionsPlayedThisTurn += 1;

  if (evo.evolutionTarget === 'CHARACTER') {
    const oldMax = computeEffectiveMaxHp(state, playerId, active);
    active.evolvedCardIds.push(evo.id);
    const newMax = computeEffectiveMaxHp(state, playerId, active);
    if (newMax > oldMax) {
      active.currentHp += newMax - oldMax;
    }
    // Kars Ultimate removes any existing elemental statuses on evolving? Keep clean: immunity blocks future ones,
    // and let's clear burn/bleed/stun if ultimate form grants total elemental immunity.
    if (evo.signatureAbility?.id === 'INSTANT_EVOLUTION_KARS') {
      active.statuses.bleedStacks = [];
      active.statuses.burn = null;
      active.statuses.stunned = false;
    }
  } else {
    // Stand Evolution
    if (active.attachedStand) {
      active.attachedStand.evolvedCardIds.push(evo.id);
    } else {
      // Star Platinum: The World played directly on Jotaro Kujo
      active.attachedStand = {
        instanceId: nextEntityId(state, 'std'),
        cardId: evo.id,
        evolvedCardIds: [],
        permanentDamageBonus: 0,
        damageDebuff: 0,
      };
    }

    // Koichi Hirose signature: heals 60 HP whenever Echoes advances an Act
    const activeProfile = getEffectiveCharacterProfile(active);
    if (
      activeProfile.signatureAbility.id === 'ECHOES_HEAL_KOICHI' &&
      evo.baseCardId.startsWith('stand-echoes')
    ) {
      healCharacter(state, eventsOut, playerId, active.instanceId, 60, 'Echoes (Avance de Acto)');
    }
  }

  pushEvent(state, eventsOut, {
    type: 'CARD_EVOLVED',
    playerId,
    evolutionCardId: evo.id,
    message: `¡EVOLUCIÓN! ${player.name} evoluciona a ${evo.name}.`,
  });
}

export function validateUsePrepAbility(
  state: GameState,
  playerId: PlayerId,
  sourceInstanceId: string,
): { ok: boolean; reason?: string } {
  if (state.phase !== 'PREPARATION' || state.activePlayerId !== playerId) {
    return { ok: false, reason: 'Solo puedes usar habilidades de preparación en tu Fase de Preparación.' };
  }
  const found = findCharacterOnBoard(state, playerId, sourceInstanceId);
  if (!found) return { ok: false, reason: 'Personaje no encontrado en tu campo.' };

  const { character } = found;
  const profile = getEffectiveCharacterProfile(character);

  if (character.statuses.stunned) {
    return { ok: false, reason: `${profile.name} está Aturdido y no puede usar habilidades.` };
  }
  if (profile.signatureAbility.trigger !== 'ONCE_PER_TURN_PREP') {
    return { ok: false, reason: `${profile.name} no tiene una habilidad activa de preparación.` };
  }
  if (character.usedPrepAbilityThisTurn) {
    return { ok: false, reason: `${profile.signatureAbility.name} ya se usó este turno.` };
  }

  const player = state.players[playerId];
  if (
    (profile.signatureAbility.id === 'READ_CARDS_AVDOL' ||
      profile.signatureAbility.id === 'MONEY_SHIGEKIYO' ||
      profile.signatureAbility.id === 'GUITAR_SOLO_AKIRA') &&
    character.usedOnceEnterPrepAbility
  ) {
    return {
      ok: false,
      reason: `${profile.signatureAbility.name} solo se puede activar una vez por entrada en juego.`,
    };
  }

  if (profile.signatureAbility.id === 'SPEEDWAGON_FOUNDATION') {
    const hasItemsInDiscard = player.discard.some((id) => getCardById(id)?.type === 'ITEM');
    if (!hasItemsInDiscard) {
      return { ok: false, reason: 'No tienes objetos en la pila de descartes para recuperar.' };
    }
  } else if (player.deck.length === 0) {
    return { ok: false, reason: 'Tu mazo no tiene cartas.' };
  }

  return { ok: true };
}

export function applyUsePrepAbility(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  sourceInstanceId: string,
): void {
  const found = findCharacterOnBoard(state, playerId, sourceInstanceId)!;
  const { character } = found;
  const profile = getEffectiveCharacterProfile(character);
  const player = state.players[playerId];

  character.usedPrepAbilityThisTurn = true;

  switch (profile.signatureAbility.id) {
    case 'GUITAR_SOLO_AKIRA': {
      character.usedOnceEnterPrepAbility = true;
      const drawn = Math.min(2, player.deck.length);
      for (let i = 0; i < drawn; i++) {
        player.hand.push(player.deck.shift()!);
      }
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId,
        abilityName: 'Solo de Guitarra',
        message: `${player.name} activa Solo de Guitarra y roba ${drawn} carta(s).`,
      });
      checkImmediateDeckOut(state, eventsOut, playerId);
      break;
    }
    case 'MONEY_SHIGEKIYO': {
      character.usedOnceEnterPrepAbility = true;
      const count = Math.min(3, player.deck.length);
      const cards = player.deck.splice(0, count);
      enqueuePrompt(state, {
        kind: 'SELECT_TOP_CARDS',
        playerId,
        cards,
        pickCount: Math.min(2, count),
        restTo: 'BOTTOM',
        sourceLabel: 'Dinero Dinero Dinero',
      });
      break;
    }
    case 'READ_CARDS_AVDOL': {
      character.usedOnceEnterPrepAbility = true;
      const count = Math.min(5, player.deck.length);
      const cards = player.deck.splice(0, count);
      enqueuePrompt(state, {
        kind: 'SELECT_TOP_CARDS',
        playerId,
        cards,
        pickCount: Math.min(3, count),
        restTo: 'TOP',
        sourceLabel: 'Leer las Cartas',
      });
      break;
    }
    case 'SPEEDWAGON_FOUNDATION': {
      const eligible = player.discard.filter((id) => getCardById(id)?.type === 'ITEM');
      enqueuePrompt(state, {
        kind: 'RECOVER_ITEM_FROM_DISCARD',
        playerId,
        destination: 'DECK',
        eligibleCardIds: eligible,
        sourceLabel: 'Recursos de la Fundación Speedwagon',
      });
      break;
    }
  }
}

export function validatePlayToBench(
  state: GameState,
  playerId: PlayerId,
  handIndex: number,
): { ok: boolean; reason?: string } {
  if (state.phase !== 'PREPARATION' || state.activePlayerId !== playerId) {
    return { ok: false, reason: 'Solo puedes gestionar la banca durante tu Fase de Preparación.' };
  }
  const player = state.players[playerId];
  if (player.bench.length >= state.rules.maxBenchSize) {
    return {
      ok: false,
      reason: `La banca está llena (máximo ${state.rules.maxBenchSize} personajes).`,
    };
  }
  if (isOpponentBenchLockedByKakyoin(state, playerId)) {
    return {
      ok: false,
      reason: 'Noriaki Kakyoin rival bloquea la colocación de nuevos personajes en tu banca.',
    };
  }
  const cardId = player.hand[handIndex];
  if (!cardId) return { ok: false, reason: 'Carta no encontrada en mano.' };

  const card = getCardById(cardId);
  if (!card || card.type !== 'CHARACTER') {
    return {
      ok: false,
      reason: 'Solo se pueden colocar cartas de Personaje en la banca (nunca Stands independientes).',
    };
  }
  return { ok: true };
}

export function applyPlayToBench(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  handIndex: number,
  rng: RngProvider,
): void {
  const player = state.players[playerId];
  const cardId = player.hand.splice(handIndex, 1)[0]!;
  const inst = createCharacterInstance(state, cardId);
  player.bench.push(inst);

  // If Okuyasu is active and Josuke enters bench, reflect +20 maxHp increase on currentHp too?
  // Standard TCG: maxHp increases dynamically via computeEffectiveMaxHp; currentHp stays intact.
  const charCard = getCharacterCard(cardId)!;
  pushEvent(state, eventsOut, {
    type: 'CHARACTER_PLAYED',
    playerId,
    cardId,
    zone: 'BENCH',
    message: `${player.name} coloca a ${charCard.name} en la banca (consume la acción principal y finaliza el turno).`,
  });

  triggerOnEnterFieldAbility(state, eventsOut, playerId, inst);

  if (state.pendingPrompt) {
    state.promptContinuation = 'FINISH_END_TURN';
    return;
  }

  // Rulebook: Bench management immediately triggers End of Turn!
  finishTurnToEndPhase(state, eventsOut, rng);
}

export function validateSwapOrRetreat(
  state: GameState,
  playerId: PlayerId,
  benchInstanceId: string,
): { ok: boolean; reason?: string } {
  if (state.phase !== 'PREPARATION' || state.activePlayerId !== playerId) {
    return { ok: false, reason: 'Solo puedes cambiar o retirar durante tu Fase de Preparación.' };
  }
  const player = state.players[playerId];
  if (!player.active) return { ok: false, reason: 'No hay personaje en el Puesto Activo.' };
  if (!player.bench.some((b) => b.instanceId === benchInstanceId)) {
    return { ok: false, reason: 'El personaje seleccionado no está en tu banca.' };
  }
  // Note: Confirmed rule D10 — Stunned DOES allow retreating/swapping to bench!
  return { ok: true };
}

export function applySwapOrRetreat(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  benchInstanceId: string,
  rng: RngProvider,
): void {
  const player = state.players[playerId];
  const outgoing = player.active!;
  const outgoingProfile = getEffectiveCharacterProfile(outgoing);
  const idx = player.bench.findIndex((b) => b.instanceId === benchInstanceId);
  const incoming = player.bench.splice(idx, 1)[0]!;

  // Stand, Items, and Energies accompany the character to the bench (C5)
  player.active = incoming;
  player.bench.push(outgoing);

  // If Okuyasu leaves bench synergy or Josuke leaves bench, clamp outgoing/incoming currentHp if needed only on maxHp drop?
  // Note: Soul Swap allows > maxHp, so we don't forcibly clamp unless needed.

  // Rulebook: Burn is cleared IMMEDIATELY upon leaving Active OR being promoted to Active!
  cleanseBurn(state, eventsOut, playerId, outgoing.instanceId, 'retirada a la banca');
  cleanseBurn(state, eventsOut, playerId, incoming.instanceId, 'promoción al Puesto Activo');

  const incomingProfile = getEffectiveCharacterProfile(incoming);

  // Joseph Joestar (Part 2) — NIGERUNDAYO: can retreat without ending turn!
  const freeRetreat = outgoingProfile.signatureAbility.id === 'NIGERUNDAYO';

  pushEvent(state, eventsOut, {
    type: 'BENCH_SWAP',
    playerId,
    newActiveCardId: incomingProfile.currentCardId,
    endedTurn: !freeRetreat,
    message: freeRetreat
      ? `¡NIGERUNDAYO! ${outgoingProfile.name} se retira sin terminar el turno; entra ${incomingProfile.name}.`
      : `${player.name} cambia a ${outgoingProfile.name} por ${incomingProfile.name} (el Stand lo acompaña a la banca; finaliza el turno).`,
  });

  if (!freeRetreat) {
    finishTurnToEndPhase(state, eventsOut, rng);
  }
}

export function validateEnterCombatPhase(
  state: GameState,
  playerId: PlayerId,
): { ok: boolean; reason?: string } {
  if (state.phase !== 'PREPARATION' || state.activePlayerId !== playerId) {
    return { ok: false, reason: 'Solo puedes pasar a Combate desde tu Fase de Preparación.' };
  }
  if (
    !state.rules.firstPlayerCanAttackTurnOne &&
    state.turnNumber === 1 &&
    playerId === state.firstPlayerId
  ) {
    return {
      ok: false,
      reason: 'El jugador que empieza la partida no puede atacar en el Turno 1 (regla Pokémon TCG).',
    };
  }
  const active = state.players[playerId].active;
  if (!active) {
    return { ok: false, reason: 'No tienes un personaje activo.' };
  }
  if (active.statuses.stunned) {
    return {
      ok: false,
      reason: `${getEffectiveCharacterProfile(active).name} está Aturdido y no puede atacar este turno (puedes retirar a banca o terminar turno).`,
    };
  }
  return { ok: true };
}

export function validateUseAttack(
  state: GameState,
  playerId: PlayerId,
  attackId: string,
): { ok: boolean; reason?: string } {
  if (state.phase !== 'COMBAT' || state.activePlayerId !== playerId) {
    return { ok: false, reason: 'Solo puedes ejecutar ataques durante tu Fase de Combate.' };
  }
  const player = state.players[playerId];
  const active = player.active;
  if (!active) return { ok: false, reason: 'No tienes personaje activo.' };

  if (active.statuses.stunned) {
    return {
      ok: false,
      reason: `${getEffectiveCharacterProfile(active).name} está Aturdido y no puede atacar.`,
    };
  }

  const found = getAvailableAttacks(active).find((a) => a.attack.id === attackId);
  if (!found) {
    return { ok: false, reason: 'El ataque seleccionado no está disponible para el personaje activo.' };
  }

  if (!canPayEnergyCost(active.attachedEnergies, found.attack.energyCost)) {
    return {
      ok: false,
      reason: `Energías insuficientes para usar ${found.attack.name}.`,
    };
  }

  // Enforce 1/turn on Za Warudo abilities
  const extraEffect = found.attack.specialEffects?.find(
    (e): e is Extract<typeof e, { kind: 'EXTRA_COMBAT_ACTIONS' }> =>
      e.kind === 'EXTRA_COMBAT_ACTIONS',
  );
  if (extraEffect && player.usedOncePerTurnKeys.includes(extraEffect.oncePerTurnKey)) {
    return {
      ok: false,
      reason: `${found.attack.name} solo se puede usar una vez por turno.`,
    };
  }

  return { ok: true };
}
