import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { RotateCw, Sparkles, X } from 'lucide-react';
import { getCardById } from '../../../data/cardRegistry';
import {
  RARITY_META,
  type BoosterPackDef,
  type CardRarity,
} from '../../../data/progressionData';
import { CARD_BACK_PATTERN_URL } from '../../../services/assetResolver';
import type { OpenPackOutcome, PackPullResult } from '../../../services/progressionService';
import { useAppStore } from '../../../store/useAppStore';
import type { PackVfxSignal } from '../../vfx/PackOpeningThreeStage';
import { CardView } from '../cards/CardView';

const PackOpeningThreeStage = lazy(() =>
  import('../../vfx/PackOpeningThreeStage').then((m) => ({
    default: m.PackOpeningThreeStage,
  })),
);

interface PackOpeningModalProps {
  pack: BoosterPackDef | null;
  outcomes: OpenPackOutcome[] | null;
  canBuyAnother: boolean;
  onBuyAnother: () => void;
  onClose: () => void;
}

type OpeningPhase = 'SEALED' | 'TEARING' | 'CARDS';

export function PackOpeningModal({
  pack,
  outcomes,
  canBuyAnother,
  onBuyAnother,
  onClose,
}: PackOpeningModalProps) {
  const openInspector = useAppStore((s) => s.openInspector);
  const enable3dVfx = useAppStore((s) => s.settings.enable3dVfx);

  const [phase, setPhase] = useState<OpeningPhase>('SEALED');
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [vfxSignal, setVfxSignal] = useState<PackVfxSignal | null>(null);
  const [urShowcasePull, setUrShowcasePull] = useState<PackPullResult | null>(null);
  const [holoShowcasePull, setHoloShowcasePull] = useState<PackPullResult | null>(null);

  const panelControls = useAnimationControls();
  const signalIdRef = useRef(1);
  const tearTimerRef = useRef<number | null>(null);

  const allPulls: { key: string; pull: PackPullResult }[] = useMemo(
    () =>
      outcomes
        ? outcomes.flatMap((out, pIdx) =>
            out.pulls.map((pull, sIdx) => ({
              key: `${pIdx}-${sIdx}-${pull.cardId}`,
              pull,
            })),
          )
        : [],
    [outcomes],
  );

  const isMultiPack = (outcomes?.length ?? 0) > 1;
  const hasUr = allPulls.some((p) => p.pull.rarity === 'BIZARRE_RARE');
  const hasSr = allPulls.some((p) => p.pull.rarity === 'SUPER_RARE');
  const hasRare = allPulls.some((p) => p.pull.rarity === 'RARE');
  const highestRarity: CardRarity = hasUr
    ? 'BIZARRE_RARE'
    : hasSr
      ? 'SUPER_RARE'
      : hasRare
        ? 'RARE'
        : 'COMMON';

  const totalNew = allPulls.filter((p) => p.pull.isNew).length;
  const totalDuplicates = allPulls.filter((p) => p.pull.isDuplicate).length;
  const allRevealed = allPulls.length > 0 && revealedKeys.size >= allPulls.length;

  const fireVfx = useCallback((kind: PackVfxSignal['kind'], accentHex?: string) => {
    signalIdRef.current += 1;
    setVfxSignal({ id: signalIdRef.current, kind, accentHex });
  }, []);

  const triggerPanelShake = useCallback(
    (amp: number) => {
      if (
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ) {
        return;
      }
      void panelControls.start({
        x: [0, -amp, amp, -amp * 0.65, amp * 0.45, -amp * 0.2, 0],
        y: [0, amp * 0.35, -amp * 0.3, amp * 0.2, 0],
        transition: { duration: 0.34, ease: 'easeOut' },
      });
    },
    [panelControls],
  );

  // Reset opening phase & VFX whenever a new batch arrives
  useEffect(() => {
    if (tearTimerRef.current !== null) {
      window.clearTimeout(tearTimerRef.current);
      tearTimerRef.current = null;
    }
    setRevealedKeys(new Set());
    setUrShowcasePull(null);
    setHoloShowcasePull(null);

    if (!outcomes || !pack) {
      setPhase('SEALED');
      setVfxSignal(null);
      return;
    }

    if (isMultiPack) {
      setPhase('CARDS');
      fireVfx('TEAR', pack.accentHex);
      triggerPanelShake(8);
    } else {
      setPhase('SEALED');
    }
  }, [outcomes, pack, isMultiPack, fireVfx, triggerPanelShake]);

  useEffect(() => {
    return () => {
      if (tearTimerRef.current !== null) {
        window.clearTimeout(tearTimerRef.current);
      }
    };
  }, []);

  // Auto-dismiss UR 0.5% anime jackpot showcase after 2.4s
  useEffect(() => {
    if (!urShowcasePull) return;
    const t = window.setTimeout(() => setUrShowcasePull(null), 2400);
    return () => window.clearTimeout(t);
  }, [urShowcasePull]);

  // Keyboard Escape accessibility
  useEffect(() => {
    if (!pack || !outcomes) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (urShowcasePull) {
        setUrShowcasePull(null);
        return;
      }
      if (allRevealed || phase === 'SEALED') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pack, outcomes, urShowcasePull, allRevealed, phase, onClose]);

  const triggerTearPack = () => {
    if (!pack || phase !== 'SEALED') return;
    setPhase('TEARING');
    fireVfx('TEAR', pack.accentHex);
    triggerPanelShake(8);

    tearTimerRef.current = window.setTimeout(() => {
      tearTimerRef.current = null;
      setPhase('CARDS');
    }, 480);
  };

  const revealOne = (key: string, pull: PackPullResult) => {
    if (revealedKeys.has(key)) return;
    setRevealedKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });

    if (pull.isFoil) {
      fireVfx('UR_JACKPOT', '#00e599');
      triggerPanelShake(13);
      setHoloShowcasePull(pull);
    } else if (pull.rarity === 'BIZARRE_RARE') {
      fireVfx('UR_JACKPOT', '#f2c12e');
      triggerPanelShake(11);
      setUrShowcasePull(pull);
    } else if (pull.rarity === 'SUPER_RARE') {
      fireVfx('SR_REVEAL', '#e6194b');
      triggerPanelShake(6);
    }
  };

  const revealAll = () => {
    if (tearTimerRef.current !== null) {
      window.clearTimeout(tearTimerRef.current);
      tearTimerRef.current = null;
    }
    const unrevealedHolo = allPulls.find(
      (p) => !revealedKeys.has(p.key) && Boolean(p.pull.isFoil),
    );
    const unrevealedUr = allPulls.find(
      (p) => !revealedKeys.has(p.key) && p.pull.rarity === 'BIZARRE_RARE',
    );
    const unrevealedSr = allPulls.find(
      (p) => !revealedKeys.has(p.key) && p.pull.rarity === 'SUPER_RARE',
    );

    setPhase('CARDS');
    setRevealedKeys(new Set(allPulls.map((p) => p.key)));

    if (unrevealedHolo) {
      fireVfx('UR_JACKPOT', '#00e599');
      triggerPanelShake(13);
      setHoloShowcasePull(unrevealedHolo.pull);
    } else if (unrevealedUr) {
      fireVfx('UR_JACKPOT', '#f2c12e');
      triggerPanelShake(11);
      setUrShowcasePull(unrevealedUr.pull);
    } else if (unrevealedSr) {
      fireVfx('SR_REVEAL', '#e6194b');
      triggerPanelShake(6);
    }
  };

  const urShowcaseCard = urShowcasePull ? getCardById(urShowcasePull.cardId) : null;
  const holoShowcaseCard = holoShowcasePull ? getCardById(holoShowcasePull.cardId) : null;

  return (
    <AnimatePresence>
      {pack && outcomes && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`Apertura de ${pack.name}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#060508]/92 p-4"
        >
          {/* Three.js 3D WebGL Pack Opening Burst Stage */}
          <Suspense fallback={null}>
            <PackOpeningThreeStage
              highestRarity={highestRarity}
              signal={vfxSignal}
              enabled={enable3dVfx}
              className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
            />
          </Suspense>

          {/* Subtle Anime Speedlines Aura behind the stage */}
          {(hasUr || hasSr || phase === 'TEARING') && (
            <motion.div
              aria-hidden="true"
              animate={{ rotate: 360 }}
              transition={{ duration: hasUr ? 14 : 24, repeat: Infinity, ease: 'linear' }}
              className={`manga-speedlines pointer-events-none fixed -inset-[35%] z-0 ${
                phase === 'TEARING'
                  ? 'opacity-70'
                  : hasUr
                    ? 'opacity-45'
                    : 'opacity-25'
              }`}
            />
          )}

          {/* Impact Flash Pulse when tearing the foil seam */}
          <AnimatePresence>
            {phase === 'TEARING' && (
              <motion.div
                key="tear-flash"
                aria-hidden="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.8, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.44 }}
                className="pointer-events-none fixed inset-0 z-25 bg-[radial-gradient(circle_at_center,rgba(255,245,192,0.9),rgba(242,193,46,0.3)_40%,transparent_72%)]"
              />
            )}
          </AnimatePresence>

          {/* Main Pack Modal Panel with Impact Screen-Shake */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="relative z-10 max-h-[92vh] w-full max-w-5xl"
          >
            <motion.div
              animate={panelControls}
              className="jojo-panel relative max-h-[92vh] w-full overflow-y-auto bg-[#14101c]/95 p-6"
            >
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar apertura"
              className="jojo-btn-ink absolute top-4 right-4 z-30 flex h-8 w-8 items-center justify-center"
            >
              <X size={16} />
            </button>

            {/* ============ PHASE 1 & 2: SEALED & TEARING FOIL PACK ============ */}
            {phase !== 'CARDS' ? (
              <div className="relative flex flex-col items-center py-6 text-center">
                <div className="mb-3 inline-block -skew-x-10 border-2 border-[#060508] bg-[#f2c12e] px-3 py-0.5 font-jojo-heading text-xs tracking-[0.2em] text-[#0b090e] uppercase shadow-[2px_2px_0_#060508]">
                  <span className="inline-block skew-x-10">{pack.badge}</span>
                </div>
                <h2 className="font-jojo-display text-3xl text-[#f5efe0] uppercase sm:text-4xl">
                  {pack.name}
                </h2>
                <p className="mt-1 text-xs text-zinc-400">
                  {phase === 'TEARING'
                    ? '¡RASGANDO EL SELLO DEL DESTINO!'
                    : `Haz clic en el sobre para rasgarlo y revelar sus ${pack.cardsPerPack} cartas`}
                </p>

                {/* Floating Menacing Katakana Foreshadowing for SR / UR packs */}
                {(hasUr || hasSr) && (
                  <>
                    <motion.span
                      aria-hidden="true"
                      animate={{ y: [0, -10, 0], rotate: [-8, -3, -8] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                      className={`pointer-events-none absolute top-28 left-8 hidden font-jojo-display text-4xl tracking-widest drop-shadow-[3px_3px_0_#060508] md:block ${
                        hasUr ? 'text-[#f2c12e]' : 'text-[#e6194b]'
                      }`}
                    >
                      ゴゴゴゴ
                    </motion.span>
                    <motion.span
                      aria-hidden="true"
                      animate={{ y: [0, 10, 0], rotate: [8, 3, 8] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                      className={`pointer-events-none absolute right-8 bottom-16 hidden font-jojo-display text-4xl tracking-widest drop-shadow-[3px_3px_0_#060508] md:block ${
                        hasUr ? 'text-[#f2c12e]' : 'text-[#e6194b]'
                      }`}
                    >
                      ドドドド
                    </motion.span>
                  </>
                )}

                <div className="jojo-3d-stage relative mt-7 flex items-center justify-center">
                  {/* Bright Anime Slash Beam during TEARING */}
                  <AnimatePresence>
                    {phase === 'TEARING' && (
                      <motion.div
                        key="slash-beam"
                        aria-hidden="true"
                        initial={{ scaleX: 0, opacity: 1 }}
                        animate={{ scaleX: [0, 1.5, 1.8], opacity: [1, 1, 0] }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.42, ease: 'easeOut' }}
                        className="pointer-events-none absolute top-[34px] left-1/2 z-30 h-3 w-[440px] -translate-x-1/2 -rotate-3 bg-gradient-to-r from-transparent via-[#fff8cc] to-transparent shadow-[0_0_28px_#f2c12e]"
                      />
                    )}
                  </AnimatePresence>

                  {/* Interactive Sealed Booster Pack */}
                  <motion.button
                    type="button"
                    disabled={phase === 'TEARING'}
                    onClick={triggerTearPack}
                    animate={
                      phase === 'TEARING'
                        ? {
                            x: [0, -10, 10, -8, 8, 0],
                            scale: [1, 1.07, 1.12, 0.92],
                            rotate: [0, -3, 3, -2, 0],
                          }
                        : {
                            y: [0, -7, 0],
                            rotate: [0, -1.2, 0, 1.2, 0],
                          }
                    }
                    transition={
                      phase === 'TEARING'
                        ? { duration: 0.44, ease: 'easeInOut' }
                        : { duration: 3.4, repeat: Infinity, ease: 'easeInOut' }
                    }
                    whileHover={
                      phase === 'SEALED'
                        ? { scale: 1.06, rotateY: -8, rotateZ: -2 }
                        : undefined
                    }
                    whileTap={phase === 'SEALED' ? { scale: 0.96, y: 4 } : undefined}
                    className="group relative flex h-[350px] w-[244px] flex-col justify-between text-left"
                  >
                    {/* Top Detachable Tear Strip */}
                    <motion.div
                      animate={
                        phase === 'TEARING'
                          ? { y: -110, x: 26, rotate: -22, opacity: 0 }
                          : { y: 0, x: 0, rotate: 0, opacity: 1 }
                      }
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      className="relative z-20 flex items-center justify-between border-[3px] border-b-[3px] border-[#060508] border-b-dashed px-3 py-2 font-mono text-[10px] font-black tracking-widest text-[#0b090e] uppercase shadow-[6px_0_0_#060508]"
                      style={{ backgroundColor: pack.accentHex }}
                    >
                      <span>RASGAR AQUÍ ✂</span>
                      <span>5 CARTAS</span>
                    </motion.div>

                    {/* Lower Foil Pack Body */}
                    <motion.div
                      animate={
                        phase === 'TEARING'
                          ? { y: 18, scale: 1.04, opacity: 0.15 }
                          : { y: 0, scale: 1, opacity: 1 }
                      }
                      transition={{ duration: 0.42, ease: 'easeIn' }}
                      className="jojo-foil-shimmer relative flex flex-1 flex-col justify-between overflow-hidden border-[3px] border-t-0 border-[#060508]"
                      style={{
                        backgroundImage: `url(${pack.patternUrl})`,
                        backgroundSize: '200px',
                        boxShadow: hasUr
                          ? '0 0 42px rgba(242,193,46,0.75), 10px 10px 0 #060508'
                          : hasSr
                            ? '0 0 28px rgba(230,25,75,0.55), 10px 10px 0 #060508'
                            : '10px 10px 0 #060508',
                      }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-[#0b090e]/75 via-[#0b090e]/50 to-[#0b090e]/92" />

                      {/* Center Cover Card Preview */}
                      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4">
                        {(() => {
                          const cover = getCardById(pack.coverCardId);
                          return cover ? (
                            <div className="-rotate-3 transition-transform duration-200 group-hover:scale-108 group-hover:rotate-0">
                              <CardView card={cover} size="sm" showInspectButton={false} />
                            </div>
                          ) : null;
                        })()}
                      </div>

                      {/* Bottom Stamp */}
                      <div className="relative z-10 border-t-2 border-[#060508] bg-[#14101c]/95 px-3 py-2.5 text-center">
                        <div className="font-jojo-display text-lg leading-tight text-[#f2c12e] uppercase">
                          {pack.name}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] font-bold tracking-wider text-white uppercase">
                          {hasUr
                            ? '★ AURA DORADA DETECTADA · CLIC ★'
                            : hasSr
                              ? '✦ ENERGÍA STAND INTENSA · CLIC ✦'
                              : 'CLIC PARA RASGAR'}
                        </div>
                      </div>
                    </motion.div>
                  </motion.button>
                </div>
              </div>
            ) : (
              /* ============ PHASE 3: 3D CARD FLIP SHOWCASE ============ */
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#f2c12e]/25 pb-3 pr-10">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="border border-[#060508] px-2 py-0.5 font-jojo-heading text-xs tracking-widest text-[#0b090e] uppercase"
                        style={{ backgroundColor: pack.accentHex }}
                      >
                        {pack.badge}
                      </span>
                      {outcomes.length > 1 && (
                        <span className="border border-[#060508] bg-[#e6194b] px-2 py-0.5 font-mono text-xs font-bold text-white">
                          ×{outcomes.length} SOBRES ({allPulls.length} CARTAS)
                        </span>
                      )}
                      {hasUr && allRevealed && (
                        <motion.span
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: [0.6, 1.12, 1], opacity: 1 }}
                          className="inline-flex items-center gap-1 border-2 border-[#060508] bg-[#f2c12e] px-2.5 py-0.5 font-jojo-display text-xs tracking-wider text-[#0b090e] uppercase shadow-[2px_2px_0_#060508]"
                        >
                          <Sparkles size={13} /> ¡BIZARRE RARE 0.5% · ゴゴゴ!
                        </motion.span>
                      )}
                    </div>
                    <h2 className="mt-1 font-jojo-display text-2xl text-[#f5efe0] uppercase sm:text-3xl">
                      {pack.name}
                    </h2>
                  </div>

                  {!allRevealed && (
                    <button
                      type="button"
                      onClick={revealAll}
                      className="jojo-btn-primary inline-flex items-center gap-1.5 px-4 py-2 font-jojo-heading text-sm tracking-widest uppercase"
                    >
                      <RotateCw size={14} /> Revelar Todas
                    </button>
                  )}
                </div>

                {/* 3D Flip Card Stage Grid */}
                <div className="jojo-3d-stage flex flex-wrap justify-center gap-4 py-2">
                  {allPulls.map(({ key, pull }, idx) => {
                    const card = getCardById(pull.cardId);
                    if (!card) return null;
                    const meta = RARITY_META[pull.rarity];
                    const isRevealed = revealedKeys.has(key);
                    const isUr = pull.rarity === 'BIZARRE_RARE';
                    const isSr = pull.rarity === 'SUPER_RARE';

                    return (
                      <motion.div
                        key={key}
                        initial={{ opacity: 0, y: 36, scale: 0.72, rotateZ: idx % 2 === 0 ? -6 : 6 }}
                        animate={{ opacity: 1, y: 0, scale: 1, rotateZ: 0 }}
                        transition={{
                          delay: Math.min(idx * 0.055, 0.55),
                          type: 'spring',
                          stiffness: 340,
                          damping: 22,
                        }}
                        className="flex flex-col items-center gap-1.5"
                      >
                        <div className="jojo-3d-stage relative h-[207px] w-[148px]">
                          {/* Expanding Shockwave Halo on SR / UR / HOLO Flip */}
                          <AnimatePresence>
                            {isRevealed && (isUr || isSr || pull.isFoil) && (
                              <motion.div
                                key={`ring-${key}`}
                                aria-hidden="true"
                                initial={{ scale: 0.7, opacity: 0.95 }}
                                animate={{
                                  scale: pull.isFoil ? 2.0 : isUr ? 1.85 : 1.5,
                                  opacity: 0,
                                }}
                                exit={{ opacity: 0 }}
                                transition={{
                                  duration: pull.isFoil ? 0.95 : isUr ? 0.85 : 0.6,
                                  ease: 'easeOut',
                                }}
                                className={`pointer-events-none absolute -inset-2 z-0 rounded-[12px] border-[4px] ${
                                  pull.isFoil
                                    ? 'border-[#00e599] shadow-[0_0_24px_rgba(0,229,153,0.9)]'
                                    : isUr
                                      ? 'border-[#f2c12e]'
                                      : 'border-[#e6194b]'
                                }`}
                              />
                            )}
                          </AnimatePresence>

                          {/* True 3D Two-Sided Rotating Card */}
                          <motion.div
                            animate={{
                              rotateY: isRevealed ? 180 : 0,
                              scale: isRevealed ? (isUr ? [1, 1.16, 1] : isSr ? [1, 1.09, 1] : [1, 1.04, 1]) : 1,
                              y: isRevealed ? [0, -14, 0] : 0,
                            }}
                            transition={{
                              rotateY: { type: 'spring', stiffness: 220, damping: 20 },
                              scale: { duration: 0.45, ease: 'easeOut' },
                              y: { duration: 0.4, ease: 'easeOut' },
                            }}
                            className="jojo-3d-card relative h-full w-full"
                          >
                            {/* CARD BACK FACE (0 deg) */}
                            <motion.button
                              type="button"
                              disabled={isRevealed}
                              tabIndex={isRevealed ? -1 : 0}
                              onClick={() => revealOne(key, pull)}
                              whileHover={!isRevealed ? { y: -6, scale: 1.04 } : undefined}
                              whileTap={!isRevealed ? { scale: 0.95 } : undefined}
                              className={`jojo-backface-hidden absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-[8px] border-[3px] ${meta.borderClass} ${
                                isUr || isSr ? 'jojo-foil-shimmer' : ''
                              } ${isRevealed ? 'pointer-events-none' : 'cursor-pointer'}`}
                              style={{
                                backgroundImage: `url(${CARD_BACK_PATTERN_URL})`,
                                backgroundSize: '180px',
                                boxShadow: isUr
                                  ? '0 0 32px rgba(242,193,46,0.95), 5px 5px 0 #060508'
                                  : isSr
                                    ? '0 0 20px rgba(230,25,75,0.75), 5px 5px 0 #060508'
                                    : '5px 5px 0 #060508',
                              }}
                            >
                              <div className="absolute inset-0 bg-[#0b090e]/55" />
                              <span
                                className={`relative z-10 -skew-x-10 border-2 border-[#060508] px-2.5 py-1 font-jojo-display text-sm tracking-widest uppercase shadow-[3px_3px_0_#060508] ${meta.badgeClass}`}
                              >
                                <span className="inline-block skew-x-10">
                                  {isUr ? '★ UR ★' : isSr ? 'SR' : 'GIRAR'}
                                </span>
                              </span>
                              {isUr && (
                                <motion.span
                                  animate={{ scale: [1, 1.12, 1] }}
                                  transition={{ duration: 0.9, repeat: Infinity }}
                                  className="relative z-10 mt-2 font-jojo-display text-lg tracking-widest text-[#f2c12e] drop-shadow-[2px_2px_0_#060508]"
                                >
                                  ゴゴゴゴ
                                </motion.span>
                              )}
                            </motion.button>

                            {/* CARD FRONT FACE (180 deg) */}
                            <div
                              className={`jojo-backface-hidden absolute inset-0 ${
                                isRevealed ? 'pointer-events-auto' : 'pointer-events-none'
                              }`}
                              style={{
                                transform: 'rotateY(180deg)',
                                filter: isUr
                                  ? 'drop-shadow(0 0 18px rgba(242,193,46,0.85))'
                                  : isSr
                                    ? 'drop-shadow(0 0 12px rgba(230,25,75,0.6))'
                                    : undefined,
                              }}
                            >
                              <div
                                className={`relative h-full w-full overflow-hidden rounded-[7px] ${
                                  isUr || isSr ? 'jojo-foil-shimmer' : ''
                                }`}
                              >
                                <CardView
                                  card={card}
                                  size="md"
                                  highlighted={isUr}
                                  foil={Boolean(pull.isFoil)}
                                  badgeText={
                                    pull.isFoil
                                      ? pull.isNew
                                        ? '¡HOLO NUEVA!'
                                        : '¡HOLO!'
                                      : pull.isNew
                                        ? '¡NUEVA!'
                                        : `×${pull.newOwnedCount}`
                                  }
                                  onClick={() => openInspector(card.id)}
                                />
                              </div>
                            </div>
                          </motion.div>
                        </div>

                        <div className="flex w-[148px] items-center justify-between gap-1 text-[10px]">
                          <span
                            className={`border border-[#060508] px-1.5 py-0.5 font-mono font-black uppercase ${meta.badgeClass}`}
                          >
                            {isRevealed ? meta.short : '?'}
                          </span>
                          <span className="truncate font-jojo-heading text-xs tracking-wider text-zinc-200 uppercase">
                            {isRevealed ? card.name : 'Toca para revelar'}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Footer Summary & Re-open Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-[#060508] pt-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {allRevealed ? (
                      <>
                        <span className="border-2 border-[#060508] bg-[#00b87c] px-2.5 py-1 font-bold text-[#0b090e]">
                          +{totalNew} carta(s) nueva(s)
                        </span>
                        {totalDuplicates > 0 && (
                          <span className="inline-flex items-center gap-1 border-2 border-[#060508] bg-[#f2c12e] px-2.5 py-1 font-bold text-[#0b090e]">
                            <Sparkles size={13} /> +{totalDuplicates} repetida(s) guardada(s) para Crafteo
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-zinc-400">
                        Reveladas: <strong>{revealedKeys.size}/{allPulls.length}</strong>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {allRevealed && canBuyAnother && (
                      <button
                        type="button"
                        onClick={onBuyAnother}
                        className="jojo-btn-primary inline-flex items-center gap-1.5 px-5 py-2 font-jojo-heading text-sm tracking-widest uppercase"
                      >
                        <Sparkles size={14} /> Abrir ×{outcomes.length} ({(pack.price * outcomes.length).toLocaleString()} 🪙)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onClose}
                      className="jojo-btn-ink px-5 py-2 font-jojo-heading text-sm tracking-widest uppercase"
                    >
                      Volver a la Tienda
                    </button>
                  </div>
                </div>
              </div>
            )}
            </motion.div>
          </motion.div>

          {/* ============ FULL-SCREEN UR 0.5% ANIME JACKPOT CUT-IN ============ */}
          <AnimatePresence>
            {urShowcaseCard && (
              <motion.div
                key={`ur-cutin-${urShowcaseCard.id}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setUrShowcasePull(null)}
                className="fixed inset-0 z-30 flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-[#060508]/88"
              >
                {/* Rotating Golden Speedlines */}
                <motion.div
                  aria-hidden="true"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                  className="manga-speedlines pointer-events-none absolute -inset-[40%] opacity-85"
                />

                {/* Top & Bottom Cinema Ink Bars */}
                <motion.div
                  aria-hidden="true"
                  initial={{ y: -70 }}
                  animate={{ y: 0 }}
                  exit={{ y: -70 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                  className="pointer-events-none absolute inset-x-0 top-0 h-14 border-b-4 border-[#f2c12e] bg-[#060508]"
                />
                <motion.div
                  aria-hidden="true"
                  initial={{ y: 70 }}
                  animate={{ y: 0 }}
                  exit={{ y: 70 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-14 border-t-4 border-[#f2c12e] bg-[#060508]"
                />

                {/* Flanking Katakana */}
                <motion.span
                  aria-hidden="true"
                  initial={{ x: -120, opacity: 0, scale: 1.5 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ x: -80, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                  className="pointer-events-none absolute top-24 left-6 hidden font-jojo-display text-6xl tracking-widest text-[#f2c12e] drop-shadow-[5px_5px_0_#060508] md:block"
                >
                  ゴゴゴゴ
                </motion.span>
                <motion.span
                  aria-hidden="true"
                  initial={{ x: 120, opacity: 0, scale: 1.5 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ x: 80, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                  className="pointer-events-none absolute right-6 bottom-24 hidden font-jojo-display text-6xl tracking-widest text-[#e6194b] drop-shadow-[5px_5px_0_#060508] md:block"
                >
                  ドドドド
                </motion.span>

                {/* Banner Headline */}
                <motion.div
                  initial={{ scale: 1.6, opacity: 0, skewX: -12 }}
                  animate={{ scale: 1, opacity: 1, skewX: -12 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="relative z-10 mb-5 border-[4px] border-[#060508] bg-[#f2c12e] px-8 py-2 shadow-[8px_8px_0_#060508]"
                >
                  <div className="skew-x-12 text-center">
                    <div className="font-mono text-xs font-black tracking-[0.35em] text-[#e6194b] uppercase">
                      ★ BIZARRE RARE · PROBABILIDAD 0.5% ★
                    </div>
                    <div className="font-jojo-display text-4xl leading-none tracking-wider text-[#0b090e] uppercase sm:text-5xl">
                      {urShowcaseCard.name}
                    </div>
                  </div>
                </motion.div>

                {/* Spinning Large Foil Card Showcase */}
                <motion.div
                  initial={{ rotateY: -180, scale: 0.45, opacity: 0 }}
                  animate={{ rotateY: 0, scale: [0.45, 1.12, 1.03], opacity: 1 }}
                  exit={{ scale: 0.85, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 18 }}
                  className="jojo-foil-shimmer relative z-10 overflow-hidden rounded-[10px]"
                  style={{
                    filter: 'drop-shadow(0 0 38px rgba(242,193,46,0.95))',
                  }}
                >
                  <CardView
                    card={urShowcaseCard}
                    size="lg"
                    highlighted
                    showInspectButton={false}
                    badgeText="★ UR 0.5% ★"
                  />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="relative z-10 mt-5 border-2 border-[#060508] bg-[#14101c] px-4 py-1 font-mono text-[11px] font-bold tracking-[0.22em] text-[#f2c12e] uppercase shadow-[3px_3px_0_#060508]"
                >
                  CLIC EN CUALQUIER LUGAR PARA CONTINUAR
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ============ FULL-SCREEN 0.1% HOLOGRAPHIC PRISMATIC ANIME CUT-IN ============ */}
          <AnimatePresence>
            {holoShowcaseCard && (
              <motion.div
                key={`holo-cutin-${holoShowcaseCard.id}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                onClick={() => setHoloShowcasePull(null)}
                className="fixed inset-0 z-40 flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-[#060508]/92"
              >
                {/* Rotating Prismatic Speedlines */}
                <motion.div
                  aria-hidden="true"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 6.5, repeat: Infinity, ease: 'linear' }}
                  className="pointer-events-none absolute -inset-[45%] opacity-70"
                  style={{
                    background:
                      'repeating-conic-gradient(from 0deg, rgba(242,193,46,0.28) 0deg 4deg, rgba(0,229,153,0.24) 4deg 8deg, rgba(56,189,248,0.24) 8deg 12deg, rgba(192,132,252,0.28) 12deg 16deg, transparent 16deg 24deg)',
                  }}
                />

                {/* Prismatic Flash Burst on Entry */}
                <motion.div
                  aria-hidden="true"
                  initial={{ opacity: 0.9, scale: 0.5 }}
                  animate={{ opacity: 0, scale: 2.2 }}
                  transition={{ duration: 0.65, ease: 'easeOut' }}
                  className="pointer-events-none absolute h-96 w-96 rounded-full bg-gradient-to-tr from-[#f2c12e] via-[#00e599] to-[#c084fc] blur-2xl"
                />

                {/* Top & Bottom Prismatic Cinema Bars */}
                <motion.div
                  aria-hidden="true"
                  initial={{ y: -70 }}
                  animate={{ y: 0 }}
                  exit={{ y: -70 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                  className="pointer-events-none absolute inset-x-0 top-0 h-14 border-b-4 border-[#00e599] bg-[#060508]"
                />
                <motion.div
                  aria-hidden="true"
                  initial={{ y: 70 }}
                  animate={{ y: 0 }}
                  exit={{ y: 70 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-14 border-t-4 border-[#c084fc] bg-[#060508]"
                />

                {/* Flanking Katakana */}
                <motion.span
                  aria-hidden="true"
                  initial={{ x: -130, opacity: 0, scale: 1.6 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ x: -80, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                  className="pointer-events-none absolute top-24 left-6 hidden font-jojo-display text-6xl tracking-widest text-[#00e599] drop-shadow-[5px_5px_0_#060508] md:block"
                >
                  ゴゴゴゴ
                </motion.span>
                <motion.span
                  aria-hidden="true"
                  initial={{ x: 130, opacity: 0, scale: 1.6 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ x: 80, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                  className="pointer-events-none absolute right-6 bottom-24 hidden font-jojo-display text-6xl tracking-widest text-[#c084fc] drop-shadow-[5px_5px_0_#060508] md:block"
                >
                  キラッ★
                </motion.span>

                {/* Prismatic Banner Headline */}
                <motion.div
                  initial={{ scale: 1.7, opacity: 0, skewX: -12 }}
                  animate={{ scale: 1, opacity: 1, skewX: -12 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                  className="relative z-10 mb-5 border-[4px] border-[#060508] bg-gradient-to-r from-[#f2c12e] via-[#00e599] to-[#c084fc] px-8 py-2 shadow-[8px_8px_0_#060508]"
                >
                  <div className="skew-x-12 text-center">
                    <div className="font-mono text-xs font-black tracking-[0.32em] text-[#0b090e] uppercase">
                      ✦ CARTA HOLOGRÁFICA · PROBABILIDAD 0,1% ✦
                    </div>
                    <div className="font-jojo-display text-4xl leading-none tracking-wider text-[#0b090e] uppercase sm:text-5xl">
                      {holoShowcaseCard.name}
                    </div>
                  </div>
                </motion.div>

                {/* Spinning Large Holographic Card Showcase */}
                <motion.div
                  initial={{ rotateY: -360, scale: 0.35, opacity: 0 }}
                  animate={{ rotateY: 0, scale: [0.35, 1.15, 1.04], opacity: 1 }}
                  exit={{ scale: 0.85, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 190, damping: 17 }}
                  className="relative z-10 rounded-[10px]"
                  style={{
                    filter:
                      'drop-shadow(0 0 28px rgba(0,229,153,0.85)) drop-shadow(0 0 44px rgba(192,132,252,0.65))',
                  }}
                >
                  <CardView
                    card={holoShowcaseCard}
                    size="lg"
                    foil
                    showInspectButton={false}
                    badgeText="✦ HOLO 0,1% ✦"
                  />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="relative z-10 mt-5 border-2 border-[#060508] bg-[#14101c] px-4 py-1 font-mono text-[11px] font-bold tracking-[0.22em] text-[#00e599] uppercase shadow-[3px_3px_0_#060508]"
                >
                  EQUÍPALA DESDE EL INSPECTOR · CLIC PARA CONTINUAR
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
