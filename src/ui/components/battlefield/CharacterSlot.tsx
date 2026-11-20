import { AnimatePresence, motion } from 'framer-motion';
import { Package, ShieldCheck, Wind } from 'lucide-react';
import { getCardById } from '../../../data/cardRegistry';
import {
  computeEffectiveMaxHp,
  getEffectiveCharacterProfile,
  getEffectiveStandProfile,
} from '../../../engine/helpers/cardStats';
import type { CharacterInstance, GameState, PlayerId } from '../../../engine/types/state';
import type { ICardFloatingPopup } from '../../vfx/vfxClassifier';
import { CardView } from '../cards/CardView';
import { EnergyBadge } from '../cards/EnergyBadge';

interface CharacterSlotProps {
  state: GameState;
  ownerId: PlayerId;
  character: CharacterInstance;
  zone: 'ACTIVE' | 'BENCH';
  isTargetable?: boolean;
  targetHint?: string;
  popups?: ICardFloatingPopup[];
  isLunging?: boolean;
  lungeDirection?: 'UP' | 'DOWN';
  onClick?: () => void;
  actionButton?: { label: string; onClick: () => void; variant?: 'gold' | 'warn' };
}

const POPUP_COLORS: Record<ICardFloatingPopup['kind'], string> = {
  DAMAGE: 'bg-[#e6194b] text-white',
  BLEED: 'bg-[#991b1b] text-rose-100',
  BURN: 'bg-[#ff6b1a] text-[#0b090e]',
  HEAL: 'bg-[#00e599] text-[#0b090e]',
  STATUS: 'bg-[#f2c12e] text-[#0b090e]',
  SHIELD: 'bg-[#f5efe0] text-[#0b090e]',
  BUFF: 'bg-[#38bdf8] text-[#0b090e]',
};

