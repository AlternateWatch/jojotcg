import { AnimatePresence, motion } from 'framer-motion';
import type { IActionTickerEntry } from '../../vfx/vfxClassifier';

interface LiveActionFeedProps {
  entries: IActionTickerEntry[];
}

const TONE_BADGE: Record<IActionTickerEntry['tone'], string> = {
  ATTACK: 'bg-[#e6194b] text-white',
  DAMAGE: 'bg-[#ff4d6d] text-white',
  HEAL: 'bg-[#00b87c] text-[#0b090e]',
  STATUS: 'bg-[#ff6b1a] text-[#0b090e]',
  EVO: 'bg-[#f2c12e] text-[#0b090e]',
  SETUP: 'bg-[#2952d9] text-white',
  KO: 'bg-[#0b090e] text-[#e6194b] border border-[#e6194b]',
  INFO: 'bg-zinc-700 text-zinc-100',
};

export function LiveActionFeed({ entries }: LiveActionFeedProps) {
  if (entries.length === 0) return null;

  const visible = entries.slice(-4);
  const latest = visible[visible.length - 1]!;

  return (
    <>
      {/* Desktop / Tablet Live Action Feed */}
      <div
        aria-live="polite"
        aria-label="Resumen en vivo de acciones"
        className="pointer-events-none fixed bottom-3 left-3 z-30 hidden w-[320px] flex-col gap-1 md:flex"
      >
        <div className="mb-0.5 inline-flex w-fit -skew-x-10 border border-[#060508] bg-[#14101c]/95 px-2 py-0.5 font-jojo-heading text-[10px] tracking-[0.2em] text-[#f2c12e] uppercase">
          <span className="skew-x-10">Últimas acciones</span>
        </div>
        <AnimatePresence initial={false}>
          {visible.map((item, idx) => {
            const isLatest = idx === visible.length - 1;
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: isLatest ? 1 : 0.72, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.22 }}
                className={`flex items-start gap-2 border-2 border-[#060508] px-2.5 py-1.5 text-[11px] leading-snug shadow-[3px_3px_0_#060508] ${
                  isLatest ? 'bg-[#171222]/96 text-[#f5efe0]' : 'bg-[#0f0c17]/90 text-zinc-300'
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 px-1.5 py-0.5 font-jojo-heading text-[9px] leading-none tracking-wider uppercase ${TONE_BADGE[item.tone]}`}
                >
                  {item.actorTag}
                </span>
                <span className="line-clamp-2 font-medium">{item.text}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Compact Mobile Single-Line Narrator */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-2 bottom-2 left-2 z-30 flex items-center gap-2 border-2 border-[#060508] bg-[#14101c]/95 px-2.5 py-1.5 text-[11px] text-[#f5efe0] shadow-[3px_3px_0_#060508] md:hidden"
      >
        <span
          className={`shrink-0 px-1.5 py-0.5 font-jojo-heading text-[9px] leading-none uppercase ${TONE_BADGE[latest.tone]}`}
        >
          {latest.actorTag}
        </span>
        <span className="truncate font-medium">{latest.text}</span>
      </div>
    </>
  );
}
