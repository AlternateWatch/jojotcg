import { AnimatePresence, motion } from 'framer-motion';

interface MenuTransitionWipeProps {
  /** Monotonically increasing key triggered on screen switches (0 = initial mount, no wipe) */
  wipeKey: number;
  direction: 1 | -1;
  isBattleLaunch: boolean;
}

/**
 * Lightweight, GPU-composited JoJo manga ink-slash wipe on screen transitions.
 * Strictly pointer-events-none so navigation stays responsive at all times.
 */
export function MenuTransitionWipe({
  wipeKey,
  direction,
  isBattleLaunch,
}: MenuTransitionWipeProps) {
  const fromX = direction === 1 ? '115%' : '-115%';
  const toX = direction === 1 ? '-115%' : '115%';

  return (
    <AnimatePresence>
      {wipeKey > 0 && (
        <motion.div
          key={wipeKey}
          aria-hidden="true"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
        >
          {/* Leading gold manga ribbon */}
          <motion.div
            initial={{ x: fromX, skewX: -14 }}
            animate={{ x: toX, skewX: -14 }}
            transition={{
              duration: isBattleLaunch ? 0.52 : 0.34,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="absolute -inset-y-8 -inset-x-24 border-x-4 border-[#060508] bg-[#f2c12e]/90"
            style={{ width: isBattleLaunch ? '58%' : '26%' }}
          />

          {/* Trailing crimson ink slash */}
          <motion.div
            initial={{ x: fromX, skewX: -14 }}
            animate={{ x: toX, skewX: -14 }}
            transition={{
              duration: isBattleLaunch ? 0.56 : 0.38,
              delay: 0.04,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="absolute -inset-y-8 -inset-x-24 flex items-center justify-center border-x-4 border-[#060508] bg-[#e6194b]/95 shadow-[8px_0_0_#060508]"
            style={{ width: isBattleLaunch ? '46%' : '18%' }}
          >
            {isBattleLaunch && (
              <span className="skew-x-14 font-jojo-display text-5xl tracking-[0.16em] text-[#f5efe0] uppercase drop-shadow-[4px_4px_0_#060508] sm:text-7xl">
                DUEL START · ゴゴゴ
              </span>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