export function CharacterSlot({
  state,
  ownerId,
  character,
  zone,
  isTargetable = false,
  targetHint,
  popups = [],
  isLunging = false,
  lungeDirection = 'UP',
  onClick,
  actionButton,
}: CharacterSlotProps) {
  const charProfile = getEffectiveCharacterProfile(character);
  const charCard = getCardById(charProfile.currentCardId);
  const standProfile = character.attachedStand
    ? getEffectiveStandProfile(character.attachedStand)
    : null;
  const standCard = standProfile ? getCardById(standProfile.currentCardId) : undefined;

  const maxHp = computeEffectiveMaxHp(state, ownerId, character);
  const hpPercent = Math.min(100, Math.round((character.currentHp / maxHp) * 100));
  const isOverMaxHp = character.currentHp > maxHp;

  const hpBarColor = isOverMaxHp
    ? 'bg-[#e6194b]'
    : hpPercent > 50
      ? 'bg-[#00b87c]'
      : hpPercent > 25
        ? 'bg-[#f2c12e]'
        : 'bg-[#e6194b]';

  const tookHitNow = popups.some(
    (p) => p.kind === 'DAMAGE' || p.kind === 'BLEED' || p.kind === 'BURN',
  );
  const hitKind = popups.find(
    (p) => p.kind === 'DAMAGE' || p.kind === 'BLEED' || p.kind === 'BURN',
  )?.kind;
  const healedNow = popups.some((p) => p.kind === 'HEAL');
  const hitPopupKey = popups.map((p) => p.id).join('|');

  if (!charCard) return null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.94 }}
      animate={
        isLunging
          ? {
              opacity: 1,
              y: lungeDirection === 'UP' ? [0, 10, -34, 0] : [0, -10, 34, 0],
              x: lungeDirection === 'UP' ? [0, -4, 14, 0] : [0, 4, -14, 0],
              scale: [1, 0.96, 1.09, 1],
              rotate: lungeDirection === 'UP' ? [0, -3, 3.5, 0] : [0, 3, -3.5, 0],
            }
          : tookHitNow
            ? {
                opacity: 1,
                x: [0, -13, 12, -9, 7, -3, 0],
                y: [0, 5, -4, 3, 0],
                rotate: [0, -5.5, 5, -3.5, 2, 0],
                scale: [1, 0.92, 1.04, 1],
              }
            : { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }
      }
      transition={{ duration: isLunging ? 0.46 : 0.44, ease: [0.22, 1, 0.36, 1] }}
      className={`relative flex flex-col items-center ${isTargetable ? 'cursor-pointer' : ''}`}
      onClick={isTargetable ? onClick : undefined}
    >
      {/* Floating Per-Card Combat Numbers & Status Popups */}
      <div className="pointer-events-none absolute -top-4 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-1">
        <AnimatePresence>
          {popups.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 18, scale: 0.65 }}
              animate={{ opacity: 1, y: -14, scale: 1.06 }}
              exit={{ opacity: 0, y: -36, scale: 0.9 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className={`-skew-x-10 border-2 border-[#060508] px-2.5 py-0.5 whitespace-nowrap shadow-[4px_4px_0_#060508] ${POPUP_COLORS[p.kind]}`}
            >
              <div className="skew-x-10 text-center">
                <div className="font-jojo-display text-xl leading-none tracking-wider">
                  {p.label}
                </div>
                {p.sublabel && (
                  <div className="font-mono text-[9px] leading-tight font-extrabold uppercase">
                    {p.sublabel}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Targetable manga stamp */}
      {isTargetable && targetHint && (
        <div className="absolute -top-3.5 left-1/2 z-30 -translate-x-1/2 -skew-x-10 border-2 border-[#060508] bg-[#00e599] px-2.5 py-0.5 font-jojo-heading text-[11px] tracking-widest whitespace-nowrap text-[#0b090e] uppercase shadow-[3px_3px_0_#060508]">
          <span className="inline-block skew-x-10">{targetHint}</span>
        </div>
      )}

      {/* Physical cards on playmat: User in front, Stand manifesting beside/behind */}
      <div
        data-vfx-instance={character.instanceId}
        data-vfx-owner={ownerId}
        data-vfx-zone={zone}
        className="relative flex items-end justify-center"
      >
        <div className="relative z-10">
          <CardView
            card={charCard}
            size={zone === 'ACTIVE' ? 'md' : 'sm'}
            highlighted={isTargetable}
          />

          {/* Anime Impact Slash + Shockwave Ring + Hit Flash directly on target card */}
          <AnimatePresence>
            {tookHitNow && (
              <motion.div
                key={`hit-fx-${hitPopupKey}`}
                aria-hidden="true"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.52 }}
                className="pointer-events-none absolute inset-0 z-25 overflow-visible rounded-[7px]"
              >
                {/* Initial white->crimson/orange impact flash */}
                <motion.div
                  initial={{ opacity: 0.92 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.36 }}
                  className={`absolute inset-0 rounded-[7px] ${
                    hitKind === 'BURN'
                      ? 'bg-[#ff6b1a]/75'
                      : hitKind === 'BLEED'
                        ? 'bg-[#991b1b]/80'
                        : 'bg-[#e6194b]/75'
                  }`}
                />
                {/* Crisp diagonal manga slash across the card */}
                <motion.div
                  initial={{ scaleX: 0, opacity: 1 }}
                  animate={{ scaleX: [0, 1.35, 1.5], opacity: [1, 1, 0] }}
                  transition={{ duration: 0.34, ease: 'easeOut' }}
                  className="absolute top-1/2 left-1/2 h-2.5 w-[150%] -translate-x-1/2 -translate-y-1/2 -rotate-35 bg-gradient-to-r from-transparent via-[#fff8cc] to-transparent shadow-[0_0_18px_#f2c12e]"
                />
                {/* Expanding impact shockwave ring around the card */}
                <motion.div
                  initial={{ scale: 0.55, opacity: 0.95 }}
                  animate={{ scale: 1.55, opacity: 0 }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                  className={`absolute -inset-2 rounded-[12px] border-[4px] ${
                    hitKind === 'BURN' ? 'border-[#ff6b1a]' : 'border-[#f2c12e]'
                  }`}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Healing Aura Ring + Emerald Glow */}
          <AnimatePresence>
            {healedNow && (
              <motion.div
                key={`heal-fx-${hitPopupKey}`}
                aria-hidden="true"
                initial={{ opacity: 0.85 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.65 }}
                className="pointer-events-none absolute inset-0 z-25 overflow-visible rounded-[7px]"
              >
                <div className="absolute inset-0 rounded-[7px] bg-[#00e599]/45" />
                <motion.div
                  initial={{ scale: 0.75, opacity: 0.95 }}
                  animate={{ scale: 1.45, opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  className="absolute -inset-2 rounded-[12px] border-[3px] border-[#00e599]"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Diagonal manga STUNNED stamp */}
          {character.statuses.stunned && (
            <div
              title="Aturdido: no puede atacar ni usar habilidades este turno (sí puede retirarse a banca)."
              className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#060508]/55"
            >
              <span className="-rotate-12 border-2 border-[#060508] bg-[#f2c12e] px-2.5 py-0.5 font-jojo-display text-sm tracking-widest text-[#0b090e] uppercase shadow-[3px_3px_0_#060508]">
                ATURDIDO!
              </span>
            </div>
          )}

          {/* Corner status stamps with explanatory tooltips */}
          <div className="absolute -top-2 -right-2 z-20 flex flex-col items-end gap-1">
            {character.statuses.bleedStacks.length > 0 && (
              <span
                title={`Sangrado ×${character.statuses.bleedStacks.length}: inflige ${character.statuses.bleedStacks.length * 10} daño al final de tu turno (turnos restantes por stack: ${character.statuses.bleedStacks.map((s) => s.turnsRemaining).join(', ')}).`}
                className="-skew-x-8 border-2 border-[#060508] bg-[#e6194b] px-1.5 py-0.5 font-jojo-heading text-[10px] leading-none tracking-wider text-white shadow-[2px_2px_0_#060508]"
              >
                <span className="inline-block skew-x-8">
                  SANGRADO ×{character.statuses.bleedStacks.length} (-
                  {character.statuses.bleedStacks.length * 10})
                </span>
              </span>
            )}
            {character.statuses.burn?.active && (
              <span
                title="Quemado: inflige 10 de daño fijo al final de tu turno. Se elimina al curarte, retirarte o subir al Puesto Activo."
                className="-skew-x-8 border-2 border-[#060508] bg-[#ff6b1a] px-1.5 py-0.5 font-jojo-heading text-[10px] leading-none tracking-wider text-[#0b090e] shadow-[2px_2px_0_#060508]"
              >
                <span className="inline-block skew-x-8">QUEMADO (-10)</span>
              </span>
            )}
          </div>
        </div>

        {/* Stand manifesting right beside its User (leaps forward when lunging!) */}
        {standCard && (
          <motion.div
            animate={
              isLunging
                ? {
                    y: lungeDirection === 'UP' ? [0, -28, 0] : [0, 28, 0],
                    x: lungeDirection === 'UP' ? [0, 14, 0] : [0, -14, 0],
                    scale: [1, 1.24, 1],
                    rotate: lungeDirection === 'UP' ? [3, -6, 3] : [3, 12, 3],
                  }
                : { y: 0, x: 0, scale: 1, rotate: 3 }
            }
            transition={{ duration: 0.46, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ scale: 1.16, x: 6, zIndex: 30 }}
            className={`relative z-0 -ml-5 transition-transform ${
              zone === 'ACTIVE' ? 'mb-2' : 'mb-1'
            }`}
          >
            <CardView
              card={standCard}
              size={zone === 'ACTIVE' ? 'sm' : 'xs'}
              badgeText={zone === 'ACTIVE' ? 'STAND' : 'BANCA'}
            />
            {character.attachedStand &&
              (character.attachedStand.permanentDamageBonus > 0 ||
                character.attachedStand.damageDebuff > 0) && (
                <div className="absolute -bottom-2 left-1/2 z-20 flex -translate-x-1/2 gap-1">
                  {character.attachedStand.permanentDamageBonus > 0 && (
                    <span className="border border-[#060508] bg-[#00b87c] px-1 font-mono text-[9px] font-bold text-[#0b090e]">
                      +{character.attachedStand.permanentDamageBonus}
                    </span>
                  )}
                  {character.attachedStand.damageDebuff > 0 && (
                    <span className="border border-[#060508] bg-[#e6194b] px-1 font-mono text-[9px] font-bold text-white">
                      -{character.attachedStand.damageDebuff}
                    </span>
                  )}
                </div>
              )}
          </motion.div>
        )}
      </div>

      {/* Fighting-Game Arcade HP Gauge + Energies */}
      <div className={`mt-1.5 space-y-1 ${zone === 'ACTIVE' ? 'w-[186px]' : 'w-[120px]'}`}>
        <div className="border-2 border-[#060508] bg-[#0b090e] p-1 shadow-[3px_3px_0_#060508]">
          <div className="mb-0.5 flex items-baseline justify-between gap-1 px-0.5">
            <span className="truncate font-jojo-heading text-xs leading-none tracking-wider text-[#f5efe0] uppercase">
              {charProfile.name}
            </span>
            <span
              className={`shrink-0 font-mono text-[11px] leading-none font-bold ${
                isOverMaxHp ? 'text-[#f2c12e]' : 'text-[#00e599]'
              }`}
            >
              {character.currentHp}/{maxHp}
            </span>
          </div>
          <div className="relative h-2.5 w-full overflow-hidden border border-[#060508] bg-[#1f192b]">
            {/* Arcade fighting-game delayed damage trail */}
            <motion.div
              initial={false}
              animate={{ width: `${hpPercent}%` }}
              transition={{ duration: 0.72, delay: 0.16, ease: 'easeOut' }}
              className="absolute inset-y-0 left-0 bg-[#f2c12e]/80"
            />
            <motion.div
              initial={false}
              animate={{ width: `${hpPercent}%` }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
              className={`relative z-10 h-full ${hpBarColor}`}
            />
          </div>
        </div>

        {/* Attached Energies + Compact Active Buffs */}
        {(character.attachedEnergies.length > 0 ||
          character.attachedItems.length > 0 ||
          character.dodgeNextAttack ||
          character.hotBloodBonusReady ||
          (charProfile.signatureAbility.id === 'WIND_SENSE_WAMUU' && !character.windSenseUsed) ||
          (charProfile.signatureAbility.id === 'SUPERIOR_INTELLECT_KARS' &&
            !character.superiorIntellectUsed)) && (
          <div className="flex flex-wrap items-center justify-center gap-1">
            {character.attachedEnergies.map((energy, i) => (
              <EnergyBadge key={`${character.instanceId}-en-${i}`} type={energy} size="xs" />
            ))}
            {character.attachedItems.map((it) => {
              const itemCard = getCardById(it.cardId);
              return (
                <span
                  key={it.instanceId}
                  title={itemCard?.name}
                  className="inline-flex items-center gap-0.5 border border-[#060508] bg-[#00b87c] px-1 py-0.5 text-[9px] font-bold text-[#0b090e]"
                >
                  <Package size={9} />
                  {zone === 'ACTIVE' && (
                    <span className="max-w-[68px] truncate">{itemCard?.name}</span>
                  )}
                </span>
              );
            })}
            {charProfile.signatureAbility.id === 'WIND_SENSE_WAMUU' && !character.windSenseUsed && (
              <span
                title="Sentido del Viento: esquiva el primer ataque recibido."
                className="inline-flex items-center gap-0.5 border border-[#060508] bg-[#38bdf8] px-1 py-0.5 text-[9px] font-bold text-[#0b090e]"
              >
                <Wind size={9} /> Viento
              </span>
            )}
            {charProfile.signatureAbility.id === 'SUPERIOR_INTELLECT_KARS' &&
              !character.superiorIntellectUsed && (
                <span
                  title="Intelecto Superior: evita cualquier KO una vez y sobrevive con 1 HP."
                  className="inline-flex items-center gap-0.5 border border-[#060508] bg-[#f2c12e] px-1 py-0.5 text-[9px] font-bold text-[#0b090e]"
                >
                  <ShieldCheck size={9} /> 1HP
                </span>
              )}
            {character.dodgeNextAttack && (
              <span className="border border-[#060508] bg-purple-400 px-1 py-0.5 text-[9px] font-bold text-[#0b090e]">
                VACÍO
              </span>
            )}
            {character.hotBloodBonusReady && (
              <span className="border border-[#060508] bg-[#ff6b1a] px-1 py-0.5 text-[9px] font-bold text-[#0b090e]">
                +20
              </span>
            )}
          </div>
        )}

        {actionButton && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              actionButton.onClick();
            }}
            className={`mt-1 w-full py-1 font-jojo-heading text-xs tracking-wider uppercase ${
              actionButton.variant === 'gold' ? 'jojo-btn-primary' : 'jojo-btn-ink text-[#f2c12e]'
            }`}
          >
            {actionButton.label}
          </button>
        )}
      </div>
    </motion.div>
  );
}
