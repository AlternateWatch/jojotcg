import { useState } from 'react';
import { ChevronDown, ChevronUp, GraduationCap, Sparkles } from 'lucide-react';
import { getCardById } from '../../../data/cardRegistry';
import type { TutorialLessonDef } from '../../../data/tutorialData';
import { validateAction } from '../../../engine/gameEngine';
import {
  canPayEnergyCost,
  getAvailableAttacks,
  getMaxEnergyAttachmentsThisTurn,
} from '../../../engine/helpers/cardStats';
import type { GameState, PlayerId } from '../../../engine/types/state';

interface TutorialCoachBannerProps {
  lesson: TutorialLessonDef;
  gameState: GameState;
  myId: PlayerId;
}

function computeDynamicInstruction(
  lesson: TutorialLessonDef,
  state: GameState,
  myId: PlayerId,
): { stepLabel: string; text: string } {
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
      };
    }
    if (state.pendingPrompt.kind === 'PROMOTE_FROM_BENCH') {
      return {
        stepLabel: 'PROMOVER DESDE BANCA',
        text: 'Tu Activo ha caído. Elige un personaje de tu banca para ocupar el Puesto Activo.',
      };
    }
    return {
      stepLabel: 'DECISIÓN PENDIENTE',
      text: 'Resuelve la ventana de efecto en pantalla para continuar tu turno.',
    };
  }

  if (state.phase === 'SETUP_MULLIGAN') {
    return {
      stepLabel: 'PASO 1 · MANO INICIAL',
      text: 'Revisa tus 7 cartas iniciales. Si tienes un personaje válido (sin DG o DG ≤ 4), pulsa «Confirmar Mano»; si no, pulsa «Hacer Mulligan».',
    };
  }

  if (state.phase === 'SETUP_ACTIVE') {
    return {
      stepLabel: 'PASO 2 · FORMACIÓN INICIAL',
      text: 'Haz clic primero en tu Personaje Activo inicial y luego marca hasta 3 personajes extra para colocarlos gratis en tu Banca. Pulsa «Confirmar Formación».',
    };
  }

  if (state.activePlayerId !== myId) {
    return {
      stepLabel: 'TURNO DEL RIVAL',
      text: 'Es el turno del entrenador rival. Observa cómo une energía y ataca.',
    };
  }

  const me = state.players[myId];

  if (state.phase === 'COMBAT') {
    return {
      stepLabel: 'FASE DE COMBATE',
      text: 'Haz clic en uno de los ataques iluminados en el centro del tablero para golpear al Activo rival.',
    };
  }

  // PREPARATION phase guidance
  // 1. Can equip a Stand from hand?
  const standInHandIdx = me.hand.findIndex((cid) => getCardById(cid)?.type === 'STAND');
  if (standInHandIdx !== -1 && me.active && !me.active.attachedStand) {
    const canEquipActive = validateAction(state, {
      type: 'EQUIP_STAND',
      playerId: myId,
      handIndex: standInHandIdx,
      targetInstanceId: me.active.instanceId,
    }).ok;
    if (canEquipActive) {
      const stName = getCardById(me.hand[standInHandIdx]!)?.name ?? 'Stand';
      return {
        stepLabel: 'EQUIPA TU STAND (GRATIS)',
        text: `Haz clic en «${stName}» en tu mano y luego haz clic en tu Personaje Activo. Equipar Stand es gratis y activa Resonancia (+1 energía este turno).`,
      };
    }
  }

  // 2. Can Evolve?
  const evoIdx = me.hand.findIndex(
    (cid, idx) =>
      getCardById(cid)?.type === 'EVOLUTION' &&
      validateAction(state, { type: 'EVOLVE_CARD', playerId: myId, handIndex: idx }).ok,
  );
  if (evoIdx !== -1) {
    const evoName = getCardById(me.hand[evoIdx]!)?.name ?? 'Evolución';
    return {
      stepLabel: '¡EVOLUCIÓN DISPONIBLE!',
      text: `Haz clic en «${evoName}» en tu mano y pulsa Evolucionar para desatar su forma definitiva.`,
    };
  }

  // 3. Can attach energy?
  const maxEnergy = getMaxEnergyAttachmentsThisTurn(state, myId);
  const hasEnergyInHand = me.hand.some((cid) => getCardById(cid)?.type === 'ENERGY');
  if (me.energyAttachedThisTurn < maxEnergy && hasEnergyInHand) {
    const hasStandEnergy = me.hand.some((cid) => cid === 'energy-stand');
    return {
      stepLabel: `UNE ENERGÍA (${me.energyAttachedThisTurn}/${maxEnergy})`,
      text: hasStandEnergy
        ? 'Selecciona una Energía (o Energía de Stand, que paga cualquier color en Stands) en tu mano y haz clic en tu Activo para unirla.'
        : 'Haz clic en una carta de Energía de tu mano y luego haz clic en tu Personaje Activo para cargarlo.',
    };
  }

  // 4. Can play a helpful Item (Lesson 4 or whenever holding Pluck / Tonio / Speedwagon)?
  const itemIdx = me.hand.findIndex(
    (cid, idx) =>
      getCardById(cid)?.type === 'ITEM' &&
      (validateAction(state, { type: 'PLAY_ITEM', playerId: myId, handIndex: idx }).ok ||
        (me.active &&
          validateAction(state, {
            type: 'PLAY_ITEM',
            playerId: myId,
            handIndex: idx,
            targetInstanceId: me.active.instanceId,
          }).ok)),
  );
  if (lesson.id === 'tut-4' && itemIdx !== -1) {
    const itemName = getCardById(me.hand[itemIdx]!)?.name ?? 'Objeto';
    return {
      stepLabel: 'USA UN OBJETO TÁCTICO',
      text: `Los Objetos no tienen límite por turno: haz clic en «${itemName}» en tu mano para jugarlo o equiparlo en un aliado.`,
    };
  }

  // 5. Can enter combat and actually pay an attack?
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
    };
  }

  // 6. Active is a Stand User without Stand and Llamada de Stand is available?
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
    };
  }

  // 7. Turn 1 restriction notice
  if (state.turnNumber === 1 && !canEnterCombat) {
    return {
      stepLabel: 'TURNO 1 · PREPARACIÓN',
      text: 'En el Turno 1 no puede atacar el primer jugador ni los personajes sin Stand. Si ya uniste tu Energía, pulsa «Terminar Turno» (o baja un personaje a la banca).',
    };
  }

  return {
    stepLabel: `OBJETIVO · ${lesson.badge}`,
    text: lesson.focusTip,
  };
}

