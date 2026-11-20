import { motion, AnimatePresence } from 'framer-motion';
import { Star, X } from 'lucide-react';
import type { CoinShowcaseState } from '../../../store/useBattleStore';

interface CoinFlipOverlayProps {
  showcase: CoinShowcaseState | null;
  onClose: () => void;
}

export function CoinFlipOverlay({ showcase, onClose }: CoinFlipOverlayProps) {
  return (
    <AnimatePresence>
      {showcase && (
        <motion.div
          key={showcase.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#060508]/85 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.88, y: 18 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="jojo-panel manga-halftone w-full max-w-md p-6 text-center"
          >
            <div className="inline-block -skew-x-10 border-2 border-[#060508] bg-[#e6194b] px-3 py-0.5 font-jojo-heading text-xs tracking-[0.2em] text-white uppercase shadow-[2px_2px_0_#060508]">
              <span className="inline-block skew-x-10">Lanzamiento de Moneda</span>
            </div>
            <h3 className="mt-2 font-jojo-display text-2xl tracking-wider text-[#f5efe0] uppercase">
              {showcase.attackName}
            </h3>

            <div className="my-6 flex flex-wrap items-center justify-center gap-4">
              {showcase.results.map((result, idx) => (
                <motion.div
                  key={`${showcase.id}-${idx}`}
                  initial={{ rotateY: 0, scale: 0.4, opacity: 0 }}
                  animate={{ rotateY: 720, scale: 1, opacity: 1 }}
                  transition={{ duration: 0.6, delay: idx * 0.13, ease: 'easeOut' }}
                  className={`flex h-20 w-20 flex-col items-center justify-center rounded-full border-[3px] border-[#060508] shadow-[4px_4px_0_#060508] ${
                    result === 'HEADS'
                      ? 'bg-[#f2c12e] text-[#0b090e]'
                      : 'bg-[#1d1727] text-[#e6194b]'
                  }`}
                >
                  {result === 'HEADS' ? (
                    <Star size={24} fill="currentColor" strokeWidth={2.5} />
                  ) : (
                    <X size={26} strokeWidth={3} />
                  )}
                  <span className="mt-0.5 font-jojo-display text-xs tracking-wider uppercase">
                    {result === 'HEADS' ? 'CARA!' : 'CRUZ'}
                  </span>
                </motion.div>
              ))}
            </div>

            <div className="jojo-panel-cream mb-5 px-3 py-2 text-xs font-semibold">
              {showcase.message}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="jojo-btn-primary w-full py-2.5 font-jojo-heading text-base tracking-[0.15em] uppercase"
            >
              Continuar
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
