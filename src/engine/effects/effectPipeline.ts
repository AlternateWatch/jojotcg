import { getItemCard } from '../../data/cardRegistry';
import type { AttackDef, EnergyType } from '../../data/schemas/cardTypes';
import {
  computeEffectiveMaxHp,
  getAttackNominalMaxDamage,
  getAvailableAttacks,
  getEffectiveCharacterProfile,
  getEffectiveStandProfile,
} from '../helpers/cardStats';
import {
  checkImmediateDeckOut,
  enqueuePrompt,
  findCharacterOnBoard,
  getOpponentId,
  isGameOver,
  pushEvent,
  setGameOver,
} from '../helpers/stateHelpers';
import type { RngProvider } from '../rng';
import { cleanseBurn } from '../statuses/statusSystem';
import type { CombatEvent } from '../types/events';
import type { CharacterInstance, GameState, PlayerId } from '../types/state';

export interface DamageParams {
  targetPlayerId: PlayerId;
  targetInstanceId: string;
  amount: number;
  source: 'ATTACK' | 'BLEED' | 'BURN' | 'RECOIL' | 'COUNTER' | 'BENCH';
  attackerPlayerId?: PlayerId;
  attackEnergies?: readonly EnergyType[];
  rng: RngProvider;
  /** When true, skips Wind Sense / Dodge check (e.g. secondary ticks) */
  ignoreDodge?: boolean;
}

export interface DamageResult {
  dodged: boolean;
  immune: boolean;
  finalDamage: number;
  koTriggered: boolean;
}

