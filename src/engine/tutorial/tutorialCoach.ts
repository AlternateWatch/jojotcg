import { getCardById } from '../../data/cardRegistry';
import type { TutorialLessonDef } from '../../data/tutorialData';
import { validateAction } from '../gameEngine';
import {
  canPayEnergyCost,
  getAvailableAttacks,
  getMaxEnergyAttachmentsThisTurn,
} from '../helpers/cardStats';
import type { GameAction } from '../types/actions';
import type { GameState, PlayerId } from '../types/state';

export interface TutorialStepGuidance {
  stepLabel: string;
  text: string;
  /** When set, ONLY these action types (plus CONCEDE) are permitted until the step is satisfied */
  allowedActionTypes?: GameAction['type'][];
  /** Optional card type highlight in hand */
  requiredCardType?: 'STAND' | 'EVOLUTION' | 'ENERGY' | 'ITEM';
  /** Message shown if player attempts a disallowed action */
  blockReason?: string;
}

export function isStrictTutorialLesson(lesson: TutorialLessonDef): boolean {
  return lesson.lessonNumber <= 5;
}

export function computeTutorialStep(
  lesson: TutorialLessonDef,
  state: GameState,
  myId: PlayerId,
): TutorialStepGuidance {
  const step = computeTutorialStepRaw(lesson, state, myId);
  if (!isStrictTutorialLesson(lesson)) {
    return {
      stepLabel: step.stepLabel,
      text: step.text,
    };
  }
  return step;
}

