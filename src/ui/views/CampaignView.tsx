import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  CheckCircle2,
  Coins,
  Crown,
  Gift,
  Layers,
  Lock,
  MapPin,
  ShoppingBag,
  Skull,
  Swords,
} from 'lucide-react';
import { getBattleTrackForCampaignStage } from '../../data/battleMusic';
import {
  CAMPAIGN_PARTS,
  isCampaignStageUnlocked,
} from '../../data/campaignData';
import { getCardById } from '../../data/cardRegistry';
import { STARTER_DECK_ID } from '../../data/progressionData';
import { validateDeck } from '../../services/deckValidator';
import { getMissingCardsForDeck } from '../../services/progressionService';
import { useAppStore } from '../../store/useAppStore';
import { useBattleStore } from '../../store/useBattleStore';
import { CardView } from '../components/cards/CardView';

const DIFFICULTY_BADGE: Record<
  'EASY' | 'NORMAL' | 'HARD',
  { label: string; cls: string }
> = {
  EASY: { label: 'FÁCIL', cls: 'bg-[#00b87c] text-[#0b090e]' },
  NORMAL: { label: 'NORMAL', cls: 'bg-[#f2c12e] text-[#0b090e]' },
  HARD: { label: 'DIFÍCIL · JEFE', cls: 'bg-[#e6194b] text-white' },
};

