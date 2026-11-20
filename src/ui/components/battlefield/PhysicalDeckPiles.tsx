import { getCardById } from '../../../data/cardRegistry';
import { CARD_BACK_PATTERN_URL } from '../../../services/assetResolver';
import { CardView } from '../cards/CardView';

interface PhysicalDeckPilesProps {
  deckCount: number;
  discardIds: string[];
  onOpenDiscard: () => void;
  label: string;
}

export function PhysicalDeckPiles({
  deckCount,
  discardIds,
  onOpenDiscard,
  label,
}: PhysicalDeckPilesProps) {
  const topDiscard =
    discardIds.length > 0 ? getCardById(discardIds[discardIds.length - 1]!) : null;

  return (
    <div className="flex flex-row items-center justify-center gap-3 xl:flex-col">
      {/* Stacked Deck */}
      <div className="flex flex-col items-center gap-1" aria-label={`Mazo de ${label}: ${deckCount} cartas`}>
        <div
          className={`relative h-[92px] w-[66px] rounded-[6px] border-2 border-[#060508] bg-cover bg-center ${
            deckCount > 0 ? 'deck-stack' : 'opacity-30'
          }`}
          style={{ backgroundImage: `url(${CARD_BACK_PATTERN_URL})` }}
        >
          <div className="absolute inset-0 bg-[#0b090e]/35" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="border-2 border-[#060508] bg-[#0b090e]/90 px-1.5 py-0.5 font-jojo-display text-lg leading-none text-[#f2c12e]">
              {deckCount}
            </span>
          </div>
        </div>
        <span className="font-jojo-heading text-[10px] tracking-[0.18em] text-zinc-400 uppercase">
          Mazo
        </span>
      </div>

      {/* Discard Pile */}
      <button
        type="button"
        onClick={onOpenDiscard}
        aria-label={`Ver descartes de ${label} (${discardIds.length} cartas)`}
        title={`Ver pila de descartes (${label})`}
        className="group flex flex-col items-center gap-1"
      >
        <div className="relative flex h-[92px] w-[66px] items-center justify-center overflow-hidden rounded-[6px] border-2 border-dashed border-[#f2c12e]/35 bg-[#0b090e]/70 transition group-hover:border-[#f2c12e]">
          {topDiscard ? (
            <div className="pointer-events-none scale-[0.9] opacity-90">
              <CardView card={topDiscard} size="xs" showInspectButton={false} />
            </div>
          ) : (
            <span className="font-mono text-[10px] text-zinc-600">0</span>
          )}
          {discardIds.length > 0 && (
            <span className="absolute right-0.5 bottom-0.5 border border-[#060508] bg-[#e6194b] px-1 font-mono text-[10px] font-bold text-white">
              {discardIds.length}
            </span>
          )}
        </div>
        <span className="font-jojo-heading text-[10px] tracking-[0.18em] text-zinc-400 uppercase group-hover:text-[#f2c12e]">
          Descartes
        </span>
      </button>
    </div>
  );
}
