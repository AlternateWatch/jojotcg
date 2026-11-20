import type { AnyCard } from '../../../data/schemas/cardTypes';
import { validateAction } from '../../../engine/gameEngine';
import { getEffectiveCharacterProfile } from '../../../engine/helpers/cardStats';
import type { GameAction } from '../../../engine/types/actions';
import type { GameState, PlayerId } from '../../../engine/types/state';

interface HandActionRibbonProps {
  gameState: GameState;
  playerId: PlayerId;
  handIndex: number;
  card: AnyCard;
  onDispatch: (action: GameAction) => void;
  onCancel: () => void;
}

export function HandActionRibbon({
  gameState,
  playerId,
  handIndex,
  card,
  onDispatch,
  onCancel,
}: HandActionRibbonProps) {
  const player = gameState.players[playerId];

  const renderPrimaryAction = () => {
    if (card.type === 'STAND') {
      const candidates = [
        ...(player.active ? [{ ch: player.active, zoneLabel: 'Activo' }] : []),
        ...player.bench.map((ch) => ({ ch, zoneLabel: 'Banca' })),
      ];
      const validTargets = candidates
        .map(({ ch, zoneLabel }) => {
          const action: GameAction = {
            type: 'EQUIP_STAND',
            playerId,
            handIndex,
            targetInstanceId: ch.instanceId,
          };
          const check = validateAction(gameState, action);
          return { ch, zoneLabel, action, check };
        })
        .filter((item) => item.check.ok);

      if (validTargets.length === 0) {
        const fallbackReason =
          candidates.length > 0
            ? validateAction(gameState, {
                type: 'EQUIP_STAND',
                playerId,
                handIndex,
                targetInstanceId: candidates[0]!.ch.instanceId,
              }).reason
            : 'No hay ningún Usuario de Stand compatible en tu campo.';
        return (
          <button
            type="button"
            disabled
            className="jojo-btn-ink px-3 py-1 font-jojo-heading text-xs tracking-wider uppercase opacity-50"
          >
            {fallbackReason ?? 'Sin usuario compatible en campo o banca'}
          </button>
        );
      }

      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {validTargets.map(({ ch, zoneLabel, action }) => {
            const prof = getEffectiveCharacterProfile(ch);
            return (
              <button
                key={ch.instanceId}
                type="button"
                onClick={() => onDispatch(action)}
                className="jojo-btn-primary px-3 py-1 font-jojo-heading text-xs tracking-wider uppercase"
              >
                Equipar en {prof.name} ({zoneLabel})
              </button>
            );
          })}
        </div>
      );
    }

    if (card.type === 'ENERGY' && player.active) {
      const action: GameAction = {
        type: 'ATTACH_ENERGY',
        playerId,
        handIndex,
        targetInstanceId: player.active.instanceId,
      };
      const check = validateAction(gameState, action);
      return (
        <button
          type="button"
          disabled={!check.ok}
          onClick={() => onDispatch(action)}
          className="jojo-btn-primary px-3 py-1 font-jojo-heading text-xs tracking-wider uppercase disabled:opacity-40"
        >
          {check.ok ? 'Unir al Activo (o haz clic en banca)' : check.reason}
        </button>
      );
    }

    if (card.type === 'ITEM') {
      const action: GameAction = {
        type: 'PLAY_ITEM',
        playerId,
        handIndex,
        targetInstanceId: player.active?.instanceId,
      };
      const check = validateAction(gameState, action);
      return (
        <button
          type="button"
          disabled={!check.ok}
          onClick={() => onDispatch(action)}
          className="jojo-btn-primary px-3 py-1 font-jojo-heading text-xs tracking-wider uppercase disabled:opacity-40"
        >
          {check.ok
            ? card.itemKind === 'EQUIPPABLE'
              ? 'Equipar al Activo (o clic en banca)'
              : 'Usar Objeto'
            : check.reason}
        </button>
      );
    }

    if (card.type === 'EVOLUTION') {
      const action: GameAction = { type: 'EVOLVE_CARD', playerId, handIndex };
      const check = validateAction(gameState, action);
      return (
        <button
          type="button"
          disabled={!check.ok}
          onClick={() => onDispatch(action)}
          className="jojo-btn-primary px-3.5 py-1 font-jojo-heading text-xs tracking-wider uppercase disabled:opacity-40"
        >
          {check.ok ? '¡EVOLUCIONAR! (1/turno)' : check.reason}
        </button>
      );
    }

    if (card.type === 'CHARACTER') {
      const action: GameAction = { type: 'PLAY_TO_BENCH', playerId, handIndex };
      const check = validateAction(gameState, action);
      return (
        <button
          type="button"
          disabled={!check.ok}
          onClick={() => onDispatch(action)}
          className="jojo-btn-crimson px-3 py-1 font-jojo-heading text-xs tracking-wider uppercase disabled:opacity-40"
        >
          {check.ok ? 'Bajar a Banca (Finaliza turno)' : check.reason}
        </button>
      );
    }

    return null;
  };

  return (
    <div className="jojo-panel mb-2 flex flex-wrap items-center justify-center gap-2.5 px-4 py-2">
      <span className="font-jojo-heading text-sm tracking-wider text-[#f2c12e] uppercase">
        {card.name}
      </span>
      {renderPrimaryAction()}
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancelar selección"
        className="jojo-btn-ink px-2.5 py-1 text-xs"
      >
        ✕
      </button>
    </div>
  );
}
