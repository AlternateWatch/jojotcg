import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ITurnSplash } from '../../vfx/vfxClassifier';

interface TurnSplashOverlayProps {
  splash: ITurnSplash | null;
  isMyTurn: boolean;
  onClear: () => void;
}

export function TurnSplashOverlay({ splash, isMyTurn, onClear }: TurnSplashOverlayProps) {
  useEffect(() => {
    if (!splash) return;
    const t = window.setTimeout(onClear, 1100);
    return () => window.clearTimeout(t);
  }, [splash, onClear]);

  return (
    <AnimatePresence>
      {splash && (
        <motion.div
          key={splash.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="pointer-events-none fixed inset-x-0 top-1/2 z-40 -translate-y-1/2 overflow-hidden py-5"
        >
          {/* Counter-sliding top accent rail */}
          <motion.div
            aria-hidden="true"
            initial={{ x: '-100%' }}
            animate={{ x: '0%' }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={`h-2 w-full border-y border-[#060508] ${
              isMyTurn ? 'bg-[#e6194b]' : 'bg-[#f2c12e]'
            }`}
          />

          {/* Full-Bleed Manga Diagonal Ribbon */}
          <motion.div
            initial={{ x: isMyTurn ? -140 : 140, scaleY: 0.72, opacity: 0 }}
            animate={{ x: 0, scaleY: 1, opacity: 1 }}
            exit={{ x: isMyTurn ? 140 : -140, scaleY: 0.75, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className={`manga-stripes relative flex items-center justify-center border-y-[4px] border-[#060508] px-6 py-3.5 shadow-[0_8px_0_#060508] ${
              isMyTurn ? 'bg-[#f2c12e] text-[#0b090e]' : 'bg-[#e6194b] text-white'
            }`}
          >
            <motion.span
              aria-hidden="true"
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 0.9 }}
              transition={{ delay: 0.05, type: 'spring', stiffness: 360, damping: 22 }}
              className={`mr-6 hidden font-jojo-display text-3xl tracking-widest drop-shadow-[3px_3px_0_#060508] sm:inline-block ${
                isMyTurn ? 'text-[#e6194b]' : 'text-[#f2c12e]'
              }`}
            >
              {isMyTurn ? 'ゴゴゴ' : 'ドドド'}
            </motion.span>

            <div className="text-center">
              <div className="inline-block -skew-x-12 border-2 border-[#060508] bg-[#0b090e] px-3 py-0.5 font-mono text-[11px] font-black tracking-[0.3em] text-[#f2c12e] uppercase">
                <span className="inline-block skew-x-12">TURNO {splash.turnNumber}</span>
              </div>
              <motion.div
                initial={{ scale: 1.25 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                className="mt-1 font-jojo-display text-3xl leading-none tracking-wider uppercase sm:text-5xl"
              >
                {isMyTurn ? `¡TU TURNO — ${splash.playerName}!` : `TURNO DE ${splash.playerName}`}
              </motion.div>
            </div>

            <motion.span
              aria-hidden="true"
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 0.9 }}
              transition={{ delay: 0.05, type: 'spring', stiffness: 360, damping: 22 }}
              className={`ml-6 hidden font-jojo-display text-3xl tracking-widest drop-shadow-[3px_3px_0_#060508] sm:inline-block ${
                isMyTurn ? 'text-[#e6194b]' : 'text-[#f2c12e]'
              }`}
            >
              {isMyTurn ? 'ゴゴゴ' : 'ドドド'}
            </motion.span>
          </motion.div>

          {/* Counter-sliding bottom accent rail */}
          <motion.div
            aria-hidden="true"
            initial={{ x: '100%' }}
            animate={{ x: '0%' }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={`h-2 w-full border-y border-[#060508] ${
              isMyTurn ? 'bg-[#e6194b]' : 'bg-[#f2c12e]'
            }`}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