export function TutorialCoachBanner({ lesson, gameState, myId }: TutorialCoachBannerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const guidance = computeDynamicInstruction(lesson, gameState, myId);

  return (
    <div className="relative z-20 mx-auto w-full max-w-[1380px] px-3 pt-2">
      <div className="border-2 border-[#060508] bg-[#141022]/95 shadow-[4px_4px_0_#060508]">
        <div className="flex items-center justify-between gap-3 px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="inline-flex shrink-0 items-center gap-1 border border-[#060508] bg-[#00b87c] px-2 py-0.5 font-mono text-[10px] font-black text-[#0b090e] uppercase">
              <GraduationCap size={12} /> {lesson.badge}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 border border-[#060508] bg-[#f2c12e] px-2 py-0.5 font-mono text-[10px] font-black text-[#0b090e] uppercase">
              <Sparkles size={11} /> {guidance.stepLabel}
            </span>
            <p className="truncate text-xs font-semibold text-[#f5efe0]">{guidance.text}</p>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="shrink-0 border border-white/15 bg-[#1f1830] px-2 py-0.5 font-mono text-[10px] font-bold text-zinc-300 hover:text-white"
          >
            {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        </div>

        {!collapsed && (
          <div className="border-t border-white/10 bg-[#0e0b16] px-3 py-1.5 text-[11px] text-zinc-300">
            <strong className="text-[#f2c12e]">{lesson.mentorName}:</strong> {guidance.text}{' '}
            <span className="text-zinc-500">· Consejo de la lección: {lesson.focusTip}</span>
          </div>
        )}
      </div>
    </div>
  );
}