function computeTutorialStepRaw(
  lesson: TutorialLessonDef,
  state: GameState,
  myId: PlayerId,
): TutorialStepGuidance {
  if (state.phase === 'GAME_OVER') {
    return {
      stepLabel: 'LECCIÓN COMPLETADA',
      text: '¡Buen combate! Revisa el resultado para recoger tu recompensa del Tutorial.',
    };
  }

  if (state.pendingPrompt) {
    if (state.pendingPrompt.playerId !== myId) {
      return {
        stepLabel: 'TURNO DEL RIVAL',
        text: 'El rival está tomando una decisión. Observa su jugada.',
      };
    }
    if (state.pendingPrompt.kind === 'CHOOSE_PRIZE_CARD') {
      return {
        stepLabel: 'CARTA DE PREMIO',
        text: '¡Has eliminado a un personaje rival! Haz clic en una de las 6 cartas boca abajo para girarla y robarla. Al robar las 6 ganas la partida.',
        allowedActionTypes: ['RESPOND_PROMPT'],
      };
    }
    if (state.pendingPrompt.kind === 'PROMOTE_FROM_BENCH') {
      return {
        stepLabel: 'PROMOVER DESDE BANCA',
        text: 'Tu Activo ha caído. Elige un personaje de tu banca para ocupar el Puesto Activo.',
        allowedActionTypes: ['RESPOND_PROMPT'],
      };
    }
    return {
      stepLabel: 'DECISIÓN PENDIENTE',
      text: 'Resuelve la ventana de efecto en pantalla para continuar tu turno.',
      allowedActionTypes: ['RESPOND_PROMPT'],
    };
  }

  if (state.phase === 'SETUP_MULLIGAN') {
    return {
      stepLabel: 'PASO 1 · MANO INICIAL',
      text: 'Revisa tus 7 cartas iniciales. Si tienes un personaje válido (sin DG o DG ≤ 4), pulsa «Confirmar Mano»; si no, pulsa «Hacer Mulligan».',
      allowedActionTypes: ['CONFIRM_STARTING_HAND', 'PERFORM_MULLIGAN'],
    };
  }

  if (state.phase === 'SETUP_ACTIVE') {
    return {
      stepLabel: 'PASO 2 · FORMACIÓN INICIAL',
      text: 'Haz clic primero en tu Personaje Activo inicial y luego marca hasta 3 personajes extra para colocarlos gratis en tu Banca. Pulsa «Confirmar Formación».',
      allowedActionTypes: ['CHOOSE_STARTING_ACTIVE'],
    };
  }

  if (state.activePlayerId !== myId) {
    return {
      stepLabel: 'TURNO DEL RIVAL',
      text: 'Es el turno del entrenador rival. Observa cómo une energía y ataca.',
    };
  }

  const me = state.players[myId];
  const boardChars = [...(me.active ? [me.active] : []), ...me.bench];

  if (state.phase === 'COMBAT') {
    const hasLegalAttack =
      me.active !== null &&
      getAvailableAttacks(me.active).some(
        (a) =>
          validateAction(state, {
            type: 'USE_ATTACK',
            playerId: myId,
            attackId: a.attack.id,
          }).ok,
      );
    if (hasLegalAttack) {
      return {
        stepLabel: 'FASE DE COMBATE',
        text: 'Haz clic en uno de los ataques iluminados en el centro del tablero para golpear al Activo rival.',
        allowedActionTypes: ['USE_ATTACK'],
        blockReason: 'Entrenador: estás en Fase de Combate, elige un ataque para golpear al rival.',
      };
    }
    return {
      stepLabel: 'FIN DE COMBATE',
      text: 'No tienes ataques disponibles ahora mismo. Pulsa «Terminar Turno».',
      allowedActionTypes: ['END_TURN'],
    };
  }

  // === PREPARATION PHASE STRICT GUIDANCE ===

  // 1. Equip a Stand from hand onto Active (or Bench if Active already has Stand)
  for (let i = 0; i < me.hand.length; i++) {
    const card = getCardById(me.hand[i]!);
    if (card?.type !== 'STAND') continue;
    const validTarget = boardChars.find(
      (ch) =>
        validateAction(state, {
          type: 'EQUIP_STAND',
          playerId: myId,
          handIndex: i,
          targetInstanceId: ch.instanceId,
        }).ok,
    );
    if (validTarget) {
      const targetZone = me.active?.instanceId === validTarget.instanceId ? 'Personaje Activo' : 'aliado en Banca';
      return {
        stepLabel: 'EQUIPA TU STAND (GRATIS)',
        text: `Haz clic en «${card.name}» en tu mano y luego en tu ${targetZone}. Equipar Stand es gratis y activa Resonancia (+1 energía este turno).`,
        allowedActionTypes: ['EQUIP_STAND'],
        requiredCardType: 'STAND',
        blockReason: `Entrenador: primero equipa «${card.name}» desde tu mano en tu ${targetZone}.`,
      };
    }
  }

  // 2. Evolve if a legal Evolution is in hand
  for (let i = 0; i < me.hand.length; i++) {
    const card = getCardById(me.hand[i]!);
    if (card?.type !== 'EVOLUTION') continue;
    if (validateAction(state, { type: 'EVOLVE_CARD', playerId: myId, handIndex: i }).ok) {
      return {
        stepLabel: '¡EVOLUCIÓN DISPONIBLE!',
        text: `Haz clic en «${card.name}» en tu mano y pulsa Evolucionar para desatar su forma definitiva.`,
        allowedActionTypes: ['EVOLVE_CARD'],
        requiredCardType: 'EVOLUTION',
        blockReason: `Entrenador: primero juega la Evolución «${card.name}» desde tu mano.`,
      };
    }
  }

  // 3. Attach Energy if quota remains and at least one legal energy attachment exists
  const maxEnergy = getMaxEnergyAttachmentsThisTurn(state, myId);
  if (me.energyAttachedThisTurn < maxEnergy) {
    let legalEnergyCardName: string | null = null;
    let hasStandEnergy = false;
    for (let i = 0; i < me.hand.length; i++) {
      const card = getCardById(me.hand[i]!);
      if (card?.type !== 'ENERGY') continue;
      const canAttach = boardChars.some(
        (ch) =>
          validateAction(state, {
            type: 'ATTACH_ENERGY',
            playerId: myId,
            handIndex: i,
            targetInstanceId: ch.instanceId,
          }).ok,
      );
      if (canAttach) {
        if (!legalEnergyCardName) legalEnergyCardName = card.name;
        if (card.energyType === 'STAND') hasStandEnergy = true;
      }
    }
    if (legalEnergyCardName) {
      return {
        stepLabel: `UNE ENERGÍA (${me.energyAttachedThisTurn}/${maxEnergy})`,
        text: hasStandEnergy
          ? 'Selecciona una Energía (o Energía de Stand, que paga cualquier color en Stands) en tu mano y haz clic en tu personaje para unirla.'
          : `Haz clic en «${legalEnergyCardName}» en tu mano y luego haz clic en tu Personaje Activo para cargarlo.`,
        allowedActionTypes: ['ATTACH_ENERGY'],
        requiredCardType: 'ENERGY',
        blockReason: 'Entrenador: primero une una carta de Energía de tu mano a tu personaje.',
      };
    }
  }

  // 4. Lesson 4 (Items): require playing a legal Item from hand if available
  if (lesson.id === 'tut-4') {
    for (let i = 0; i < me.hand.length; i++) {
      const card = getCardById(me.hand[i]!);
      if (card?.type !== 'ITEM') continue;
      const legalStandalone = validateAction(state, {
        type: 'PLAY_ITEM',
        playerId: myId,
        handIndex: i,
      }).ok;
      const legalTargeted = boardChars.some(
        (ch) =>
          validateAction(state, {
            type: 'PLAY_ITEM',
            playerId: myId,
            handIndex: i,
            targetInstanceId: ch.instanceId,
          }).ok,
      );
      // Avoid forcing heal item if nobody is injured or burned
      if (card.id === 'item-comida-de-tonio') {
        const anyHurt = boardChars.some((ch) => ch.currentHp < 100 || Boolean(ch.statuses.burn));
        if (!anyHurt) continue;
      }
      if (legalStandalone || legalTargeted) {
        return {
          stepLabel: 'USA UN OBJETO TÁCTICO',
          text: `Los Objetos no tienen límite por turno: haz clic en «${card.name}» en tu mano para jugarlo o equiparlo en un aliado.`,
          allowedActionTypes: ['PLAY_ITEM'],
          requiredCardType: 'ITEM',
          blockReason: `Entrenador: en esta lección juega primero «${card.name}» desde tu mano.`,
        };
      }
    }
  }

  // 5. Enter Combat Phase if legal AND an attack is payable
  const canEnterCombat = validateAction(state, {
    type: 'ENTER_COMBAT_PHASE',
    playerId: myId,
  }).ok;
  const canPayAnyAttack =
    me.active !== null &&
    getAvailableAttacks(me.active).some((a) =>
      canPayEnergyCost(me.active!.attachedEnergies, a.attack.energyCost, a.source),
    );
  if (canEnterCombat && canPayAnyAttack) {
    return {
      stepLabel: '¡LISTO PARA ATACAR!',
      text: 'Ya tienes suficiente energía. Pulsa el botón rojo «Fase de Combate» en el centro para atacar al rival.',
      allowedActionTypes: ['ENTER_COMBAT_PHASE', 'PLAY_ITEM', 'USE_PREP_ABILITY'],
      blockReason: 'Entrenador: ya puedes atacar este turno. Pulsa «Fase de Combate» en el centro.',
    };
  }

  // 6. Active is a Stand User without Stand and Llamada de Stand is legal
  if (
    me.active &&
    !me.active.attachedStand &&
    validateAction(state, {
      type: 'SUMMON_STAND_FROM_DECK',
      playerId: myId,
      targetInstanceId: me.active.instanceId,
    }).ok
  ) {
    return {
      stepLabel: 'LLAMADA DE STAND',
      text: 'Tu Usuario Activo aún no tiene Stand. Pulsa «⚡ Llamar Stand» en el centro para invocar un Stand compatible aleatorio desde tu mazo (termina el turno).',
      allowedActionTypes: ['SUMMON_STAND_FROM_DECK', 'PLAY_ITEM'],
      blockReason: 'Entrenador: pulsa «⚡ Llamar Stand» en el centro para invocar un Stand a tu Activo.',
    };
  }

  // 7. Turn 1 restriction notice
  if (state.turnNumber === 1 && !canEnterCombat) {
    return {
      stepLabel: 'TURNO 1 · TERMINA TU TURNO',
      text: 'En el Turno 1 no puede atacar el primer jugador ni los personajes sin Stand. Pulsa «Terminar Turno» (o baja un personaje a la banca).',
      allowedActionTypes: ['END_TURN', 'PLAY_TO_BENCH', 'PLAY_ITEM', 'USE_PREP_ABILITY', 'SUMMON_STAND_FROM_DECK'],
    };
  }

  return {
    stepLabel: `OBJETIVO · ${lesson.badge}`,
    text: lesson.focusTip,
  };
}

export function checkTutorialActionAllowed(
  lesson: TutorialLessonDef,
  state: GameState,
  myId: PlayerId,
  action: GameAction,
): { ok: true } | { ok: false; reason: string } {
  if (!isStrictTutorialLesson(lesson) || action.type === 'CONCEDE' || action.playerId !== myId) {
    return { ok: true };
  }
  const step = computeTutorialStep(lesson, state, myId);
  if (!step.allowedActionTypes || step.allowedActionTypes.length === 0) {
    return { ok: true };
  }
  if (step.allowedActionTypes.includes(action.type)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: step.blockReason ?? `Sigue al entrenador: ${step.text}`,
  };
}