export function computeAttackDamageBonus(
  state: GameState,
  attackerPlayerId: PlayerId,
  attackerInst: CharacterInstance,
  attack: AttackDef,
  attackSource: 'CHARACTER' | 'STAND',
): {
  bonus: number;
  consumedHotBlood: boolean;
  consumedLuckyShot: boolean;
  consumedLastHamon: boolean;
  consumedErinaLove: boolean;
} {
  const player = state.players[attackerPlayerId];
  const opponent = state.players[getOpponentId(attackerPlayerId)];
  const profile = getEffectiveCharacterProfile(attackerInst);

  let bonus = 0;
  let consumedHotBlood = false;
  let consumedLuckyShot = false;
  let consumedLastHamon = false;
  let consumedErinaLove = false;

  // 1. Bench Hamon Masters (Will A. Zeppeli & Lisa Lisa): +20 each for HAMON_USER attacks
  if (profile.categories.includes('HAMON_USER')) {
    for (const benchChar of player.bench) {
      const benchProfile = getEffectiveCharacterProfile(benchChar);
      if (benchProfile.signatureAbility.id === 'HAMON_MASTER_BENCH') {
        bonus += 20;
      }
    }
  }

  // 2. Stand-specific user & bench synergies
  if (attackSource === 'STAND' && attackerInst.attachedStand) {
    // Permanent Stand buffs (RHCP Absorción de Energía, Silver Chariot Fuera la Armadura)
    bonus += attackerInst.attachedStand.permanentDamageBonus;
    // Heaven's Door Safety Lock debuff
    bonus -= attackerInst.attachedStand.damageDebuff;

    // Yukako + Koichi on bench: +10
    if (
      profile.signatureAbility.id === 'HE_IS_MINE_YUKAKO' &&
      player.bench.some((b) => getEffectiveCharacterProfile(b).currentCardId === 'char-koichi-hirose')
    ) {
      bonus += 10;
    }

    // Iggy + Polnareff on bench: +10
    if (
      profile.signatureAbility.id === 'HATE_POLNAREFF_IGGY' &&
      player.bench.some(
        (b) => getEffectiveCharacterProfile(b).currentCardId === 'char-jean-pierre-polnareff',
      )
    ) {
      bonus += 10;
    }

    // Yoshikage Kira + Killer Queen: +10
    if (
      profile.signatureAbility.id === 'QUIET_LIFE_KIRA' &&
      (attackerInst.attachedStand.cardId === 'stand-killer-queen' ||
        getEffectiveStandProfile(attackerInst.attachedStand).currentCardId === 'stand-killer-queen')
    ) {
      bonus += 10;
    }

    // DIO Furia Vampírica: when HP <= 30, +20 to active Stand attacks
    if (profile.signatureAbility.id === 'VAMPIRE_FURY_DIO' && attackerInst.currentHp <= 30) {
      bonus += 20;
    }

    // Josuke Hair Rage: permanent +10 once HP reached <= 60
    if (profile.signatureAbility.id === 'HAIR_RAGE_JOSUKE' && attackerInst.hairRageTriggered) {
      bonus += 10;
    }

    // Old Joseph — Oh My God: +20 if own Stand's strongest attack < enemy's strongest attack
    if (profile.signatureAbility.id === 'OH_MY_GOD_OLD_JOSEPH' && opponent.active) {
      const ownStandAttacks = getEffectiveStandProfile(attackerInst.attachedStand).attacks;
      const ownMax = Math.max(0, ...ownStandAttacks.map(getAttackNominalMaxDamage));
      const enemyMax = Math.max(
        0,
        ...getAvailableAttacks(opponent.active).map((a) => getAttackNominalMaxDamage(a.attack)),
      );
      if (ownMax < enemyMax) {
        bonus += 20;
      }
    }

    // Hol Horse — Lucky Shot: +40 on very first Stand attack
    if (profile.signatureAbility.id === 'LUCKY_SHOT_HOL_HORSE' && !attackerInst.luckyShotUsed) {
      bonus += 40;
      consumedLuckyShot = true;
    }
  }

  // 3. Esidisi — Sangre Caliente: +20 on next attack after taking damage
  if (profile.signatureAbility.id === 'HOT_BLOOD_ESIDISI' && attackerInst.hotBloodBonusReady) {
    bonus += 20;
    consumedHotBlood = true;
  }

  // 4. Caesar Zeppeli — El Último Hamon pending bonus (+40)
  if (player.pendingNextAttackBonus > 0) {
    bonus += player.pendingNextAttackBonus;
    consumedLastHamon = true;
  }
  if (attackerInst.erinaNextAttackBonus) {
    bonus += 10;
    consumedErinaLove = true;
  }

  // 5. Horus — Caída de las Temperaturas (+10 per stack to WATER attacks)
  if (player.permanentWaterAttackBonus > 0 && attack.energyCost.includes('WATER')) {
    bonus += player.permanentWaterAttackBonus;
  }

  // 6. Equippable Item bonuses (e.g., Máscara de Piedra, (P)luck +10; Clackers +20 for Hamon users)
  for (const item of attackerInst.attachedItems) {
    const itemCard = getItemCard(item.cardId);
    if (!itemCard) continue;
    for (const eff of itemCard.effects) {
      if (eff.kind === 'EQUIP_PASSIVE_DAMAGE_BONUS') {
        bonus += eff.bonusDamage;
      } else if (
        eff.kind === 'EQUIP_PASSIVE_CATEGORY_DAMAGE_BONUS' &&
        profile.categories.includes(eff.category)
      ) {
        bonus += eff.bonusDamage;
      } else if (
        eff.kind === 'EQUIP_PASSIVE_ELEMENT_BONUS' &&
        attack.energyCost.includes(eff.energy)
      ) {
        bonus += eff.bonusDamage;
      }
    }
  }

  return { bonus, consumedHotBlood, consumedLuckyShot, consumedLastHamon, consumedErinaLove };
}

export function healCharacter(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  instanceId: string,
  amount: number,
  sourceLabel: string,
): number {
  const found = findCharacterOnBoard(state, playerId, instanceId);
  if (!found || amount <= 0) return 0;

  const { character } = found;
  const maxHp = computeEffectiveMaxHp(state, playerId, character);
  const prevHp = character.currentHp;

  // Preserve over-max HP from Soul Swap; otherwise cap at effectiveMaxHp
  const nextHp = prevHp >= maxHp ? prevHp : Math.min(maxHp, prevHp + amount);
  const actualHeal = nextHp - prevHp;
  character.currentHp = nextHp;

  const profile = getEffectiveCharacterProfile(character);
  pushEvent(state, eventsOut, {
    type: 'HEALED',
    targetPlayerId: playerId,
    targetInstanceId: instanceId,
    amount: actualHeal,
    message: `${profile.name} recibe curación (${sourceLabel}: +${actualHeal} HP, actual ${character.currentHp}/${maxHp}).`,
  });

  // Rulebook: ANY healing effect immediately removes Burn
  cleanseBurn(state, eventsOut, playerId, instanceId, `curación por ${sourceLabel}`);

  return actualHeal;
}

