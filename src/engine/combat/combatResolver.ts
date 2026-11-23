import { getCardById, getCharacterCard } from '../../data/cardRegistry';
import type { AttackDef, EnergyType } from '../../data/schemas/cardTypes';
import {
  computeEffectiveMaxHp,
  getAvailableAttacks,
  getEffectiveCharacterProfile,
  getEffectiveStandProfile,
} from '../helpers/cardStats';
import {
  checkImmediateDeckOut,
  createCharacterInstance,
  enqueuePrompt,
  findCharacterOnBoard,
  getOpponentId,
  isGameOver,
  pushEvent,
  setGameOver,
} from '../helpers/stateHelpers';
import type { CoinResult, RngProvider } from '../rng';
import {
  applyStatusConfirmed,
  cleanseBurn,
  tryApplyElementalStatus,
} from '../statuses/statusSystem';
import {
  computeAttackDamageBonus,
  dealDamageToCharacter,
  handleCharacterKo,
  healCharacter,
  resolveEndOfTurnEffects,
  triggerOnMoveToActiveAbility,
  triggerOpponentExtraDrawReaction,
} from '../effects/effectPipeline';
import { attachSummonedStandFromDeck, triggerOnEnterFieldAbility } from '../rules/turnRules';
import type { PromptResponsePayload } from '../types/actions';
import type { CombatEvent } from '../types/events';
import type { GameState, PlayerId, PlayerPrompt } from '../types/state';

export function startNextTurn(
  state: GameState,
  eventsOut: CombatEvent[],
  rng: RngProvider,
): void {
  if (state.phase === 'GAME_OVER') return;

  const nextPlayerId = getOpponentId(state.activePlayerId);
  state.activePlayerId = nextPlayerId;
  // A full turn/round advances only after BOTH players have taken a turn
  if (nextPlayerId === state.firstPlayerId) {
    state.turnNumber += 1;
  }

  const player = state.players[nextPlayerId];
  player.energyAttachedThisTurn = 0;
  player.bonusEnergyAttachmentsThisTurn = 0;
  player.evolutionsPlayedThisTurn = 0;
  player.itemsPlayedThisTurn = 0;
  player.extraCombatActionsRemaining = 0;
  player.usedOncePerTurnKeys = [];

  state.phase = 'DRAW';
  pushEvent(state, eventsOut, {
    type: 'PHASE_CHANGED',
    playerId: nextPlayerId,
    phase: 'DRAW',
    message: `Turno ${state.turnNumber} — Fase de Robo de ${player.name}.`,
  });

  // Mandatory draw: if deck is empty before or after drawing, player loses by deck-out
  if (checkImmediateDeckOut(state, eventsOut, nextPlayerId)) {
    return;
  }

  const drawn = player.deck.shift()!;
  player.hand.push(drawn);
  pushEvent(state, eventsOut, {
    type: 'CARD_DRAWN',
    playerId: nextPlayerId,
    count: 1,
    message: `${player.name} roba una carta.`,
  });

  if (checkImmediateDeckOut(state, eventsOut, nextPlayerId)) {
    return;
  }

  // Straizo — ESTUDIOSO DEL HAMON: while Straizo is on bench and Tonpetty or Dire is Active, draw 1 extra card!
  if (
    player.active &&
    player.bench.some(
      (b) => getEffectiveCharacterProfile(b).signatureAbility.id === 'HAMON_SCHOLAR_STRAIZO',
    )
  ) {
    const activeProfile = getEffectiveCharacterProfile(player.active);
    if (
      (activeProfile.currentCardId === 'char-tonpetty' ||
        activeProfile.currentCardId === 'char-dire') &&
      player.deck.length > 0
    ) {
      const extraCard = player.deck.shift()!;
      player.hand.push(extraCard);
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId: nextPlayerId,
        abilityName: 'Estudioso del Hamon',
        message: `¡Estudioso del Hamon! Straizo en banca otorga 1 carta extra a ${player.name} (${activeProfile.name} activo).`,
      });
      pushEvent(state, eventsOut, {
        type: 'CARD_DRAWN',
        playerId: nextPlayerId,
        count: 1,
        message: `${player.name} roba 1 carta extra gracias a Estudioso del Hamon.`,
      });
      if (checkImmediateDeckOut(state, eventsOut, nextPlayerId)) {
        return;
      }
      triggerOpponentExtraDrawReaction(state, eventsOut, nextPlayerId);
      if (isGameOver(state)) return;
    }
  }

  state.phase = 'PREPARATION';
  pushEvent(state, eventsOut, {
    type: 'PHASE_CHANGED',
    playerId: nextPlayerId,
    phase: 'PREPARATION',
    message: `Fase de Preparación de ${player.name}.`,
  });

  void rng;
}

export function finishTurnToEndPhase(
  state: GameState,
  eventsOut: CombatEvent[],
  rng: RngProvider,
): void {
  if (state.phase === 'GAME_OVER') return;

  const endingPlayerId = state.activePlayerId;
  state.phase = 'END_TURN';
  pushEvent(state, eventsOut, {
    type: 'PHASE_CHANGED',
    playerId: endingPlayerId,
    phase: 'END_TURN',
    message: `Fase de Fin de Turno de ${state.players[endingPlayerId].name}.`,
  });

  resolveEndOfTurnEffects(state, eventsOut, endingPlayerId, rng);

  if (isGameOver(state)) return;

  if (state.pendingPrompt) {
    state.promptContinuation = 'FINISH_END_TURN';
    return;
  }

  startNextTurn(state, eventsOut, rng);
}

export function advanceAfterCombatAction(
  state: GameState,
  eventsOut: CombatEvent[],
  rng: RngProvider,
): void {
  if (state.phase === 'GAME_OVER') return;

  const player = state.players[state.activePlayerId];
  if (
    player.extraCombatActionsRemaining > 0 &&
    player.active &&
    !player.active.statuses.stunned
  ) {
    player.extraCombatActionsRemaining -= 1;
    state.phase = 'COMBAT';
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId: player.id,
      abilityName: 'Za Warudo',
      message: `¡El tiempo sigue detenido! ${player.name} puede ejecutar una habilidad adicional.`,
    });
    return;
  }

  finishTurnToEndPhase(state, eventsOut, rng);
}

function isPromptStillValid(state: GameState, prompt: PlayerPrompt): boolean {
  switch (prompt.kind) {
    case 'YARE_YARE_DAZE_REACTION': {
      const target = findCharacterOnBoard(state, prompt.playerId, prompt.targetInstanceId);
      return Boolean(target && state.players[prompt.playerId].hand.length > 0);
    }
    case 'PROMOTE_FROM_BENCH': {
      const p = state.players[prompt.playerId];
      return p.active === null && p.bench.length > 0;
    }
    case 'CHOOSE_ENEMY_BENCH_TARGET': {
      return state.players[prompt.targetPlayerId].bench.length > 0;
    }
    case 'RETREAT_CHOOSE_NEW_ACTIVE': {
      const p = state.players[prompt.playerId];
      return p.active !== null && p.bench.length > 0;
    }
    default:
      return true;
  }
}

export function drainPromptQueueOrContinue(
  state: GameState,
  eventsOut: CombatEvent[],
  rng: RngProvider,
): void {
  if (state.phase === 'GAME_OVER') return;

  while (!state.pendingPrompt && state.queuedPrompts.length > 0) {
    const next = state.queuedPrompts.shift()!;
    if (isPromptStillValid(state, next)) {
      state.pendingPrompt = next;
      return;
    }
  }

  if (state.pendingPrompt) return;

  const cont = state.promptContinuation;
  state.promptContinuation = 'NONE';

  if (cont === 'FINISH_COMBAT_ACTION') {
    advanceAfterCombatAction(state, eventsOut, rng);
  } else if (cont === 'FINISH_END_TURN') {
    startNextTurn(state, eventsOut, rng);
  }
}

function enemyActiveHasExplicitFour(
  state: GameState,
  opponentId: PlayerId,
): boolean {
  const defender = state.players[opponentId].active;
  if (!defender) return false;

  const hasFour = (val: string | number | null | undefined): boolean =>
    val !== null && val !== undefined && String(val).includes('4');

  const defProf = getEffectiveCharacterProfile(defender);
  const effectiveMaxHp = computeEffectiveMaxHp(state, opponentId, defender);

  if (
    hasFour(defender.currentHp) ||
    hasFour(effectiveMaxHp) ||
    hasFour(defProf.baseMaxHp) ||
    hasFour(defProf.dg)
  ) {
    return true;
  }

  if (defender.attachedStand) {
    const standProf = getEffectiveStandProfile(defender.attachedStand);
    if (hasFour(standProf.requiredDg)) return true;
  }

  for (const { attack } of getAvailableAttacks(defender)) {
    if (
      hasFour(attack.baseDamage) ||
      hasFour(attack.damageLabel) ||
      hasFour(attack.energyCost.length)
    ) {
      return true;
    }
  }

  return false;
}

