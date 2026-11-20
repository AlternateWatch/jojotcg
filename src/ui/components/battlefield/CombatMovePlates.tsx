import { computeAttackDamageBonus } from '../../../engine/effects/effectPipeline';
import { validateAction } from '../../../engine/gameEngine';
import { canPayEnergyCost, getAvailableAttacks } from '../../../engine/helpers/cardStats';
import type { GameAction } from '../../../engine/types/actions';
import type { GameState, PlayerId } from '../../../engine/types/state';
import { EnergyBadge } from '../cards/EnergyBadge';

interface CombatMovePlatesProps {
  gameState: GameState;
  playerId: PlayerId;
  onDispatch: (action: GameAction) => void;
}

export function CombatMovePlates({ gameState, playerId, onDispatch }: CombatMovePlatesProps) {
  const active = gameState.players[playerId].active;
  if (!active) return null;

  const attacks = getAvailableAttacks(active);

  if (attacks.length === 0) {
    return (
      <div className="jojo-panel-cream mx-auto px-4 py-2 text-xs font-bold">
        Tu Usuario de Stand activo no tiene ataques propios. Equipa un Stand compatible en
        Preparación.
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-wrap justify-center gap-2.5 pt-1">
      {attacks.map(({ attack, source }) => {
        const canPay = canPayEnergyCost(active.attachedEnergies, attack.energyCost);
        const action: GameAction = { type: 'USE_ATTACK', playerId, attackId: attack.id };
        const check = validateAction(gameState, action);
        const bonusInfo = computeAttackDamageBonus(gameState, playerId, active, attack, source);
        const hasFixedDamage = attack.baseDamage > 0 && !attack.coinFlip?.replacesBaseDamage;
        const effectiveDamage = hasFixedDamage
          ? Math.max(0, attack.baseDamage + bonusInfo.bonus)
          : null;

        return (
          <button
            key={attack.id}
            type="button"
            disabled={!check.ok}
            title={check.reason}
            onClick={() => onDispatch(action)}
            className={`group flex min-w-[235px] max-w-[305px] flex-1 flex-col justify-between border-2 border-[#060508] p-2.5 text-left transition ${
              check.ok
                ? 'bg-[#161122] shadow-[4px_4px_0_#060508] hover:-translate-y-0.5 hover:border-[#f2c12e] hover:bg-[#1f172f] hover:shadow-[5px_5px_0_#060508]'
                : 'bg-[#100d17]/75 opacity-45'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-[9px] font-bold tracking-widest text-[#f2c12e] uppercase">
                  {source === 'STAND' ? 'STAND' : 'PERSONAJE'}
                </span>
                <div className="font-jojo-heading text-lg leading-tight tracking-wider text-white uppercase">
                  {attack.name}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className="border-2 border-[#060508] bg-[#e6194b] px-2 py-0.5 font-jojo-display text-sm text-white">
                  {effectiveDamage !== null
                    ? effectiveDamage
                    : attack.damageLabel ?? 'FX'}
                </span>
                {bonusInfo.bonus !== 0 && (
                  <span
                    className={`mt-0.5 font-mono text-[9px] font-black ${
                      bonusInfo.bonus > 0 ? 'text-[#00e599]' : 'text-[#e6194b]'
                    }`}
                  >
                    {bonusInfo.bonus > 0 ? `+${bonusInfo.bonus} BONUS` : `${bonusInfo.bonus} PENAL.`}
                  </span>
                )}
              </div>
            </div>

            {attack.effectText && (
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-300">
                {attack.effectText}
              </p>
            )}

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-1.5">
              <div className="flex flex-wrap gap-1">
                {attack.energyCost.map((en, i) => (
                  <EnergyBadge key={`${attack.id}-c-${i}`} type={en} size="xs" />
                ))}
              </div>
              {!canPay && (
                <span className="font-mono text-[10px] font-bold text-[#e6194b]">SIN ENERGÍA</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
