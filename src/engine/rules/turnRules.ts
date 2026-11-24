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
  getCharacterUnlockTurn,
  getEffectiveCharacterProfile,
  getMaxEnergyAttachmentsThisTurn,
  getMaxPlayableCharacterDg,
  isCharacterDgAllowedOnTurn,
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
import {
  healCharacter,
  triggerOnMoveToActiveAbility,
  triggerOpponentExtraDrawReaction,
} from '../effects/effectPipeline';
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
  const player = state.players[playerId];
  const opponentId = getOpponentId(playerId);
  const opponent = state.players[opponentId];

  // Erina Pendleton — AMOR FLAGRANTE: when Jonathan enters play while Erina is on bench, +10 HP & +10 next attack!
  if (
    profile.currentCardId === 'char-jonathan-joestar' &&
    player.bench.some(
      (b) =>
        b.instanceId !== inst.instanceId &&
        getEffectiveCharacterProfile(b).signatureAbility.id === 'FLAGRANT_LOVE_ERINA',
    )
  ) {
    inst.erinaHpBonus = (inst.erinaHpBonus ?? 0) + 10;
    inst.currentHp += 10;
    inst.erinaNextAttackBonus = true;
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId,
      abilityName: 'Amor Flagrante',
      message: `¡Amor Flagrante! Erina Pendleton anima a Jonathan Joestar desde la banca (+10 HP y +10 daño en su siguiente ataque).`,
    });
  }

  if (profile.signatureAbility.id === 'GERMAN_ELITE_DONOVAN') {
    const allyBoard = [...(player.active ? [player.active] : []), ...player.bench];
    const stroheim = allyBoard.find(
      (ch) => getEffectiveCharacterProfile(ch).currentCardId === 'char-rudol-von-stroheim',
    );
    if (stroheim) {
      stroheim.nextAttackDamageReduction = (stroheim.nextAttackDamageReduction ?? 0) + 20;
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId,
        abilityName: 'Élite Alemana',
        message: `¡Élite Alemana! Donovan protege a Rudol Von Stroheim (-20 de daño en el siguiente ataque que reciba).`,
      });
    }
  }

  if (profile.signatureAbility.id === 'MASS_MURDER_GRAY_FLY' && player.koEnemyLastTurn) {
    inst.grayFlyMassMurderBonus = true;
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId,
      abilityName: 'Asesinato en Masa',
      message: `¡Asesinato en Masa! ${profile.name} entra tras un KO del turno anterior (+20 de daño en su siguiente ataque).`,
    });
  }

  if (profile.signatureAbility.id === 'NARCISSISM_RUBBER_SOUL') {
    const enemyBenchCount = opponent.bench.length;
    if (enemyBenchCount > 0) {
      const bonusHp = enemyBenchCount * 10;
      inst.rubberSoulHpBonus = (inst.rubberSoulHpBonus ?? 0) + bonusHp;
      inst.currentHp += bonusHp;
      const newMax = computeEffectiveMaxHp(state, playerId, inst);
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId,
        abilityName: 'Narcisismo',
        message: `¡Narcisismo! ${profile.name} gana +${bonusHp} HP extra por los ${enemyBenchCount} personaje(s) en la banca enemiga (${inst.currentHp}/${newMax} HP).`,
      });
    }
  }

  if (profile.signatureAbility.id === 'MAGNETIC_ATTRACTION_MARIAH' && opponent.active) {
    let stolen = 0;
    const remaining: typeof opponent.active.attachedEnergies = [];
    for (const energy of opponent.active.attachedEnergies) {
      if (energy === 'COLORLESS' && stolen < 3) {
        inst.attachedEnergies.push('COLORLESS');
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
        message: `Mariah roba ${stolen} energía(s) Incolora(s) del rival y las une a sí misma.`,
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
  } else if (profile.signatureAbility.id === 'HAVE_A_DREAM_GIORNO') {
    const player = state.players[playerId];
    if (!player.giornoDreamUsed) {
      player.giornoDreamUsed = true;
      const otherBench = player.bench.filter((b) => b.instanceId !== inst.instanceId);
      if (otherBench.length === 1) {
        const target = otherBench[0]!;
        pushEvent(state, eventsOut, {
          type: 'ABILITY_TRIGGERED',
          playerId,
          abilityName: 'I, Giorno Giovanna, Have a Dream',
          message: `Giorno Giovanna activa I, Giorno Giovanna, Have a Dream y cura 20 HP a ${getEffectiveCharacterProfile(target).name} en banca.`,
        });
        healCharacter(
          state,
          eventsOut,
          playerId,
          target.instanceId,
          20,
          'I, Giorno Giovanna, Have a Dream',
        );
      } else if (otherBench.length > 1) {
        pushEvent(state, eventsOut, {
          type: 'ABILITY_TRIGGERED',
          playerId,
          abilityName: 'I, Giorno Giovanna, Have a Dream',
          message: `Giorno Giovanna activa I, Giorno Giovanna, Have a Dream: elige un aliado en banca para curarle 20 HP.`,
        });
        enqueuePrompt(state, {
          kind: 'CHOOSE_ALLY_BENCH_HEAL',
          playerId,
          eligibleInstanceIds: otherBench.map((b) => b.instanceId),
          healAmount: 20,
          sourceLabel: 'I, Giorno Giovanna, Have a Dream',
        });
      }
    }
  } else if (profile.signatureAbility.id === 'PRECOGNITION_TONPETTY') {
    const ownTopCards = player.deck.slice(0, 3);
    const opponentTopCards = opponent.deck.slice(0, 3);
    if (ownTopCards.length > 0 || opponentTopCards.length > 0) {
      enqueuePrompt(state, {
        kind: 'PEEK_TOP_DECK',
        playerId,
        ownTopCards,
        opponentTopCards,
        sourceLabel: 'Precognición',
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

export function getCompatibleDeckStandsForCharacter(
  state: GameState,
  playerId: PlayerId,
  character: CharacterInstance,
): string[] {
  const player = state.players[playerId];
  const eligible: string[] = [];
  for (const cid of player.deck) {
    const stand = getStandCard(cid);
    if (!stand) continue;
    if (isStandCompatibleWithCharacter(stand, character).ok && !eligible.includes(stand.id)) {
      eligible.push(stand.id);
    }
  }
  return eligible;
}

export function validateSummonStandFromDeck(
  state: GameState,
  playerId: PlayerId,
  targetInstanceId: string,
  standCardId?: string,
): { ok: boolean; reason?: string } {
  if (state.phase !== 'PREPARATION' || state.activePlayerId !== playerId) {
    return { ok: false, reason: 'Solo puedes usar Llamada de Stand en tu Fase de Preparación.' };
  }
  const player = state.players[playerId];
  if (player.usedOncePerTurnKeys.includes('SUMMON_STAND_FROM_DECK')) {
    return { ok: false, reason: 'Ya usaste Llamada de Stand este turno (máx. 1 por turno).' };
  }
  const target = findCharacterOnBoard(state, playerId, targetInstanceId);
  if (!target) {
    return { ok: false, reason: 'El Usuario de Stand objetivo debe estar en tu campo.' };
  }
  const eligible = getCompatibleDeckStandsForCharacter(state, playerId, target.character);
  if (eligible.length === 0) {
    return { ok: false, reason: 'No tienes ningún Stand compatible en tu mazo para este usuario.' };
  }
  if (standCardId && !eligible.includes(standCardId)) {
    return { ok: false, reason: 'El Stand seleccionado no es compatible o no está en tu mazo.' };
  }
  return { ok: true };
}

export function attachSummonedStandFromDeck(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  targetInstanceId: string,
  standCardId: string,
  rng: RngProvider,
): void {
  const player = state.players[playerId];
  const deckIdx = player.deck.indexOf(standCardId);
  if (deckIdx === -1) return;
  const target = findCharacterOnBoard(state, playerId, targetInstanceId);
  if (!target) return;
  const standCard = getStandCard(standCardId);
  if (!standCard) return;

  player.deck.splice(deckIdx, 1);
  player.deck = rng.shuffle(player.deck);

  const character = target.character;
  const prevMax = computeEffectiveMaxHp(state, playerId, character);
  character.attachedStand = {
    instanceId: nextEntityId(state, 'std'),
    cardId: standCard.id,
    evolvedCardIds: [],
    permanentDamageBonus: 0,
    damageDebuff: 0,
  };
  const newMax = computeEffectiveMaxHp(state, playerId, character);
  if (newMax > prevMax) {
    character.currentHp += newMax - prevMax;
  }

  if (!player.usedOncePerTurnKeys.includes('SUMMON_STAND_FROM_DECK')) {
    player.usedOncePerTurnKeys.push('SUMMON_STAND_FROM_DECK');
  }

  const charProfile = getEffectiveCharacterProfile(character);
  const zoneLabel = target.zone === 'ACTIVE' ? 'Puesto Activo' : 'Banca';
  pushEvent(state, eventsOut, {
    type: 'STAND_EQUIPPED',
    playerId,
    standCardId: standCard.id,
    characterCardId: charProfile.currentCardId,
    message: `¡Llamada de Stand! ${player.name} invoca a ${standCard.name} desde su mazo en ${charProfile.name} (${zoneLabel}).`,
  });
}

export function applySummonStandFromDeck(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  targetInstanceId: string,
  rng: RngProvider,
): void {
  const target = findCharacterOnBoard(state, playerId, targetInstanceId)!;
  const eligible = getCompatibleDeckStandsForCharacter(state, playerId, target.character);
  if (eligible.length === 0) return;

  // Pick a random compatible Stand from the deck and auto-bind it to the chosen User
  const pickedIdx = Math.min(eligible.length - 1, Math.floor(rng.nextFloat() * eligible.length));
  const pickedStandId = eligible[pickedIdx]!;

  attachSummonedStandFromDeck(state, eventsOut, playerId, targetInstanceId, pickedStandId, rng);

  // Rulebook: Llamada de Stand consumes the main action and immediately ends the turn (like bench actions)
  finishTurnToEndPhase(state, eventsOut, rng);
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
  const energyCard = cardId ? getEnergyCard(cardId) : undefined;
  if (!energyCard) {
    return { ok: false, reason: 'La carta seleccionada no es una carta de Energía.' };
  }
  const target = findCharacterOnBoard(state, playerId, targetInstanceId);
  if (!target) {
    return { ok: false, reason: 'El personaje objetivo no está en tu campo.' };
  }
  if (
    energyCard.energyType === 'STAND' &&
    !getEffectiveCharacterProfile(target.character).categories.includes('STAND_USER')
  ) {
    return {
      ok: false,
      reason: 'Energía de Stand solo puede unirse a Usuarios de Stand.',
    };
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
  if (
    state.rules.maxItemsPerTurn !== null &&
    player.itemsPlayedThisTurn >= state.rules.maxItemsPerTurn
  ) {
    return {
      ok: false,
      reason: `Solo puedes usar ${state.rules.maxItemsPerTurn} objeto(s) por turno.`,
    };
  }
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

  // Dual-mode item (¡Estilo de combate de Ogre Street!): standalone (!targetInstanceId) searches deck (fizzles cleanly if none)
  const hasDualModeSearch =
    item.itemKind === 'EQUIPPABLE' && item.effects.some((e) => e.kind === 'SEARCH_DECK');
  if (hasDualModeSearch && !targetInstanceId) {
    return { ok: true };
  }

  if (item.targetScope === 'ACTIVE_ALLY') {
    if (!player.active) return { ok: false, reason: 'No tienes personaje activo.' };
    if (targetInstanceId && targetInstanceId !== player.active.instanceId) {
      return { ok: false, reason: `${item.name} solo puede usarse en tu Personaje Activo.` };
    }
    if (
      item.itemKind === 'EQUIPPABLE' &&
      player.active.attachedItems.some((it) => it.cardId === item.id)
    ) {
      const prof = getEffectiveCharacterProfile(player.active);
      return {
        ok: false,
        reason: `${prof.name} ya tiene equipado ${item.name} (máximo 1 de cada objeto por personaje).`,
      };
    }
  } else if (item.targetScope === 'ANY_ALLY') {
    const resolvedTarget = targetInstanceId ?? player.active?.instanceId;
    const foundTarget = resolvedTarget ? findCharacterOnBoard(state, playerId, resolvedTarget) : null;
    if (!foundTarget) {
      return { ok: false, reason: 'Selecciona un personaje aliado válido en el campo.' };
    }
    if (
      item.itemKind === 'EQUIPPABLE' &&
      foundTarget.character.attachedItems.some((it) => it.cardId === item.id)
    ) {
      const prof = getEffectiveCharacterProfile(foundTarget.character);
      return {
        ok: false,
        reason: `${prof.name} ya tiene equipado ${item.name} (máximo 1 de cada objeto por personaje).`,
      };
    }
  }

  // Validate item-specific requirements (search targets / bench swap)
  for (const eff of item.effects) {
    if (eff.kind === 'SEARCH_DECK') {
      // If an equippable dual-mode item is being equipped onto a character, skip deck search validation
      if (item.itemKind === 'EQUIPPABLE' && targetInstanceId) continue;
      const hasMatch = player.deck.some((id) => {
        const c = getCardById(id);
        if (!c) return false;
        if (eff.filter === 'ENERGY') return c.type === 'ENERGY';
        if (eff.filter === 'STAND') return c.type === 'STAND';
        if (eff.filter === 'STAND_EVOLUTION') {
          return c.type === 'EVOLUTION' && c.evolutionTarget === 'STAND';
        }
        if (eff.filter === 'CONVENTIONAL_FIGHTER') {
          return c.type === 'CHARACTER' && c.categories.includes('CONVENTIONAL_FIGHTER');
        }
        if (eff.filter === 'HAMON_USER') {
          return c.type === 'CHARACTER' && c.categories.includes('HAMON_USER');
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
                  : eff.filter === 'CONVENTIONAL_FIGHTER'
                    ? 'No quedan Luchadores Convencionales en tu mazo.'
                    : eff.filter === 'HAMON_USER'
                      ? 'No quedan Usuarios de Hamon en tu mazo.'
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
      if (player.active.retreatLockedUntilEndOfTurn) {
        return {
          ok: false,
          reason: `${getEffectiveCharacterProfile(player.active).name} está encerrado por Ataúd de DIO y no puede bajar a la banca este turno.`,
        };
      }
    } else if (eff.kind === 'STUN_AND_LOCK_RETREAT_ENEMY_ACTIVE') {
      const opponent = state.players[getOpponentId(playerId)];
      if (!opponent.active) {
        return { ok: false, reason: 'El oponente no tiene un personaje activo.' };
      }
    } else if (eff.kind === 'NEXT_ATTACK_DAMAGE_BONUS') {
      if (!player.active) {
        return { ok: false, reason: 'Necesitas tener un personaje activo en el campo.' };
      }
    } else if (eff.kind === 'DISCARD_ENEMY_EQUIPPED_ITEM_AND_DRAW') {
      const opponent = state.players[getOpponentId(playerId)];
      const enemyChars = [...(opponent.active ? [opponent.active] : []), ...opponent.bench];
      const hasEquipped = enemyChars.some((ch) => ch.attachedItems.length > 0);
      if (!hasEquipped) {
        return { ok: false, reason: 'El oponente no tiene ningún objeto equipado en el campo.' };
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
  player.itemsPlayedThisTurn += 1;

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

  // Dual-mode equippable + search item (¡Estilo de combate de Ogre Street!) played standalone (!targetInstanceId)
  const standaloneSearchEff =
    item.itemKind === 'EQUIPPABLE' && !targetInstanceId
      ? item.effects.find(
          (e): e is Extract<typeof e, { kind: 'SEARCH_DECK' }> => e.kind === 'SEARCH_DECK',
        )
      : undefined;
  if (standaloneSearchEff) {
    const hasMatch = player.deck.some((id) => {
      const c = getCardById(id);
      if (!c) return false;
      if (standaloneSearchEff.filter === 'CONVENTIONAL_FIGHTER') {
        return c.type === 'CHARACTER' && c.categories.includes('CONVENTIONAL_FIGHTER');
      }
      if (standaloneSearchEff.filter === 'HAMON_USER') {
        return c.type === 'CHARACTER' && c.categories.includes('HAMON_USER');
      }
      if (standaloneSearchEff.filter === 'ENERGY') return c.type === 'ENERGY';
      if (standaloneSearchEff.filter === 'STAND') return c.type === 'STAND';
      if (standaloneSearchEff.filter === 'STAND_EVOLUTION') {
        return c.type === 'EVOLUTION' && c.evolutionTarget === 'STAND';
      }
      return c.type === 'CHARACTER' || c.type === 'STAND';
    });
    if (hasMatch) {
      enqueuePrompt(state, {
        kind: 'SEARCH_DECK_CARDS',
        playerId,
        filter: standaloneSearchEff.filter,
        maxPickCount: standaloneSearchEff.maxCount,
        sourceLabel: item.name,
      });
    } else {
      const targetLabel =
        standaloneSearchEff.filter === 'HAMON_USER'
          ? 'Usuarios de Hamon'
          : 'Luchadores Convencionales';
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId,
        abilityName: item.name,
        message: `${item.name}: no hay ${targetLabel} en el mazo de ${player.name}, la carta no tiene efecto.`,
      });
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
      healCharacter(
        state,
        eventsOut,
        playerId,
        target.character.instanceId,
        newMax - prevMax,
        item.name,
      );
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
    } else if (eff.kind === 'STUN_AND_LOCK_RETREAT_ENEMY_ACTIVE') {
      const opponentId = getOpponentId(playerId);
      const opponent = state.players[opponentId];
      if (opponent.active) {
        tryApplyElementalStatus(
          state,
          eventsOut,
          opponentId,
          opponent.active.instanceId,
          'STUNNED',
          item.name,
        );
        opponent.active.retreatLockedUntilEndOfTurn = true;
        pushEvent(state, eventsOut, {
          type: 'ABILITY_TRIGGERED',
          playerId,
          abilityName: item.name,
          message: `¡${item.name}! ${getEffectiveCharacterProfile(opponent.active).name} no podrá retirarse a la banca durante su próximo turno.`,
        });
      }
    } else if (eff.kind === 'NEXT_ATTACK_DAMAGE_BONUS') {
      player.pendingNextAttackBonus += eff.bonusDamage;
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId,
        abilityName: item.name,
        message: `¡${item.name}! El siguiente ataque de tu personaje o Stand activo inflige +${eff.bonusDamage} puntos de daño extra.`,
      });
    } else if (eff.kind === 'DISCARD_ENEMY_EQUIPPED_ITEM_AND_DRAW') {
      const opponentId = getOpponentId(playerId);
      const opponent = state.players[opponentId];
      const enemyChars = [...(opponent.active ? [opponent.active] : []), ...opponent.bench];
      const equippedEntries: { char: CharacterInstance; itemIdx: number; cardId: string }[] = [];
      for (const ch of enemyChars) {
        ch.attachedItems.forEach((it, idx) => {
          equippedEntries.push({ char: ch, itemIdx: idx, cardId: it.cardId });
        });
      }
      if (equippedEntries.length === 1) {
        const only = equippedEntries[0]!;
        only.char.attachedItems.splice(only.itemIdx, 1);
        opponent.discard.push(only.cardId);
        const newMax = computeEffectiveMaxHp(state, opponentId, only.char);
        if (only.char.currentHp > newMax) only.char.currentHp = newMax;
        const removedName = getCardById(only.cardId)?.name ?? only.cardId;
        const charName = getEffectiveCharacterProfile(only.char).name;
        pushEvent(state, eventsOut, {
          type: 'ABILITY_TRIGGERED',
          playerId,
          abilityName: item.name,
          message: `¡${item.name}! Descarta ${removedName} equipado en ${charName}.`,
        });
        let drawnCount = 0;
        for (let i = 0; i < eff.drawCount; i++) {
          if (player.deck.length === 0 && checkImmediateDeckOut(state, eventsOut, playerId)) break;
          if (player.deck.length === 0) break;
          player.hand.push(player.deck.shift()!);
          drawnCount++;
        }
        if (drawnCount > 0) {
          pushEvent(state, eventsOut, {
            type: 'CARD_DRAWN',
            playerId,
            count: drawnCount,
            message: `${player.name} roba ${drawnCount} carta(s) gracias a ${item.name}.`,
          });
          checkImmediateDeckOut(state, eventsOut, playerId);
          triggerOpponentExtraDrawReaction(state, eventsOut, playerId);
        }
      } else if (equippedEntries.length > 1) {
        enqueuePrompt(state, {
          kind: 'CHOOSE_ENEMY_EQUIPPED_ITEM',
          playerId,
          targetPlayerId: opponentId,
          drawCount: eff.drawCount,
          sourceLabel: item.name,
        });
      }
    } else if (eff.kind === 'DRAW_CARDS') {
      let drawnCount = 0;
      for (let i = 0; i < eff.count; i++) {
        if (player.deck.length === 0 && checkImmediateDeckOut(state, eventsOut, playerId)) break;
        if (player.deck.length === 0) break;
        player.hand.push(player.deck.shift()!);
        drawnCount++;
      }
      if (drawnCount > 0) {
        pushEvent(state, eventsOut, {
          type: 'CARD_DRAWN',
          playerId,
          count: drawnCount,
          message: `${player.name} roba ${drawnCount} carta(s) gracias a ${item.name}.`,
        });
        checkImmediateDeckOut(state, eventsOut, playerId);
        triggerOpponentExtraDrawReaction(state, eventsOut, playerId);
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
        triggerOnMoveToActiveAbility(state, eventsOut, playerId, incoming, outgoing);
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

  // Consume any required bench Stands (e.g. Stray Cat for Bites The Dust): user stays on bench without Stand
  const consumedStandNotes: string[] = [];
  for (const benchIdx of reqCheck.consumedBenchStandIndices) {
    const benchUser = player.bench[benchIdx];
    if (benchUser && benchUser.attachedStand) {
      const consumedStand = benchUser.attachedStand;
      const standName = getStandCard(consumedStand.cardId)?.name ?? consumedStand.cardId;
      const userName = getEffectiveCharacterProfile(benchUser).name;
      player.discard.push(consumedStand.cardId, ...consumedStand.evolvedCardIds);
      benchUser.attachedStand = null;
      consumedStandNotes.push(`${standName} se consume y ${userName} queda sin Stand`);
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
    message: `¡EVOLUCIÓN! ${player.name} evoluciona a ${evo.name}.${
      consumedStandNotes.length > 0 ? ` (${consumedStandNotes.join('; ')}).` : ''
    }`,
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
      if (drawn > 0) {
        triggerOpponentExtraDrawReaction(state, eventsOut, playerId);
      }
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
  // Stand Users of any DG can be placed on the Bench from Turn 1 to prepare their Stand/Energy
  if (
    !card.categories.includes('STAND_USER') &&
    !isCharacterDgAllowedOnTurn(card.dg, state.turnNumber)
  ) {
    const unlockTurn = getCharacterUnlockTurn(card.dg);
    const maxNow = getMaxPlayableCharacterDg(state.turnNumber);
    return {
      ok: false,
      reason: `${card.name} (DG ${card.dg}) se desbloquea en el Turno ${unlockTurn} (límite en Turno ${state.turnNumber}: DG ${maxNow}).`,
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
  if (player.active.retreatLockedUntilEndOfTurn) {
    return {
      ok: false,
      reason: `${getEffectiveCharacterProfile(player.active).name} está encerrado por Ataúd de DIO y no puede bajar a la banca este turno.`,
    };
  }
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
  triggerOnMoveToActiveAbility(state, eventsOut, playerId, incoming, outgoing);

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
  if (state.turnNumber === 1 && !active.attachedStand) {
    return {
      ok: false,
      reason:
        'Los personajes sin Stand no pueden atacar en el Turno 1 (solo un Usuario con Stand equipado puede atacar en T1 si sale 2.º).',
    };
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

  if (!canPayEnergyCost(active.attachedEnergies, found.attack.energyCost, found.source)) {
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
