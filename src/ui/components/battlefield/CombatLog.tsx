import { useEffect, useRef } from 'react';
import type { CombatEvent } from '../../../engine/types/events';

interface CombatLogProps {
  events: CombatEvent[];
}

const EVENT_STRIP: Partial<Record<CombatEvent['type'], string>> = {
  PHASE_CHANGED: 'border-l-[#f2c12e] bg-[#1a1424] text-[#f2c12e]',
  ATTACK_DECLARED: 'border-l-[#e6194b] bg-[#1c1018] text-white font-semibold',
  COIN_FLIPPED: 'border-l-[#f2c12e] bg-[#1c1810] text-amber-200',
  DAMAGE_DEALT: 'border-l-[#ff4d6d] bg-[#190e15] text-rose-200',
  HEALED: 'border-l-[#00b87c] bg-[#0e1b18] text-emerald-200',
  CHARACTER_KO: 'border-l-[#e6194b] bg-[#2a0b15] text-rose-100 font-bold',
  GAME_OVER: 'border-l-[#f2c12e] bg-[#2a1d0b] text-[#f2c12e] font-bold',
  CARD_EVOLVED: 'border-l-[#f2c12e] bg-[#22190f] text-yellow-200 font-bold',
};

export function CombatLog({ events }: CombatLogProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events.length]);

  return (
    <div className="jojo-panel flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b-2 border-[#060508] bg-[#0e0b14] px-3 py-2">
        <span className="font-jojo-heading text-sm tracking-[0.14em] text-[#f2c12e] uppercase">
          Crónica del Duelo
        </span>
        <span className="border border-[#060508] bg-[#1d1727] px-1.5 py-0.5 font-mono text-[10px] font-bold text-zinc-300">
          {events.length}
        </span>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2 text-[11px]">
        {events.map((evt) => (
          <div
            key={evt.id}
            className={`border-l-[3px] px-2 py-1 leading-snug ${
              EVENT_STRIP[evt.type] ?? 'border-l-zinc-600 bg-[#120f1a] text-zinc-300'
            }`}
          >
            <span className="mr-1.5 font-mono text-[10px] opacity-55">T{evt.turn}</span>
            <span>{evt.message}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