/**
 * Bruno Bucciarati — DETECCIÓN DE MENTIRAS:
 * While Bucciarati is in the Active slot, whenever the opponent draws extra card(s)
 * via any item/ability/search method (excluding the mandatory start-of-turn draw),
 * Bucciarati's controller draws 1 card as well (without chaining into another Bucciarati).
 */
export function triggerOpponentExtraDrawReaction(
  state: GameState,
  eventsOut: CombatEvent[],
  drawingPlayerId: PlayerId,
): void {
  if (isGameOver(state)) return;
  const reactorId = getOpponentId(drawingPlayerId);
  const reactor = state.players[reactorId];
  if (!reactor.active) return;

  const activeProfile = getEffectiveCharacterProfile(reactor.active);
  if (activeProfile.signatureAbility.id !== 'LIE_DETECTION_BUCCIARATI') return;
  if (reactor.deck.length === 0) return;

  const drawn = reactor.deck.shift()!;
  reactor.hand.push(drawn);
  pushEvent(state, eventsOut, {
    type: 'ABILITY_TRIGGERED',
    playerId: reactorId,
    abilityName: 'Detección de Mentiras',
    message: `¡Detección de Mentiras! Bruno Bucciarati detecta el robo extra rival y ${reactor.name} roba 1 carta.`,
  });
  pushEvent(state, eventsOut, {
    type: 'CARD_DRAWN',
    playerId: reactorId,
    count: 1,
    message: `${reactor.name} roba 1 carta gracias a Detección de Mentiras.`,
  });
  checkImmediateDeckOut(state, eventsOut, reactorId);
}