export function executeAttack(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  attackId: string,
  rng: RngProvider,
  copiedAttack?: { attack: AttackDef; source: 'CHARACTER' | 'STAND' },
): void {
  const player = state.players[playerId];
  const opponentId = getOpponentId(playerId);
  const opponent = state.players[opponentId];
  const attacker = player.active;
  const defender = opponent.active;

  if (!attacker || !defender) return;

  const entry =
    copiedAttack ??
    getAvailableAttacks(attacker).find((a) => a.attack.id === attackId);
  if (!entry) return;

  const { attack, source } = entry;
  const attackerProfile = getEffectiveCharacterProfile(attacker);
  const defenderProfile = getEffectiveCharacterProfile(defender);

  pushEvent(state, eventsOut, {
    type: 'ATTACK_DECLARED',
    playerId,
    attackName: attack.name,
    message: `${attackerProfile.name} usa ${attack.name}!`,
  });

  // Guido Mista — TETRAFOBIA: if enemy active has an explicit "4" in any stat, attached Stand gains permanent +10 damage!
  if (
    attackerProfile.signatureAbility.id === 'TETRAPHOBIA_MISTA' &&
    source === 'STAND' &&
    attacker.attachedStand &&
    !attacker.tetraphobiaTriggered &&
    enemyActiveHasExplicitFour(state, opponentId)
  ) {
    attacker.tetraphobiaTriggered = true;
    attacker.attachedStand.permanentDamageBonus += 10;
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId,
      abilityName: 'Tetrafobia',
      message: `¡TETRAFOBIA! El rival tiene un 4 en sus estadísticas: ${getEffectiveStandProfile(attacker.attachedStand).name} gana +10 de daño permanente.`,
    });
  }

  // Calculate passive/synergy attack bonus
  const bonusInfo = computeAttackDamageBonus(state, playerId, attacker, attack, source);
  const consumeAttackBonuses = () => {
    if (bonusInfo.consumedHotBlood) attacker.hotBloodBonusReady = false;
    if (bonusInfo.consumedLuckyShot) attacker.luckyShotUsed = true;
    if (bonusInfo.consumedLastHamon) player.pendingNextAttackBonus = 0;
    if (bonusInfo.consumedErinaLove) attacker.erinaNextAttackBonus = false;
    if (bonusInfo.consumedDireAfterimage) attacker.direAfterimageBonus = false;
    if (bonusInfo.consumedGrayFlyMassMurder) attacker.grayFlyMassMurderBonus = false;
  };

  // Special non-damaging copy attack (Silver Chariot Réquiem — Manipulación de Cuerpos)
  if (attack.specialEffects?.some((e) => e.kind === 'COPY_ENEMY_STAND_ATTACK')) {
    const copyableEnemyAttacks = getAvailableAttacks(defender)
      .map((a) => a.attack)
      .filter((a) => !a.specialEffects?.some((se) => se.kind === 'COPY_ENEMY_STAND_ATTACK'));
    if (copyableEnemyAttacks.length > 0) {
      enqueuePrompt(state, {
        kind: 'CHOOSE_ENEMY_STAND_ATTACK',
        playerId,
        targetPlayerId: opponentId,
        availableAttackIds: copyableEnemyAttacks.map((a) => a.id),
        sourceLabel: 'Manipulación de Cuerpos',
      });
      state.promptContinuation = 'FINISH_COMBAT_ACTION';
      return;
    }
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId,
      abilityName: 'Manipulación de Cuerpos',
      message: `${defenderProfile.name} no tiene ataques copiables.`,
    });
    advanceAfterCombatAction(state, eventsOut, rng);
    return;
  }

  // Special Soul Swap (Silver Chariot Requiem — Intercambio de Almas)
  if (attack.specialEffects?.some((e) => e.kind === 'SOUL_SWAP_HP')) {
    const myHp = attacker.currentHp;
    const enemyHp = defender.currentHp;
    attacker.currentHp = enemyHp;
    defender.currentHp = myHp;
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId,
      abilityName: 'Intercambio de Almas',
      message: `¡Intercambio de Almas! ${attackerProfile.name} ahora tiene ${attacker.currentHp} HP y ${defenderProfile.name} tiene ${defender.currentHp} HP.`,
    });
    advanceAfterCombatAction(state, eventsOut, rng);
    return;
  }

  // Track if an attack has bench distribution
  const distributeEffect = attack.specialEffects?.find(
    (e): e is Extract<typeof e, { kind: 'DISTRIBUTE_BENCH_DAMAGE' }> =>
      e.kind === 'DISTRIBUTE_BENCH_DAMAGE',
  );

  if (distributeEffect) {
    let baseDistribute = distributeEffect.totalDamage;
    if (
      attack.id === 'atk-control-de-las-balas' &&
      attacker.attachedStand?.rapidReloadTurnsRemaining &&
      attacker.attachedStand.rapidReloadTurnsRemaining > 0
    ) {
      baseDistribute = 60;
      attacker.attachedStand.rapidReloadTurnsRemaining = 0;
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId,
        abilityName: 'Recarga Rápida',
        message: `¡Recarga Rápida! Control de las Balas aumenta a 6x10 (60 de daño base).`,
      });
    }
    const totalPool = Math.max(0, baseDistribute + bonusInfo.bonus);
    consumeAttackBonuses();

    if (opponent.bench.length > 0 && totalPool > 0) {
      const eligibleIds = [defender.instanceId, ...opponent.bench.map((b) => b.instanceId)];
      enqueuePrompt(state, {
        kind: 'DISTRIBUTE_BENCH_DAMAGE',
        playerId,
        targetPlayerId: opponentId,
        totalDamage: totalPool,
        increment: state.rules.benchDamageIncrement,
        attackName: attack.name,
        eligibleInstanceIds: eligibleIds,
        attackElementEnergies: [...attack.energyCost],
      });
      state.promptContinuation = 'FINISH_COMBAT_ACTION';
      return;
    }

    // No enemy bench: all damage hits active enemy
    if (totalPool > 0) {
      dealDamageToCharacter(state, eventsOut, {
        targetPlayerId: opponentId,
        targetInstanceId: defender.instanceId,
        amount: totalPool,
        source: 'ATTACK',
        attackerPlayerId: playerId,
        attackEnergies: attack.energyCost,
        rng,
      });
    }
    if (state.pendingPrompt) {
      state.promptContinuation = 'FINISH_COMBAT_ACTION';
      return;
    }
    advanceAfterCombatAction(state, eventsOut, rng);
    return;
  }

  // Flip coins if required
  let coinResults: CoinResult[] = [];
  let attackCancelled = false;
  let coinDamageToDefender = 0;
  let coinSelfDamage = 0;
  let coinHealSelf = 0;
  let instantKoDefender = false;
  let instantKoSelf = false;
  let grantDodgeNextAttack = false;
  const statusesToDefender: ('STUNNED' | 'BLEED' | 'BURN')[] = [];
  const statusesToSelf: ('STUNNED' | 'BLEED' | 'BURN')[] = [];
  let burnEnemyBenchChoice = false;
  let bounceDefenderToHand = false;

  if (attack.coinFlip) {
    coinResults = Array.from({ length: attack.coinFlip.count }, () => rng.flipCoin());
    const headsCount = coinResults.filter((r) => r === 'HEADS').length;
    const tailsCount = coinResults.length - headsCount;
    pushEvent(state, eventsOut, {
      type: 'COIN_FLIPPED',
      playerId,
      attackName: attack.name,
      results: coinResults,
      message: `Lanzamiento de moneda (${attack.name}): ${coinResults
        .map((r) => (r === 'HEADS' ? 'Cara' : 'Cruz'))
        .join(', ')} (${headsCount} cara(s), ${tailsCount} cruz/cruces).`,
    });

    if (attack.coinFlip.requireMajorityHeads && headsCount <= tailsCount) {
      attackCancelled = true;
    }

    if (
      attack.coinFlip.allHeadsEffect === 'BOUNCE_DEFENDER_TO_HAND' &&
      coinResults.length > 0 &&
      headsCount === coinResults.length
    ) {
      bounceDefenderToHand = true;
    }

    for (const flip of coinResults) {
      const outcomes = flip === 'HEADS' ? attack.coinFlip.onHeads : attack.coinFlip.onTails;
      if (!outcomes) continue;
      for (const outcome of outcomes) {
        switch (outcome.kind) {
          case 'CANCEL_ATTACK':
            attackCancelled = true;
            break;
          case 'DAMAGE':
            if (outcome.target === 'DEFENDER') coinDamageToDefender += outcome.amount;
            else coinSelfDamage += outcome.amount;
            break;
          case 'DAMAGE_AND_HEAL':
            coinDamageToDefender += outcome.damageToDefender;
            coinHealSelf += outcome.healSelf;
            break;
          case 'STATUS':
            if (outcome.target === 'DEFENDER') statusesToDefender.push(outcome.status);
            else if (outcome.target === 'SELF') statusesToSelf.push(outcome.status);
            else if (outcome.target === 'ENEMY_BENCH_CHOOSE') burnEnemyBenchChoice = true;
            break;
          case 'INSTANT_KO':
            if (outcome.target === 'DEFENDER') instantKoDefender = true;
            else instantKoSelf = true;
            break;
          case 'DODGE_NEXT_ENEMY_ATTACK':
            grantDodgeNextAttack = true;
            break;
        }
      }
    }
  }

  if (attackCancelled) {
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId,
      abilityName: attack.name,
      message: `¡Salió cruz! ${attack.name} no surte efecto.`,
    });
    advanceAfterCombatAction(state, eventsOut, rng);
    return;
  }

  // Calculate primary damage to defender
  const rawBase = attack.coinFlip?.replacesBaseDamage
    ? coinDamageToDefender
    : attack.baseDamage + coinDamageToDefender;

  const isDamagingAttack = rawBase > 0;
  let defenderDodgedOrImmune = false;
  let defenderKoTriggered = false;

  if (isDamagingAttack) {
    let conditionalBonus = 0;
    for (const eff of attack.specialEffects ?? []) {
      if (eff.kind === 'BONUS_IF_MIRROR_CHARACTER_ON_BOARD') {
        const ownIds = new Set<string>(
          [...(player.active ? [player.active] : []), ...player.bench].flatMap((ch) => [
            ch.cardId,
            getEffectiveCharacterProfile(ch).currentCardId,
          ]),
        );
        const oppChars = [...(opponent.active ? [opponent.active] : []), ...opponent.bench];
        const hasMirror = oppChars.some(
          (ch) => ownIds.has(ch.cardId) || ownIds.has(getEffectiveCharacterProfile(ch).currentCardId),
        );
        if (hasMirror) {
          conditionalBonus += eff.bonusDamage;
          pushEvent(state, eventsOut, {
            type: 'ABILITY_TRIGGERED',
            playerId,
            abilityName: attack.name,
            message: `¡${attack.name}! Coincidencia de reflejo en el campo (+${eff.bonusDamage} de daño extra).`,
          });
        }
      }
    }
    const totalDamage = Math.max(0, rawBase + bonusInfo.bonus + conditionalBonus);
    consumeAttackBonuses();
    const res = dealDamageToCharacter(state, eventsOut, {
      targetPlayerId: opponentId,
      targetInstanceId: defender.instanceId,
      amount: totalDamage,
      source: 'ATTACK',
      attackerPlayerId: playerId,
      attackEnergies: attack.energyCost,
      rng,
    });
    defenderDodgedOrImmune = res.dodged || res.immune;
    defenderKoTriggered = res.koTriggered;
  } else if (instantKoDefender) {
    // Check Wamuu's Wind Sense / Cream's Dodge / N'Doul Water Immunity on Instant KO attacks
    const probeTarget = findCharacterOnBoard(state, opponentId, defender.instanceId);
    if (probeTarget) {
      const defChar = probeTarget.character;
      const defProf = getEffectiveCharacterProfile(defChar);
      if (defProf.signatureAbility.id === 'WIND_SENSE_WAMUU' && !defChar.windSenseUsed) {
        defChar.windSenseUsed = true;
        defenderDodgedOrImmune = true;
        pushEvent(state, eventsOut, {
          type: 'ABILITY_TRIGGERED',
          playerId: opponentId,
          abilityName: 'Sentido del Viento',
          message: `¡Sentido del Viento! ${defProf.name} esquiva ${attack.name}.`,
        });
      } else if (defChar.dodgeNextAttack) {
        defChar.dodgeNextAttack = false;
        defenderDodgedOrImmune = true;
        pushEvent(state, eventsOut, {
          type: 'ABILITY_TRIGGERED',
          playerId: opponentId,
          abilityName: 'Invisibilidad del Vacío',
          message: `${defProf.name} esquiva ${attack.name} desde el vacío.`,
        });
      } else {
        handleCharacterKo(
          state,
          eventsOut,
          opponentId,
          defender.instanceId,
          playerId,
          attack.name,
          rng,
        );
      }
    }
  }

  if (isGameOver(state)) return;

  // Apply coin heal & recoil damage to self
  if (coinHealSelf > 0 && findCharacterOnBoard(state, playerId, attacker.instanceId)) {
    healCharacter(state, eventsOut, playerId, attacker.instanceId, coinHealSelf, attack.name);
  }
  if (coinSelfDamage > 0 && findCharacterOnBoard(state, playerId, attacker.instanceId)) {
    dealDamageToCharacter(state, eventsOut, {
      targetPlayerId: playerId,
      targetInstanceId: attacker.instanceId,
      amount: coinSelfDamage,
      source: 'RECOIL',
      attackerPlayerId: playerId,
      rng,
      ignoreDodge: true,
    });
  }
  if (instantKoSelf && findCharacterOnBoard(state, playerId, attacker.instanceId)) {
    handleCharacterKo(
      state,
      eventsOut,
      playerId,
      attacker.instanceId,
      playerId,
      `${attack.name} (cruz)`,
      rng,
    );
  }
  if (grantDodgeNextAttack && findCharacterOnBoard(state, playerId, attacker.instanceId)) {
    attacker.dodgeNextAttack = true;
    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId,
      abilityName: attack.name,
      message: `${attackerProfile.name} esquivará el próximo ataque rival.`,
    });
  }

  if (isGameOver(state)) return;

  // Apply coin statuses if target survived and didn't dodge
  if (!defenderDodgedOrImmune && findCharacterOnBoard(state, opponentId, defender.instanceId)) {
    for (const st of statusesToDefender) {
      tryApplyElementalStatus(state, eventsOut, opponentId, defender.instanceId, st, attack.name);
    }
  }
  if (findCharacterOnBoard(state, playerId, attacker.instanceId)) {
    for (const st of statusesToSelf) {
      tryApplyElementalStatus(state, eventsOut, playerId, attacker.instanceId, st, attack.name);
    }
  }
  if (burnEnemyBenchChoice && !defenderDodgedOrImmune) {
    if (opponent.bench.length === 1) {
      const onlyBench = opponent.bench[0]!;
      tryApplyElementalStatus(
        state,
        eventsOut,
        opponentId,
        onlyBench.instanceId,
        'BURN',
        attack.name,
      );
    } else if (opponent.bench.length > 1) {
      enqueuePrompt(state, {
        kind: 'CHOOSE_ENEMY_BENCH_TARGET',
        playerId,
        targetPlayerId: opponentId,
        effect: 'APPLY_BURN',
        sourceLabel: attack.name,
      });
    }
  }

  // Sticky Fingers — Zipper Man: 3/3 heads bounces enemy active character + attached Stand to opponent's hand
  if (
    bounceDefenderToHand &&
    !defenderDodgedOrImmune &&
    opponent.active?.instanceId === defender.instanceId
  ) {
    const bounced = opponent.active;
    const bouncedProf = getEffectiveCharacterProfile(bounced);
    opponent.active = null;

    // Return user card + any character evolutions to opponent's hand
    opponent.hand.push(bounced.cardId);
    for (const evoId of bounced.evolvedCardIds) opponent.hand.push(evoId);

    // Return attached Stand + any Stand evolutions to opponent's hand
    let standNote = '';
    if (bounced.attachedStand) {
      const standProf = getEffectiveStandProfile(bounced.attachedStand);
      opponent.hand.push(bounced.attachedStand.cardId);
      for (const evoId of bounced.attachedStand.evolvedCardIds) opponent.hand.push(evoId);
      standNote = ` y su Stand ${standProf.name}`;
    }

    // Discard attached items & energies
    for (const item of bounced.attachedItems) opponent.discard.push(item.cardId);
    for (const eType of bounced.attachedEnergies) {
      opponent.discard.push(`energy-${eType.toLowerCase()}`);
    }

    pushEvent(state, eventsOut, {
      type: 'ABILITY_TRIGGERED',
      playerId,
      abilityName: attack.name,
      message: `¡${attack.name} (3 caras)! ${bouncedProf.name}${standNote} regresa(n) a la mano de ${opponent.name}.`,
    });

    if (opponent.bench.length === 0) {
      setGameOver(
        state,
        eventsOut,
        playerId,
        `${opponent.name} se quedó sin personajes en el campo tras ${attack.name}.`,
      );
      return;
    } else if (opponent.bench.length === 1) {
      const promoted = opponent.bench.splice(0, 1)[0]!;
      opponent.active = promoted;
      cleanseBurn(state, eventsOut, opponentId, promoted.instanceId, 'promoción al Puesto Activo');
      triggerOnMoveToActiveAbility(state, eventsOut, opponentId, promoted);
      pushEvent(state, eventsOut, {
        type: 'BENCH_SWAP',
        playerId: opponentId,
        newActiveCardId: getEffectiveCharacterProfile(promoted).currentCardId,
        endedTurn: false,
        message: `${getEffectiveCharacterProfile(promoted).name} pasa automáticamente al Puesto Activo.`,
      });
    } else {
      enqueuePrompt(state, {
        kind: 'PROMOTE_FROM_BENCH',
        playerId: opponentId,
        reason: `${attack.name} devolvió a tu Personaje Activo a la mano. Elige un reemplazo de tu banca.`,
      });
    }
  }

  // Apply special effects defined on the attack
  for (const eff of attack.specialEffects ?? []) {
    if (isGameOver(state)) return;
    switch (eff.kind) {
      case 'APPLY_STATUS': {
        const tgtPlayer = eff.target === 'DEFENDER' ? opponentId : playerId;
        const tgtInstId = eff.target === 'DEFENDER' ? defender.instanceId : attacker.instanceId;
        if (eff.target === 'DEFENDER' && defenderDodgedOrImmune) break;
        if (findCharacterOnBoard(state, tgtPlayer, tgtInstId)) {
          tryApplyElementalStatus(state, eventsOut, tgtPlayer, tgtInstId, eff.status, attack.name);
        }
        break;
      }
      case 'GLOBAL_BENCH_DAMAGE': {
        const benchIds = opponent.bench.map((b) => b.instanceId);
        for (const bId of benchIds) {
          if (isGameOver(state)) break;
          dealDamageToCharacter(state, eventsOut, {
            targetPlayerId: opponentId,
            targetInstanceId: bId,
            amount: eff.damage,
            source: 'BENCH',
            attackerPlayerId: playerId,
            attackEnergies: attack.energyCost,
            rng,
          });
        }
        break;
      }
      case 'HEAL_SELF': {
        if (findCharacterOnBoard(state, playerId, attacker.instanceId)) {
          healCharacter(state, eventsOut, playerId, attacker.instanceId, eff.amount, attack.name);
        }
        break;
      }
      case 'HEAL_DEFENDER': {
        if (!defenderDodgedOrImmune && findCharacterOnBoard(state, opponentId, defender.instanceId)) {
          healCharacter(state, eventsOut, opponentId, defender.instanceId, eff.amount, attack.name);
        }
        break;
      }
      case 'HEAL_ALLY_BENCH': {
        if (player.bench.length === 1) {
          healCharacter(
            state,
            eventsOut,
            playerId,
            player.bench[0]!.instanceId,
            eff.amount,
            attack.name,
          );
        } else if (player.bench.length > 1) {
          enqueuePrompt(state, {
            kind: 'CHOOSE_ALLY_BENCH_HEAL',
            playerId,
            eligibleInstanceIds: player.bench.map((b) => b.instanceId),
            healAmount: eff.amount,
            sourceLabel: attack.name,
          });
        } else {
          pushEvent(state, eventsOut, {
            type: 'ABILITY_TRIGGERED',
            playerId,
            abilityName: attack.name,
            message: `${player.name} no tiene aliados en banca para curar con ${attack.name}.`,
          });
        }
        break;
      }
      case 'FALSE_MEDICINE_BENCH_COIN': {
        if (player.bench.length === 1) {
          const target = player.bench[0]!;
          const flip = rng.flipCoin();
          pushEvent(state, eventsOut, {
            type: 'COIN_FLIPPED',
            playerId,
            attackName: attack.name,
            results: [flip],
            message: `${attack.name}: moneda → ${flip === 'HEADS' ? 'CARA (+20 HP)' : 'CRUZ (-20 HP)'}.`,
          });
          if (flip === 'HEADS') {
            healCharacter(state, eventsOut, playerId, target.instanceId, eff.amount, attack.name);
          } else {
            dealDamageToCharacter(state, eventsOut, {
              targetPlayerId: playerId,
              targetInstanceId: target.instanceId,
              amount: eff.amount,
              source: 'RECOIL',
              rng,
              ignoreDodge: true,
            });
          }
        } else if (player.bench.length > 1) {
          enqueuePrompt(state, {
            kind: 'CHOOSE_ALLY_BENCH_HEAL',
            playerId,
            eligibleInstanceIds: player.bench.map((b) => b.instanceId),
            healAmount: eff.amount,
            coinFlipDamageAmount: eff.amount,
            sourceLabel: attack.name,
          });
        } else {
          pushEvent(state, eventsOut, {
            type: 'ABILITY_TRIGGERED',
            playerId,
            abilityName: attack.name,
            message: `${player.name} no tiene aliados en banca para usar ${attack.name}.`,
          });
        }
        break;
      }
      case 'HEAL_SELF_OR_BENCH': {
        const eligibleIds = [
          ...(findCharacterOnBoard(state, playerId, attacker.instanceId) ? [attacker.instanceId] : []),
          ...player.bench.map((b) => b.instanceId),
        ];
        if (eligibleIds.length === 1) {
          healCharacter(state, eventsOut, playerId, eligibleIds[0]!, eff.amount, attack.name);
        } else if (eligibleIds.length > 1) {
          enqueuePrompt(state, {
            kind: 'CHOOSE_ALLY_BENCH_HEAL',
            playerId,
            eligibleInstanceIds: eligibleIds,
            healAmount: eff.amount,
            sourceLabel: attack.name,
          });
        }
        break;
      }
      case 'RETURN_TO_ZERO': {
        if (findCharacterOnBoard(state, playerId, attacker.instanceId)) {
          attacker.maxHpPenalty = 0;
          attacker.statuses.stunned = false;
          attacker.statuses.stunImmuneNextTurn = false;
          attacker.statuses.bleedStacks = [];
          attacker.statuses.burn = null;
          attacker.tookDamageThisTurn = false;
          if (attacker.attachedStand) {
            attacker.attachedStand.damageDebuff = 0;
          }
          const originalMaxHp = computeEffectiveMaxHp(state, playerId, attacker);
          const restored = Math.max(0, originalMaxHp - attacker.currentHp);
          attacker.currentHp = originalMaxHp;

          pushEvent(state, eventsOut, {
            type: 'ABILITY_TRIGGERED',
            playerId,
            abilityName: attack.name,
            message: `¡RETURN TO ZERO! ${attackerProfile.name} y su Stand regresan a su estado original (${originalMaxHp}/${originalMaxHp} HP, sin estados ni penalizaciones).`,
          });
          if (restored > 0) {
            pushEvent(state, eventsOut, {
              type: 'HEALED',
              targetPlayerId: playerId,
              targetInstanceId: attacker.instanceId,
              amount: restored,
              message: `${attackerProfile.name} restaura +${restored} HP con Return to Zero.`,
            });
          }
        }
        break;
      }
      case 'RAPID_RELOAD_BUFF': {
        if (attacker.attachedStand) {
          attacker.attachedStand.rapidReloadTurnsRemaining = 2;
          pushEvent(state, eventsOut, {
            type: 'ABILITY_TRIGGERED',
            playerId,
            abilityName: attack.name,
            message: `¡${attack.name}! En el siguiente turno, Control de las Balas hará 6x10 (${eff.nextTurnDamage}) puntos de daño.`,
          });
        }
        break;
      }
      case 'EXTRA_COMBAT_ACTIONS': {
        if (!player.usedOncePerTurnKeys.includes(eff.oncePerTurnKey)) {
          player.usedOncePerTurnKeys.push(eff.oncePerTurnKey);
          player.extraCombatActionsRemaining += eff.extraActions;
          pushEvent(state, eventsOut, {
            type: 'ABILITY_TRIGGERED',
            playerId,
            abilityName: attack.name,
            message: `${player.name} obtiene ${eff.extraActions} habilidad(es) extra este turno.`,
          });
        }
        break;
      }
      case 'SELF_KO_AFTER_ATTACK': {
        if (findCharacterOnBoard(state, playerId, attacker.instanceId)) {
          handleCharacterKo(
            state,
            eventsOut,
            playerId,
            attacker.instanceId,
            playerId,
            attack.name,
            rng,
          );
        }
        break;
      }
      case 'HEAL_SELF_ON_KO': {
        if (defenderKoTriggered && findCharacterOnBoard(state, playerId, attacker.instanceId)) {
          healCharacter(state, eventsOut, playerId, attacker.instanceId, eff.amount, attack.name);
        }
        break;
      }
      case 'CAP_NEXT_INCOMING_ATTACK_DAMAGE': {
        if (findCharacterOnBoard(state, playerId, attacker.instanceId)) {
          attacker.nextIncomingAttackDamageCap = eff.maxDamage;
          pushEvent(state, eventsOut, {
            type: 'ABILITY_TRIGGERED',
            playerId,
            abilityName: attack.name,
            message: `¡${attack.name}! El siguiente ataque rival solo infligirá ${eff.maxDamage} puntos de daño a ${attackerProfile.name}.`,
          });
        }
        break;
      }
      case 'SWAP_ACTIVE_WITH_HAND_CHARACTER': {
        if (player.active?.instanceId === attacker.instanceId) {
          const eligibleHandIndices: number[] = [];
          player.hand.forEach((cid, idx) => {
            if (getCharacterCard(cid)) eligibleHandIndices.push(idx);
          });
          if (eligibleHandIndices.length === 0) {
            pushEvent(state, eventsOut, {
              type: 'ABILITY_TRIGGERED',
              playerId,
              abilityName: attack.name,
              message: `${attack.name}: ${player.name} no tiene personajes en la mano para intercambiar.`,
            });
          } else if (eligibleHandIndices.length === 1) {
            swapActiveWithHandCharacter(
              state,
              eventsOut,
              playerId,
              eligibleHandIndices[0]!,
              attack.name,
            );
          } else {
            enqueuePrompt(state, {
              kind: 'CHOOSE_HAND_CHARACTER_SWAP',
              playerId,
              eligibleHandIndices,
              sourceLabel: attack.name,
            });
          }
        }
        break;
      }
      case 'RETREAT_SELF_AFTER_ATTACK': {
        if (findCharacterOnBoard(state, playerId, attacker.instanceId) && player.bench.length > 0) {
          if (player.bench.length === 1) {
            const incoming = player.bench.splice(0, 1)[0]!;
            const outgoing = player.active!;
            player.active = incoming;
            player.bench.push(outgoing);
            cleanseBurn(state, eventsOut, playerId, outgoing.instanceId, 'retirada a la banca');
            cleanseBurn(state, eventsOut, playerId, incoming.instanceId, 'promoción al Puesto Activo');
            triggerOnMoveToActiveAbility(state, eventsOut, playerId, incoming, outgoing);
            pushEvent(state, eventsOut, {
              type: 'BENCH_SWAP',
              playerId,
              newActiveCardId: getEffectiveCharacterProfile(incoming).currentCardId,
              endedTurn: false,
              message: `${attackerProfile.name} se retira mediante ${attack.name}.`,
            });
          } else {
            enqueuePrompt(state, {
              kind: 'RETREAT_CHOOSE_NEW_ACTIVE',
              playerId,
              sourceLabel: attack.name,
            });
          }
        }
        break;
      }
      case 'PERMANENT_STAND_DAMAGE_BUFF': {
        if (attacker.attachedStand) {
          attacker.attachedStand.permanentDamageBonus += eff.amount;
          pushEvent(state, eventsOut, {
            type: 'ABILITY_TRIGGERED',
            playerId,
            abilityName: attack.name,
            message: `${getEffectiveStandProfile(attacker.attachedStand).name} gana +${eff.amount} de daño permanente.`,
          });
        }
        break;
      }
      case 'ARMOR_OFF_BUFF': {
        if (attacker.attachedStand) {
          attacker.maxHpPenalty += eff.maxHpLoss;
          const newMax = computeEffectiveMaxHp(state, playerId, attacker);
          if (attacker.currentHp > newMax) attacker.currentHp = newMax;
          attacker.attachedStand.permanentDamageBonus += eff.damageGain;
          pushEvent(state, eventsOut, {
            type: 'ABILITY_TRIGGERED',
            playerId,
            abilityName: attack.name,
            message: `${attackerProfile.name} reduce su HP máx. en ${eff.maxHpLoss} (${newMax}) y Silver Chariot gana +${eff.damageGain} de daño permanente.`,
          });
        }
        break;
      }
      case 'ENEMY_STAND_DAMAGE_DEBUFF': {
        if (defender.attachedStand && findCharacterOnBoard(state, opponentId, defender.instanceId)) {
          defender.attachedStand.damageDebuff += eff.amount;
          pushEvent(state, eventsOut, {
            type: 'ABILITY_TRIGGERED',
            playerId,
            abilityName: attack.name,
            message: `Safety Lock reduce permanentemente el daño de ${getEffectiveStandProfile(defender.attachedStand).name} en -${eff.amount}.`,
          });
        }
        break;
      }
      case 'PERMANENT_WATER_ATTACK_BUFF': {
        player.permanentWaterAttackBonus += eff.amount;
        pushEvent(state, eventsOut, {
          type: 'ABILITY_TRIGGERED',
          playerId,
          abilityName: attack.name,
          message: `Todos los ataques de Agua de ${player.name} ganan +${eff.amount} de daño permanente.`,
        });
        break;
      }
      case 'PSYCHOPHOTOGRAPHY_SCRY': {
        const count = Math.min(eff.lookCount, player.deck.length);
        if (count > 0) {
          const cards = player.deck.splice(0, count);
          enqueuePrompt(state, {
            kind: 'SELECT_TOP_CARDS',
            playerId,
            cards,
            pickCount: Math.min(eff.pickCount, count),
            restTo: eff.restTo,
            sourceLabel: attack.name,
          });
        }
        break;
      }
      case 'RECOVER_ITEM_FROM_DISCARD': {
        const itemIndices = player.discard
          .map((id, i) => ({ id, i }))
          .filter((x) => getCardById(x.id)?.type === 'ITEM');
        if (itemIndices.length > 0) {
          enqueuePrompt(state, {
            kind: 'RECOVER_ITEM_FROM_DISCARD',
            playerId,
            destination: eff.destination,
            eligibleCardIds: itemIndices.map((x) => x.id),
            sourceLabel: attack.name,
          });
        } else {
          pushEvent(state, eventsOut, {
            type: 'ABILITY_TRIGGERED',
            playerId,
            abilityName: attack.name,
            message: `No hay objetos en la pila de descartes de ${player.name}.`,
          });
        }
        break;
      }
      case 'RETURN_ENEMY_BENCH_TO_DECK': {
        if (opponent.bench.length === 1) {
          returnBenchCharacterToDeck(state, eventsOut, opponentId, opponent.bench[0]!.instanceId, rng);
        } else if (opponent.bench.length > 1) {
          enqueuePrompt(state, {
            kind: 'CHOOSE_ENEMY_BENCH_TARGET',
            playerId,
            targetPlayerId: opponentId,
            effect: 'RETURN_TO_DECK',
            sourceLabel: attack.name,
          });
        }
        break;
      }
    }
  }

  if (isGameOver(state)) return;

  if (state.pendingPrompt) {
    state.promptContinuation = 'FINISH_COMBAT_ACTION';
    return;
  }

  advanceAfterCombatAction(state, eventsOut, rng);
}

