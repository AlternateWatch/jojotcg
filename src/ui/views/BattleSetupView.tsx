import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Lock, ShoppingBag } from 'lucide-react';
import { STARTER_DECK_ID } from '../../data/progressionData';
import { ENERGY_META, type EnergyType } from '../../data/schemas/cardTypes';
import type { AiDifficulty } from '../../engine/ai/tacticalAi';
import { validateDeck } from '../../services/deckValidator';
import { getMissingCardsForDeck } from '../../services/progressionService';
import { useAppStore } from '../../store/useAppStore';
import { useBattleStore, type BattleMode } from '../../store/useBattleStore';

const DIFFICULTY_OPTIONS: { id: AiDifficulty; label: string; hint: string }[] = [
  { id: 'EASY', label: 'Fácil', hint: 'IA relajada · ideal para practicar' },
  { id: 'NORMAL', label: 'Normal', hint: 'Equilibrada · combates tácticos' },
  { id: 'HARD', label: 'Difícil', hint: 'IA óptima · máxima exigencia' },
];

export function BattleSetupView() {
  const preferredMode = useAppStore((s) => s.preferredBattleMode);
  const preselectedDeckId = useAppStore((s) => s.preselectedDeckId);
  const allDecks = useAppStore((s) => s.allDecks);
  const progression = useAppStore((s) => s.progression);
  const settings = useAppStore((s) => s.settings);
  const setHotseatPrivacyScreen = useAppStore((s) => s.setHotseatPrivacyScreen);
  const setAiDifficulty = useAppStore((s) => s.setAiDifficulty);
  const setScreen = useAppStore((s) => s.setScreen);
  const startBattle = useBattleStore((s) => s.startBattle);

  const [mode, setMode] = useState<BattleMode>(preferredMode);
  const [p1Name, setP1Name] = useState('Jotaro (J1)');
  const [p2Name, setP2Name] = useState(preferredMode === 'VS_AI' ? 'IA Bizarra' : 'DIO (J2)');
  const [p1DeckId, setP1DeckId] = useState(
    preselectedDeckId ?? allDecks.find((d) => d.id === STARTER_DECK_ID)?.id ?? allDecks[0]?.id ?? '',
  );
  const [p2DeckId, setP2DeckId] = useState(
    allDecks.find((d) => d.id === 'preset-dio-pillar-men')?.id ?? allDecks[1]?.id ?? allDecks[0]?.id ?? '',
  );
  const [starter, setStarter] = useState<'P1' | 'P2' | 'RANDOM'>('P1');

  const p1Deck = allDecks.find((d) => d.id === p1DeckId);
  const p2Deck = allDecks.find((d) => d.id === p2DeckId);

  const p1Val = useMemo(() => (p1Deck ? validateDeck(p1Deck.cardIds) : null), [p1Deck]);
  const p2Val = useMemo(() => (p2Deck ? validateDeck(p2Deck.cardIds) : null), [p2Deck]);
  const p1Missing = useMemo(
    () => (p1Deck ? getMissingCardsForDeck(progression, p1Deck.cardIds) : []),
    [progression, p1Deck],
  );

  const canStart = Boolean(
    p1Deck && p2Deck && p1Val?.valid && p2Val?.valid && p1Missing.length === 0,
  );

  const handleModeChange = (next: BattleMode) => {
    setMode(next);
    setP2Name(next === 'VS_AI' ? 'IA Bizarra' : 'Jugador 2');
  };

  const handleLaunch = () => {
    if (!p1Deck || !p2Deck || !canStart) return;
    const firstPlayerId =
      starter === 'RANDOM' ? (Math.random() < 0.5 ? 'P1' : 'P2') : starter;
    startBattle(
      {
        mode,
        p1Name: p1Name.trim() || 'Jugador 1',
        p2Name: p2Name.trim() || (mode === 'VS_AI' ? 'IA Bizarra' : 'Jugador 2'),
        p1DeckIds: p1Deck.cardIds,
        p2DeckIds: p2Deck.cardIds,
        firstPlayerId,
        aiDifficulty: settings.aiDifficulty,
      },
      settings.hotseatPrivacyScreen,
    );
    setScreen('BATTLE');
  };

  return (
    <div
      className="relative min-h-[calc(100vh-56px)] py-8"
      style={{
        backgroundImage: 'url(/assets/patterns/pattern1.png)',
        backgroundSize: '340px',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[#0b090e]/90" />

      <div className="relative z-10 mx-auto max-w-5xl space-y-6 px-4">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#f2c12e]/30 pb-4">
          <div>
            <div className="font-jojo-heading text-xs tracking-[0.25em] text-[#e6194b] uppercase">
              CONFIGURACIÓN DEL DUELO
            </div>
            <h1 className="font-jojo-display text-4xl text-[#f5efe0] uppercase">
              SELECCIÓN DE CONTENDIENTES
            </h1>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleModeChange('VS_AI')}
              className={`-skew-x-10 px-4 py-2 font-jojo-heading text-sm tracking-widest uppercase ${
                mode === 'VS_AI' ? 'jojo-btn-primary' : 'jojo-btn-ink text-zinc-400'
              }`}
            >
              <span className="inline-block skew-x-10">1v1 vs IA</span>
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('HOTSEAT')}
              className={`-skew-x-10 px-4 py-2 font-jojo-heading text-sm tracking-widest uppercase ${
                mode === 'HOTSEAT' ? 'jojo-btn-crimson' : 'jojo-btn-ink text-zinc-400'
              }`}
            >
              <span className="inline-block skew-x-10">1v1 Local</span>
            </button>
          </div>
        </div>

        {/* Arcade VS Split */}
        <div className="relative grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
          {/* Center VS Medallion with fighting-game slam */}
          <motion.div
            initial={{ scale: 2.1, opacity: 0, rotate: -22 }}
            animate={{ scale: 1, opacity: 1, rotate: -6 }}
            transition={{ delay: 0.14, type: 'spring', stiffness: 420, damping: 20 }}
            className="pointer-events-none absolute top-1/2 left-1/2 z-20 hidden -translate-x-1/2 -translate-y-1/2 border-[3px] border-[#060508] bg-[#e6194b] px-3 py-1 font-jojo-display text-2xl text-white shadow-[4px_4px_0_#060508] md:block"
          >
            VS
          </motion.div>

          {[
            {
              tag: 'JUGADOR 1',
              barColor: 'bg-[#f2c12e] text-[#0b090e]',
              name: p1Name,
              setName: setP1Name,
              deckId: p1DeckId,
              setDeckId: setP1DeckId,
              deck: p1Deck,
              val: p1Val,
            },
            {
              tag: mode === 'VS_AI' ? 'RIVAL — IA TÁCTICA' : 'JUGADOR 2',
              barColor: 'bg-[#e6194b] text-white',
              name: p2Name,
              setName: setP2Name,
              deckId: p2DeckId,
              setDeckId: setP2DeckId,
              deck: p2Deck,
              val: p2Val,
            },
          ].map((slot, slotIdx) => (
            <motion.div
              key={slot.tag}
              initial={{ opacity: 0, x: slotIdx === 0 ? -34 : 34 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="jojo-panel flex flex-col justify-between p-5"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`-skew-x-8 border-2 border-[#060508] px-3 py-0.5 font-jojo-heading text-sm tracking-widest uppercase shadow-[2px_2px_0_#060508] ${slot.barColor}`}
                  >
                    <span className="inline-block skew-x-8">{slot.tag}</span>
                  </span>
                  {slot.val && (
                    <span
                      className={`border border-[#060508] px-2 py-0.5 font-mono text-[11px] font-bold uppercase ${
                        slot.val.valid
                          ? 'bg-[#00b87c] text-[#0b090e]'
                          : 'bg-[#e6194b] text-white'
                      }`}
                    >
                      {slot.val.valid ? 'LEGAL 40/40' : 'INVÁLIDO'}
                    </span>
                  )}
                </div>

                <div>
                  <label className="font-jojo-heading text-xs tracking-widest text-zinc-400 uppercase">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={slot.name}
                    onChange={(e) => slot.setName(e.target.value)}
                    className="mt-1 w-full border-2 border-[#060508] bg-[#0e0b14] px-3 py-2 text-sm font-bold text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-jojo-heading text-xs tracking-widest text-zinc-400 uppercase">
                    Baraja
                  </label>
                  <select
                    value={slot.deckId}
                    onChange={(e) => slot.setDeckId(e.target.value)}
                    className="mt-1 w-full border-2 border-[#060508] bg-[#0e0b14] px-3 py-2.5 text-sm font-semibold text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
                  >
                    {allDecks.map((d) => {
                      const missingCount =
                        slotIdx === 0 ? getMissingCardsForDeck(progression, d.cardIds).length : 0;
                      return (
                        <option key={d.id} value={d.id}>
                          {missingCount > 0 ? '🔒 ' : d.isPreset ? '★ ' : '♦ '}
                          {d.name} ({d.cardIds.length})
                          {missingCount > 0 ? ` — Faltan ${missingCount}` : ''}
                        </option>
                      );
                    })}
                  </select>
                  {slot.deck?.description && (
                    <p className="mt-1.5 text-xs text-zinc-400">{slot.deck.description}</p>
                  )}
                  {slotIdx === 0 && p1Missing.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-l-4 border-[#e6194b] bg-[#2a0c16] px-2.5 py-2 text-xs text-rose-200">
                      <span className="inline-flex items-center gap-1.5">
                        <Lock size={13} /> Te faltan <strong>{p1Missing.length}</strong> carta(s)
                        para jugar este mazo.
                      </span>
                      <button
                        type="button"
                        onClick={() => setScreen('SHOP')}
                        className="jojo-btn-primary inline-flex items-center gap-1 px-2.5 py-1 font-jojo-heading text-[11px] tracking-wider uppercase"
                      >
                        <ShoppingBag size={12} /> Abrir Sobres
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {slot.val && (
                <div className="mt-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(Object.entries(slot.val.stats.byEnergy) as [EnergyType, number][])
                      .filter(([, count]) => count > 0)
                      .sort((a, b) => b[1] - a[1])
                      .map(([etype, count]) => {
                        const meta = ENERGY_META[etype];
                        return (
                          <span
                            key={etype}
                            className={`border border-[#060508] px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${meta.bgClass} ${meta.textClass}`}
                          >
                            {meta.short} ×{count}
                          </span>
                        );
                      })}
                  </div>
                  <div className="grid grid-cols-5 border-2 border-[#060508] bg-[#0e0b14] text-center">
                    {[
                      ['PERS', slot.val.stats.byType.CHARACTER, 'text-[#f2c12e]'],
                      ['STAND', slot.val.stats.byType.STAND, 'text-[#e6194b]'],
                      ['EVO', slot.val.stats.byType.EVOLUTION, 'text-yellow-300'],
                      ['OBJ', slot.val.stats.byType.ITEM, 'text-[#00b87c]'],
                      ['ENER', slot.val.stats.byType.ENERGY, 'text-[#f5efe0]'],
                    ].map(([lbl, num, cls]) => (
                      <div key={String(lbl)} className="border-r border-white/10 py-2 last:border-r-0">
                        <div className={`font-jojo-display text-lg leading-none ${cls}`}>{num}</div>
                        <div className="mt-0.5 font-mono text-[9px] text-zinc-500">{lbl}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Bottom Launch Bar */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="jojo-panel flex flex-wrap items-center justify-between gap-4 p-4"
        >
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="font-jojo-heading text-xs tracking-widest text-zinc-400 uppercase">
                Primer Turno (sin ataque en T1)
              </div>
              <div className="mt-1.5 flex gap-1.5">
                {(['P1', 'P2', 'RANDOM'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setStarter(opt)}
                    className={`px-3 py-1 text-xs font-bold uppercase ${
                      starter === opt ? 'jojo-btn-primary' : 'jojo-btn-ink text-zinc-400'
                    }`}
                  >
                    {opt === 'P1' ? 'J1' : opt === 'P2' ? 'J2' : 'Aleatorio'}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'VS_AI' && (
              <div>
                <div className="font-jojo-heading text-xs tracking-widest text-zinc-400 uppercase">
                  Dificultad de la IA
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  {DIFFICULTY_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      title={opt.hint}
                      onClick={() => setAiDifficulty(opt.id)}
                      className={`px-3 py-1 text-xs font-bold uppercase ${
                        settings.aiDifficulty === opt.id
                          ? opt.id === 'HARD'
                            ? 'jojo-btn-crimson'
                            : 'jojo-btn-primary'
                          : 'jojo-btn-ink text-zinc-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-zinc-400">
                  {DIFFICULTY_OPTIONS.find((o) => o.id === settings.aiDifficulty)?.hint}
                </div>
              </div>
            )}

            {mode === 'HOTSEAT' && (
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-zinc-200">
                <input
                  type="checkbox"
                  checked={settings.hotseatPrivacyScreen}
                  onChange={(e) => setHotseatPrivacyScreen(e.target.checked)}
                  className="h-4 w-4 accent-[#e6194b]"
                />
                Ocultar manos al cambiar de turno
              </label>
            )}
          </div>

          <button
            type="button"
            disabled={!canStart}
            onClick={handleLaunch}
            className="jojo-btn-primary inline-flex items-center gap-2 px-8 py-3 font-jojo-heading text-xl tracking-[0.16em] uppercase disabled:opacity-35"
          >
            Comenzar Duelo <ArrowRight size={20} />
          </button>
        </motion.div>
      </div>
    </div>
  );
}