export function handleCharacterKo(
  state: GameState,
  eventsOut: CombatEvent[],
  ownerPlayerId: PlayerId,
  instanceId: string,
  killerPlayerId: PlayerId | null,
  reason: string,
  rng: RngProvider,
): boolean {
  const found = findCharacterOnBoard(state, ownerPlayerId, instanceId);
  if (!found) return false;

  const { character, zone, benchIndex } = found;
  const profile = getEffectiveCharacterProfile(character);

  // 1. Kars — Intelecto Superior: saves from ANY KO type once per life/match!
  if (
    profile.signatureAbility.id === 'SUPERIOR_INTELLECT_KARS' &&
    !character.superiorIntellectUsed
  ) {
    character.superiorIntellectUsed = true;
    character.currentHp = 1;
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId: ownerPlayerId,
      abilityName: 'Intelecto Superior',
      message: `¡Intelecto Superior! ${profile.name} evita ser eliminado (${reason}) y permanece con 1 HP.`,
    });
    return false;
  }

  const owner = state.players[ownerPlayerId];
  const killer = killerPlayerId ? state.players[killerPlayerId] : null;
  const killerActiveProfile = killer?.active
    ? getEffectiveCharacterProfile(killer.active)
    : null;

  // 2. Remove from board
  if (zone === 'ACTIVE') {
    owner.active = null;
  } else {
    owner.bench.splice(benchIndex, 1);
  }

  // 3. Dispose attached Stand & Energies to owner's discard (reviving later starts without Stand)
  if (character.attachedStand) {
    owner.discard.push(character.attachedStand.cardId);
    for (const evoId of character.attachedStand.evolvedCardIds) {
      owner.discard.push(evoId);
    }
  }
  for (const energy of character.attachedEnergies) {
    owner.discard.push(`energy-${energy.toLowerCase()}`);
  }

  // 4. Attached Items: Kosaku Kawajiri ("No Quedará Nada...") steals them to killer's hand!
  if (
    character.attachedItems.length > 0 &&
    killer &&
    killerActiveProfile?.signatureAbility.id === 'NOTHING_WILL_REMAIN_KOSAKU' &&
    killerPlayerId !== ownerPlayerId
  ) {
    for (const item of character.attachedItems) {
      killer.hand.push(item.cardId);
    }
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId: killer.id,
      abilityName: 'No Quedará Nada...',
      message: `Kosaku Kawajiri roba ${character.attachedItems.length} objeto(s) equipado(s) de ${profile.name} a su mano.`,
    });
  } else {
    for (const item of character.attachedItems) {
      owner.discard.push(item.cardId);
    }
  }

  // 5. Character card destination: Jonathan Joestar ("Adiós... Erina") returns to deck!
  if (profile.signatureAbility.id === 'ADIOS_ERINA') {
    owner.deck.push(character.cardId);
    owner.deck = rng.shuffle(owner.deck);
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId: ownerPlayerId,
      abilityName: 'Adiós... Erina',
      message: `${profile.name} regresa al mazo de ${owner.name} en lugar de ir a descartes.`,
    });
  } else {
    owner.discard.push(character.cardId);
    for (const evoId of character.evolvedCardIds) {
      owner.discard.push(evoId);
    }
  }

  // 6. Caesar Zeppeli ("El Último Hamon"): +40 to next attack
  if (profile.signatureAbility.id === 'LAST_HAMON_CAESAR') {
    owner.pendingNextAttackBonus += 40;
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId: ownerPlayerId,
      abilityName: 'El Último Hamon',
      message: `¡El Último Hamon! El siguiente ataque de ${owner.name} infligirá +40 de daño.`,
    });
  }

  pushEvent(state, eventsOut, {
    type: 'CHARACTER_KO',
    ownerPlayerId,
    cardId: profile.currentCardId,
    reason,
    message: `${profile.name} de ${owner.name} ha sido eliminado (${reason}).`,
  });

  // 7. Prize Card award: opponent takes 1 face-down Prize Card into their hand; taking the last Prize Card wins!
  const prizeWinnerId = getOpponentId(ownerPlayerId);
  const prizeWinner = state.players[prizeWinnerId];
  if (prizeWinner.prizeCards.length > 0) {
    const takenPrizeId = prizeWinner.prizeCards.shift()!;
    prizeWinner.hand.push(takenPrizeId);
    pushEvent(state, eventsOut, {
      type: 'CARD_DRAWN',
      playerId: prizeWinnerId,
      count: 1,
      message: `¡Carta de Premio! ${prizeWinner.name} roba 1 carta de sus premios (${prizeWinner.prizeCards.length} restante(s)).`,
    });
    if (prizeWinner.prizeCards.length === 0) {
      setGameOver(
        state,
        eventsOut,
        prizeWinnerId,
        `¡${prizeWinner.name} ha robado todas sus Cartas de Premio!`,
      );
      return true;
    }
  }

  // 8. If Active was KO'd, check promotion or Game Over
  if (zone === 'ACTIVE') {
    if (owner.bench.length === 0) {
      setGameOver(
        state,
        eventsOut,
        getOpponentId(ownerPlayerId),
        `${owner.name} se ha quedado sin personajes en el campo.`,
      );
    } else if (owner.bench.length === 1) {
      // Auto-promote the sole bench character cleanly (still clears Burn on promote!)
      const promoted = owner.bench.splice(0, 1)[0]!;
      owner.active = promoted;
      const promotedProfile = getEffectiveCharacterProfile(promoted);
      pushEvent(state, eventsOut, {
        type: 'BENCH_SWAP',
        playerId: ownerPlayerId,
        newActiveCardId: promotedProfile.currentCardId,
        endedTurn: false,
        message: `${promotedProfile.name} sube automáticamente al Puesto Activo.`,
      });
      cleanseBurn(state, eventsOut, ownerPlayerId, promoted.instanceId, 'promoción al Puesto Activo');
    } else {
      enqueuePrompt(state, {
        kind: 'PROMOTE_FROM_BENCH',
        playerId: ownerPlayerId,
        reason: `${profile.name} fue eliminado. Elige un personaje de la banca para el Puesto Activo.`,
      });
    }
  }

  return true;
}