function returnBenchCharacterToDeck(
  state: GameState,
  eventsOut: CombatEvent[],
  ownerPlayerId: PlayerId,
  benchInstanceId: string,
  rng: RngProvider,
): void {
  const owner = state.players[ownerPlayerId];
  const idx = owner.bench.findIndex((b) => b.instanceId === benchInstanceId);
  if (idx === -1) return;

  const removed = owner.bench.splice(idx, 1)[0]!;
  const profile = getEffectiveCharacterProfile(removed);

  // Return character (and evolutions/stand/items/energies cleanly)
  owner.deck.push(removed.cardId);
  for (const evoId of removed.evolvedCardIds) owner.deck.push(evoId);
  if (removed.attachedStand) {
    owner.discard.push(removed.attachedStand.cardId);
    for (const sEvo of removed.attachedStand.evolvedCardIds) owner.discard.push(sEvo);
  }
  for (const it of removed.attachedItems) owner.discard.push(it.cardId);
  for (const en of removed.attachedEnergies) owner.discard.push(`energy-${en.toLowerCase()}`);

  owner.deck = rng.shuffle(owner.deck);

  pushEvent(state, eventsOut, {
    type: 'ABILITY_TRIGGERED',
    playerId: getOpponentId(ownerPlayerId),
    abilityName: 'Bites The Dust',
    message: `${profile.name} es devuelto de la banca al mazo de ${owner.name} (y se baraja).`,
  });
}

