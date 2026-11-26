import type { AnyCard } from '../../../data/schemas/cardTypes';
import { validateAction } from '../../../engine/gameEngine';
import {
  computeEffectiveMaxHp,
  getEffectiveCharacterProfile,
} from '../../../engine/helpers/cardStats';
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
      const hasStandaloneBurn = card.effects.some((e) => e.kind === 'BURN_ENEMY_ACTIVE');
      if (hasStandaloneBurn) {
        const burnAction: GameAction = {
          type: 'PLAY_ITEM',
          playerId,
          handIndex,
        };
        const burnCheck = validateAction(gameState, burnAction);

        const equipAction: GameAction = {
          type: 'PLAY_ITEM',
          playerId,
          handIndex,
          targetInstanceId: player.active?.instanceId,
        };
        const equipCheck = validateAction(gameState, equipAction);

        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={!burnCheck.ok}
              onClick={() => onDispatch(burnAction)}
              className="jojo-btn-crimson px-3 py-1 font-jojo-heading text-xs tracking-wider uppercase disabled:opacity-40"
            >
              {burnCheck.ok ? 'Quemar Oponente (Por su cuenta)' : burnCheck.reason}
            </button>
            {player.active && (
              <button
                type="button"
                disabled={!equipCheck.ok}
                onClick={() => onDispatch(equipAction)}
                className="jojo-btn-primary px-3 py-1 font-jojo-heading text-xs tracking-wider uppercase disabled:opacity-40"
              >
                Equipar al Activo (Catalizador o clic en banca)
              </button>
            )}
          </div>
        );
      }

      const dualModeSearchEff =
        card.itemKind === 'EQUIPPABLE'
          ? card.effects.find(
              (e): e is Extract<typeof e, { kind: 'SEARCH_DECK' }> => e.kind === 'SEARCH_DECK',
            )
          : undefined;
      if (dualModeSearchEff) {
        const searchAction: GameAction = {
          type: 'PLAY_ITEM',
          playerId,
          handIndex,
        };
        const searchCheck = validateAction(gameState, searchAction);

        const equipAction: GameAction = {
          type: 'PLAY_ITEM',
          playerId,
          handIndex,
          targetInstanceId: player.active?.instanceId,
        };
        const equipCheck = validateAction(gameState, equipAction);
        const catBonus = card.effects.find(
          (e): e is Extract<typeof e, { kind: 'EQUIP_PASSIVE_CATEGORY_DAMAGE_BONUS' }> =>
            e.kind === 'EQUIP_PASSIVE_CATEGORY_DAMAGE_BONUS',
        );
        const searchLabel =
          dualModeSearchEff.filter === 'HAMON_USER'
            ? 'Buscar Usuario de Hamon (Por su cuenta)'
            : 'Buscar Luchador Convencional (Por su cuenta)';
        const bonusLabel = catBonus ? `+${catBonus.bonusDamage} daño` : 'Equipar';

        return (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={!searchCheck.ok}
              onClick={() => onDispatch(searchAction)}
              className="jojo-btn-crimson px-3 py-1 font-jojo-heading text-xs tracking-wider uppercase disabled:opacity-40"
            >
              {searchCheck.ok ? searchLabel : searchCheck.reason}
            </button>
            {player.active && (
              <button
                type="button"
                disabled={!equipCheck.ok}
                onClick={() => onDispatch(equipAction)}
                className="jojo-btn-primary px-3 py-1 font-jojo-heading text-xs tracking-wider uppercase disabled:opacity-40"
              >
                Equipar al Activo ({bonusLabel} o clic en banca)
              </button>
            )}
          </div>
        );
      }

      if (card.itemKind === 'CONSUMABLE' && card.targetScope === 'ANY_ALLY') {
        const candidates = [
          ...(player.active ? [{ ch: player.active, zoneLabel: 'Activo' }] : []),
          ...player.bench.map((ch) => ({ ch, zoneLabel: 'Banca' })),
        ];
        const validTargets = candidates
          .map(({ ch, zoneLabel }) => {
            const action: GameAction = {
              type: 'PLAY_ITEM',
              playerId,
              handIndex,
              targetInstanceId: ch.instanceId,
            };
            const check = validateAction(gameState, action);
            return { ch, zoneLabel, action, check };
          })
          .filter((item) => item.check.ok);

        if (validTargets.length > 0) {
          const isHeal = card.effects.some((e) => e.kind === 'HEAL_TARGET');
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              {validTargets.map(({ ch, zoneLabel, action }) => {
                const prof = getEffectiveCharacterProfile(ch);
                const maxHp = computeEffectiveMaxHp(gameState, playerId, ch);
                return (
                  <button
                    key={ch.instanceId}
                    type="button"
                    onClick={() => onDispatch(action)}
                    className="jojo-btn-primary px-3 py-1 font-jojo-heading text-xs tracking-wider uppercase"
                  >
                    {isHeal
                      ? `Curar ${prof.name} (${zoneLabel} · ${ch.currentHp}/${maxHp})`
                      : `Usar en ${prof.name} (${zoneLabel})`}
                  </button>
                );
              })}
            </div>
          );
        }
      }

      const action: GameAction = {
        type: 'PLAY_ITEM',
        playerId,
        handIndex,
        targetInstanceId: card.targetScope === 'PLAYER' ? undefined : player.active?.instanceId,
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
              : card.targetScope === 'ANY_ALLY'
                ? 'Usar en Activo (o clic en banca)'
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
      const benchAction: GameAction = { type: 'PLAY_TO_BENCH', playerId, handIndex };
      const benchCheck = validateAction(gameState, benchAction);
      const hasHandAbility = card.signatureAbility.trigger === 'IN_HAND_PREP';
      const handAbilityAction: GameAction = { type: 'USE_HAND_ABILITY', playerId, handIndex };
      const handAbilityCheck = hasHandAbility
        ? validateAction(gameState, handAbilityAction)
        : { ok: false, reason: '' };

      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {hasHandAbility && (
            <button
              type="button"
              disabled={!handAbilityCheck.ok}
              onClick={() => onDispatch(handAbilityAction)}
              className="jojo-btn-primary px-3 py-1 font-jojo-heading text-xs tracking-wider uppercase disabled:opacity-40"
            >
              {handAbilityCheck.ok
                ? `${card.signatureAbility.name} (Descartar → Robar 2)`
                : handAbilityCheck.reason}
            </button>
          )}
          <button
            type="button"
            disabled={!benchCheck.ok}
            onClick={() => onDispatch(benchAction)}
            className="jojo-btn-crimson px-3 py-1 font-jojo-heading text-xs tracking-wider uppercase disabled:opacity-40"
          >
            {benchCheck.ok ? 'Bajar a Banca (Finaliza turno)' : benchCheck.reason}
          </button>
        </div>
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