export function dealDamageToCharacter(
  state: GameState,
  eventsOut: CombatEvent[],
  params: DamageParams,
): DamageResult {
  const found = findCharacterOnBoard(state, params.targetPlayerId, params.targetInstanceId);
  if (!found) {
    return { dodged: false, immune: false, finalDamage: 0, koTriggered: false };
  }

  const { character } = found;
  const profile = getEffectiveCharacterProfile(character);
  const isEnemyAttack = params.source === 'ATTACK' || params.source === 'BENCH';

  // 1. N'Doul — Control del Agua: immune to any attack requiring WATER energy
  if (
    isEnemyAttack &&
    profile.signatureAbility.id === 'WATER_CONTROL_NDOUL' &&
    params.attackEnergies?.includes('WATER')
  ) {
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId: params.targetPlayerId,
      abilityName: 'Control del Agua',
      message: `${profile.name} es inmune al ataque de agua gracias a Control del Agua.`,
    });
    return { dodged: false, immune: true, finalDamage: 0, koTriggered: false };
  }

  // 2. Wamuu — Sentido del Viento (dodges first attack once per life)
  if (
    isEnemyAttack &&
    !params.ignoreDodge &&
    profile.signatureAbility.id === 'WIND_SENSE_WAMUU' &&
    !character.windSenseUsed
  ) {
    character.windSenseUsed = true;
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId: params.targetPlayerId,
      abilityName: 'Sentido del Viento',
      message: `¡Sentido del Viento! ${profile.name} esquiva automáticamente el primer ataque.`,
    });
    return { dodged: true, immune: false, finalDamage: 0, koTriggered: false };
  }

  // 3. Cream — Invisibilidad del Vacío dodge flag
  if (isEnemyAttack && !params.ignoreDodge && character.dodgeNextAttack) {
    character.dodgeNextAttack = false;
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId: params.targetPlayerId,
      abilityName: 'Invisibilidad del Vacío',
      message: `${profile.name} esquiva el ataque oculto en el vacío de Cream.`,
    });
    return { dodged: true, immune: false, finalDamage: 0, koTriggered: false };
  }

  // 4. Rudol Von Stroheim — Tecnología Alemana Superior (-10 damage ONLY from attacks)
  let finalDamage = Math.max(0, params.amount);
  if (isEnemyAttack && profile.signatureAbility.id === 'GERMAN_TECHNOLOGY' && finalDamage > 0) {
    finalDamage = Math.max(0, finalDamage - 10);
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId: params.targetPlayerId,
      abilityName: 'Tecnología Alemana Superior',
      message: `${profile.name} reduce el daño del ataque en 10 puntos (daño final: ${finalDamage}).`,
    });
  }

  if (finalDamage <= 0) {
    return { dodged: false, immune: false, finalDamage: 0, koTriggered: false };
  }

  character.currentHp = Math.max(0, character.currentHp - finalDamage);
  character.tookDamageThisTurn = true;

  pushEvent(state, eventsOut, {
    type: 'DAMAGE_DEALT',
    targetPlayerId: params.targetPlayerId,
    targetInstanceId: params.targetInstanceId,
    targetCardId: profile.currentCardId,
    amount: finalDamage,
    source: params.source,
    message: `${profile.name} recibe ${finalDamage} de daño (HP restante: ${character.currentHp}).`,
  });

  // Trigger damage-reactive abilities if still alive (or before KO check for Esidisi/Josuke)
  if (character.currentHp > 0) {
    if (profile.signatureAbility.id === 'HOT_BLOOD_ESIDISI') {
      character.hotBloodBonusReady = true;
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId: params.targetPlayerId,
        abilityName: 'Sangre Caliente',
        message: `${profile.name} activa Sangre Caliente (+20 daño en su próximo ataque).`,
      });
    }

    if (
      profile.signatureAbility.id === 'HAIR_RAGE_JOSUKE' &&
      !character.hairRageTriggered &&
      character.currentHp <= 60
    ) {
      character.hairRageTriggered = true;
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId: params.targetPlayerId,
        abilityName: '¿Qué has dicho de mi peinado?',
        message: `¡${profile.name} enfurece! Su Stand obtiene +10 daño permanente.`,
      });
    }

    // Santana — Absorción de Cuerpo (on taking attack damage: deals 10 to attacker & heals 10)
    if (
      params.source === 'ATTACK' &&
      profile.signatureAbility.id === 'BODY_ABSORPTION_SANTANA' &&
      params.attackerPlayerId &&
      params.attackerPlayerId !== params.targetPlayerId
    ) {
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId: params.targetPlayerId,
        abilityName: 'Absorción de Cuerpo',
        message: `${profile.name} activa Absorción de Cuerpo: contraataca con 10 de daño y se cura 10 HP.`,
      });
      healCharacter(
        state,
        eventsOut,
        params.targetPlayerId,
        character.instanceId,
        10,
        'Absorción de Cuerpo',
      );
      const attackerActive = state.players[params.attackerPlayerId].active;
      if (attackerActive) {
        dealDamageToCharacter(state, eventsOut, {
          targetPlayerId: params.attackerPlayerId,
          targetInstanceId: attackerActive.instanceId,
          amount: 10,
          source: 'COUNTER',
          attackerPlayerId: params.targetPlayerId,
          rng: params.rng,
          ignoreDodge: true,
        });
      }
    }
  }

  let koTriggered = false;
  if (character.currentHp <= 0) {
    koTriggered = handleCharacterKo(
      state,
      eventsOut,
      params.targetPlayerId,
      character.instanceId,
      params.attackerPlayerId ?? null,
      params.source === 'BLEED'
        ? 'Sangrado letal'
        : params.source === 'BURN'
          ? 'Quemadura letal'
          : 'Daño letal',
      params.rng,
    );
  }

  return { dodged: false, immune: false, finalDamage, koTriggered };
}