export function CampaignView() {
  const progression = useAppStore((s) => s.progression);
  const allDecks = useAppStore((s) => s.allDecks);
  const settings = useAppStore((s) => s.settings);
  const authUser = useAppStore((s) => s.authUser);
  const setSelectedDeckId = useAppStore((s) => s.setSelectedDeckId);
  const selectedPartNum = useAppStore((s) => s.selectedCampaignPart);
  const setSelectedPartNum = useAppStore((s) => s.setSelectedCampaignPart);
  const setScreen = useAppStore((s) => s.setScreen);
  const openInspector = useAppStore((s) => s.openInspector);
  const startBattle = useBattleStore((s) => s.startBattle);

  const [deckMode, setDeckMode] = useState<'STORY' | 'CUSTOM'>('STORY');

  const activePart = CAMPAIGN_PARTS.find((p) => p.part === selectedPartNum) ?? CAMPAIGN_PARTS[0]!;
  const completedIds = progression.completedCampaignStages ?? [];

  const defaultStageId = useMemo(() => {
    const nextStage = activePart.stages.find(
      (s) => isCampaignStageUnlocked(s, completedIds) && !completedIds.includes(s.id),
    );
    return nextStage?.id ?? activePart.stages[activePart.stages.length - 1]?.id ?? '';
  }, [activePart, completedIds]);

  const [selectedStageId, setSelectedStageId] = useState<string>(defaultStageId);
  const selectedStage =
    activePart.stages.find((s) => s.id === selectedStageId) ??
    activePart.stages.find((s) => s.id === defaultStageId) ??
    activePart.stages[0];

  const defaultDeckId =
    allDecks.find((d) => d.id === STARTER_DECK_ID)?.id ?? allDecks[0]?.id ?? '';
  const selectedDeckId =
    settings.selectedDeckId && allDecks.some((d) => d.id === settings.selectedDeckId)
      ? settings.selectedDeckId
      : defaultDeckId;
  const playerCustomDeck = allDecks.find((d) => d.id === selectedDeckId);
  const customDeckVal = useMemo(
    () => (playerCustomDeck ? validateDeck(playerCustomDeck.cardIds) : null),
    [playerCustomDeck],
  );
  const customDeckMissing = useMemo(
    () => (playerCustomDeck ? getMissingCardsForDeck(progression, playerCustomDeck.cardIds) : []),
    [progression, playerCustomDeck],
  );
  const canPlayCustomDeck = Boolean(
    playerCustomDeck && customDeckVal?.valid && customDeckMissing.length === 0,
  );

  const clearedInPart = activePart.stages.filter((s) => completedIds.includes(s.id)).length;
  const stageUnlocked = selectedStage
    ? isCampaignStageUnlocked(selectedStage, completedIds)
    : false;
  const stageCompleted = selectedStage ? completedIds.includes(selectedStage.id) : false;
  const featuredCard = selectedStage ? getCardById(selectedStage.featuredCardId) : undefined;

  // Enforce themed campaign story deck until the stage is completed at least once!
  const effectiveDeckMode: 'STORY' | 'CUSTOM' = stageCompleted ? deckMode : 'STORY';
  const canLaunchSelected =
    Boolean(selectedStage && stageUnlocked) &&
    (effectiveDeckMode === 'STORY' || canPlayCustomDeck);

  // Unique non-energy cards in the selected stage's story deck for visual preview
  const storyDeckHighlights = useMemo(() => {
    if (!selectedStage) return [];
    const seen = new Set<string>();
    const list: NonNullable<ReturnType<typeof getCardById>>[] = [];
    for (const id of selectedStage.storyDeckIds) {
      if (seen.has(id)) continue;
      const c = getCardById(id);
      if (!c || c.type === 'ENERGY') continue;
      seen.add(id);
      list.push(c);
    }
    return list;
  }, [selectedStage]);

  const handleLaunchStage = () => {
    if (!selectedStage || !canLaunchSelected) return;
    const p1DeckIds =
      effectiveDeckMode === 'CUSTOM' && playerCustomDeck
        ? playerCustomDeck.cardIds
        : selectedStage.storyDeckIds;

    const stageTrack = getBattleTrackForCampaignStage(selectedStage.id, selectedStage.part);

    startBattle(
      {
        mode: 'VS_AI',
        p1Name: authUser?.username ?? 'Jonathan (Campaña)',
        p2Name: selectedStage.opponentName,
        p1DeckIds,
        p2DeckIds: selectedStage.opponentDeckIds,
        firstPlayerId: 'P1',
        aiDifficulty: selectedStage.difficulty,
        campaignStageId: selectedStage.id,
        p2GuaranteedOpeningCardId: selectedStage.featuredCardId,
        battleTrackId: stageTrack?.id ?? null,
      },
      settings.hotseatPrivacyScreen,
    );
    setScreen('BATTLE');
  };

  const stageRows = useMemo(() => {
    const rows: typeof activePart.stages[] = [];
    for (let i = 0; i < activePart.stages.length; i += 5) {
      rows.push(activePart.stages.slice(i, i + 5));
    }
    return rows;
  }, [activePart.stages]);
  const finalStageNumber = activePart.stages[activePart.stages.length - 1]?.stageNumber ?? 10;
  const minibossNumbers = activePart.stages
    .filter((s) => s.isBoss && s.stageNumber !== finalStageNumber)
    .map((s) => s.stageNumber);

  return (
    <div
      className="relative min-h-[calc(100vh-56px)] py-7"
      style={{
        backgroundImage: `url(${activePart.patternUrl})`,
        backgroundSize: '340px',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[#0b090e]/91" />
      <div className="manga-halftone pointer-events-none absolute inset-0 opacity-45" />

      <div className="relative z-10 mx-auto max-w-[1380px] space-y-6 px-4 sm:px-6">
        {/* Header + Part Selector Tabs */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#f2c12e]/30 pb-4">
          <div>
            <div className="font-jojo-heading text-xs tracking-[0.26em] text-[#e6194b] uppercase">
              MODO HISTORIA · CAMPAÑA VS IA
            </div>
            <h1 className="font-jojo-display text-4xl text-[#f5efe0] uppercase sm:text-5xl">
              {activePart.name}
            </h1>
            <p className="mt-1 text-xs text-zinc-400">{activePart.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {CAMPAIGN_PARTS.map((p) => {
              const isSelected = p.part === activePart.part;
              return (
                <button
                  key={p.part}
                  type="button"
                  disabled={!p.available}
                  onClick={() => {
                    if (!p.available) return;
                    setSelectedPartNum(p.part);
                    const nextInPart = p.stages.find(
                      (s) => isCampaignStageUnlocked(s, completedIds) && !completedIds.includes(s.id),
                    );
                    setSelectedStageId(nextInPart?.id ?? p.stages[p.stages.length - 1]?.id ?? '');
                  }}
                  className={`-skew-x-10 px-3.5 py-2 font-jojo-heading text-xs tracking-widest uppercase transition ${
                    isSelected
                      ? 'jojo-btn-primary'
                      : p.available
                        ? 'jojo-btn-ink text-zinc-200'
                        : 'border-2 border-[#060508] bg-[#14101c]/60 text-zinc-600 opacity-65'
                  }`}
                >
                  <span className="inline-flex skew-x-10 items-center gap-1.5">
                    {!p.available && <Lock size={11} />}
                    {p.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Top Progress & Rules Strip */}
        <div className="jojo-panel flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="border-2 border-[#060508] bg-[#0e0b14] px-3.5 py-2">
              <div className="font-mono text-[10px] font-bold tracking-widest text-zinc-400 uppercase">
                PROGRESO {activePart.badge}
              </div>
              <div className="font-jojo-display text-2xl leading-none text-[#f2c12e]">
                {clearedInPart} / {activePart.stages.length}{' '}
                <span className="font-jojo-heading text-sm text-zinc-400">NIVELES</span>
              </div>
            </div>
            <div className="space-y-1 text-xs text-zinc-300">
              <div className="flex items-center gap-1.5">
                <Gift size={14} className="text-[#f2c12e]" />
                <span>
                  {minibossNumbers.length > 0 && (
                    <>
                      <strong>
                        {minibossNumbers.length === 1
                          ? `Nivel ${minibossNumbers[0]} (Minijefe)`
                          : `Niveles ${minibossNumbers.join(', ')} (Minijefes)`}
                      </strong>
                      : +1 Sobre {activePart.badge} ·{' '}
                    </>
                  )}
                  <strong>Nivel {finalStageNumber} (Jefe Final)</strong>: +2 Sobres{' '}
                  {activePart.badge}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400">
                La <strong>1.ª vez</strong> en cada nivel juegas con el{' '}
                <strong className="text-[#f2c12e]">Mazo Historia temático</strong> (no necesitas
                tener las cartas). Al completarlo, podrás repetirlo con{' '}
                <strong className="text-[#00e599]">cualquier mazo tuyo</strong>.
              </div>
            </div>
          </div>
        </div>

        {/* Main Split: Serpentine Adventure Map (Left) + Stage Briefing Panel (Right) */}
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1.35fr_0.85fr]">
          {/* ADVENTURE ROUTE MAP */}
          <div className="jojo-panel relative overflow-hidden p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="inline-flex items-center gap-2 border-l-4 border-[#f2c12e] pl-2.5 font-jojo-heading text-sm tracking-[0.2em] text-[#f2c12e] uppercase">
                <MapPin size={15} /> {activePart.mapHeader}
              </div>
              <span className="font-mono text-[10px] font-bold text-zinc-400 uppercase">
                SELECCIONA UN NIVEL
              </span>
            </div>

            <div className="space-y-4">
              {stageRows.map((rowStages, rowIdx) => {
                const isReversed = rowIdx % 2 === 1;
                const displayStages = isReversed ? [...rowStages].reverse() : rowStages;
                const hasNextRow = rowIdx < stageRows.length - 1;
                return (
                  <div key={`row-${rowIdx}`} className="space-y-4">
                    <div className="relative">
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1/2 right-8 left-8 hidden h-1 -translate-y-1/2 bg-[#292038] sm:block"
                      />
                      <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-5">
                        {displayStages.map((stage) => {
                          const unlocked = isCampaignStageUnlocked(stage, completedIds);
                          const cleared = completedIds.includes(stage.id);
                          const isCurrent = selectedStage?.id === stage.id;
                          const isNext = unlocked && !cleared;
                          const isFinalBoss = stage.stageNumber === finalStageNumber && stage.isBoss;
                          return (
                            <motion.button
                              key={stage.id}
                              type="button"
                              whileHover={{ y: -4, scale: 1.03 }}
                              whileTap={{ scale: 0.96 }}
                              onClick={() => setSelectedStageId(stage.id)}
                              className={`relative flex flex-col items-center justify-between border-2 p-3 text-center transition ${
                                isCurrent
                                  ? 'border-[#f2c12e] bg-[#241b35] shadow-[0_0_0_2px_#f2c12e,4px_4px_0_#060508]'
                                  : isFinalBoss
                                    ? 'border-[#f2c12e] bg-gradient-to-b from-[#2e0e1b] to-[#1a0b12] shadow-[4px_4px_0_#060508]'
                                    : stage.isBoss
                                      ? 'border-[#e6194b] bg-[#240e18] shadow-[4px_4px_0_#060508]'
                                      : cleared
                                        ? 'border-[#00b87c] bg-[#0e201b] shadow-[4px_4px_0_#060508]'
                                        : unlocked
                                          ? 'border-[#060508] bg-[#1a1426] shadow-[4px_4px_0_#060508]'
                                          : 'border-[#060508] bg-[#100d17] opacity-60'
                              }`}
                            >
                              <div className="flex w-full items-center justify-between text-[10px] font-black">
                                <span
                                  className={`px-1.5 py-0.5 font-mono ${
                                    isFinalBoss
                                      ? 'bg-[#f2c12e] text-[#0b090e]'
                                      : stage.isBoss
                                        ? 'bg-[#e6194b] text-white'
                                        : cleared
                                          ? 'bg-[#00b87c] text-[#0b090e]'
                                          : 'bg-[#060508] text-[#f2c12e]'
                                  }`}
                                >
                                  N{stage.stageNumber}
                                </span>
                                {cleared ? (
                                  <CheckCircle2 size={14} className="text-[#00e599]" />
                                ) : !unlocked ? (
                                  <Lock size={13} className="text-zinc-500" />
                                ) : isFinalBoss ? (
                                  <Crown size={14} className="text-[#f2c12e]" />
                                ) : stage.isBoss ? (
                                  <Skull size={14} className="text-[#e6194b]" />
                                ) : isNext ? (
                                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#f2c12e]" />
                                ) : null}
                              </div>

                              <div className="my-2 font-jojo-heading text-sm leading-tight tracking-wide text-[#f5efe0] uppercase">
                                {stage.title}
                              </div>

                              <div className="flex flex-wrap items-center justify-center gap-1">
                                <span className="border border-[#060508] bg-[#0b090e] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#f2c12e]">
                                  +{stage.rewardCoins} 🪙
                                </span>
                                {stage.rewardPackCount && (
                                  <span
                                    className={`border border-[#060508] px-1.5 py-0.5 font-mono text-[9px] font-black ${
                                      isFinalBoss
                                        ? 'bg-[#e6194b] text-white'
                                        : 'bg-[#f2c12e] text-[#0b090e]'
                                    }`}
                                  >
                                    +{stage.rewardPackCount}{' '}
                                    {stage.rewardPackCount > 1 ? 'SOBRES' : 'SOBRE'}
                                  </span>
                                )}
                              </div>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>

                    {hasNextRow && (
                      <div
                        className={`hidden sm:flex ${
                          isReversed ? 'justify-start pl-[9%]' : 'justify-end pr-[9%]'
                        }`}
                        aria-hidden="true"
                      >
                        <div className="flex flex-col items-center">
                          <div className="h-4 w-1 bg-[#f2c12e]/50" />
                          <span className="border border-[#060508] bg-[#f2c12e] px-2 py-0.5 font-mono text-[9px] font-black text-[#0b090e]">
                            SIGUE ↓
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* SELECTED STAGE BRIEFING PANEL */}
          {selectedStage && (
            <motion.div
              key={selectedStage.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="jojo-panel space-y-4 p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#f2c12e]/25 pb-3">
                <div className="flex items-center gap-2">
                  <span className="-skew-x-10 border-2 border-[#060508] bg-[#f2c12e] px-2.5 py-0.5 font-jojo-display text-sm text-[#0b090e] shadow-[2px_2px_0_#060508]">
                    <span className="inline-block skew-x-10">
                      NIVEL {selectedStage.stageNumber}
                    </span>
                  </span>
                  <span
                    className={`border border-[#060508] px-2 py-0.5 font-mono text-[10px] font-black uppercase ${
                      DIFFICULTY_BADGE[selectedStage.difficulty].cls
                    }`}
                  >
                    {DIFFICULTY_BADGE[selectedStage.difficulty].label}
                  </span>
                </div>
                {stageCompleted && (
                  <span className="inline-flex items-center gap-1 border border-[#060508] bg-[#00b87c] px-2 py-0.5 font-mono text-[10px] font-black text-[#0b090e] uppercase">
                    <CheckCircle2 size={12} /> COMPLETADO
                  </span>
                )}
              </div>

              <div>
                <div className="font-mono text-[10px] font-bold tracking-widest text-[#e6194b] uppercase">
                  {selectedStage.location}
                </div>
                <h2 className="mt-0.5 font-jojo-display text-3xl leading-tight text-[#f5efe0] uppercase">
                  {selectedStage.title}
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">
                  {selectedStage.storyText}
                </p>
              </div>

              {/* Rival Preview */}
              <div className="flex items-center gap-4 border-2 border-[#060508] bg-[#0e0b14] p-3">
                {featuredCard && (
                  <div className="shrink-0">
                    <CardView
                      card={featuredCard}
                      size="xs"
                      showInspectButton={false}
                      onClick={() => openInspector(featuredCard.id)}
                    />
                  </div>
                )}
                <div className="min-w-0 space-y-1">
                  <div className="font-mono text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
                    RIVAL IA ({activePart.badge})
                  </div>
                  <div className="font-jojo-heading text-lg leading-tight tracking-wider text-[#f2c12e] uppercase">
                    {selectedStage.opponentName}
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Mazo temático de 46 cartas exclusivo de {activePart.name}.
                  </div>
                </div>
              </div>

              {/* Deck Selection: Mandatory Story Deck on 1st Clear, Free Choice once Completed! */}
              <div className="space-y-2.5 border-2 border-[#060508] bg-[#0e0b14] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-jojo-heading text-xs tracking-[0.18em] text-[#f2c12e] uppercase">
                    <BookOpen size={13} /> Tu Baraja para este Nivel
                  </span>
                  {!stageCompleted ? (
                    <span className="border border-[#060508] bg-[#2952d9] px-1.5 py-0.5 font-mono text-[9px] font-black text-white uppercase">
                      MAZO HISTORIA · 1.ª VEZ
                    </span>
                  ) : (
                    <span className="border border-[#060508] bg-[#00b87c] px-1.5 py-0.5 font-mono text-[9px] font-black text-[#0b090e] uppercase">
                      MODO LIBRE DESBLOQUEADO
                    </span>
                  )}
                </div>

                {stageCompleted && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDeckMode('STORY')}
                      className={`inline-flex items-center justify-center gap-1 px-2.5 py-1.5 font-jojo-heading text-xs tracking-wider uppercase ${
                        effectiveDeckMode === 'STORY'
                          ? 'jojo-btn-primary'
                          : 'jojo-btn-ink text-zinc-400'
                      }`}
                    >
                      <BookOpen size={12} /> Mazo Historia
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeckMode('CUSTOM')}
                      className={`inline-flex items-center justify-center gap-1 px-2.5 py-1.5 font-jojo-heading text-xs tracking-wider uppercase ${
                        effectiveDeckMode === 'CUSTOM'
                          ? 'jojo-btn-primary'
                          : 'jojo-btn-ink text-zinc-400'
                      }`}
                    >
                      <Layers size={12} /> Tu Mazo
                    </button>
                  </div>
                )}

                {effectiveDeckMode === 'STORY' ? (
                  <div className="space-y-2">
                    <div className="font-jojo-heading text-sm tracking-wide text-[#f5efe0] uppercase">
                      ★ {selectedStage.storyDeckName}
                    </div>
                    <p className="text-[11px] leading-snug text-zinc-400">
                      {selectedStage.storyDeckDescription}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {storyDeckHighlights.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => openInspector(c.id)}
                          className="border border-[#060508] bg-[#1c1626] px-2 py-0.5 text-[10px] font-bold text-zinc-200 transition hover:border-[#f2c12e] hover:text-[#f2c12e]"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                    {!stageCompleted && (
                      <div className="text-[10px] text-zinc-500">
                        Completa este nivel por primera vez para poder rejugarlo con cualquier mazo
                        de tu colección.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <select
                      value={selectedDeckId}
                      onChange={(e) => setSelectedDeckId(e.target.value)}
                      className="w-full border-2 border-[#060508] bg-[#14101c] px-2.5 py-2 text-xs font-bold text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
                    >
                      {allDecks.map((d) => {
                        const miss = getMissingCardsForDeck(progression, d.cardIds).length;
                        return (
                          <option key={d.id} value={d.id}>
                            {miss > 0 ? '🔒 ' : d.isPreset ? '★ ' : '♦ '}
                            {d.name} ({d.cardIds.length})
                            {miss > 0 ? ` — Faltan ${miss}` : ''}
                          </option>
                        );
                      })}
                    </select>
                    {!canPlayCustomDeck && (
                      <div className="flex items-center justify-between gap-2 border-l-4 border-[#e6194b] bg-[#2a0c16] px-2.5 py-1.5 text-[11px] text-rose-200">
                        <span>Te faltan cartas o el mazo no es legal (46/46).</span>
                        <button
                          type="button"
                          onClick={() => setScreen('SHOP')}
                          className="jojo-btn-primary inline-flex items-center gap-1 px-2 py-0.5 font-jojo-heading text-[10px] uppercase"
                        >
                          <ShoppingBag size={11} /> Tienda
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* One-Time Pickup Rewards Box */}
              <div
                className={`border-2 border-[#060508] p-3.5 ${
                  stageCompleted ? 'bg-[#121a18]' : 'bg-[#1f162a]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-jojo-heading text-xs tracking-[0.18em] text-[#f2c12e] uppercase">
                    Recompensa (Recogida Única)
                  </span>
                  {stageCompleted && (
                    <span className="border border-[#060508] bg-[#00b87c] px-1.5 py-0.5 font-mono text-[9px] font-black text-[#0b090e] uppercase">
                      YA RECOGIDA
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 border-2 border-[#060508] px-3 py-1 font-mono text-xs font-black ${
                      stageCompleted
                        ? 'bg-zinc-800 text-zinc-400 line-through'
                        : 'bg-[#f2c12e] text-[#0b090e]'
                    }`}
                  >
                    <Coins size={14} /> +{selectedStage.rewardCoins} Monedas
                  </span>
                  {selectedStage.rewardPackCount && (
                    <span
                      className={`inline-flex items-center gap-1.5 border-2 border-[#060508] px-3 py-1 font-mono text-xs font-black ${
                        stageCompleted
                          ? 'bg-zinc-800 text-zinc-400 line-through'
                          : 'bg-[#e6194b] text-white'
                      }`}
                    >
                      <Gift size={14} /> ×{selectedStage.rewardPackCount} Sobre {activePart.badge}
                    </span>
                  )}
                </div>
              </div>

              {/* Launch CTA */}
              {!stageUnlocked ? (
                <div className="flex items-center justify-center gap-2 border-2 border-[#060508] bg-[#100d17] py-3 font-jojo-heading text-sm tracking-widest text-zinc-400 uppercase">
                  <Lock size={15} /> Completa el Nivel {selectedStage.stageNumber - 1} para
                  desbloquear
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!canLaunchSelected}
                  onClick={handleLaunchStage}
                  className={`w-full inline-flex items-center justify-center gap-2 py-3 font-jojo-heading text-xl tracking-[0.16em] uppercase disabled:opacity-35 ${
                    selectedStage.isBoss ? 'jojo-btn-crimson' : 'jojo-btn-primary'
                  }`}
                >
                  <Swords size={20} />
                  {stageCompleted
                    ? effectiveDeckMode === 'CUSTOM'
                      ? 'Rejugar con Tu Mazo'
                      : 'Rejugar (Mazo Historia)'
                    : '¡Iniciar Combate (Mazo Historia)!'}
                </button>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
