import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  Layers,
  Lock,
  PackageCheck,
  ShoppingBag,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { getCardById } from '../../data/cardRegistry';
import { ALL_MILESTONES, type MilestoneCategory } from '../../data/milestonesData';
import { getCardRarity, RARITY_META } from '../../data/progressionData';
import {
  getAllMilestonesProgress,
  type MilestoneProgress,
} from '../../services/progressionService';
import { useAppStore } from '../../store/useAppStore';

type MilestoneFilter = 'ALL' | 'READY' | MilestoneCategory;

const COMPACT_PREVIEW_LIMIT = 10;

export function MilestonesView() {
  const progression = useAppStore((s) => s.progression);
  const claimMilestone = useAppStore((s) => s.claimMilestone);
  const claimAllMilestones = useAppStore((s) => s.claimAllMilestones);
  const openInspector = useAppStore((s) => s.openInspector);
  const setScreen = useAppStore((s) => s.setScreen);

  const [filter, setFilter] = useState<MilestoneFilter>('ALL');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ title: string; coins: number } | null>(null);

  const allProgress = useMemo(() => getAllMilestonesProgress(progression), [progression]);

  const stats = useMemo(() => {
    const claimed = allProgress.filter((p) => p.isClaimed);
    const ready = allProgress.filter((p) => p.canClaim);
    const readyCoins = ready.reduce((sum, p) => sum + p.milestone.rewardCoins, 0);
    const earnedCoins = claimed.reduce((sum, p) => sum + p.milestone.rewardCoins, 0);
    const totalPossibleCoins = allProgress.reduce((sum, p) => sum + p.milestone.rewardCoins, 0);
    return {
      total: allProgress.length,
      claimedCount: claimed.length,
      readyCount: ready.length,
      readyCoins,
      earnedCoins,
      totalPossibleCoins,
    };
  }, [allProgress]);

  const visibleMilestones = useMemo(() => {
    const filtered = allProgress.filter((entry) => {
      if (filter === 'ALL') return true;
      if (filter === 'READY') return entry.canClaim;
      return entry.milestone.category === filter;
    });

    // Sort: Ready to claim -> In progress (highest % first) -> Claimed
    return [...filtered].sort((a, b) => {
      const rank = (x: MilestoneProgress) => (x.canClaim ? 0 : !x.isClaimed ? 1 : 2);
      const rDiff = rank(a) - rank(b);
      if (rDiff !== 0) return rDiff;
      if (!a.isClaimed && !b.isClaimed) {
        return b.percent - a.percent || b.milestone.rewardCoins - a.milestone.rewardCoins;
      }
      return b.milestone.rewardCoins - a.milestone.rewardCoins;
    });
  }, [allProgress, filter]);

  const showToast = (title: string, coins: number) => {
    setToast({ title, coins });
    window.setTimeout(() => {
      setToast((prev) => (prev && prev.title === title && prev.coins === coins ? null : prev));
    }, 3600);
  };

  const handleClaimOne = (entry: MilestoneProgress) => {
    const res = claimMilestone(entry.milestone.id);
    if (res.ok && res.coinsAwarded > 0) {
      showToast(entry.milestone.title, res.coinsAwarded);
    }
  };

  const handleClaimAll = () => {
    const res = claimAllMilestones();
    if (res.claimedIds.length > 0 && res.totalCoinsAwarded > 0) {
      showToast(`${res.claimedIds.length} hito(s) reclamados`, res.totalCoinsAwarded);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div
      className="relative min-h-[calc(100vh-56px)] py-6"
      style={{
        backgroundImage: 'url(/assets/patterns/pattern1.png)',
        backgroundSize: '360px',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[#0b090e]/92" />

      {/* Reward Claim Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.94 }}
            className="fixed top-20 right-5 z-50 border-2 border-[#060508] bg-[#f2c12e] px-5 py-3 text-[#0b090e] shadow-[6px_6px_0_#060508]"
          >
            <div className="flex items-center gap-2.5">
              <Trophy size={20} className="shrink-0" />
              <div>
                <div className="font-jojo-heading text-xs tracking-widest uppercase opacity-80">
                  ¡Hito Completado!
                </div>
                <div className="font-jojo-display text-lg leading-tight uppercase">
                  {toast.title} · +{toast.coins.toLocaleString()} MONEDAS
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative z-10 mx-auto max-w-[1440px] space-y-6 px-4">
        {/* Masthead */}
        <div className="jojo-panel flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="font-jojo-heading text-xs tracking-[0.25em] text-[#f2c12e] uppercase">
              ARCHIVOS DE LA FUNDACIÓN SPEEDWAGON
            </div>
            <h1 className="font-jojo-display text-4xl text-[#f5efe0] uppercase">
              HITOS &amp; COLECCIONES
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-zinc-400">
              Completa sobres enteros o reúne grupos icónicos como los{' '}
              <strong className="text-[#f2c12e]">Stardust Crusaders</strong>, los{' '}
              <strong className="text-[#f2c12e]">Hombres del Pilar</strong> o los{' '}
              <strong className="text-[#f2c12e]">Defensores de Morioh</strong> para reclamar
              recompensas extra de monedas Speedwagon.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Completed Counter */}
            <div className="border-2 border-[#060508] bg-[#0e0b14] px-3.5 py-2">
              <div className="font-mono text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                Hitos Reclamados
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="font-jojo-display text-xl text-[#00e599]">
                  {stats.claimedCount}/{stats.total}
                </span>
                <span className="font-mono text-[11px] text-zinc-400">
                  ({Math.round((stats.claimedCount / Math.max(1, stats.total)) * 100)}%)
                </span>
              </div>
            </div>

            {/* Extra Coins Earned */}
            <div className="border-2 border-[#060508] bg-[#0e0b14] px-3.5 py-2">
              <div className="font-mono text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                Monedas por Hitos
              </div>
              <div className="mt-0.5 flex items-baseline gap-1.5 font-mono text-sm font-black text-[#f2c12e]">
                <Coins size={14} />
                <span>{stats.earnedCoins.toLocaleString()}</span>
                <span className="text-[11px] font-normal text-zinc-500">
                  / {stats.totalPossibleCoins.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Claim All CTA */}
            {stats.readyCount > 0 && (
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                onClick={handleClaimAll}
                className="jojo-btn-primary inline-flex items-center gap-2 px-4 py-2.5 font-jojo-heading text-sm tracking-widest uppercase"
              >
                <Sparkles size={16} />
                Reclamar Todos ({stats.readyCount}) · +{stats.readyCoins.toLocaleString()}
              </motion.button>
            )}
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['ALL', `Todos (${ALL_MILESTONES.length})`, Trophy],
                ['READY', `Listos (${stats.readyCount})`, Award],
                [
                  'CARD_SET',
                  `Conjuntos de Cartas (${allProgress.filter((p) => p.milestone.category === 'CARD_SET').length})`,
                  Layers,
                ],
                [
                  'PACK_COMPLETION',
                  `Sobres Completos (${allProgress.filter((p) => p.milestone.category === 'PACK_COMPLETION').length})`,
                  PackageCheck,
                ],
              ] as const
            ).map(([tab, label, Icon]) => {
              const active = filter === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={`-skew-x-8 px-4 py-2 font-jojo-heading text-sm tracking-widest uppercase transition ${
                    active
                      ? tab === 'READY'
                        ? 'border-2 border-[#060508] bg-[#00e599] text-[#0b090e] shadow-[4px_4px_0_#060508]'
                        : 'jojo-btn-primary'
                      : 'jojo-btn-ink text-zinc-400 hover:text-[#f5efe0]'
                  }`}
                >
                  <span className="inline-flex skew-x-8 items-center gap-1.5">
                    <Icon size={14} />
                    {label}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setScreen('SHOP')}
            className="jojo-btn-crimson inline-flex items-center gap-1.5 px-3.5 py-2 font-jojo-heading text-xs tracking-widest uppercase"
          >
            <ShoppingBag size={14} /> Ir a Tienda de Sobres
          </button>
        </div>

        {/* Empty state for READY filter */}
        {visibleMilestones.length === 0 ? (
          <div className="jojo-panel flex flex-col items-center justify-center gap-3 py-14 text-center">
            <Trophy size={38} className="text-zinc-600" />
            <div className="font-jojo-heading text-xl tracking-wider text-zinc-300 uppercase">
              No hay hitos pendientes de reclamar ahora mismo
            </div>
            <p className="max-w-md text-xs text-zinc-400">
              Abre sobres en la Tienda, completa niveles de la Campaña o forja cartas en tu
              Colección para desbloquear nuevos hitos y ganar monedas extra.
            </p>
            <button
              type="button"
              onClick={() => setFilter('ALL')}
              className="jojo-btn-primary mt-1 px-4 py-2 font-jojo-heading text-xs tracking-widest uppercase"
            >
              Ver Todos los Hitos
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {visibleMilestones.map((entry) => {
              const { milestone, unlocked, total, percent, isClaimed, canClaim } = entry;
              const isExpanded = Boolean(expandedIds[milestone.id]);
              const orderedCardIds = [
                ...milestone.requiredCardIds.filter(
                  (id) => (progression.ownedCards[id] ?? 0) === 0,
                ),
                ...milestone.requiredCardIds.filter(
                  (id) => (progression.ownedCards[id] ?? 0) > 0,
                ),
              ];
              const hasOverflow = orderedCardIds.length > COMPACT_PREVIEW_LIMIT;
              const displayedIds =
                hasOverflow && !isExpanded
                  ? orderedCardIds.slice(0, COMPACT_PREVIEW_LIMIT)
                  : orderedCardIds;

              return (
                <motion.div
                  key={milestone.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`relative flex flex-col justify-between border-2 border-[#060508] bg-[#14101c] p-4 shadow-[5px_5px_0_#060508] transition ${
                    canClaim
                      ? 'ring-2 ring-[#f2c12e]'
                      : isClaimed
                        ? 'opacity-85'
                        : ''
                  }`}
                >
                  {/* Top Accent Strip */}
                  <div
                    className="absolute inset-x-0 top-0 h-1.5"
                    style={{ backgroundColor: canClaim ? '#f2c12e' : milestone.accentHex }}
                  />

                  <div className="space-y-3 pt-1">
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className="inline-block border border-[#060508] px-2 py-0.5 font-mono text-[10px] font-black tracking-wider text-[#0b090e] uppercase"
                            style={{ backgroundColor: milestone.accentHex }}
                          >
                            {milestone.badge}
                          </span>
                          <span className="border border-zinc-700 bg-[#0b090e] px-2 py-0.5 font-mono text-[10px] font-bold text-zinc-300 uppercase">
                            {milestone.category === 'PACK_COMPLETION'
                              ? 'Sobre Completo'
                              : 'Conjunto'}
                          </span>
                          {canClaim && (
                            <span className="animate-pulse border border-[#060508] bg-[#00e599] px-2 py-0.5 font-mono text-[10px] font-black text-[#0b090e] uppercase">
                              ¡LISTO!
                            </span>
                          )}
                        </div>

                        <h2 className="font-jojo-display text-2xl leading-tight text-[#f5efe0] uppercase">
                          {milestone.title}
                        </h2>
                        <p className="text-xs text-zinc-400">{milestone.description}</p>
                      </div>

                      {/* Coin Reward Plate */}
                      <div
                        className={`shrink-0 border-2 border-[#060508] px-3 py-1.5 text-right shadow-[3px_3px_0_#060508] ${
                          isClaimed
                            ? 'bg-[#1f2937] text-zinc-400'
                            : 'bg-[#f2c12e] text-[#0b090e]'
                        }`}
                      >
                        <div className="font-mono text-[9px] font-black tracking-wider uppercase opacity-80">
                          Recompensa
                        </div>
                        <div className="flex items-center justify-end gap-1 font-jojo-display text-xl leading-none">
                          <Coins size={15} />
                          <span>+{milestone.rewardCoins.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between font-mono text-[11px] font-bold">
                        <span className="text-zinc-400">
                          Progreso:{' '}
                          <strong className={entry.isCompleted ? 'text-[#00e599]' : 'text-[#f5efe0]'}>
                            {unlocked}/{total} cartas
                          </strong>
                        </span>
                        <span className={entry.isCompleted ? 'text-[#00e599]' : 'text-[#f2c12e]'}>
                          {percent}%
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden border-2 border-[#060508] bg-[#0b090e]">
                        <div
                          className="h-full transition-all duration-300"
                          style={{
                            width: `${percent}%`,
                            backgroundColor: entry.isCompleted
                              ? '#00e599'
                              : milestone.accentHex,
                          }}
                        />
                      </div>
                    </div>

                    {/* Required Cards Checklist (clickable to inspect & see which pack drops it) */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {displayedIds.map((cardId) => {
                          const card = getCardById(cardId);
                          if (!card) return null;
                          const owned = (progression.ownedCards[cardId] ?? 0) > 0;
                          const rarity = RARITY_META[getCardRarity(cardId)];
                          return (
                            <button
                              key={cardId}
                              type="button"
                              onClick={() => openInspector(cardId)}
                              title={`${card.name} (${rarity.label}) — Clic para inspeccionar`}
                              className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-semibold transition ${
                                owned
                                  ? 'border-[#00b87c]/60 bg-[#00b87c]/15 text-[#d1fae5] hover:border-[#00e599]'
                                  : 'border-zinc-700/80 bg-[#0b090e]/90 text-zinc-400 hover:border-[#f2c12e] hover:text-zinc-200'
                              }`}
                            >
                              {owned ? (
                                <CheckCircle2 size={11} className="shrink-0 text-[#00e599]" />
                              ) : (
                                <Lock size={10} className="shrink-0 text-zinc-500" />
                              )}
                              <span
                                className={`px-1 font-mono text-[9px] font-black ${rarity.badgeClass}`}
                              >
                                {rarity.short}
                              </span>
                              <span className="max-w-[140px] truncate">{card.name}</span>
                            </button>
                          );
                        })}
                      </div>

                      {hasOverflow && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(milestone.id)}
                          className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[#f2c12e] hover:underline"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp size={13} /> Ocultar lista completa
                            </>
                          ) : (
                            <>
                              <ChevronDown size={13} /> Ver las{' '}
                              {orderedCardIds.length - COMPACT_PREVIEW_LIMIT} cartas restantes (
                              {entry.missingCardIds.length} faltantes)
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Footer Action */}
                  <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3">
                    <span className="font-mono text-[10px] text-zinc-500">
                      {isClaimed
                        ? 'Recompensa ya añadida a tus Monedas Speedwagon'
                        : canClaim
                          ? '¡Todas las cartas reunidas! Reclama tu premio extra.'
                          : `Faltan ${entry.missingCardIds.length} carta(s) · Clic en cualquier carta para ver su sobre`}
                    </span>

                    {canClaim ? (
                      <button
                        type="button"
                        onClick={() => handleClaimOne(entry)}
                        className="jojo-btn-primary inline-flex items-center gap-1.5 px-4 py-1.5 font-jojo-heading text-xs tracking-widest uppercase"
                      >
                        <Sparkles size={14} /> Reclamar +{milestone.rewardCoins.toLocaleString()}
                      </button>
                    ) : isClaimed ? (
                      <span className="inline-flex items-center gap-1.5 border-2 border-[#060508] bg-[#00b87c]/20 px-3 py-1 font-jojo-heading text-xs tracking-widest text-[#00e599] uppercase">
                        <CheckCircle2 size={14} /> Reclamado
                      </span>
                    ) : milestone.packId ? (
                      <button
                        type="button"
                        onClick={() => setScreen('SHOP')}
                        className="jojo-btn-ink inline-flex items-center gap-1.5 px-3 py-1 font-jojo-heading text-xs tracking-wider text-[#f2c12e] uppercase"
                      >
                        <ShoppingBag size={13} /> Abrir Sobre
                      </button>
                    ) : (
                      <span className="font-mono text-[11px] font-bold text-zinc-500 uppercase">
                        En progreso
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
