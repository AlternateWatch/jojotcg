import { Eye } from 'lucide-react';
import {
  CATEGORY_LABELS,
  ENERGY_META,
  type AnyCard,
} from '../../../data/schemas/cardTypes';
import { resolveCardAsset } from '../../../services/assetResolver';
import { useAppStore } from '../../../store/useAppStore';
import { CardArtwork } from './CardArtwork';
import { EnergyBadge } from './EnergyBadge';

interface CardViewProps {
  card: AnyCard;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  selected?: boolean;
  highlighted?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  showInspectButton?: boolean;
  badgeText?: string;
  /** Explicit holographic foil visual (kept off in general grids; enabled in Inspector / Holo reveals) */
  foil?: boolean;
}

const SIZE_WIDTHS = {
  xs: 'w-[74px]',
  sm: 'w-[108px]',
  md: 'w-[148px]',
  lg: 'w-[248px]',
};

const TYPE_HEADER_BG: Record<AnyCard['type'], string> = {
  CHARACTER: 'bg-[#f2c12e] text-[#0b090e]',
  STAND: 'bg-[#e6194b] text-white',
  EVOLUTION: 'bg-[#f2c12e] text-[#0b090e]',
  ITEM: 'bg-[#00b87c] text-[#0b090e]',
  ENERGY: 'bg-[#f5efe0] text-[#0b090e]',
};

const TYPE_SPANISH: Record<AnyCard['type'], string> = {
  CHARACTER: 'Personaje',
  STAND: 'Stand',
  EVOLUTION: 'Evolución',
  ITEM: 'Objeto',
  ENERGY: 'Energía',
};

export function CardView({
  card,
  size = 'md',
  selected = false,
  highlighted = false,
  disabled = false,
  onClick,
  showInspectButton = true,
  badgeText,
  foil,
}: CardViewProps) {
  const openInspector = useAppStore((s) => s.openInspector);
  const overrides = useAppStore((s) => s.settings.customImageOverrides);
  const isFoil = Boolean(foil);
  const asset = resolveCardAsset(card.imageId, card.assetFolder, overrides);

  const shadowClass = selected
    ? 'jojo-card-selected'
    : highlighted
      ? 'jojo-card-target'
      : isFoil
        ? 'jojo-foil-prismatic'
        : 'jojo-card-shadow';

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group relative aspect-[5/7] shrink-0 overflow-hidden rounded-[7px] border-2 border-[#060508] bg-[#14101c] transition-all duration-150 hover:z-20 hover:scale-105 ${SIZE_WIDTHS[size]} ${shadowClass} ${
        onClick ? 'cursor-pointer' : ''
      } ${disabled ? 'opacity-45 grayscale-[35%]' : ''}`}
    >
      {asset.isFullCardRender && asset.url ? (
        <CardArtwork card={card} />
      ) : (
        /* Editorial physical TCG frame for Items, Energies, and cards pending artwork */
        <div className="flex h-full w-full flex-col justify-between bg-[#181322] p-1.5">
          {/* Header bar */}
          <div
            className={`flex items-center justify-between gap-1 border border-[#060508] px-1.5 py-0.5 ${TYPE_HEADER_BG[card.type]}`}
          >
            <span className="truncate font-jojo-heading text-[11px] leading-tight tracking-wider uppercase">
              {card.name}
            </span>
            {card.type === 'CHARACTER' && (
              <span className="shrink-0 bg-[#0b090e] px-1 font-mono text-[9px] font-bold text-[#f2c12e]">
                {card.maxHp}
              </span>
            )}
            {card.type === 'ENERGY' && <EnergyBadge type={card.energyType} size="xs" />}
          </div>

          {/* Center artwork box */}
          <div className="my-1 flex-1 overflow-hidden border border-[#060508]">
            {card.type === 'ENERGY' ? (
              <div
                className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#0e0b14] p-2"
                style={{
                  backgroundImage: `radial-gradient(circle at 50% 50%, ${ENERGY_META[card.energyType].color}30 0%, #0e0b14 78%)`,
                }}
              >
                <div className="scale-125">
                  <EnergyBadge type={card.energyType} size="md" />
                </div>
                <span className="font-jojo-heading text-[11px] tracking-widest text-[#f5efe0] uppercase">
                  {ENERGY_META[card.energyType].label}
                </span>
              </div>
            ) : (
              <CardArtwork card={card} />
            )}
          </div>

          {/* Cream editorial text box */}
          <div className="space-y-0.5 border border-[#060508] bg-[#f5efe0] px-1.5 py-1 text-[#0b090e]">
            {size !== 'xs' && card.description && (
              <p className="line-clamp-3 text-[8.5px] leading-tight font-medium text-[#1b1623]">
                {card.description}
              </p>
            )}
            {size !== 'xs' && card.type === 'CHARACTER' && (
              <p className="line-clamp-2 text-[8.5px] font-bold text-[#0b090e]">
                {card.categories.map((c) => CATEGORY_LABELS[c]).join(' / ')}
              </p>
            )}
            <div className="flex items-center justify-between border-t border-[#0b090e]/20 pt-0.5 font-jojo-heading text-[9px] tracking-widest uppercase">
              <span>{TYPE_SPANISH[card.type]}</span>
              {card.type === 'ITEM' && (
                <span className="text-[#0c6e4d]">
                  {card.itemKind === 'EQUIPPABLE' ? 'Equip.' : 'Uso'}
                </span>
              )}
              {card.type === 'ENERGY' && <span className="text-zinc-600">Básica</span>}
            </div>
          </div>
        </div>
      )}

      {/* Upgraded 3-layer holographic foil overlay + corner stamp */}
      {isFoil && (
        <>
          <div aria-hidden="true" className="jojo-holo-prism absolute inset-0 z-10" />
          <div aria-hidden="true" className="jojo-holo-sparkle absolute inset-0 z-10" />
          <div aria-hidden="true" className="jojo-holo-glare absolute inset-0 z-10 overflow-hidden" />
          <div className="pointer-events-none absolute top-1 right-1 z-20 -skew-x-8 border border-[#060508] bg-gradient-to-r from-[#f2c12e] via-[#00e599] to-[#c084fc] px-1.5 py-0.5 font-mono text-[8px] leading-none font-black tracking-wider text-[#0b090e] uppercase shadow-[2px_2px_0_#060508]">
            <span className="inline-block skew-x-8">✦ HOLO</span>
          </div>
        </>
      )}

      {/* Optional crisp manga corner stamp */}
      {badgeText && (
        <div className="pointer-events-none absolute top-1 left-1 z-20 -skew-x-8 border border-[#060508] bg-[#f2c12e] px-1.5 py-0.5 font-jojo-heading text-[10px] leading-none tracking-wider text-[#0b090e] uppercase shadow-[2px_2px_0_#060508]">
          <span className="inline-block skew-x-8">{badgeText}</span>
        </div>
      )}

      {/* Subtle inspect button on hover */}
      {showInspectButton && (
        <button
          type="button"
          title="Ver ficha completa"
          onClick={(e) => {
            e.stopPropagation();
            openInspector(card.id);
          }}
          className="absolute right-1 bottom-1 z-20 flex h-6 w-6 items-center justify-center border border-[#060508] bg-[#0b090e]/90 text-[#f2c12e] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[#f2c12e] hover:text-[#0b090e] focus:opacity-100"
        >
          <Eye size={12} />
        </button>
      )}
    </div>
  );
}
