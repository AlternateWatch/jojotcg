import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { AnyCard } from '../../../data/schemas/cardTypes';
import { resolveCardAsset } from '../../../services/assetResolver';
import { useAppStore } from '../../../store/useAppStore';

interface CardArtworkProps {
  card: AnyCard;
  className?: string;
}

export function CardArtwork({ card, className = '' }: CardArtworkProps) {
  const overrides = useAppStore((s) => s.settings.customImageOverrides);
  const [imgFailed, setImgFailed] = useState(false);

  const asset = resolveCardAsset(card.imageId, card.assetFolder, overrides);

  if (asset.url && !imgFailed) {
    return (
      <img
        src={asset.url}
        alt={card.name}
        loading="lazy"
        draggable={false}
        onError={() => setImgFailed(true)}
        className={`h-full w-full object-cover select-none ${className}`}
      />
    );
  }

  // Neutral, clearly identifiable manga-ink placeholder for cards pending artwork
  return (
    <div
      className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[#1a1522] p-2.5 text-center select-none ${className}`}
      style={{
        backgroundImage: 'url(/assets/patterns/pattern5.png)',
        backgroundSize: '150px',
      }}
    >
      <div className="absolute inset-0 bg-[#14101c]/88" />
      <div className="relative z-10 flex flex-col items-center gap-1">
        <div className="flex h-8 w-8 items-center justify-center border-2 border-[#060508] bg-[#261f33] text-zinc-400">
          <ImageOff size={15} />
        </div>
        <span className="border border-zinc-600 bg-[#0b090e] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-zinc-300 uppercase">
          Sin imagen
        </span>
        <span className="max-w-full truncate font-mono text-[8px] text-zinc-400">
          {card.imageId}
        </span>
      </div>
    </div>
  );
}
