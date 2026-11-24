import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShieldAlert, Sparkles, X } from 'lucide-react';
import { getRoguelikeRelicById } from '../../../data/roguelikeData';
import type { RoguelikeModifierItem } from '../../../services/roguelikeService';

interface RoguelikeModifiersHudProps {
  playerModifiers: RoguelikeModifierItem[];
  enemyModifiers: RoguelikeModifierItem[];
  relicIds: string[];
  playerName: string;
  enemyName: string;
}

const SOURCE_BADGE: Record<
  RoguelikeModifierItem['sourceCategory'],
  { label: string; className: string }
> = {
  RELIC: { label: 'RELIQUIA', className: 'bg-[#f2c12e] text-[#0b090e]' },
  SCALING: { label: 'ESCALADO ROGUELIKE', className: 'bg-[#9333ea] text-white' },
  DIFFICULTY: { label: 'DIFICULTAD', className: 'bg-[#e6194b] text-white' },
  RULE: { label: 'REGLA', className: 'bg-[#2952d9] text-white' },
};

const KIND_STYLE: Record<
  RoguelikeModifierItem['kind'],
  { pill: string; badge: string; badgeText: string }
> = {
  BUFF: {
    pill: 'border-[#f2c12e]/70 bg-[#1c1528]/95 text-[#f5efe0] hover:border-[#f2c12e] hover:bg-[#281e3a]',
    badge: 'bg-[#00b87c] text-[#0b090e]',
    badgeText: 'BUFO',
  },
  DEBUFF: {
    pill: 'border-sky-400/70 bg-[#101c28]/95 text-sky-100 hover:border-sky-300 hover:bg-[#172a3b]',
    badge: 'bg-sky-400 text-[#0b090e]',
    badgeText: 'DEBUFO',
  },
  NEUTRAL: {
    pill: 'border-zinc-500/60 bg-[#15111e]/95 text-zinc-200 hover:border-zinc-300 hover:bg-[#221c30]',
    badge: 'bg-zinc-600 text-white',
    badgeText: 'INFO',
  },
};

