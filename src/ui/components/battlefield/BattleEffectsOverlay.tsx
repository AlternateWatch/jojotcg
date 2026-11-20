import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BattleImpactBanner } from '../../../store/useBattleStore';

interface BattleEffectsOverlayProps {
  banner: BattleImpactBanner | null;
  onClear: () => void;
}

const BANNER_STYLES: Record<
  BattleImpactBanner['kind'],
  {
    bg: string;
    accentBar: string;
    text: string;
    sfxColor: string;
    secondarySfx: string;
    durationMs: number;
    isCinematic: boolean;
  }
> = {
  DAMAGE: {
    bg: 'bg-[#e6194b]',
    accentBar: 'bg-[#f2c12e]',
    text: 'text-white',
    sfxColor: 'text-[#f2c12e]',
    secondarySfx: 'バァーン',
    durationMs: 1450,
    isCinematic: false,
  },
  HEAL: {
    bg: 'bg-[#00b87c]',
    accentBar: 'bg-[#f5efe0]',
    text: 'text-[#0b090e]',
    sfxColor: 'text-[#f5efe0]',
    secondarySfx: 'キラッ',
    durationMs: 1350,
    isCinematic: false,
  },
  EVOLUTION: {
    bg: 'bg-[#f2c12e]',
    accentBar: 'bg-[#e6194b]',
    text: 'text-[#0b090e]',
    sfxColor: 'text-[#e6194b]',
    secondarySfx: 'ゴゴゴゴ',
    durationMs: 1850,
    isCinematic: true,
  },
  TIME_STOP: {
    bg: 'bg-[#0b090e]',
    accentBar: 'bg-[#f2c12e]',
    text: 'text-[#f2c12e]',
    sfxColor: 'text-[#e6194b]',
    secondarySfx: 'ゴゴゴゴ',
    durationMs: 1850,
    isCinematic: true,
  },
  KO: {
    bg: 'bg-[#0b090e]',
    accentBar: 'bg-[#e6194b]',
    text: 'text-[#e6194b]',
    sfxColor: 'text-[#f2c12e]',
    secondarySfx: 'ドドドド',
    durationMs: 1650,
    isCinematic: true,
  },
  DEFENSE: {
    bg: 'bg-[#f5efe0]',
    accentBar: 'bg-[#e6194b]',
    text: 'text-[#0b090e]',
    sfxColor: 'text-[#e6194b]',
    secondarySfx: 'ガキン',
    durationMs: 1350,
    isCinematic: false,
  },
};

function parseHeavyDamage(banner: BattleImpactBanner): boolean {
  if (banner.kind !== 'DAMAGE') return false;
  const match = banner.headline.match(/(\d+)/);
  return match ? Number.parseInt(match[1]!, 10) >= 70 : false;
}

