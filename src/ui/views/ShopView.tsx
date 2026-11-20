import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Coins, Eye, Lock, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import { getCardById } from '../../data/cardRegistry';
import {
  BOOSTER_PACKS,
  getCardRarity,
  RARITY_META,
  RARITY_ORDER,
  type BoosterPackDef,
  type CardRarity,
  type PackSeries,
} from '../../data/progressionData';
import {
  computeEffectivePackRates,
  getCollectionProgress,
  getOwnedCount,
  getPackCollectionProgress,
  type OpenPackOutcome,
} from '../../services/progressionService';
import { useAppStore } from '../../store/useAppStore';
import { CardView } from '../components/cards/CardView';
import { PackOpeningModal } from '../components/shop/PackOpeningModal';

export function ShopView() {
  const progression = useAppStore((s) => s.progression);
  const buyAndOpenPack = useAppStore((s) => s.buyAndOpenPack);
  const grantTestCoins = useAppStore((s) => s.grantTestCoins);
  const resetProgression = useAppStore((s) => s.resetProgression);
  const openInspector = useAppStore((s) => s.openInspector);

  const [seriesTab, setSeriesTab] = useState<PackSeries>('PART');
  const [openingState, setOpeningState] = useState<{
    pack: BoosterPackDef;
    outcomes: OpenPackOutcome[];
  } | null>(null);
  const [inspectingPack, setInspectingPack] = useState<BoosterPackDef | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const collectionStats = useMemo(() => getCollectionProgress(progression), [progression]);
  const visiblePacks = useMemo(
    () => BOOSTER_PACKS.filter((p) => p.series === seriesTab),
    [seriesTab],
  );

  const handleOpenPack = (pack: BoosterPackDef, count: number) => {
    const outcomes = buyAndOpenPack(pack.id, count);
    if (!outcomes) return;
    setOpeningState({ pack, outcomes });
  };

  return (
    <div
      className="relative min-h-[calc(100vh-56px)] py-6"
      style={{
        backgroundImage: 'url(/assets/patterns/pattern3.png)',
        backgroundSize: '340px',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[#0b090e]/92" />

      <div className="relative z-10 mx-auto max-w-[1440px] space-y-6 px-4">
        {/* Top Shop Masthead + Wallet */}
        <div className="jojo-panel flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="font-jojo-heading text-xs tracking-[0.25em] text-[#e6194b] uppercase">
              TIENDA DE LA FUNDACIÓN SPEEDWAGON
            </div>
            <h1 className="font-jojo-display text-4xl text-[#f5efe0] uppercase">
              SOBRES DE EXPANSIÓN
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              Desbloquea personajes, Stands, evoluciones y objetos. Los pesos pesados{' '}
              <strong className="text-[#f2c12e]">Bizarre Rare (UR)</strong> tienen una probabilidad
              del <strong className="text-[#f2c12e]">0.5%</strong> por carta.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Collection Progress Pill */}
            <div className="border-2 border-[#060508] bg-[#0e0b14] px-3.5 py-2">
              <div className="font-mono text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                Colección · {progression.packsOpened} sobres
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="font-jojo-display text-xl text-[#00e599]">
                  {collectionStats.unlocked}/{collectionStats.total}
                </span>
                <span className="font-mono text-xs text-zinc-400">
                  ({collectionStats.percent}%)
                </span>
              </div>
            </div>

            {/* Coins Balance */}
            <div className="border-2 border-[#060508] bg-[#f2c12e] px-4 py-2 text-[#0b090e] shadow-[4px_4px_0_#060508]">
              <div className="font-mono text-[10px] font-black tracking-wider uppercase opacity-80">
                Monedas Speedwagon
              </div>
              <div className="flex items-center gap-1.5 font-jojo-display text-2xl leading-none">
                <Coins size={20} /> {progression.coins.toLocaleString()}
              </div>
            </div>

            {/* Test Coins + Reset Controls */}
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => grantTestCoins(10_000)}
                title="Añadir monedas de prueba para testear la tienda y el 0.5%"
                className="jojo-btn-ink inline-flex items-center justify-center gap-1 px-2.5 py-1 font-mono text-[10px] font-bold text-[#f2c12e] uppercase"
              >
                <Plus size={11} /> +10.000 (Test)
              </button>
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="jojo-btn-ink inline-flex items-center justify-center gap-1 px-2.5 py-1 font-mono text-[10px] font-bold text-zinc-400 uppercase hover:text-rose-300"
                >
                  <RotateCcw size={10} /> Reiniciar
                </button>
              ) : (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      resetProgression();
                      setConfirmReset(false);
                    }}
                    className="jojo-btn-crimson px-2 py-1 font-mono text-[10px] font-bold uppercase"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="jojo-btn-ink px-2 py-1 font-mono text-[10px] uppercase"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Series Selector Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {(
              [
                ['PART', 'Sobres por Parte (P1 — P5)'],
                ['CORRELATION', 'Series de Correlaciones (JoJos, JoBros, Villanos...)'],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSeriesTab(tab)}
                className={`-skew-x-8 px-4 py-2 font-jojo-heading text-sm tracking-widest uppercase ${
                  seriesTab === tab ? 'jojo-btn-primary' : 'jojo-btn-ink text-zinc-400'
                }`}
              >
                <span className="inline-block skew-x-8">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
            <span className="border border-[#060508] bg-[#14101c] px-2.5 py-1">
              Victoria IA: <strong className="text-[#f2c12e]">140–350 🪙</strong> · Repetidas se
              guardan en Colección para <strong className="text-[#00e599]">Craftear</strong>
            </span>
          </div>
        </div>

        {/* Booster Packs Grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={seriesTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
          >
            {visiblePacks.map((pack, idx) => {
              const packProg = getPackCollectionProgress(progression, pack);
              const coverCard = getCardById(pack.coverCardId);
              const canAfford1 = progression.coins >= pack.price;
              const canAfford5 = progression.coins >= pack.price * 5;
              const hasUr = pack.chaseCardIds.length > 0;

              return (
                <motion.div
                  key={pack.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.22 }}
                  className="jojo-panel flex flex-col justify-between overflow-hidden"
                >
                  {/* Visual Booster Foil Header */}
                  <div
                    className="relative flex items-center gap-4 border-b-2 border-[#060508] p-4"
                    style={{
                      backgroundImage: `url(${pack.patternUrl})`,
                      backgroundSize: '200px',
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0b090e]/92 via-[#0b090e]/82 to-[#0b090e]/65" />

                    {/* Mini Cover Card */}
                    <div className="relative z-10 shrink-0 -rotate-3 transition-transform hover:rotate-0">
                      {coverCard && (
                        <CardView
                          card={coverCard}
                          size="xs"
                          showInspectButton={false}
                          onClick={() => openInspector(coverCard.id)}
                        />
                      )}
                    </div>

                    <div className="relative z-10 min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="border border-[#060508] px-2 py-0.5 font-jojo-heading text-[11px] tracking-widest text-[#0b090e] uppercase"
                          style={{ backgroundColor: pack.accentHex }}
                        >
                          {pack.badge}
                        </span>
                        {hasUr && (
                          <span className="border border-[#060508] bg-[#f2c12e] px-1.5 py-0.5 font-mono text-[10px] font-black text-[#0b090e]">
                            UR 0.5%
                          </span>
                        )}
                      </div>
                      <h2 className="font-jojo-display text-xl leading-tight text-[#f5efe0] uppercase">
                        {pack.name}
                      </h2>
                      <p className="text-[11px] leading-snug text-zinc-300">{pack.subtitle}</p>
                    </div>
                  </div>

                  {/* Pack Progress + Actions */}
                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">
                        Colección del sobre:{' '}
                        <strong className="text-[#00e599]">
                          {packProg.unlocked}/{packProg.total}
                        </strong>
                      </span>
                      <span className="inline-flex items-center gap-1 font-jojo-display text-lg text-[#f2c12e]">
                        <Coins size={15} /> {pack.price}
                      </span>
                    </div>

                    <div className="h-2 w-full overflow-hidden border border-[#060508] bg-[#0e0b14]">
                      <div
                        className="h-full bg-[#00b87c] transition-all duration-300"
                        style={{
                          width: `${packProg.total > 0 ? Math.round((packProg.unlocked / packProg.total) * 100) : 0}%`,
                        }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={!canAfford1}
                        onClick={() => handleOpenPack(pack, 1)}
                        className="jojo-btn-primary flex-1 inline-flex items-center justify-center gap-1.5 py-2 font-jojo-heading text-sm tracking-widest uppercase disabled:opacity-35"
                      >
                        <Sparkles size={14} /> Abrir ×1
                      </button>
                      <button
                        type="button"
                        disabled={!canAfford5}
                        onClick={() => handleOpenPack(pack, 5)}
                        title={`Abrir 5 sobres (${(pack.price * 5).toLocaleString()} monedas)`}
                        className="jojo-btn-crimson px-3.5 py-2 font-jojo-heading text-sm tracking-wider uppercase disabled:opacity-35"
                      >
                        ×5 ({(pack.price * 5).toLocaleString()})
                      </button>
                      <button
                        type="button"
                        onClick={() => setInspectingPack(pack)}
                        title="Ver contenido y probabilidades exactas"
                        className="jojo-btn-ink flex items-center gap-1 px-2.5 py-2 text-xs font-bold"
                      >
                        <Eye size={14} /> %
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Pack Contents & Odds Inspection Modal */}
      <AnimatePresence>
        {inspectingPack && (() => {
          const normalRates = computeEffectivePackRates(inspectingPack, false);
          const featuredRates = computeEffectivePackRates(inspectingPack, true);
          const sortedCards = Array.from(new Set(inspectingPack.poolCardIds))
            .map((id) => ({ id, card: getCardById(id), rarity: getCardRarity(id) }))
            .filter((x): x is { id: string; card: NonNullable<typeof x.card>; rarity: CardRarity } => Boolean(x.card))
            .sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] || a.card.name.localeCompare(b.card.name));

          return (
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`Contenido de ${inspectingPack.name}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInspectingPack(null)}
              className="fixed inset-0 z-50 flex items-center justify-center bg-[#060508]/88 p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 10 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                onClick={(e) => e.stopPropagation()}
                className="jojo-panel relative max-h-[88vh] w-full max-w-4xl space-y-4 overflow-y-auto p-6"
              >
                <button
                  type="button"
                  onClick={() => setInspectingPack(null)}
                  className="jojo-btn-ink absolute top-4 right-4 flex h-8 w-8 items-center justify-center"
                >
                  <X size={16} />
                </button>

                <div>
                  <span
                    className="border border-[#060508] px-2 py-0.5 font-jojo-heading text-xs tracking-widest text-[#0b090e] uppercase"
                    style={{ backgroundColor: inspectingPack.accentHex }}
                  >
                    {inspectingPack.badge}
                  </span>
                  <h2 className="mt-1 font-jojo-display text-2xl text-[#f5efe0] uppercase">
                    {inspectingPack.name} — Probabilidades y Cartas ({sortedCards.length})
                  </h2>
                </div>

                {/* Transparent Odds Table */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(['BIZARRE_RARE', 'SUPER_RARE', 'RARE', 'COMMON'] as CardRarity[]).map((r) => {
                    const meta = RARITY_META[r];
                    return (
                      <div
                        key={r}
                        className="border-2 border-[#060508] bg-[#0e0b14] p-2.5 text-xs"
                      >
                        <span
                          className={`inline-block border border-[#060508] px-1.5 py-0.5 font-mono text-[10px] font-black uppercase ${meta.badgeClass}`}
                        >
                          {meta.short} · {meta.label}
                        </span>
                        <div className="mt-1.5 font-mono text-[11px] text-zinc-200">
                          Slots 1–4: <strong>{(normalRates[r] * 100).toFixed(1)}%</strong>
                        </div>
                        <div className="font-mono text-[11px] text-[#f2c12e]">
                          Slot 5: <strong>{(featuredRates[r] * 100).toFixed(1)}%</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Cards inside Pack */}
                <div className="flex flex-wrap justify-center gap-3 pt-2">
                  {sortedCards.map(({ card, rarity }) => {
                    const owned = getOwnedCount(progression, card.id);
                    const meta = RARITY_META[rarity];
                    return (
                      <div key={card.id} className="flex flex-col items-center gap-1">
                        <div className={`relative ${owned === 0 ? 'opacity-55 grayscale-[45%]' : ''}`}>
                          <CardView
                            card={card}
                            size="sm"
                            badgeText={owned > 0 ? `×${owned}` : undefined}
                            onClick={() => openInspector(card.id)}
                          />
                          {owned === 0 && (
                            <span className="pointer-events-none absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center border border-[#060508] bg-[#0b090e]/90 text-zinc-300">
                              <Lock size={10} />
                            </span>
                          )}
                        </div>
                        <div className="flex w-[108px] items-center justify-between gap-1 text-[10px]">
                          <span className={`px-1 font-mono font-bold ${meta.badgeClass}`}>
                            {meta.short}
                          </span>
                          <span className="truncate font-semibold text-zinc-300">{card.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Pack Opening Interactive Modal */}
      <PackOpeningModal
        pack={openingState?.pack ?? null}
        outcomes={openingState?.outcomes ?? null}
        canBuyAnother={
          Boolean(
            openingState &&
              progression.coins >= openingState.pack.price * openingState.outcomes.length,
          )
        }
        onBuyAnother={() => {
          if (!openingState) return;
          handleOpenPack(openingState.pack, openingState.outcomes.length);
        }}
        onClose={() => setOpeningState(null)}
      />
    </div>
  );
}