export function RoguelikeModifiersHud({
  playerModifiers,
  enemyModifiers,
  relicIds,
  playerName,
  enemyName,
}: RoguelikeModifiersHudProps) {
  const [modalState, setModalState] = useState<{
    tab: 'PLAYER' | 'ENEMY';
    focusedId: string | null;
  } | null>(null);

  const openModal = (tab: 'PLAYER' | 'ENEMY', focusedId: string) => {
    setModalState({ tab, focusedId });
  };

  const activeItems = modalState?.tab === 'ENEMY' ? enemyModifiers : playerModifiers;
  const ownedRelics = relicIds
    .map((id) => getRoguelikeRelicById(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  return (
    <>
      {/* LEFT EDGE: ENEMY SCALING & EXTERNAL MODIFIERS */}
      {enemyModifiers.length > 0 && (
        <aside
          aria-label="Bonuses y escalado del rival"
          className="pointer-events-none fixed top-1/2 left-1.5 z-30 flex -translate-y-1/2 flex-col items-start gap-1.5"
        >
          <span className="pointer-events-auto border border-[#060508] bg-[#e6194b] px-1.5 py-0.5 font-jojo-heading text-[9px] tracking-[0.18em] text-white uppercase shadow-[2px_2px_0_#060508]">
            RIVAL
          </span>
          {enemyModifiers.map((mod) => {
            const style = KIND_STYLE[mod.kind];
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => openModal('ENEMY', mod.id)}
                title={`${mod.title} — Clic para ver el desglose`}
                className={`pointer-events-auto flex items-center gap-1.5 border-2 px-2 py-1 text-left font-mono text-[10px] font-black shadow-[3px_3px_0_#060508] transition hover:translate-x-0.5 ${
                  mod.kind === 'BUFF'
                    ? 'border-[#e6194b]/80 bg-[#26101b]/95 text-rose-100 hover:border-[#ff4d79] hover:bg-[#381425]'
                    : style.pill
                }`}
              >
                <span className="text-xs leading-none">{mod.icon}</span>
                <span className="whitespace-nowrap">{mod.tagLabel}</span>
              </button>
            );
          })}
        </aside>
      )}

      {/* RIGHT EDGE: PLAYER RELICS & EXTERNAL BONUSES */}
      {playerModifiers.length > 0 && (
        <aside
          aria-label="Tus bonuses y reliquias"
          className="pointer-events-none fixed top-1/2 right-1.5 z-30 flex -translate-y-1/2 flex-col items-end gap-1.5"
        >
          <span className="pointer-events-auto border border-[#060508] bg-[#f2c12e] px-1.5 py-0.5 font-jojo-heading text-[9px] tracking-[0.18em] text-[#0b090e] uppercase shadow-[2px_2px_0_#060508]">
            TUS BUFOS
          </span>
          {playerModifiers.map((mod) => {
            const style = KIND_STYLE[mod.kind];
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => openModal('PLAYER', mod.id)}
                title={`${mod.title} — Clic para ver el desglose`}
                className={`pointer-events-auto flex items-center gap-1.5 border-2 px-2 py-1 text-right font-mono text-[10px] font-black shadow-[3px_3px_0_#060508] transition hover:-translate-x-0.5 ${style.pill}`}
              >
                <span className="whitespace-nowrap">{mod.tagLabel}</span>
                <span className="text-xs leading-none">{mod.icon}</span>
              </button>
            );
          })}
        </aside>
      )}

      {/* BREAKDOWN MODAL */}
      <AnimatePresence>
        {modalState && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setModalState(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.16 }}
              onClick={(e) => e.stopPropagation()}
              className="jojo-panel flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b-2 border-[#060508] bg-[#161022] px-5 py-3.5">
                <div>
                  <div className="font-jojo-heading text-[11px] tracking-[0.22em] text-[#f2c12e] uppercase">
                    EXPEDICIÓN ROGUELIKE · MODIFICADORES EXTERNOS
                  </div>
                  <h2 className="font-jojo-display text-2xl text-[#f5efe0] uppercase">
                    Desglose de Bufos y Escalado
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setModalState(null)}
                  aria-label="Cerrar desglose"
                  className="jojo-btn-ink p-1.5 text-zinc-200 hover:text-[#f2c12e]"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Side Switcher Tabs */}
              <div className="grid grid-cols-2 border-b-2 border-[#060508] bg-[#0e0b14]">
                <button
                  type="button"
                  onClick={() => setModalState({ tab: 'PLAYER', focusedId: null })}
                  className={`flex items-center justify-center gap-2 px-4 py-2.5 font-jojo-heading text-xs tracking-widest uppercase transition ${
                    modalState.tab === 'PLAYER'
                      ? 'border-b-3 border-[#f2c12e] bg-[#1f182d] text-[#f2c12e]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Sparkles size={14} /> {playerName} ({playerModifiers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setModalState({ tab: 'ENEMY', focusedId: null })}
                  className={`flex items-center justify-center gap-2 border-l border-[#060508] px-4 py-2.5 font-jojo-heading text-xs tracking-widest uppercase transition ${
                    modalState.tab === 'ENEMY'
                      ? 'border-b-3 border-[#e6194b] bg-[#2a121d] text-[#ff6b8d]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <ShieldAlert size={14} /> {enemyName} ({enemyModifiers.length})
                </button>
              </div>

              {/* Breakdown Body */}
              <div className="space-y-3 overflow-y-auto p-5">
                {activeItems.length === 0 ? (
                  <p className="py-6 text-center text-xs text-zinc-400">
                    No hay modificadores externos activos en este lado.
                  </p>
                ) : (
                  activeItems.map((mod) => {
                    const srcBadge = SOURCE_BADGE[mod.sourceCategory];
                    const kindStyle = KIND_STYLE[mod.kind];
                    const isFocused = modalState.focusedId === mod.id;
                    return (
                      <div
                        key={mod.id}
                        className={`border-2 p-3.5 transition ${
                          isFocused
                            ? 'border-[#f2c12e] bg-[#221a32] shadow-[4px_4px_0_#060508]'
                            : 'border-[#060508] bg-[#120e1b]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg leading-none">{mod.icon}</span>
                            <span className="font-jojo-heading text-sm text-[#f5efe0] uppercase">
                              {mod.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`border border-[#060508] px-1.5 py-0.5 font-mono text-[9px] font-black uppercase ${kindStyle.badge}`}
                            >
                              {kindStyle.badgeText}
                            </span>
                            <span
                              className={`border border-[#060508] px-1.5 py-0.5 font-mono text-[9px] font-black uppercase ${srcBadge.className}`}
                            >
                              {srcBadge.label}
                            </span>
                          </div>
                        </div>

                        <div className="mt-1 font-mono text-[11px] font-bold text-[#f2c12e]/90">
                          Origen: {mod.sourceLabel}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                          {mod.description}
                        </p>

                        {mod.breakdown && mod.breakdown.length > 0 && (
                          <ul className="mt-2 space-y-1 border-t border-white/10 pt-2 text-[11px] text-zinc-200">
                            {mod.breakdown.map((line, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="text-[#f2c12e]">▸</span>
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Full owned Relics inventory on Player tab */}
                {modalState.tab === 'PLAYER' && ownedRelics.length > 0 && (
                  <div className="border-t-2 border-white/10 pt-4">
                    <div className="mb-2 font-jojo-heading text-xs tracking-[0.18em] text-[#f2c12e] uppercase">
                      Todas tus Reliquias Activas ({ownedRelics.length})
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {ownedRelics.map((rel) => (
                        <div
                          key={rel.id}
                          className="border border-[#f2c12e]/35 bg-[#181224] p-2.5 text-xs"
                        >
                          <div className="font-bold text-[#f2c12e]">
                            {rel.icon} {rel.name}
                          </div>
                          <div className="mt-0.5 text-[11px] text-zinc-300">{rel.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