export function validatePromptResponse(
  state: GameState,
  playerId: PlayerId,
  response: PromptResponsePayload,
): { ok: boolean; reason?: string } {
  const prompt = state.pendingPrompt;
  if (!prompt) {
    return { ok: false, reason: 'No hay ninguna decisión pendiente.' };
  }
  if (prompt.playerId !== playerId) {
    return { ok: false, reason: 'No es tu turno de responder a esta decisión.' };
  }
  if (prompt.kind !== response.kind) {
    return { ok: false, reason: `Tipo de respuesta incorrecto (esperado ${prompt.kind}).` };
  }

  const player = state.players[playerId];

  switch (prompt.kind) {
    case 'YARE_YARE_DAZE_REACTION': {
      const r = response as Extract<PromptResponsePayload, { kind: 'YARE_YARE_DAZE_REACTION' }>;
      if (r.accept) {
        if (
          r.discardHandIndex === undefined ||
          r.discardHandIndex < 0 ||
          r.discardHandIndex >= player.hand.length
        ) {
          return { ok: false, reason: 'Debes elegir una carta válida de tu mano para descartar.' };
        }
      }
      return { ok: true };
    }
    case 'PROMOTE_FROM_BENCH':
    case 'RETREAT_CHOOSE_NEW_ACTIVE': {
      const r = response as Extract<
        PromptResponsePayload,
        { kind: 'PROMOTE_FROM_BENCH' | 'RETREAT_CHOOSE_NEW_ACTIVE' }
      >;
      if (!player.bench.some((b) => b.instanceId === r.benchInstanceId)) {
        return { ok: false, reason: 'El personaje elegido no está en tu banca.' };
      }
      return { ok: true };
    }
    case 'DISTRIBUTE_BENCH_DAMAGE': {
      const r = response as Extract<PromptResponsePayload, { kind: 'DISTRIBUTE_BENCH_DAMAGE' }>;
      let sum = 0;
      for (const [instId, dmg] of Object.entries(r.allocation)) {
        if (!prompt.eligibleInstanceIds.includes(instId)) {
          return { ok: false, reason: `Objetivo de daño no válido: ${instId}.` };
        }
        if (dmg < 0 || dmg % prompt.increment !== 0) {
          return {
            ok: false,
            reason: `El daño repartido debe ser múltiplo de ${prompt.increment}.`,
          };
        }
        sum += dmg;
      }
      if (sum !== prompt.totalDamage) {
        return {
          ok: false,
          reason: `Debes repartir exactamente ${prompt.totalDamage} de daño (asignado: ${sum}).`,
        };
      }
      return { ok: true };
    }
    case 'SELECT_TOP_CARDS': {
      const r = response as Extract<PromptResponsePayload, { kind: 'SELECT_TOP_CARDS' }>;
      const unique = new Set(r.pickedIndices);
      if (unique.size !== prompt.pickCount) {
        return { ok: false, reason: `Debes elegir exactamente ${prompt.pickCount} carta(s).` };
      }
      for (const idx of unique) {
        if (idx < 0 || idx >= prompt.cards.length) {
          return { ok: false, reason: 'Índice de carta fuera de rango.' };
        }
      }
      return { ok: true };
    }
    case 'REORDER_OPPONENT_TOP_DECK': {
      const r = response as Extract<PromptResponsePayload, { kind: 'REORDER_OPPONENT_TOP_DECK' }>;
      const unique = new Set(r.orderedIndices);
      if (unique.size !== prompt.cards.length) {
        return { ok: false, reason: 'Debes ordenar todas las cartas mostradas.' };
      }
      for (const idx of unique) {
        if (idx < 0 || idx >= prompt.cards.length) {
          return { ok: false, reason: 'Índice de orden fuera de rango.' };
        }
      }
      return { ok: true };
    }
    case 'CHOOSE_ENEMY_BENCH_TARGET': {
      const r = response as Extract<PromptResponsePayload, { kind: 'CHOOSE_ENEMY_BENCH_TARGET' }>;
      const targetBench = state.players[prompt.targetPlayerId].bench;
      if (!targetBench.some((b) => b.instanceId === r.benchInstanceId)) {
        return { ok: false, reason: 'El personaje elegido no está en la banca enemiga.' };
      }
      return { ok: true };
    }
    case 'CHOOSE_ENEMY_STAND_ATTACK': {
      const r = response as Extract<PromptResponsePayload, { kind: 'CHOOSE_ENEMY_STAND_ATTACK' }>;
      if (!prompt.availableAttackIds.includes(r.attackId)) {
        return { ok: false, reason: 'El movimiento elegido no pertenece al Stand enemigo.' };
      }
      return { ok: true };
    }
    case 'RECOVER_ITEM_FROM_DISCARD': {
      const r = response as Extract<PromptResponsePayload, { kind: 'RECOVER_ITEM_FROM_DISCARD' }>;
      const cardId = player.discard[r.discardIndex];
      if (!cardId || getCardById(cardId)?.type !== 'ITEM') {
        return { ok: false, reason: 'Debes seleccionar una carta de Objeto válida de descartes.' };
      }
      return { ok: true };
    }
    case 'SEARCH_DECK_CARDS': {
      const r = response as Extract<PromptResponsePayload, { kind: 'SEARCH_DECK_CARDS' }>;
      const unique = new Set(r.deckIndices);
      if (unique.size !== r.deckIndices.length) {
        return { ok: false, reason: 'No puedes seleccionar la misma carta del mazo dos veces.' };
      }
      if (unique.size > prompt.maxPickCount) {
        return {
          ok: false,
          reason: `Solo puedes elegir como máximo ${prompt.maxPickCount} carta(s).`,
        };
      }
      for (const idx of unique) {
        const cid = player.deck[idx];
        const card = cid ? getCardById(cid) : undefined;
        if (!card) return { ok: false, reason: 'Índice de carta del mazo fuera de rango.' };
        const matches =
          prompt.filter === 'ENERGY'
            ? card.type === 'ENERGY'
            : prompt.filter === 'STAND'
              ? card.type === 'STAND'
              : prompt.filter === 'STAND_EVOLUTION'
                ? card.type === 'EVOLUTION' && card.evolutionTarget === 'STAND'
                : prompt.filter === 'CONVENTIONAL_FIGHTER'
                  ? card.type === 'CHARACTER' && card.categories.includes('CONVENTIONAL_FIGHTER')
                  : prompt.filter === 'HAMON_USER'
                    ? card.type === 'CHARACTER' && card.categories.includes('HAMON_USER')
                    : card.type === 'CHARACTER' || card.type === 'STAND';
        if (!matches) {
          return {
            ok: false,
            reason: `La carta ${card.name} no cumple el filtro de búsqueda.`,
          };
        }
      }
      return { ok: true };
    }
    case 'RECOVER_ENERGY_FROM_DISCARD': {
      const r = response as Extract<PromptResponsePayload, { kind: 'RECOVER_ENERGY_FROM_DISCARD' }>;
      const cardId = player.discard[r.discardIndex];
      if (!cardId || getCardById(cardId)?.type !== 'ENERGY') {
        return { ok: false, reason: 'Debes seleccionar una carta de Energía válida de descartes.' };
      }
      return { ok: true };
    }
    case 'CHOOSE_ALLY_BENCH_HEAL': {
      const r = response as Extract<PromptResponsePayload, { kind: 'CHOOSE_ALLY_BENCH_HEAL' }>;
      if (
        !prompt.eligibleInstanceIds.includes(r.benchInstanceId) ||
        !findCharacterOnBoard(state, playerId, r.benchInstanceId)
      ) {
        return { ok: false, reason: 'Debes elegir un personaje aliado válido para curar.' };
      }
      return { ok: true };
    }
    case 'PEEK_TOP_DECK': {
      const r = response as Extract<PromptResponsePayload, { kind: 'PEEK_TOP_DECK' }>;
      if (r.target !== 'SELF' && r.target !== 'OPPONENT') {
        return { ok: false, reason: 'Debes elegir ver tu mazo o el mazo del oponente.' };
      }
      return { ok: true };
    }
    case 'CHOOSE_PRIZE_CARD': {
      const r = response as Extract<PromptResponsePayload, { kind: 'CHOOSE_PRIZE_CARD' }>;
      if (
        !Number.isInteger(r.prizeIndex) ||
        r.prizeIndex < 0 ||
        r.prizeIndex >= player.prizeCards.length
      ) {
        return { ok: false, reason: 'Debes seleccionar una Carta de Premio válida.' };
      }
      return { ok: true };
    }
    case 'CHOOSE_STAND_FROM_DECK': {
      const r = response as Extract<PromptResponsePayload, { kind: 'CHOOSE_STAND_FROM_DECK' }>;
      if (!prompt.eligibleStandCardIds.includes(r.standCardId) || !player.deck.includes(r.standCardId)) {
        return { ok: false, reason: 'El Stand elegido no está disponible en tu mazo.' };
      }
      return { ok: true };
    }
    case 'CHOOSE_ENEMY_EQUIPPED_ITEM': {
      const r = response as Extract<PromptResponsePayload, { kind: 'CHOOSE_ENEMY_EQUIPPED_ITEM' }>;
      const found = findCharacterOnBoard(state, prompt.targetPlayerId, r.characterInstanceId);
      if (!found || !found.character.attachedItems.some((it) => it.instanceId === r.itemInstanceId)) {
        return { ok: false, reason: 'Debes seleccionar un objeto equipado válido del rival.' };
      }
      return { ok: true };
    }
    case 'CHOOSE_HAND_CHARACTER_SWAP': {
      const r = response as Extract<PromptResponsePayload, { kind: 'CHOOSE_HAND_CHARACTER_SWAP' }>;
      if (
        !prompt.eligibleHandIndices.includes(r.handIndex) ||
        !player.hand[r.handIndex] ||
        !getCharacterCard(player.hand[r.handIndex]!)
      ) {
        return { ok: false, reason: 'Debes seleccionar un personaje válido de tu mano.' };
      }
      return { ok: true };
    }
  }
}