export function BattleEffectsOverlay({ banner, onClear }: BattleEffectsOverlayProps) {
  useEffect(() => {
    if (!banner) return;
    const ms = BANNER_STYLES[banner.kind].durationMs;
    const timer = window.setTimeout(onClear, ms);
    return () => window.clearTimeout(timer);
  }, [banner, onClear]);

  return (
    <AnimatePresence>
      {banner &&
        (() => {
          const style = BANNER_STYLES[banner.kind];
          const isHeavyDamage = parseHeavyDamage(banner);

          if (style.isCinematic) {
            const isTimeStop = banner.kind === 'TIME_STOP';
            const isKo = banner.kind === 'KO';
            return (
              <motion.div
                key={banner.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
              >
                {/* Radial Manga Speedlines Burst */}
                <motion.div
                  aria-hidden="true"
                  initial={{ opacity: 0, scale: 1.25 }}
                  animate={{ opacity: [0, 0.72, 0.52, 0], scale: 1, rotate: 16 }}
                  transition={{ duration: style.durationMs / 1000, ease: 'easeOut' }}
                  className="manga-speedlines absolute -inset-[30%]"
                />

                {/* Authentic Za Warudo Negative-Color Shockwave Dome */}
                {isTimeStop && (
                  <motion.div
                    aria-hidden="true"
                    initial={{ scale: 0.05, opacity: 0.95 }}
                    animate={{
                      scale: [0.05, 2.8, 2.9, 0.1],
                      opacity: [0.95, 0.85, 0.7, 0],
                    }}
                    transition={{ duration: 1.35, times: [0, 0.32, 0.78, 1], ease: 'easeOut' }}
                    className="absolute top-1/2 left-1/2 h-[110vmax] w-[110vmax] -translate-x-1/2 -translate-y-1/2 rounded-full border-[14px] border-[#f2c12e] bg-[#f2c12e]/35 mix-blend-difference"
                  />
                )}

                {/* KO Diagonal Crimson Slash Flash */}
                {isKo && (
                  <motion.div
                    aria-hidden="true"
                    initial={{ scaleX: 0, opacity: 1 }}
                    animate={{ scaleX: [0, 1.4, 1.6], opacity: [1, 0.95, 0] }}
                    transition={{ duration: 0.55, ease: 'easeOut' }}
                    className="absolute top-1/2 left-1/2 h-4 w-[135vw] -translate-x-1/2 -translate-y-1/2 -rotate-12 bg-gradient-to-r from-transparent via-[#fff5c0] to-transparent shadow-[0_0_32px_#e6194b]"
                  />
                )}

                {/* Top & Bottom Cinema Ink Bars */}
                <motion.div
                  aria-hidden="true"
                  initial={{ y: -44 }}
                  animate={{ y: 0 }}
                  exit={{ y: -44 }}
                  transition={{ duration: 0.18 }}
                  className={`absolute inset-x-0 top-0 h-6 border-b-2 bg-[#060508] ${
                    isKo ? 'border-[#e6194b]' : 'border-[#f2c12e]'
                  }`}
                />
                <motion.div
                  aria-hidden="true"
                  initial={{ y: 44 }}
                  animate={{ y: 0 }}
                  exit={{ y: 44 }}
                  transition={{ duration: 0.18 }}
                  className={`absolute inset-x-0 bottom-0 h-6 border-t-2 bg-[#060508] ${
                    isKo ? 'border-[#e6194b]' : 'border-[#f2c12e]'
                  }`}
                />

                {/* Full-Width Dramatic Cut-In Band */}
                <motion.div
                  initial={{ x: '-16%', opacity: 0, scaleY: 0.65 }}
                  animate={{ x: '0%', opacity: 1, scaleY: 1 }}
                  exit={{ x: '16%', opacity: 0, scaleY: 0.7 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                  className="absolute inset-x-0 top-[18%] flex items-center justify-center"
                >
                  <div
                    className={`manga-stripes relative flex w-full items-center justify-center border-y-[4px] border-[#060508] py-4 shadow-[0_10px_0_#060508] ${style.bg} ${style.text}`}
                  >
                    {/* Top & bottom accent speed rails */}
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.25 }}
                      className={`absolute inset-x-0 top-0 h-1.5 origin-left ${style.accentBar}`}
                    />
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.25 }}
                      className={`absolute inset-x-0 bottom-0 h-1.5 origin-right ${style.accentBar}`}
                    />

                    {/* Giant Flanking Katakana */}
                    <motion.span
                      aria-hidden="true"
                      initial={{ x: -60, opacity: 0, scale: 1.4 }}
                      animate={{ x: 0, opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 20 }}
                      className={`mr-6 hidden font-jojo-display text-4xl tracking-widest drop-shadow-[4px_4px_0_#060508] sm:inline-block lg:text-5xl ${style.sfxColor}`}
                    >
                      {banner.sfx}
                    </motion.span>

                    <motion.div
                      initial={{ scale: 1.45, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 440, damping: 22 }}
                      className="px-4 text-center"
                    >
                      <div className="font-jojo-display text-4xl leading-none tracking-wider uppercase drop-shadow-[4px_4px_0_#060508] sm:text-6xl">
                        {banner.headline}
                      </div>
                      <div className="mt-1 max-w-xl truncate font-jojo-heading text-sm tracking-[0.16em] uppercase opacity-95 sm:text-base">
                        {banner.subline}
                      </div>
                    </motion.div>

                    <motion.span
                      aria-hidden="true"
                      initial={{ x: 60, opacity: 0, scale: 1.4 }}
                      animate={{ x: 0, opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 20 }}
                      className={`ml-6 hidden font-jojo-display text-4xl tracking-widest drop-shadow-[4px_4px_0_#060508] sm:inline-block lg:text-5xl ${style.sfxColor}`}
                    >
                      {style.secondarySfx}
                    </motion.span>
                  </div>
                </motion.div>
              </motion.div>
            );
          }

          // Standard / Heavy Combat Impact Banner
          return (
            <motion.div
              key={banner.id}
              initial={{ opacity: 0, scale: isHeavyDamage ? 1.55 : 0.68, x: -45 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.88, x: 50 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
              className="pointer-events-none fixed top-20 left-1/2 z-40 -translate-x-1/2"
            >
              {/* Heavy Hit Diagonal Impact Slash */}
              {isHeavyDamage && (
                <motion.div
                  aria-hidden="true"
                  initial={{ scaleX: 0, opacity: 1 }}
                  animate={{ scaleX: [0, 1.35], opacity: [1, 0] }}
                  transition={{ duration: 0.42, ease: 'easeOut' }}
                  className="absolute top-1/2 left-1/2 -z-10 h-3 w-[480px] -translate-x-1/2 -translate-y-1/2 -rotate-6 bg-gradient-to-r from-transparent via-[#f2c12e] to-transparent shadow-[0_0_24px_#f2c12e]"
                />
              )}

              <div
                className={`relative -skew-x-10 border-[3px] border-[#060508] shadow-[7px_7px_0_#060508] ${
                  isHeavyDamage ? 'px-10 py-3.5' : 'px-7 py-2.5'
                } ${style.bg} ${style.text}`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute -top-5 -left-5 font-jojo-display tracking-widest drop-shadow-[3px_3px_0_#060508] ${
                    isHeavyDamage ? 'text-2xl' : 'text-lg'
                  } ${style.sfxColor}`}
                >
                  {banner.sfx}
                </span>
                {isHeavyDamage && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-5 -bottom-4 font-jojo-display text-xl tracking-widest text-[#f2c12e] drop-shadow-[3px_3px_0_#060508]"
                  >
                    {style.secondarySfx}
                  </span>
                )}

                <div className="skew-x-10 text-center">
                  <div
                    className={`font-jojo-display leading-none tracking-wider uppercase ${
                      isHeavyDamage ? 'text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl'
                    }`}
                  >
                    {banner.headline}
                  </div>
                  <div className="mt-0.5 max-w-md truncate text-xs font-bold opacity-95">
                    {banner.subline}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })()}
    </AnimatePresence>
  );
}
