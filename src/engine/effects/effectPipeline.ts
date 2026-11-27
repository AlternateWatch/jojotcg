import { getItemCard } from '../../data/cardRegistry';
import type { AttackDef, EnergyType } from '../../data/schemas/cardTypes';
import {
  computeEffectiveMaxHp,
  getAttackNominalMaxDamage,
  getAvailableAttacks,
  getEffectiveCharacterProfile,
  getEffectiveStandProfile,
  getLocationDamageBonusForCharacter,
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
  consumedDireAfterimage: boolean;
  consumedGrayFlyMassMurder: boolean;
} {
  const player = state.players[attackerPlayerId];
  const opponent = state.players[getOpponentId(attackerPlayerId)];
  const profile = getEffectiveCharacterProfile(attackerInst);

  let bonus =
    attackerPlayerId === 'P1'
      ? (state.rules.p1BonusDamage ?? 0)
      : (state.rules.p2BonusDamage ?? 0);
  let consumedHotBlood = false;
  let consumedLuckyShot = false;
  let consumedLastHamon = false;
  let consumedErinaLove = false;
  let consumedDireAfterimage = false;
  let consumedGrayFlyMassMurder = false;

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

    // Devo el Maldito — Masoquismo: +10 Stand dmg at <= 70 HP, +20 Stand dmg at <= 30 HP
    if (profile.signatureAbility.id === 'MASOCHISM_DEVO') {
      if (attackerInst.currentHp <= 30) {
        bonus += 20;
      } else if (attackerInst.currentHp <= 70) {
        bonus += 10;
      }
    }

    // J. Geil — Crueldad Absoluta: if enemy active has <= 50 HP while J. Geil is on player's board, active Stand attacks deal +10 damage
    const hasJGeilOnBoard =
      profile.signatureAbility.id === 'ABSOLUTE_CRUELTY_J_GEIL' ||
      player.bench.some(
        (b) => getEffectiveCharacterProfile(b).signatureAbility.id === 'ABSOLUTE_CRUELTY_J_GEIL',
      );
    if (hasJGeilOnBoard && opponent.active && opponent.active.currentHp <= 50) {
      bonus += 10;
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
  if (attackerInst.direAfterimageBonus) {
    bonus += 10;
    consumedDireAfterimage = true;
  }
  if (attackerInst.grayFlyMassMurderBonus) {
    bonus += 20;
    consumedGrayFlyMassMurder = true;
  }
  if (attackerInst.tarkusDamageBonus && attackerInst.tarkusDamageBonus > 0) {
    bonus += attackerInst.tarkusDamageBonus;
  }
  if (attackerInst.tenilleDamageBonus && attackerInst.tenilleDamageBonus > 0) {
    bonus += attackerInst.tenilleDamageBonus;
  }

  // 5. Horus — Caída de las Temperaturas (+10 per stack to WATER attacks)
  if (player.permanentWaterAttackBonus > 0 && attack.energyCost.includes('WATER')) {
    bonus += player.permanentWaterAttackBonus;
  }

  // 6. Equippable Item bonuses (e.g., Máscara de Piedra, (P)luck +10; Bruford Lealtad de Caballero turns (P)luck into +20; Clackers +20 for Hamon users)
  for (const item of attackerInst.attachedItems) {
    const itemCard = getItemCard(item.cardId);
    if (!itemCard) continue;
    for (const eff of itemCard.effects) {
      if (eff.kind === 'EQUIP_PASSIVE_DAMAGE_BONUS') {
        bonus += eff.bonusDamage;
        if (
          profile.signatureAbility.id === 'KNIGHT_LOYALTY_BRUFORD' &&
          item.cardId === 'item-pluck'
        ) {
          bonus += 10; // Total +20 instead of +10!
        }
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

  // 7. Active Location passive damage bonuses (e.g. Mansión De Los Joestar +10 dmg to Joestars & their Stands)
  bonus += getLocationDamageBonusForCharacter(state, attackerInst);

  return {
    bonus,
    consumedHotBlood,
    consumedLuckyShot,
    consumedLastHamon,
    consumedErinaLove,
    consumedDireAfterimage,
    consumedGrayFlyMassMurder,
  };
}

/**
 * Triggers passive abilities when a character moves from Bench to the Active slot
 * (Dire's Imagen Residual, Forever's Primate Avanzado when swapped with an active ally,
 * and "Capitán Tenille"'s Apnea Inhumana turn tracking & return-to-bench buff).
 */
export function triggerOnMoveToActiveAbility(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  inst: CharacterInstance,
  swappedFromActive?: CharacterInstance,
): void {
  const profile = getEffectiveCharacterProfile(inst);
  if (profile.signatureAbility.id === 'AFTERIMAGE_DIRE' && inst.attachedEnergies.length > 1) {
    inst.direAfterimageBonus = true;
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId,
      abilityName: 'Imagen Residual',
      message: `¡Imagen Residual! ${profile.name} entra al Puesto Activo con ${inst.attachedEnergies.length} energías (+10 daño en su siguiente ataque).`,
    });
  }

  // Forever — PRIMATE AVANZADO: +30 permanent max & current HP when swapped in for another Active character
  if (profile.signatureAbility.id === 'ADVANCED_PRIMATE_FOREVER' && swappedFromActive) {
    inst.foreverHpBonus = (inst.foreverHpBonus ?? 0) + 30;
    inst.currentHp += 30;
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId,
      abilityName: 'Primate Avanzado',
      message: `¡Primate Avanzado! ${profile.name} recibe +30 puntos de vida extra permanentes.`,
    });
  }

  // "Capitán Tenille" — APNEA INHUMANA: record turn when entering Active from Bench
  if (profile.signatureAbility.id === 'INHUMAN_APNEA_TENILLE') {
    inst.tenilleEnteredActiveFromBenchTurn = state.turnNumber;
  }

  // "Capitán Tenille" — APNEA INHUMANA: if swapped back to Bench within 3 turns of entering Active from Bench -> +10 permanent damage!
  if (swappedFromActive) {
    const outProfile = getEffectiveCharacterProfile(swappedFromActive);
    if (
      outProfile.signatureAbility.id === 'INHUMAN_APNEA_TENILLE' &&
      swappedFromActive.tenilleEnteredActiveFromBenchTurn !== undefined &&
      swappedFromActive.tenilleEnteredActiveFromBenchTurn !== null
    ) {
      const turnsElapsed = state.turnNumber - swappedFromActive.tenilleEnteredActiveFromBenchTurn;
      swappedFromActive.tenilleEnteredActiveFromBenchTurn = null;
      if (turnsElapsed <= 3) {
        swappedFromActive.tenilleDamageBonus = (swappedFromActive.tenilleDamageBonus ?? 0) + 10;
        pushEvent(state, eventsOut, {
          type: 'ABILITY_TRIGGERED',
          playerId,
          abilityName: 'Apnea Inhumana',
          message: `¡Apnea Inhumana! ${outProfile.name} regresa a la banca en ${turnsElapsed} turno(s) y gana +10 de daño permanente (total +${swappedFromActive.tenilleDamageBonus}).`,
        });
      }
    }
  }
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

  // 3. Return attached Stand (and Stand evolutions) to owner's shuffled deck on KO; Energies go to discard
  if (character.attachedStand) {
    const standProfile = getEffectiveStandProfile(character.attachedStand);
    owner.deck.push(character.attachedStand.cardId);
    for (const evoId of character.attachedStand.evolvedCardIds) {
      owner.deck.push(evoId);
    }
    owner.deck = rng.shuffle(owner.deck);
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId: ownerPlayerId,
      abilityName: 'Regreso de Stand',
      message: `${standProfile.name} regresa al mazo de ${owner.name} tras caer ${profile.name}.`,
    });
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

  // 6b. Wang Chan ("Lacayo de DIO"): if DIO (Part 1 or Part 3) is on bench, increase DIO's HP by +20
  if (profile.signatureAbility.id === 'DIO_LACKEY_WANG_CHAN') {
    const benchDio = owner.bench.find((b) => {
      const bId = getEffectiveCharacterProfile(b).currentCardId;
      return bId === 'char-dio-brando' || bId === 'char-dio';
    });
    if (benchDio) {
      benchDio.wangChanHpBonus = (benchDio.wangChanHpBonus ?? 0) + 20;
      benchDio.currentHp += 20;
      const dioProfile = getEffectiveCharacterProfile(benchDio);
      const newMax = computeEffectiveMaxHp(state, ownerPlayerId, benchDio);
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId: ownerPlayerId,
        abilityName: 'Lacayo de DIO',
        message: `¡Lacayo de DIO! Al caer Wang Chan, ${dioProfile.name} en la banca aumenta su vida en +20 HP (${benchDio.currentHp}/${newMax} HP).`,
      });
    }
  }

  // 6c. Enyaba Geil ("Lacaya de DIO"): if DIO is on bench when Enyaba is KO'd, increase DIO's HP by +40
  if (profile.signatureAbility.id === 'DIO_LACKEY_ENYABA') {
    const benchDio = owner.bench.find((b) => {
      const bId = getEffectiveCharacterProfile(b).currentCardId;
      return bId === 'char-dio' || bId === 'char-dio-brando';
    });
    if (benchDio) {
      benchDio.wangChanHpBonus = (benchDio.wangChanHpBonus ?? 0) + 40;
      benchDio.currentHp += 40;
      const dioProfile = getEffectiveCharacterProfile(benchDio);
      const newMax = computeEffectiveMaxHp(state, ownerPlayerId, benchDio);
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId: ownerPlayerId,
        abilityName: 'Lacaya de DIO',
        message: `¡Lacaya de DIO! Al caer Enyaba Geil, ${dioProfile.name} en la banca aumenta su vida en +40 HP (${benchDio.currentHp}/${newMax} HP).`,
      });
    }
  }

  pushEvent(state, eventsOut, {
    type: 'CHARACTER_KO',
    ownerPlayerId,
    cardId: profile.currentCardId,
    reason,
    message: `${profile.name} de ${owner.name} ha sido eliminado (${reason}).`,
  });

  // Track opponent KO during active player's turn for Gray Fly ("Asesinato en Masa")
  const killerId = getOpponentId(ownerPlayerId);
  if (state.activePlayerId === killerId) {
    state.players[killerId].koEnemyThisTurn = true;
  }

  // 7. Check immediate Game Over if Active was KO'd and owner has no bench left
  if (zone === 'ACTIVE' && owner.bench.length === 0) {
    setGameOver(
      state,
      eventsOut,
      getOpponentId(ownerPlayerId),
      `${owner.name} se ha quedado sin personajes en el campo.`,
    );
    return true;
  }

  // 8. Prize Card award: 2 Prize Cards if KO'd Character OR its attached Stand is Evolved (capped at ×2 even if both), else 1
  const isEvolvedKo =
    character.evolvedCardIds.length > 0 ||
    Boolean(character.attachedStand && character.attachedStand.evolvedCardIds.length > 0);
  const prizeAwardCount = isEvolvedKo ? 2 : 1;

  const prizeWinnerId = getOpponentId(ownerPlayerId);
  const prizeWinner = state.players[prizeWinnerId];
  if (prizeWinner.prizeCards.length > 0) {
    const actualCount = Math.min(prizeAwardCount, prizeWinner.prizeCards.length);
    if (prizeWinner.isAi) {
      for (let p = 0; p < actualCount; p++) {
        const takenPrizeId = prizeWinner.prizeCards.shift()!;
        prizeWinner.hand.push(takenPrizeId);
      }
      pushEvent(state, eventsOut, {
        type: 'CARD_DRAWN',
        playerId: prizeWinnerId,
        count: actualCount,
        message: isEvolvedKo
          ? `¡Evolución derrotada (×${actualCount} Premios)! ${prizeWinner.name} roba ${actualCount} Carta(s) de Premio (${prizeWinner.prizeCards.length} restante(s)).`
          : `¡Carta de Premio! ${prizeWinner.name} roba 1 carta de sus premios (${prizeWinner.prizeCards.length} restante(s)).`,
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
    } else {
      for (let p = 0; p < actualCount; p++) {
        enqueuePrompt(state, {
          kind: 'CHOOSE_PRIZE_CARD',
          playerId: prizeWinnerId,
          reason: isEvolvedKo
            ? `¡Evolución derrotada (×${actualCount} Premios)! ${profile.name} fue eliminado (${reason}). Elige tu Carta de Premio (${p + 1}/${actualCount}).`
            : `${profile.name} fue eliminado (${reason}). Elige 1 Carta de Premio boca abajo.`,
        });
      }
    }
  }

  // 9. If Active was KO'd, promote sole bench character or ask owner to choose replacement
  if (zone === 'ACTIVE') {
    if (owner.bench.length === 1) {
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
      triggerOnMoveToActiveAbility(state, eventsOut, ownerPlayerId, promoted);
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

  // 3. Cream — Invisibilidad del Vacío / Donovan — Sigilo dodge flag
  if (isEnemyAttack && !params.ignoreDodge && character.dodgeNextAttack) {
    character.dodgeNextAttack = false;
    const isDonovan = profile.currentCardId === 'char-donovan';
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId: params.targetPlayerId,
      abilityName: isDonovan ? 'Sigilo' : 'Invisibilidad del Vacío',
      message: isDonovan
        ? `¡Sigilo! ${profile.name} evita por completo el daño del ataque.`
        : `${profile.name} esquiva el ataque oculto en el vacío de Cream.`,
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

  // 4b. Donovan — Élite Alemana (-20 damage on next incoming attack on Stroheim)
  if (
    isEnemyAttack &&
    character.nextAttackDamageReduction &&
    character.nextAttackDamageReduction > 0 &&
    finalDamage > 0
  ) {
    const red = character.nextAttackDamageReduction;
    character.nextAttackDamageReduction = 0;
    finalDamage = Math.max(0, finalDamage - red);
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId: params.targetPlayerId,
      abilityName: 'Élite Alemana',
      message: `¡Élite Alemana! ${profile.name} reduce el daño del ataque en ${red} puntos adicionales (daño final: ${finalDamage}).`,
    });
  }

  // 4c. Yellow Temperance — Defensa Física (caps next incoming enemy attack damage to 10)
  if (
    isEnemyAttack &&
    typeof character.nextIncomingAttackDamageCap === 'number' &&
    finalDamage > 0
  ) {
    const cap = character.nextIncomingAttackDamageCap;
    character.nextIncomingAttackDamageCap = null;
    if (finalDamage > cap) {
      finalDamage = cap;
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId: params.targetPlayerId,
        abilityName: 'Defensa Física',
        message: `¡Defensa Física! ${profile.name} absorbe el impacto y solo recibe ${cap} de daño.`,
      });
    }
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

  // Lovers — Sincronización del Dolor: reflect incoming enemy attack damage + bonusDamage back to attacker
  if (
    isEnemyAttack &&
    typeof character.reflectNextAttackBonus === 'number' &&
    params.attackerPlayerId &&
    finalDamage > 0
  ) {
    const bonus = character.reflectNextAttackBonus;
    character.reflectNextAttackBonus = null;
    const reflectTotal = finalDamage + bonus;
    const attackerActive = state.players[params.attackerPlayerId].active;
    if (attackerActive) {
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId: params.targetPlayerId,
        abilityName: 'Sincronización del Dolor',
        message: `¡Sincronización del Dolor! ${profile.name} refleja ${reflectTotal} de daño (${finalDamage} + ${bonus}) a ${getEffectiveCharacterProfile(attackerActive).name}.`,
      });
      dealDamageToCharacter(state, eventsOut, {
        targetPlayerId: params.attackerPlayerId,
        targetInstanceId: attackerActive.instanceId,
        amount: reflectTotal,
        source: 'RECOIL',
        rng: params.rng,
      });
    }
  }

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

    // 3c. Tarkus — Fuerza Sobrehumana: while Active, flip a coin at end of turn; on HEADS gain permanent +10 damage!
    if (
      profile.signatureAbility.id === 'SUPERHUMAN_STRENGTH_TARKUS' &&
      player.active?.instanceId === instId
    ) {
      const flip = rng.flipCoin();
      pushEvent(state, eventsOut, {
        type: 'COIN_FLIPPED',
        playerId: endingPlayerId,
        attackName: 'Fuerza Sobrehumana',
        results: [flip],
        message:
          flip === 'HEADS'
            ? `¡Fuerza Sobrehumana! ${profile.name} saca CARA y gana +10 de daño permanente.`
            : `Fuerza Sobrehumana: ${profile.name} saca cruz (sin aumento esta ronda).`,
      });
      if (flip === 'HEADS') {
        character.tarkusDamageBonus = (character.tarkusDamageBonus ?? 0) + 10;
        pushEvent(state, eventsOut, {
          type: 'ABILITY_TRIGGERED',
          playerId: endingPlayerId,
          abilityName: 'Fuerza Sobrehumana',
          message: `${profile.name} acumula +${character.tarkusDamageBonus} de daño permanente con Fuerza Sobrehumana.`,
        });
      }
    }

    // 4. Clear Stunned after the affected player's turn ends (and grant 1-turn stun resistance)
    if (character.statuses.stunned && character.statuses.stunAppliedOnOwnTurn) {
      // Self-inflicted stun during own turn persists into the player's next turn!
      character.statuses.stunAppliedOnOwnTurn = false;
    } else if (character.statuses.stunned) {
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

  // Roll KO tracking for Gray Fly ("Asesinato en Masa") into the player's next turn
  player.koEnemyLastTurn = Boolean(player.koEnemyThisTurn);
  player.koEnemyThisTurn = false;
}