/**
 * Resolves End of Turn effects for the player whose turn is ending:
 * 1. Bleed stacks (10 damage per stack; each stack ticks down independently from 3 -> 0)
 * 2. Burn (10 fixed damage)
 * 3. Vampire Regeneration (+10 HP if no damage taken this turn — cleanses Burn if healed)
 * 4. Clear Stunned status that affected this turn & reset turn flags
 */
export function resolveEndOfTurnEffects(
  state: GameState,
  eventsOut: CombatEvent[],
  endingPlayerId: PlayerId,
  rng: RngProvider,
): void {
  const player = state.players[endingPlayerId];
  const opponentId = getOpponentId(endingPlayerId);

  // Snapshot IDs currently on board because KOs may mutate active/bench
  const boardInstanceIds: string[] = [
    ...(player.active ? [player.active.instanceId] : []),
    ...player.bench.map((b) => b.instanceId),
  ];

  for (const instId of boardInstanceIds) {
    if (isGameOver(state)) return;
    const found = findCharacterOnBoard(state, endingPlayerId, instId);
    if (!found) continue;
    const { character } = found;
    const profile = getEffectiveCharacterProfile(character);

    // 1. Bleed stacks (independent 3-turn durations)
    if (character.statuses.bleedStacks.length > 0) {
      const totalBleed = character.statuses.bleedStacks.reduce(
        (sum, stack) => sum + stack.damagePerTurn,
        0,
      );
      // Decrement each stack and remove expired stacks
      character.statuses.bleedStacks = character.statuses.bleedStacks
        .map((s) => ({ ...s, turnsRemaining: s.turnsRemaining - 1 }))
        .filter((s) => s.turnsRemaining > 0);

      dealDamageToCharacter(state, eventsOut, {
        targetPlayerId: endingPlayerId,
        targetInstanceId: instId,
        amount: totalBleed,
        source: 'BLEED',
        attackerPlayerId: opponentId,
        rng,
        ignoreDodge: true,
      });

      if (isGameOver(state)) return;
      if (!findCharacterOnBoard(state, endingPlayerId, instId)) continue;
    }

    // 2. Burn (10 fixed damage at end of affected player's turn)
    if (character.statuses.burn?.active) {
      dealDamageToCharacter(state, eventsOut, {
        targetPlayerId: endingPlayerId,
        targetInstanceId: instId,
        amount: character.statuses.burn.damagePerTurn,
        source: 'BURN',
        attackerPlayerId: opponentId,
        rng,
        ignoreDodge: true,
      });

      if (isGameOver(state)) return;
      if (!findCharacterOnBoard(state, endingPlayerId, instId)) continue;
    }

    // 3. Vampire Regeneration (+10 HP if no damage taken this turn)
    if (
      (profile.signatureAbility.id === 'VAMPIRE_REGEN' ||
        profile.signatureAbility.id === 'VAMPIRE_FURY_DIO') &&
      !character.tookDamageThisTurn
    ) {
      const maxHp = computeEffectiveMaxHp(state, endingPlayerId, character);
      if (character.currentHp < maxHp) {
        healCharacter(
          state,
          eventsOut,
          endingPlayerId,
          instId,
          state.rules.vampireRegenAmount,
          profile.signatureAbility.name,
        );
      }
    }

    // 3b. Equipped end-of-turn draw if undamaged (Mechero de Polpo)
    if (!character.tookDamageThisTurn && character.attachedItems.length > 0) {
      for (const attached of character.attachedItems) {
        if (isGameOver(state)) return;
        const item = getItemCard(attached.cardId);
        if (!item) continue;
        for (const eff of item.effects) {
          if (eff.kind === 'EQUIP_END_TURN_DRAW_IF_UNDAMAGED' && player.deck.length > 0) {
            const drawnCount = Math.min(eff.count, player.deck.length);
            for (let d = 0; d < drawnCount; d++) {
              player.hand.push(player.deck.shift()!);
            }
            pushEvent(state, eventsOut, {
              type: 'ABILITY_TRIGGERED',
              playerId: endingPlayerId,
              abilityName: item.name,
              message: `${item.name} (${profile.name} ileso este turno): ${player.name} roba ${drawnCount} carta extra al final del turno.`,
            });
            pushEvent(state, eventsOut, {
              type: 'CARD_DRAWN',
              playerId: endingPlayerId,
              count: drawnCount,
              message: `${player.name} roba ${drawnCount} carta(s) gracias a ${item.name}.`,
            });
            checkImmediateDeckOut(state, eventsOut, endingPlayerId);
            if (!isGameOver(state)) {
              triggerOpponentExtraDrawReaction(state, eventsOut, endingPlayerId);
            }
          }
        }
      }
    }

    // 4. Clear Stunned after the affected player's turn ends (and grant 1-turn stun resistance)
    if (character.statuses.stunned) {
      character.statuses.stunned = false;
      if (state.rules.preventConsecutiveStun) {
        character.statuses.stunImmuneNextTurn = true;
      }
      pushEvent(state, eventsOut, {
        type: 'STATUS_CLEARED',
        targetPlayerId: endingPlayerId,
        targetInstanceId: instId,
        status: 'STUNNED',
        reason: 'fin del turno afectado',
        message: `${profile.name} ya no está Aturdido${
          state.rules.preventConsecutiveStun ? ' (inmune a Aturdido durante 1 turno)' : ''
        }.`,
      });
    } else if (character.statuses.stunImmuneNextTurn) {
      // Clear 1-turn stun resistance after completing a non-stunned turn
      character.statuses.stunImmuneNextTurn = false;
    }

    // Reset per-turn flags
    character.tookDamageThisTurn = false;
    character.usedPrepAbilityThisTurn = false;
    character.retreatLockedUntilEndOfTurn = false;
    if (
      character.attachedStand?.rapidReloadTurnsRemaining &&
      character.attachedStand.rapidReloadTurnsRemaining > 0
    ) {
      character.attachedStand.rapidReloadTurnsRemaining -= 1;
    }
  }
}