function swapActiveWithHandCharacter(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  handIndex: number,
  sourceLabel: string,
): void {
  const player = state.players[playerId];
  const outgoing = player.active;
  const incomingCardId = player.hand[handIndex];
  if (!outgoing || !incomingCardId || !getCharacterCard(incomingCardId)) return;

  player.hand.splice(handIndex, 1);
  const outgoingProfile = getEffectiveCharacterProfile(outgoing);

  // Return outgoing character (+ evolutions) and attached Stand (+ evolutions) to hand; discard items & energies
  player.hand.push(outgoing.cardId);
  for (const evoId of outgoing.evolvedCardIds) player.hand.push(evoId);
  if (outgoing.attachedStand) {
    player.hand.push(outgoing.attachedStand.cardId);
    for (const evoId of outgoing.attachedStand.evolvedCardIds) player.hand.push(evoId);
  }
  for (const item of outgoing.attachedItems) player.discard.push(item.cardId);
  for (const eType of outgoing.attachedEnergies) {
    player.discard.push(`energy-${eType.toLowerCase()}`);
  }

  const incoming = createCharacterInstance(state, incomingCardId);
  player.active = incoming;
  const incomingProfile = getEffectiveCharacterProfile(incoming);

  pushEvent(state, eventsOut, {
    type: 'ABILITY_TRIGGERED',
    playerId,
    abilityName: sourceLabel,
    message: `¡${sourceLabel}! ${outgoingProfile.name} regresa a la mano y ${incomingProfile.name} entra al Puesto Activo.`,
  });
  pushEvent(state, eventsOut, {
    type: 'BENCH_SWAP',
    playerId,
    newActiveCardId: incomingProfile.currentCardId,
    endedTurn: false,
    message: `${incomingProfile.name} ocupa el Puesto Activo de ${player.name}.`,
  });

  triggerOnEnterFieldAbility(state, eventsOut, playerId, incoming);
}

export function resolvePendingPrompt(
  state: GameState,
  eventsOut: CombatEvent[],
  playerId: PlayerId,
  response: PromptResponsePayload,
  rng: RngProvider,
): void {
  const prompt = state.pendingPrompt;
  if (!prompt) return;

  // Pop current prompt before executing so nested triggers enqueue cleanly
  state.pendingPrompt = null;
  const player = state.players[playerId];

  switch (prompt.kind) {
    case 'YARE_YARE_DAZE_REACTION': {
      const r = response as Extract<PromptResponsePayload, { kind: 'YARE_YARE_DAZE_REACTION' }>;
      if (r.accept && r.discardHandIndex !== undefined) {
        const discardedId = player.hand.splice(r.discardHandIndex, 1)[0]!;
        player.discard.push(discardedId);
        pushEvent(state, eventsOut, {
          type: 'STATUS_PREVENTED',
          targetPlayerId: playerId,
          targetInstanceId: prompt.targetInstanceId,
          status: prompt.status,
          reason: 'Yare Yare Daze',
          message: `¡Yare Yare Daze! Jotaro descarta ${getCardById(discardedId)?.name ?? discardedId} y anula el estado elemental.`,
        });
      } else {
        applyStatusConfirmed(
          state,
          eventsOut,
          playerId,
          prompt.targetInstanceId,
          prompt.status,
        );
      }
      break;
    }
    case 'PROMOTE_FROM_BENCH': {
      const r = response as Extract<PromptResponsePayload, { kind: 'PROMOTE_FROM_BENCH' }>;
      const idx = player.bench.findIndex((b) => b.instanceId === r.benchInstanceId);
      if (idx !== -1) {
        const promoted = player.bench.splice(idx, 1)[0]!;
        player.active = promoted;
        const prof = getEffectiveCharacterProfile(promoted);
        pushEvent(state, eventsOut, {
          type: 'BENCH_SWAP',
          playerId,
          newActiveCardId: prof.currentCardId,
          endedTurn: false,
          message: `${prof.name} es promovido al Puesto Activo.`,
        });
        cleanseBurn(state, eventsOut, playerId, promoted.instanceId, 'promoción al Puesto Activo');
        triggerOnMoveToActiveAbility(state, eventsOut, playerId, promoted);
      }
      break;
    }
    case 'RETREAT_CHOOSE_NEW_ACTIVE': {
      const r = response as Extract<PromptResponsePayload, { kind: 'RETREAT_CHOOSE_NEW_ACTIVE' }>;
      const idx = player.bench.findIndex((b) => b.instanceId === r.benchInstanceId);
      if (idx !== -1 && player.active) {
        const outgoing = player.active;
        const incoming = player.bench.splice(idx, 1)[0]!;
        player.active = incoming;
        player.bench.push(outgoing);
        cleanseBurn(state, eventsOut, playerId, outgoing.instanceId, 'retirada a la banca');
        cleanseBurn(state, eventsOut, playerId, incoming.instanceId, 'promoción al Puesto Activo');
        triggerOnMoveToActiveAbility(state, eventsOut, playerId, incoming, outgoing);
        pushEvent(state, eventsOut, {
          type: 'BENCH_SWAP',
          playerId,
          newActiveCardId: getEffectiveCharacterProfile(incoming).currentCardId,
          endedTurn: false,
          message: `${getEffectiveCharacterProfile(incoming).name} entra al Puesto Activo tras ${prompt.sourceLabel}.`,
        });
      }
      break;
    }
    case 'DISTRIBUTE_BENCH_DAMAGE': {
      const r = response as Extract<PromptResponsePayload, { kind: 'DISTRIBUTE_BENCH_DAMAGE' }>;
      const enemyActiveId = state.players[prompt.targetPlayerId].active?.instanceId;
      for (const [instId, dmg] of Object.entries(r.allocation)) {
        if (dmg <= 0 || state.phase === 'GAME_OVER') continue;
        dealDamageToCharacter(state, eventsOut, {
          targetPlayerId: prompt.targetPlayerId,
          targetInstanceId: instId,
          amount: dmg,
          source: instId === enemyActiveId ? 'ATTACK' : 'BENCH',
          attackerPlayerId: playerId,
          attackEnergies: prompt.attackElementEnergies as EnergyType[],
          rng,
        });
      }
      break;
    }
    case 'SELECT_TOP_CARDS': {
      const r = response as Extract<PromptResponsePayload, { kind: 'SELECT_TOP_CARDS' }>;
      const pickedSet = new Set(r.pickedIndices);
      for (const idx of r.pickedIndices) {
        player.hand.push(prompt.cards[idx]!);
      }
      const remainingIndices = prompt.cards
        .map((_, idx) => idx)
        .filter((idx) => !pickedSet.has(idx));
      const orderedRemaining =
        r.restOrderIndices && r.restOrderIndices.length === remainingIndices.length
          ? r.restOrderIndices.map((idx) => prompt.cards[idx]!)
          : remainingIndices.map((idx) => prompt.cards[idx]!);

      if (prompt.restTo === 'TOP') {
        player.deck.unshift(...orderedRemaining);
      } else {
        player.deck.push(...orderedRemaining);
      }
      pushEvent(state, eventsOut, {
        type: 'CARD_DRAWN',
        playerId,
        count: r.pickedIndices.length,
        message: `${player.name} añade ${r.pickedIndices.length} carta(s) a su mano con ${prompt.sourceLabel}.`,
      });
      checkImmediateDeckOut(state, eventsOut, playerId);
      if (r.pickedIndices.length > 0) {
        triggerOpponentExtraDrawReaction(state, eventsOut, playerId);
      }
      break;
    }
    case 'REORDER_OPPONENT_TOP_DECK': {
      const r = response as Extract<PromptResponsePayload, { kind: 'REORDER_OPPONENT_TOP_DECK' }>;
      const targetPlayer = state.players[prompt.targetPlayerId];
      const reordered = r.orderedIndices.map((i) => prompt.cards[i]!);
      targetPlayer.deck.unshift(...reordered);
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId,
        abilityName: prompt.sourceLabel,
        message: `${player.name} reordena las ${reordered.length} cartas superiores del mazo de ${targetPlayer.name}.`,
      });
      break;
    }
    case 'CHOOSE_ENEMY_BENCH_TARGET': {
      const r = response as Extract<PromptResponsePayload, { kind: 'CHOOSE_ENEMY_BENCH_TARGET' }>;
      if (prompt.effect === 'APPLY_BURN') {
        tryApplyElementalStatus(
          state,
          eventsOut,
          prompt.targetPlayerId,
          r.benchInstanceId,
          'BURN',
          prompt.sourceLabel,
        );
      } else if (prompt.effect === 'RETURN_TO_DECK') {
        returnBenchCharacterToDeck(
          state,
          eventsOut,
          prompt.targetPlayerId,
          r.benchInstanceId,
          rng,
        );
      }
      break;
    }
    case 'CHOOSE_ENEMY_STAND_ATTACK': {
      const r = response as Extract<PromptResponsePayload, { kind: 'CHOOSE_ENEMY_STAND_ATTACK' }>;
      const enemyActive = state.players[prompt.targetPlayerId].active;
      if (enemyActive) {
        const entry = getAvailableAttacks(enemyActive).find((a) => a.attack.id === r.attackId);
        if (entry) {
          executeAttack(state, eventsOut, playerId, entry.attack.id, rng, {
            attack: entry.attack,
            source: 'STAND',
          });
          return;
        }
      }
      break;
    }
    case 'RECOVER_ITEM_FROM_DISCARD': {
      const r = response as Extract<PromptResponsePayload, { kind: 'RECOVER_ITEM_FROM_DISCARD' }>;
      const recovered = player.discard.splice(r.discardIndex, 1)[0]!;
      if (prompt.destination === 'HAND') {
        player.hand.push(recovered);
      } else {
        player.deck.push(recovered);
        player.deck = rng.shuffle(player.deck);
      }
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId,
        abilityName: prompt.sourceLabel,
        message: `${player.name} recupera ${getCardById(recovered)?.name ?? recovered} a su ${prompt.destination === 'HAND' ? 'mano' : 'mazo'}.`,
      });
      break;
    }
    case 'SEARCH_DECK_CARDS': {
      const r = response as Extract<PromptResponsePayload, { kind: 'SEARCH_DECK_CARDS' }>;
      const sortedDesc = [...r.deckIndices].sort((a, b) => b - a);
      const pickedNames: string[] = [];
      for (const idx of sortedDesc) {
        const pickedId = player.deck.splice(idx, 1)[0]!;
        player.hand.push(pickedId);
        pickedNames.push(getCardById(pickedId)?.name ?? pickedId);
      }
      player.deck = rng.shuffle(player.deck);
      pushEvent(state, eventsOut, {
        type: 'CARD_DRAWN',
        playerId,
        count: pickedNames.length,
        message:
          pickedNames.length > 0
            ? `${player.name} busca en el mazo (${prompt.sourceLabel}): obtiene ${pickedNames.reverse().join(', ')} y baraja.`
            : `${player.name} baraja su mazo sin elegir cartas (${prompt.sourceLabel}).`,
      });
      checkImmediateDeckOut(state, eventsOut, playerId);
      if (pickedNames.length > 0) {
        triggerOpponentExtraDrawReaction(state, eventsOut, playerId);
      }
      break;
    }
    case 'RECOVER_ENERGY_FROM_DISCARD': {
      const r = response as Extract<PromptResponsePayload, { kind: 'RECOVER_ENERGY_FROM_DISCARD' }>;
      const recovered = player.discard.splice(r.discardIndex, 1)[0]!;
      player.hand.push(recovered);
      pushEvent(state, eventsOut, {
        type: 'CARD_DRAWN',
        playerId,
        count: 1,
        message: `${player.name} recupera ${getCardById(recovered)?.name ?? recovered} desde descartes (${prompt.sourceLabel}).`,
      });
      break;
    }
    case 'CHOOSE_ALLY_BENCH_HEAL': {
      const r = response as Extract<PromptResponsePayload, { kind: 'CHOOSE_ALLY_BENCH_HEAL' }>;
      if (prompt.coinFlipDamageAmount) {
        const flip = rng.flipCoin();
        pushEvent(state, eventsOut, {
          type: 'COIN_FLIPPED',
          playerId,
          attackName: prompt.sourceLabel,
          results: [flip],
          message: `${prompt.sourceLabel}: moneda → ${
            flip === 'HEADS'
              ? `CARA (+${prompt.healAmount} HP)`
              : `CRUZ (-${prompt.coinFlipDamageAmount} HP)`
          }.`,
        });
        if (flip === 'HEADS') {
          healCharacter(
            state,
            eventsOut,
            playerId,
            r.benchInstanceId,
            prompt.healAmount,
            prompt.sourceLabel,
          );
        } else {
          dealDamageToCharacter(state, eventsOut, {
            targetPlayerId: playerId,
            targetInstanceId: r.benchInstanceId,
            amount: prompt.coinFlipDamageAmount,
            source: 'RECOIL',
            rng,
            ignoreDodge: true,
          });
        }
      } else {
        healCharacter(
          state,
          eventsOut,
          playerId,
          r.benchInstanceId,
          prompt.healAmount,
          prompt.sourceLabel,
        );
      }
      break;
    }
    case 'PEEK_TOP_DECK': {
      const r = response as Extract<PromptResponsePayload, { kind: 'PEEK_TOP_DECK' }>;
      const count = r.target === 'SELF' ? prompt.ownTopCards.length : prompt.opponentTopCards.length;
      pushEvent(state, eventsOut, {
        type: 'ABILITY_TRIGGERED',
        playerId,
        abilityName: prompt.sourceLabel,
        message: `${player.name} usa ${prompt.sourceLabel} y observa las ${count} próximas cartas del mazo ${
          r.target === 'SELF' ? 'propio' : 'rival'
        }.`,
      });
      break;
    }
    case 'CHOOSE_PRIZE_CARD': {
      const r = response as Extract<PromptResponsePayload, { kind: 'CHOOSE_PRIZE_CARD' }>;
      const takenPrizeId = player.prizeCards.splice(r.prizeIndex, 1)[0]!;
      player.hand.push(takenPrizeId);
      const prizeCardName = getCardById(takenPrizeId)?.name ?? takenPrizeId;
      pushEvent(state, eventsOut, {
        type: 'CARD_DRAWN',
        playerId,
        count: 1,
        message: `¡Carta de Premio! ${player.name} elige y roba ${prizeCardName} (${player.prizeCards.length} restante(s)).`,
      });
      if (player.prizeCards.length === 0) {
        setGameOver(
          state,
          eventsOut,
          playerId,
          `¡${player.name} ha robado todas sus Cartas de Premio!`,
        );
        return;
      }
      break;
    }
    case 'CHOOSE_STAND_FROM_DECK': {
      const r = response as Extract<PromptResponsePayload, { kind: 'CHOOSE_STAND_FROM_DECK' }>;
      attachSummonedStandFromDeck(
        state,
        eventsOut,
        playerId,
        prompt.targetInstanceId,
        r.standCardId,
        rng,
      );
      break;
    }
    case 'CHOOSE_ENEMY_EQUIPPED_ITEM': {
      const r = response as Extract<PromptResponsePayload, { kind: 'CHOOSE_ENEMY_EQUIPPED_ITEM' }>;
      const opponent = state.players[prompt.targetPlayerId];
      const found = findCharacterOnBoard(state, prompt.targetPlayerId, r.characterInstanceId);
      if (found) {
        const idx = found.character.attachedItems.findIndex((it) => it.instanceId === r.itemInstanceId);
        if (idx !== -1) {
          const removed = found.character.attachedItems.splice(idx, 1)[0]!;
          opponent.discard.push(removed.cardId);
          const newMax = computeEffectiveMaxHp(state, prompt.targetPlayerId, found.character);
          if (found.character.currentHp > newMax) found.character.currentHp = newMax;
          const removedName = getCardById(removed.cardId)?.name ?? removed.cardId;
          const charName = getEffectiveCharacterProfile(found.character).name;
          pushEvent(state, eventsOut, {
            type: 'ABILITY_TRIGGERED',
            playerId,
            abilityName: prompt.sourceLabel,
            message: `¡${prompt.sourceLabel}! Descarta ${removedName} equipado en ${charName}.`,
          });
        }
      }
      const drawnCount = Math.min(prompt.drawCount, player.deck.length);
      for (let i = 0; i < drawnCount; i++) {
        player.hand.push(player.deck.shift()!);
      }
      if (drawnCount > 0) {
        pushEvent(state, eventsOut, {
          type: 'CARD_DRAWN',
          playerId,
          count: drawnCount,
          message: `${player.name} roba ${drawnCount} carta(s) gracias a ${prompt.sourceLabel}.`,
        });
        checkImmediateDeckOut(state, eventsOut, playerId);
        triggerOpponentExtraDrawReaction(state, eventsOut, playerId);
      }
      break;
    }
    case 'CHOOSE_HAND_CHARACTER_SWAP': {
      const r = response as Extract<PromptResponsePayload, { kind: 'CHOOSE_HAND_CHARACTER_SWAP' }>;
      swapActiveWithHandCharacter(state, eventsOut, playerId, r.handIndex, prompt.sourceLabel);
      break;
    }
  }

  drainPromptQueueOrContinue(state, eventsOut, rng);
}
