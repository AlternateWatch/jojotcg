import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  Calendar,
  Coins,
  Compass,
  Crown,
  Flame,
  Gift,
  Layers,
  ShoppingBag,
  Skull,
  Sparkles,
  Swords,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { pickRandomRoguelikeTrack } from '../../data/battleMusic';
import { getCardById } from '../../data/cardRegistry';
import { getCardRarity, RARITY_META, type BoosterPackDef } from '../../data/progressionData';
import {
  BASIC_ENERGY_IDS,
  getRoguelikeRelicById,
  ROGUELIKE_ACTS,
  ROGUELIKE_DIFFICULTY_META,
  ROGUELIKE_EVENTS,
  ROGUELIKE_MIN_DECK_SIZE,
  ROGUELIKE_STARTER_DECKS,
  ROGUELIKE_TOTAL_FLOORS,
  type RoguelikeDifficulty,
  type RoguelikeRoomType,
} from '../../data/roguelikeData';
import type { OpenPackOutcome } from '../../services/progressionService';
import {
  fetchDailyLeaderboard,
  submitDailyScore,
  type DailyLeaderboardEntry,
} from '../../services/roguelikeDailyService';
import {
  buyShopEnergyPack,
  buyShopOffer,
  claimTreasureBonusCard,
  computeDailyRunScore,
  computeRelicRulesOverrides,
  computeRoguelikeMetaReward,
  enterRoguelikeNode,
  getDailyChallengeSpec,
  getSelectableNodeIds,
  getSkipCardGoldBonus,
  openCampfireMode,
  pickRoguelikeRewardCard,
  pickRoguelikeRewardRelic,
  purgeCardFromRunDeck,
  resolveCampfireCloneCard,
  resolveCampfirePurgeCard,
  resolveCampfireTrain,
  resolveEventPurgeCard,
  resolveRoguelikeEventChoice,
  type RoguelikeMapNode,
} from '../../services/roguelikeService';
import { useAppStore } from '../../store/useAppStore';
import { useBattleStore } from '../../store/useBattleStore';
import { CardView } from '../components/cards/CardView';
import { PackOpeningModal } from '../components/shop/PackOpeningModal';

const ROOM_STYLE: Record<
  RoguelikeRoomType,
  { badge: string; border: string; bg: string; text: string }
> = {
  BATTLE: {
    badge: 'COMBATE',
    border: 'border-[#2952d9]',
    bg: 'bg-[#121933]',
    text: 'text-sky-300',
  },
  ELITE: {
    badge: 'ÉLITE',
    border: 'border-[#f2c12e]',
    bg: 'bg-[#2a1f0b]',
    text: 'text-[#f2c12e]',
  },
  TREASURE: {
    badge: 'TESORO',
    border: 'border-[#00b87c]',
    bg: 'bg-[#0b241d]',
    text: 'text-[#00e599]',
  },
  SHOP: {
    badge: 'TIENDA',
    border: 'border-amber-400',
    bg: 'bg-[#261b0e]',
    text: 'text-amber-300',
  },
  EVENT: {
    badge: 'EVENTO',
    border: 'border-purple-400',
    bg: 'bg-[#1e102e]',
    text: 'text-purple-300',
  },
  CAMPFIRE: {
    badge: 'HOGUERA',
    border: 'border-orange-400',
    bg: 'bg-[#2a150b]',
    text: 'text-orange-300',
  },
  BOSS: {
    badge: 'JEFE',
    border: 'border-[#e6194b]',
    bg: 'bg-[#330b16]',
    text: 'text-[#ff4d79]',
  },
};

function RoomIcon({ type, size = 16 }: { type: RoguelikeRoomType; size?: number }) {
  switch (type) {
    case 'BATTLE':
      return <Swords size={size} />;
    case 'ELITE':
      return <Skull size={size} />;
    case 'TREASURE':
      return <Gift size={size} />;
    case 'SHOP':
      return <ShoppingBag size={size} />;
    case 'EVENT':
      return <Sparkles size={size} />;
    case 'CAMPFIRE':
      return <Flame size={size} />;
    case 'BOSS':
      return <Crown size={size} />;
  }
}

export function RoguelikeView() {
  const roguelikeRun = useAppStore((s) => s.roguelikeRun);
  const bestRoguelikeFloor = useAppStore((s) => s.bestRoguelikeFloor);
  const startRoguelikeRun = useAppStore((s) => s.startRoguelikeRun);
  const startDailyRoguelikeRun = useAppStore((s) => s.startDailyRoguelikeRun);
  const setRoguelikeRun = useAppStore((s) => s.setRoguelikeRun);
  const claimRoguelikeEndReward = useAppStore((s) => s.claimRoguelikeEndReward);
  const abandonRoguelikeRun = useAppStore((s) => s.abandonRoguelikeRun);
  const setScreen = useAppStore((s) => s.setScreen);
  const openInspector = useAppStore((s) => s.openInspector);
  const authUser = useAppStore((s) => s.authUser);
  const settings = useAppStore((s) => s.settings);

  const startBattle = useBattleStore((s) => s.startBattle);
  const lastBattleTrackId = useBattleStore((s) => s.activeBattleTrackId);

  const [selectedDifficulty, setSelectedDifficulty] = useState<RoguelikeDifficulty>('NORMAL');
  const [dailyLeaderboard, setDailyLeaderboard] = useState<DailyLeaderboardEntry[]>([]);
  const dailySpec = useMemo(() => getDailyChallengeSpec(), []);
  const dailyStarter = useMemo(
    () => ROGUELIKE_STARTER_DECKS.find((s) => s.id === dailySpec.starterId) ?? ROGUELIKE_STARTER_DECKS[0]!,
    [dailySpec],
  );

  useEffect(() => {
    let active = true;
    void fetchDailyLeaderboard(dailySpec.date).then((entries) => {
      if (active) setDailyLeaderboard(entries);
    });
    return () => {
      active = false;
    };
  }, [dailySpec.date, roguelikeRun?.status]);
  const [victoryPackModal, setVictoryPackModal] = useState<{
    pack: BoosterPackDef;
    outcomes: OpenPackOutcome[];
  } | null>(null);
  const [showDeckModal, setShowDeckModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showPurgePicker, setShowPurgePicker] = useState(false);
  const [showEnergyPicker, setShowEnergyPicker] = useState(false);
  const [activeActTab, setActiveActTab] = useState<1 | 2 | 3>(() => {
    const f = roguelikeRun?.currentFloor ?? 1;
    if (f >= 21) return 3;
    if (f >= 11) return 2;
    return 1;
  });

  const selectableNodeIds = useMemo(
    () => (roguelikeRun ? getSelectableNodeIds(roguelikeRun) : new Set<string>()),
    [roguelikeRun],
  );

  const currentActDef = ROGUELIKE_ACTS.find((a) => a.act === activeActTab) ?? ROGUELIKE_ACTS[0];
  const actFloors = useMemo(() => {
    if (!roguelikeRun) return [];
    const [minF, maxF] = currentActDef.floorRange;
    const grouped: { floor: number; nodes: RoguelikeMapNode[] }[] = [];
    for (let f = minF; f <= maxF; f++) {
      grouped.push({
        floor: f,
        nodes: roguelikeRun.map.filter((n) => n.floor === f),
      });
    }
    return grouped;
  }, [roguelikeRun, currentActDef]);

  // ==================== 1. STARTER SELECTION SCREEN ====================
  if (!roguelikeRun) {
    return (
      <div
        className="relative min-h-[calc(100vh-56px)] py-8"
        style={{
          backgroundImage: 'url(/assets/patterns/pattern3.png)',
          backgroundSize: '340px',
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[#0b090e]/92" />
        <div className="relative z-10 mx-auto max-w-[1320px] space-y-6 px-4">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#f2c12e]/30 pb-4">
            <div>
              <div className="font-jojo-heading text-xs tracking-[0.26em] text-[#9333ea] uppercase">
                MODO EXPEDICIÓN · 30 NIVELES · MAZO PROGRESIVO
              </div>
              <h1 className="font-jojo-display text-4xl text-[#f5efe0] uppercase sm:text-5xl">
                EXPEDICIÓN <span className="text-[#f2c12e]">ROGUELIKE</span>
              </h1>
              <p className="mt-1 max-w-2xl text-xs text-zinc-300">
                Empieza con un mazo compacto de <strong>16 cartas</strong> (10 en baraja + 6
                Premios). Elige tu ruta por <strong>30 pisos</strong> entre combates, élites,
                tiendas, tesoros, eventos y <strong>3 Jefes de Acto</strong>. Al terminar la
                expedición ganarás <strong>Monedas Speedwagon</strong> reales según lo lejos que
                llegues.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowGuideModal(true)}
                className="jojo-btn-ink inline-flex items-center gap-1.5 px-3.5 py-2 font-jojo-heading text-xs tracking-wider text-[#f2c12e] uppercase"
              >
                <BookOpen size={14} /> Instrucciones del Roguelike
              </button>
              {bestRoguelikeFloor > 0 && (
                <div className="border-2 border-[#060508] bg-[#1d1727] px-4 py-2 font-mono text-xs text-[#f2c12e] shadow-[3px_3px_0_#060508]">
                  <Trophy size={14} className="mr-1.5 inline" />
                  RÉCORD PERSONAL: <strong>PISO {bestRoguelikeFloor}/30</strong>
                </div>
              )}
            </div>
          </div>

          {/* Quick Inline Guide Strip */}
          <div className="jojo-panel grid grid-cols-1 gap-3 p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-l-4 border-[#9333ea] bg-[#0e0b14] p-2.5">
              <div className="font-jojo-heading text-xs text-purple-300 uppercase">
                1. Mazo Compacto (16 cartas)
              </div>
              <p className="mt-1 text-[11px] text-zinc-300">
                Sales con 10 cartas en mazo + 6 Premios, mano inicial de 5 y{' '}
                <strong>sin derrota por deck-out</strong> (el descarte se recicla).
              </p>
            </div>
            <div className="border-l-4 border-[#2952d9] bg-[#0e0b14] p-2.5">
              <div className="font-jojo-heading text-xs text-sky-300 uppercase">
                2. Ruta por 3 Carriles
              </div>
              <p className="mt-1 text-[11px] text-zinc-300">
                Solo avanzas a <strong>carriles adyacentes</strong> (líneas doradas). Los{' '}
                <strong>Jefes</strong> esperan en el Carril Central en los Pisos 10, 20 y 30.
              </p>
            </div>
            <div className="border-l-4 border-[#00e599] bg-[#0e0b14] p-2.5">
              <div className="font-jojo-heading text-xs text-[#00e599] uppercase">
                3. Crece tras cada Combate
              </div>
              <p className="mt-1 text-[11px] text-zinc-300">
                Al ganar combates eliges <strong>1 carta entre 3</strong> para tu mazo y ganas{' '}
                <strong>Oro de Expedición</strong> para Tiendas y Reliquias.
              </p>
            </div>
            <div className="border-l-4 border-[#f2c12e] bg-[#0e0b14] p-2.5">
              <div className="font-jojo-heading text-xs text-[#f2c12e] uppercase">
                4. Recompensa Final Real
              </div>
              <p className="mt-1 text-[11px] text-zinc-300">
                Al caer o conquistar el Piso 30 recibes <strong>Monedas Speedwagon</strong> reales
                para la Tienda según tu avance.
              </p>
            </div>
          </div>

          {/* DAILY CHALLENGE BANNER & LEADERBOARD */}
          <div className="jojo-panel grid grid-cols-1 gap-4 border-2 border-[#f2c12e]/70 bg-[#191227] p-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 border border-[#060508] bg-[#f2c12e] px-2 py-0.5 font-mono text-[10px] font-black text-[#0b090e] uppercase">
                  <Calendar size={11} /> DESAFÍO DIARIO · {dailySpec.date}
                </span>
                <span
                  className="border border-[#060508] px-2 py-0.5 font-mono text-[10px] font-black text-[#0b090e] uppercase"
                  style={{ backgroundColor: ROGUELIKE_DIFFICULTY_META[dailySpec.difficulty].accentHex }}
                >
                  {ROGUELIKE_DIFFICULTY_META[dailySpec.difficulty].label}
                </span>
                <span className="font-mono text-[10px] text-zinc-400">Semilla #{dailySpec.seed}</span>
              </div>
              <h2 className="font-jojo-display text-2xl text-[#f5efe0] uppercase">
                Misma semilla para todos · Mazo: <span className="text-[#f2c12e]">{dailyStarter.name}</span>
              </h2>
              <p className="text-xs text-zinc-300">
                Compite hoy en exactamente el mismo mapa, enemigos y eventos que el resto de jugadores. Al terminar, tu puntuación se registra automáticamente en el ranking diario.
              </p>
              <button
                type="button"
                onClick={() => {
                  startDailyRoguelikeRun();
                  setActiveActTab(1);
                }}
                className="jojo-btn-primary inline-flex items-center gap-2 px-5 py-2.5 font-jojo-heading text-sm tracking-widest uppercase"
              >
                <Calendar size={15} /> Jugar Desafío Diario
              </button>
            </div>

            <div className="border-2 border-[#060508] bg-[#0e0b14] p-3">
              <div className="mb-2 flex items-center justify-between font-jojo-heading text-xs tracking-widest text-[#f2c12e] uppercase">
                <span><Trophy size={12} className="mr-1 inline" /> Ranking de Hoy ({dailySpec.date})</span>
                <span className="font-mono text-[10px] text-zinc-400">Top {Math.max(dailyLeaderboard.length, 0)}</span>
              </div>
              {dailyLeaderboard.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-zinc-400">
                  Aún no hay puntuaciones hoy. ¡Sé el primero en marcar récord!
                </p>
              ) : (
                <div className="max-h-[135px] space-y-1 overflow-y-auto pr-1 text-[11px]">
                  {dailyLeaderboard.slice(0, 8).map((entry, idx) => (
                    <div
                      key={`${entry.username}-${idx}`}
                      className="flex items-center justify-between border border-white/5 bg-[#171222] px-2 py-1"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-mono font-black text-[#f2c12e]">#{idx + 1}</span>
                        <span className="truncate font-bold text-[#f5efe0]">{entry.username}</span>
                        {entry.victory && (
                          <span className="bg-[#00b87c] px-1 font-mono text-[9px] font-black text-[#0b090e]">
                            WIN
                          </span>
                        )}
                      </div>
                      <div className="shrink-0 font-mono text-[10px] text-zinc-300">
                        P{entry.floorsCleared} · <strong className="text-[#f2c12e]">{entry.score} pts</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Difficulty Selector */}
          <div className="jojo-panel space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-jojo-heading text-xs tracking-[0.22em] text-[#f2c12e] uppercase">
                ELIGE LA DIFICULTAD DE LA EXPEDICIÓN
              </span>
              <span className="font-mono text-[11px] text-zinc-400">
                Vencer el Piso 30 otorga Sobres Generales (cualquier carta del juego)
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {(['EASY', 'NORMAL', 'HARD'] as RoguelikeDifficulty[]).map((diff) => {
                const meta = ROGUELIKE_DIFFICULTY_META[diff];
                const isSelected = selectedDifficulty === diff;
                return (
                  <button
                    key={diff}
                    type="button"
                    onClick={() => setSelectedDifficulty(diff)}
                    className={`flex flex-col justify-between gap-2 border-2 p-3.5 text-left transition ${
                      isSelected
                        ? 'border-[#f2c12e] bg-[#1f182d] shadow-[4px_4px_0_#060508]'
                        : 'border-[#060508] bg-[#0e0b14] hover:border-zinc-500'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-jojo-display text-xl text-[#f5efe0] uppercase">
                        {meta.label}
                      </span>
                      <span
                        className="border border-[#060508] px-2 py-0.5 font-mono text-[10px] font-black text-[#0b090e] uppercase"
                        style={{ backgroundColor: meta.accentHex }}
                      >
                        {meta.badge}
                      </span>
                    </div>
                    <p className="text-[11px] leading-snug text-zinc-300">{meta.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {ROGUELIKE_STARTER_DECKS.map((starter) => {
              const cover = getCardById(starter.coverCardId);
              return (
                <div
                  key={starter.id}
                  className="jojo-panel flex flex-col justify-between gap-4 p-5"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="border-2 border-[#060508] px-2 py-0.5 font-mono text-[10px] font-black text-[#0b090e] uppercase"
                        style={{ backgroundColor: starter.accentHex }}
                      >
                        {starter.badge}
                      </span>
                      <span className="font-mono text-xs text-zinc-400">
                        {ROGUELIKE_DIFFICULTY_META[selectedDifficulty].startingGold} Oro inicial
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      {cover && (
                        <div className="shrink-0">
                          <CardView
                            card={cover}
                            size="sm"
                            onClick={() => openInspector(cover.id)}
                          />
                        </div>
                      )}
                      <div>
                        <h2 className="font-jojo-display text-2xl text-[#f5efe0] uppercase">
                          {starter.name}
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                          {starter.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="border border-white/10 bg-[#0e0b14] p-2.5 text-[11px] text-zinc-400">
                      <div className="mb-1 font-bold text-zinc-200">Cartas iniciales (16):</div>
                      <div className="flex flex-wrap gap-1">
                        {Array.from(new Set(starter.cardIds)).map((cid) => {
                          const c = getCardById(cid);
                          const count = starter.cardIds.filter((x) => x === cid).length;
                          if (!c) return null;
                          return (
                            <span
                              key={cid}
                              className="border border-[#060508] bg-[#1a1425] px-1.5 py-0.5 text-[10px] text-zinc-200"
                            >
                              {count > 1 ? `${count}× ` : ''}
                              {c.name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      startRoguelikeRun(starter.id, selectedDifficulty);
                      setActiveActTab(1);
                    }}
                    className="jojo-btn-primary w-full py-2.5 font-jojo-heading text-sm tracking-widest uppercase"
                  >
                    <Compass size={15} className="mr-1.5 inline" /> Iniciar ({ROGUELIKE_DIFFICULTY_META[selectedDifficulty].label})
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <RoguelikeGuideModal open={showGuideModal} onClose={() => setShowGuideModal(false)} />
        <PackOpeningModal
          pack={victoryPackModal?.pack ?? null}
          outcomes={victoryPackModal?.outcomes ?? null}
          canBuyAnother={false}
          onBuyAnother={() => {}}
          onClose={() => setVictoryPackModal(null)}
        />
      </div>
    );
  }

  // ==================== HANDLERS FOR ACTIVE RUN ====================
  const handleSelectNode = (node: RoguelikeMapNode) => {
    if (!selectableNodeIds.has(node.id)) return;
    const { nextRun, enemy } = enterRoguelikeNode(roguelikeRun, node.id);
    setRoguelikeRun(nextRun);
    setShowPurgePicker(false);
    setShowEnergyPicker(false);

    if (enemy && nextRun.status === 'IN_BATTLE') {
      const rules = {
        ...computeRelicRulesOverrides(nextRun.relicIds, nextRun.campfireBonusMaxHp ?? 0),
        p2BonusMaxHp: enemy.bonusMaxHp,
        p2BonusDamage: enemy.bonusDamage,
      };
      const firstPlayerId =
        node.type === 'BOSS' || (node.type === 'ELITE' && node.floor % 2 === 1) ? 'P2' : 'P1';
      const battleRoomType: 'BATTLE' | 'ELITE' | 'BOSS' =
        node.type === 'BOSS' ? 'BOSS' : node.type === 'ELITE' ? 'ELITE' : 'BATTLE';
      const battleTrack = pickRandomRoguelikeTrack(battleRoomType, lastBattleTrackId);
      startBattle(
        {
          mode: 'VS_AI',
          p1Name: authUser?.username ?? 'Expedicionario',
          p2Name: enemy.name,
          p1DeckIds: nextRun.deckCardIds,
          p2DeckIds: enemy.deckIds,
          firstPlayerId,
          aiDifficulty: enemy.difficulty,
          aiErrorRate: enemy.aiErrorRate,
          roguelikeNodeId: node.id,
          rules,
          p2GuaranteedOpeningCardId: enemy.featuredCardId,
          battleTrackId: battleTrack?.id ?? null,
        },
        settings.hotseatPrivacyScreen,
      );
      setScreen('BATTLE');
    }
  };

  const handleLeaveRoomToMap = () => {
    setShowPurgePicker(false);
    setShowEnergyPicker(false);
    setRoguelikeRun({
      ...roguelikeRun,
      status: 'MAP',
      activeShop: null,
      activeEvent: null,
      activeCampfire: null,
      pendingReward: null,
    });
    const nextFloor = roguelikeRun.currentFloor + 1;
    if (nextFloor >= 21) setActiveActTab(3);
    else if (nextFloor >= 11) setActiveActTab(2);
  };

  const activeEventDef = roguelikeRun.activeEvent
    ? ROGUELIKE_EVENTS.find((e) => e.id === roguelikeRun.activeEvent?.eventId)
    : undefined;

  const endRewardSummary =
    roguelikeRun.status === 'VICTORY' || roguelikeRun.status === 'DEFEAT'
      ? computeRoguelikeMetaReward(roguelikeRun)
      : null;

  return (
    <div
      className="relative min-h-[calc(100vh-56px)] py-6"
      style={{
        backgroundImage: 'url(/assets/patterns/pattern3.png)',
        backgroundSize: '340px',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[#0b090e]/92" />

      <div className="relative z-10 mx-auto max-w-[1400px] space-y-5 px-4">
        {/* TOP EXPEDITION HUD */}
        <div className="jojo-panel flex flex-wrap items-center justify-between gap-3 p-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="border-2 border-[#060508] bg-[#9333ea] px-3 py-1 font-jojo-display text-sm tracking-wider text-white uppercase">
              PISO {roguelikeRun.currentFloor} / {ROGUELIKE_TOTAL_FLOORS}
            </span>
            <span
              className="border-2 border-[#060508] px-2.5 py-1 font-mono text-xs font-black text-[#0b090e] uppercase"
              style={{
                backgroundColor:
                  ROGUELIKE_DIFFICULTY_META[roguelikeRun.difficulty ?? 'NORMAL'].accentHex,
              }}
            >
              {ROGUELIKE_DIFFICULTY_META[roguelikeRun.difficulty ?? 'NORMAL'].label}
            </span>
            <span className="inline-flex items-center gap-1.5 border-2 border-[#060508] bg-[#1e170a] px-3 py-1 font-mono text-xs font-black text-[#f2c12e]">
              <Coins size={14} /> {roguelikeRun.gold} Oro de Expedición
            </span>
            <button
              type="button"
              onClick={() => setShowDeckModal(true)}
              className="jojo-btn-ink inline-flex items-center gap-1.5 px-3 py-1 font-jojo-heading text-xs tracking-wider text-[#f5efe0] uppercase"
            >
              <Layers size={13} /> Mi Mazo ({roguelikeRun.deckCardIds.length})
            </button>
            <button
              type="button"
              onClick={() => setShowGuideModal(true)}
              className="jojo-btn-ink inline-flex items-center gap-1.5 px-3 py-1 font-jojo-heading text-xs tracking-wider text-[#f2c12e] uppercase"
            >
              <BookOpen size={13} /> Instrucciones
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Active Relics Strip */}
            {roguelikeRun.relicIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {roguelikeRun.relicIds.map((rid) => {
                  const relic = getRoguelikeRelicById(rid);
                  if (!relic) return null;
                  return (
                    <span
                      key={rid}
                      title={`${relic.name}: ${relic.description}`}
                      className="cursor-help border border-[#f2c12e]/60 bg-[#1f182d] px-2 py-0.5 text-xs text-[#f2c12e]"
                    >
                      {relic.icon} {relic.name}
                    </span>
                  );
                })}
              </div>
            )}

            {roguelikeRun.status !== 'VICTORY' && roguelikeRun.status !== 'DEFEAT' && (
              <button
                type="button"
                onClick={() => {
                  setRoguelikeRun({
                    ...roguelikeRun,
                    status: 'DEFEAT',
                    activeNodeId: null,
                  });
                }}
                className="jojo-btn-crimson px-3 py-1 font-jojo-heading text-xs tracking-wider uppercase"
              >
                Finalizar Expedición
              </button>
            )}
          </div>
        </div>

        {/* ==================== VICTORY / DEFEAT SUMMARY ==================== */}
        {(roguelikeRun.status === 'VICTORY' || roguelikeRun.status === 'DEFEAT') &&
          endRewardSummary && (
            <div className="jojo-panel mx-auto max-w-2xl space-y-5 p-6 text-center">
              <div
                className={`mx-auto inline-flex items-center gap-2 border-2 border-[#060508] px-4 py-1 font-jojo-heading text-xs tracking-widest uppercase ${
                  roguelikeRun.status === 'VICTORY'
                    ? 'bg-[#00b87c] text-[#0b090e]'
                    : 'bg-[#e6194b] text-white'
                }`}
              >
                {roguelikeRun.status === 'VICTORY' ? (
                  <>
                    <Trophy size={15} /> ¡EXPEDICIÓN COMPLETADA!
                  </>
                ) : (
                  <>
                    <Skull size={15} /> FIN DE LA EXPEDICIÓN
                  </>
                )}
              </div>

              <h2 className="font-jojo-display text-4xl text-[#f2c12e] uppercase">
                {roguelikeRun.status === 'VICTORY'
                  ? '¡CONQUISTASTE LOS 30 NIVELES!'
                  : `LLEGASTE AL PISO ${roguelikeRun.currentFloor} / 30`}
              </h2>

              <div className="grid grid-cols-3 gap-3 border-2 border-[#060508] bg-[#0e0b14] p-4 font-mono text-xs">
                <div>
                  <div className="text-zinc-400">Pisos superados</div>
                  <div className="text-xl font-black text-[#f5efe0]">
                    {endRewardSummary.floorsCleared}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-400">Combates ganados</div>
                  <div className="text-xl font-black text-[#00e599]">{roguelikeRun.battlesWon}</div>
                </div>
                <div>
                  <div className="text-zinc-400">Jefes derrotados</div>
                  <div className="text-xl font-black text-[#f2c12e]">{roguelikeRun.bossesWon}</div>
                </div>
              </div>

              <div className="border-2 border-[#f2c12e] bg-[#1e170a] p-4">
                <div className="font-jojo-heading text-xs tracking-widest text-amber-300 uppercase">
                  RECOMPENSA PERMANENTE EN MONEDAS SPEEDWAGON
                </div>
                <div className="mt-1 font-jojo-display text-4xl text-[#f2c12e]">
                  +{endRewardSummary.coins} MONEDAS
                  {endRewardSummary.packCount > 0 && (
                    <span className="block text-2xl text-[#00e599]">
                      + {endRewardSummary.packCount}× SOBRE GENERAL (CUALQUIER CARTA)
                    </span>
                  )}
                </div>
                <div className="mt-1 font-mono text-[11px] text-zinc-300">
                  {endRewardSummary.breakdown}
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-3">
                {roguelikeRun.metaCoinsClaimed === null ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (roguelikeRun.isDaily && roguelikeRun.dailyDate) {
                        void submitDailyScore({
                          date: roguelikeRun.dailyDate,
                          username: authUser?.username ?? 'Expedicionario',
                          floorsCleared: endRewardSummary.floorsCleared,
                          battlesWon: roguelikeRun.battlesWon,
                          bossesWon: roguelikeRun.bossesWon,
                          victory: roguelikeRun.status === 'VICTORY',
                          score: computeDailyRunScore(roguelikeRun),
                        }).then((entries) => {
                          if (entries.length > 0) setDailyLeaderboard(entries);
                        });
                      }
                      const claimed = claimRoguelikeEndReward();
                      if (claimed?.pack && claimed.packOutcomes) {
                        setVictoryPackModal({
                          pack: claimed.pack,
                          outcomes: claimed.packOutcomes,
                        });
                      }
                      abandonRoguelikeRun();
                    }}
                    className="jojo-btn-primary inline-flex items-center gap-2 px-6 py-3 font-jojo-heading text-sm tracking-widest uppercase"
                  >
                    <Coins size={16} />{' '}
                    {endRewardSummary.packCount > 0
                      ? `Reclamar +${endRewardSummary.coins} Monedas y Abrir ${endRewardSummary.packCount} Sobre(s)`
                      : `Reclamar +${endRewardSummary.coins} Monedas y Nueva Partida`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => abandonRoguelikeRun()}
                    className="jojo-btn-primary px-6 py-3 font-jojo-heading text-sm tracking-widest uppercase"
                  >
                    Nueva Expedición
                  </button>
                )}
              </div>
            </div>
          )}

        {/* ==================== POST-BATTLE / TREASURE REWARD DRAFT ==================== */}
        {roguelikeRun.status === 'REWARD' && roguelikeRun.pendingReward && (
          <div className="jojo-panel space-y-5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#060508] pb-3">
              <div>
                <div className="font-jojo-heading text-xs tracking-[0.22em] text-[#00e599] uppercase">
                  {roguelikeRun.pendingReward.sourceType === 'TREASURE'
                    ? 'SALA DE TESORO'
                    : `¡VICTORIA EN PISO ${roguelikeRun.currentFloor}!`}
                </div>
                <h2 className="font-jojo-display text-3xl text-[#f2c12e] uppercase">
                  {roguelikeRun.pendingReward.sourceType === 'TREASURE'
                    ? 'COFRE DE EXPEDICIÓN'
                    : 'ELIGE 1 CARTA PERMANENTE PARA TU MAZO'}
                </h2>
              </div>
              <span className="border-2 border-[#060508] bg-[#1e170a] px-3 py-1.5 font-mono text-sm font-black text-[#f2c12e]">
                +{roguelikeRun.pendingReward.goldAwarded} Oro de Expedición
              </span>
            </div>

            {/* Optional Relic Draft (Elites, Bosses, Treasures) */}
            {roguelikeRun.pendingReward.relicChoices &&
              roguelikeRun.pendingReward.relicChoices.length > 0 && (() => {
                const isBossRelicDraft = roguelikeRun.pendingReward.relicChoices.some(
                  (rid) => getRoguelikeRelicById(rid)?.isBossRelic,
                );
                return (
                  <div
                    className={`space-y-2 border-2 p-4 ${
                      isBossRelicDraft
                        ? 'border-[#e6194b] bg-[#28101b]'
                        : 'border-[#f2c12e]/50 bg-[#1a1328]'
                    }`}
                  >
                    <div
                      className={`font-jojo-heading text-xs tracking-widest uppercase ${
                        isBossRelicDraft ? 'text-[#ff6b8d]' : 'text-[#f2c12e]'
                      }`}
                    >
                      {isBossRelicDraft ? (
                        <>
                          <Crown size={13} className="mr-1 inline" /> ¡RELIQUIA DE JEFE! Poder
                          extremo con contrapartida — elige 1:
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} className="mr-1 inline" /> ¡RELIQUIA DE EXPEDICIÓN!
                          Elige 1 bonificación pasiva:
                        </>
                      )}
                    </div>
                    <div
                      className={`grid grid-cols-1 gap-3 ${
                        isBossRelicDraft ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
                      }`}
                    >
                      {roguelikeRun.pendingReward.relicChoices.map((rid) => {
                        const rel = getRoguelikeRelicById(rid);
                        if (!rel) return null;
                        return (
                          <button
                            key={rid}
                            type="button"
                            onClick={() => setRoguelikeRun(pickRoguelikeRewardRelic(roguelikeRun, rid))}
                            className={`flex items-start gap-3 border-2 bg-[#0e0b14] p-3 text-left transition ${
                              rel.isBossRelic
                                ? 'border-[#e6194b]/80 hover:border-[#f2c12e] hover:bg-[#321423]'
                                : 'border-[#f2c12e] hover:bg-[#241b35]'
                            }`}
                          >
                            <span className="text-2xl">{rel.icon}</span>
                            <div className="space-y-1">
                              <div className="font-jojo-heading text-sm text-[#f2c12e] uppercase">
                                {rel.name}
                              </div>
                              <div className="text-xs text-zinc-300">{rel.description}</div>
                              {rel.tradeoff && (
                                <div className="inline-block border border-[#e6194b]/60 bg-[#3a121f] px-1.5 py-0.5 font-mono text-[10px] font-bold text-rose-200">
                                  Pega: {rel.tradeoff}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

            {/* 1-of-3 (or 4) Card Choices — ONLY after winning a Battle/Elite/Boss */}
            {roguelikeRun.pendingReward.cardChoices.length > 0 ? (
              <>
                <div className="flex flex-wrap justify-center gap-5 py-2">
                  {roguelikeRun.pendingReward.cardChoices.map((cid) => {
                    const card = getCardById(cid);
                    if (!card) return null;
                    const rMeta = RARITY_META[getCardRarity(cid)];
                    return (
                      <div key={cid} className="flex flex-col items-center gap-2">
                        <span
                          className={`border border-[#060508] px-2 py-0.5 font-mono text-[10px] font-black uppercase ${rMeta.badgeClass}`}
                        >
                          {rMeta.label}
                        </span>
                        <CardView
                          card={card}
                          size="md"
                          highlighted
                          onClick={() => {
                            const next = pickRoguelikeRewardCard(roguelikeRun, cid);
                            setRoguelikeRun(next);
                            if (next.currentFloor + 1 >= 21) setActiveActTab(3);
                            else if (next.currentFloor + 1 >= 11) setActiveActTab(2);
                          }}
                        />
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => openInspector(cid)}
                            className="jojo-btn-ink px-2.5 py-1 text-[11px] font-bold uppercase"
                          >
                            Inspeccionar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const next = pickRoguelikeRewardCard(roguelikeRun, cid);
                              setRoguelikeRun(next);
                              if (next.currentFloor + 1 >= 21) setActiveActTab(3);
                              else if (next.currentFloor + 1 >= 11) setActiveActTab(2);
                            }}
                            className="jojo-btn-primary px-3 py-1 text-[11px] font-bold uppercase"
                          >
                            Añadir al Mazo
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 border-t border-white/10 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowEnergyPicker((v) => !v)}
                    className="jojo-btn-ink px-4 py-2 font-jojo-heading text-xs tracking-wider text-sky-300 uppercase"
                  >
                    O elegir +1 Energía Básica
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = pickRoguelikeRewardCard(roguelikeRun, null);
                      setRoguelikeRun(next);
                    }}
                    className="jojo-btn-ink px-4 py-2 font-jojo-heading text-xs tracking-wider text-[#f2c12e] uppercase"
                  >
                    Omitir carta (+{getSkipCardGoldBonus(roguelikeRun.relicIds)} Oro)
                  </button>
                </div>

                {showEnergyPicker && (
                  <div className="flex flex-wrap justify-center gap-2 border border-sky-400/30 bg-[#0e0b14] p-3">
                    {BASIC_ENERGY_IDS.map((eid) => {
                      const eCard = getCardById(eid);
                      if (!eCard) return null;
                      return (
                        <button
                          key={eid}
                          type="button"
                          onClick={() => {
                            setShowEnergyPicker(false);
                            setRoguelikeRun(pickRoguelikeRewardCard(roguelikeRun, eid));
                          }}
                          className="jojo-btn-ink px-3 py-1.5 text-xs font-bold text-zinc-100 hover:border-[#f2c12e]"
                        >
                          +1 {eCard.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 border-t border-white/10 pt-4 text-center">
                {roguelikeRun.pendingReward.treasureFoundCardId &&
                  (() => {
                    const foundCard = getCardById(roguelikeRun.pendingReward.treasureFoundCardId);
                    if (!foundCard) return null;
                    const claimed = Boolean(roguelikeRun.pendingReward.treasureCardClaimed);
                    return (
                      <div className="flex flex-col items-center gap-2 border-2 border-[#00e599]/50 bg-[#0b2019] px-6 py-4">
                        <div className="font-jojo-heading text-xs tracking-widest text-[#00e599] uppercase">
                          <Gift size={13} className="mr-1 inline" /> ¡Carta encontrada en el cofre!
                        </div>
                        <CardView
                          card={foundCard}
                          size="sm"
                          highlighted={!claimed}
                          badgeText={claimed ? 'GUARDADA' : 'BOTÍN'}
                          onClick={() => openInspector(foundCard.id)}
                        />
                        <div className="text-xs font-bold text-[#f5efe0]">{foundCard.name}</div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openInspector(foundCard.id)}
                            className="jojo-btn-ink px-3 py-1 text-[11px] font-bold uppercase"
                          >
                            Inspeccionar
                          </button>
                          <button
                            type="button"
                            disabled={claimed}
                            onClick={() => setRoguelikeRun(claimTreasureBonusCard(roguelikeRun))}
                            className="jojo-btn-primary px-3.5 py-1 text-[11px] font-bold uppercase disabled:opacity-45"
                          >
                            {claimed ? 'Añadida al Mazo ✓' : 'Guardar en mi Mazo'}
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                <p className="text-xs text-zinc-300">
                  {roguelikeRun.pendingReward.relicChoices &&
                  roguelikeRun.pendingReward.relicChoices.length > 0
                    ? 'Elige una Reliquia arriba antes de continuar, o vuelve directamente al mapa.'
                    : '¡Tesoro recogido! Continúa tu expedición por la hoja de ruta.'}
                </p>
                <button
                  type="button"
                  onClick={handleLeaveRoomToMap}
                  className="jojo-btn-primary px-6 py-2.5 font-jojo-heading text-sm tracking-widest uppercase"
                >
                  Continuar al Mapa ➔
                </button>
              </div>
            )}
          </div>
        )}

        {/* ==================== SHOP ROOM ==================== */}
        {roguelikeRun.status === 'SHOP' && roguelikeRun.activeShop && (
          <div className="jojo-panel space-y-5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#060508] pb-3">
              <div>
                <div className="font-jojo-heading text-xs tracking-[0.22em] text-amber-300 uppercase">
                  TIENDA DE EXPEDICIÓN · PISO {roguelikeRun.currentFloor}
                </div>
                <h2 className="font-jojo-display text-3xl text-[#f2c12e] uppercase">
                  MERCADO BIZARRO
                </h2>
              </div>
              <button
                type="button"
                onClick={handleLeaveRoomToMap}
                className="jojo-btn-primary px-5 py-2 font-jojo-heading text-xs tracking-widest uppercase"
              >
                Salir al Mapa ➔
              </button>
            </div>

            {/* Cards & Relics for sale */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {roguelikeRun.activeShop.offers.map((offer) => {
                const canAfford = roguelikeRun.gold >= offer.price && !offer.purchased;
                if (offer.kind === 'CARD' && offer.cardId) {
                  const card = getCardById(offer.cardId);
                  if (!card) return null;
                  return (
                    <div
                      key={offer.id}
                      className={`flex flex-col items-center gap-2 border-2 p-3 ${
                        offer.purchased
                          ? 'border-zinc-800 bg-[#0c0a11] opacity-40'
                          : 'border-[#060508] bg-[#14101d]'
                      }`}
                    >
                      <CardView card={card} size="sm" onClick={() => openInspector(card.id)} />
                      <div className="text-center text-xs font-bold text-[#f5efe0]">{card.name}</div>
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => setRoguelikeRun(buyShopOffer(roguelikeRun, offer.id))}
                        className="jojo-btn-primary w-full py-1.5 font-mono text-xs font-black uppercase disabled:opacity-35"
                      >
                        {offer.purchased ? 'COMPRADO' : `${offer.price} Oro`}
                      </button>
                    </div>
                  );
                }
                if (offer.kind === 'RELIC' && offer.relicId) {
                  const rel = getRoguelikeRelicById(offer.relicId);
                  if (!rel) return null;
                  return (
                    <div
                      key={offer.id}
                      className={`flex flex-col justify-between gap-2 border-2 p-3 ${
                        offer.purchased
                          ? 'border-zinc-800 bg-[#0c0a11] opacity-40'
                          : 'border-[#f2c12e]/60 bg-[#1e172a]'
                      }`}
                    >
                      <div className="space-y-1 text-center">
                        <div className="text-3xl">{rel.icon}</div>
                        <div className="font-jojo-heading text-sm text-[#f2c12e] uppercase">
                          {rel.name}
                        </div>
                        <p className="text-[11px] text-zinc-300">{rel.description}</p>
                      </div>
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => setRoguelikeRun(buyShopOffer(roguelikeRun, offer.id))}
                        className="jojo-btn-primary w-full py-1.5 font-mono text-xs font-black uppercase disabled:opacity-35"
                      >
                        {offer.purchased ? 'COMPRADO' : `Reliquia · ${offer.price} Oro`}
                      </button>
                    </div>
                  );
                }
                return null;
              })}
            </div>

            {/* Shop Services: Pack of +2 Energies & Purge Card */}
            <div className="grid grid-cols-1 gap-3 border-t border-white/10 pt-4 md:grid-cols-2">
              <div className="border-2 border-[#060508] bg-[#0e0b14] p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-jojo-heading text-sm text-sky-300 uppercase">
                    Pack +2 Energías Básicas
                  </span>
                  <span className="font-mono text-xs font-bold text-[#f2c12e]">
                    {roguelikeRun.activeShop.energyPackPrice} Oro
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {BASIC_ENERGY_IDS.map((eid) => {
                    const eCard = getCardById(eid);
                    if (!eCard) return null;
                    return (
                      <button
                        key={eid}
                        type="button"
                        disabled={
                          roguelikeRun.activeShop!.energyPackBought ||
                          roguelikeRun.gold < roguelikeRun.activeShop!.energyPackPrice
                        }
                        onClick={() => setRoguelikeRun(buyShopEnergyPack(roguelikeRun, eid))}
                        className="jojo-btn-ink px-2.5 py-1 text-[11px] font-bold text-zinc-200 disabled:opacity-35"
                      >
                        +2 {eCard.name.replace('Energía ', '')}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-2 border-[#060508] bg-[#0e0b14] p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-jojo-heading text-sm text-rose-300 uppercase">
                    <Trash2 size={14} className="mr-1 inline" /> Purgar 1 Carta del Mazo
                  </span>
                  <span className="font-mono text-xs font-bold text-[#f2c12e]">
                    {roguelikeRun.activeShop.purgePrice} Oro
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Elimina una carta sobrante para afinar tu mazo (mínimo {ROGUELIKE_MIN_DECK_SIZE}{' '}
                  cartas).
                </p>
                <button
                  type="button"
                  disabled={
                    roguelikeRun.activeShop.purgedThisVisit ||
                    roguelikeRun.gold < roguelikeRun.activeShop.purgePrice ||
                    roguelikeRun.deckCardIds.length <= ROGUELIKE_MIN_DECK_SIZE
                  }
                  onClick={() => setShowPurgePicker((v) => !v)}
                  className="jojo-btn-crimson px-3 py-1.5 font-jojo-heading text-xs uppercase disabled:opacity-35"
                >
                  {roguelikeRun.activeShop.purgedThisVisit
                    ? 'Ya purgado en esta tienda'
                    : 'Elegir carta para purgar'}
                </button>
              </div>
            </div>

            {showPurgePicker && !roguelikeRun.activeShop.purgedThisVisit && (
              <div className="grid max-h-[220px] grid-cols-2 gap-2 overflow-y-auto border border-rose-500/40 bg-[#140b12] p-3 sm:grid-cols-3 md:grid-cols-5">
                {roguelikeRun.deckCardIds.map((cid, idx) => {
                  const c = getCardById(cid);
                  if (!c) return null;
                  return (
                    <button
                      key={`${idx}-${cid}`}
                      type="button"
                      onClick={() => {
                        setRoguelikeRun(purgeCardFromRunDeck(roguelikeRun, idx));
                        setShowPurgePicker(false);
                      }}
                      className="border border-[#060508] bg-[#1d121a] px-2 py-1.5 text-left text-xs text-zinc-200 hover:border-rose-400"
                    >
                      <div className="truncate font-bold">{c.name}</div>
                      <div className="font-mono text-[10px] text-rose-300">Purgar</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== CAMPFIRE / REST ROOM ==================== */}
        {roguelikeRun.status === 'CAMPFIRE' && roguelikeRun.activeCampfire && (
          <div className="jojo-panel mx-auto max-w-3xl space-y-5 border-2 border-orange-400/70 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#060508] pb-4">
              <div>
                <div className="font-jojo-heading text-xs tracking-[0.22em] text-orange-300 uppercase">
                  <Flame size={13} className="mr-1 inline" /> SALA DE HOGUERA · PISO{' '}
                  {roguelikeRun.currentFloor}
                </div>
                <h2 className="font-jojo-display text-3xl text-[#f2c12e] uppercase">
                  DESCANSO Y FORJA
                </h2>
                <p className="mt-1 text-xs text-zinc-300">
                  Aprovecha un respiro antes de los combates más duros. Elige 1 acción gratuita para
                  reforzar tu expedición.
                </p>
              </div>
            </div>

            {roguelikeRun.activeCampfire.resolvedMessage ? (
              <div className="space-y-4">
                <div className="border-l-4 border-orange-400 bg-[#24130a] p-3 text-sm font-bold text-orange-100">
                  {roguelikeRun.activeCampfire.resolvedMessage}
                </div>
                <button
                  type="button"
                  onClick={handleLeaveRoomToMap}
                  className="jojo-btn-primary px-5 py-2.5 font-jojo-heading text-sm tracking-widest uppercase"
                >
                  Continuar al Mapa ➔
                </button>
              </div>
            ) : roguelikeRun.activeCampfire.mode === 'CLONE' ||
              roguelikeRun.activeCampfire.mode === 'PURGE' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-orange-200">
                    {roguelikeRun.activeCampfire.mode === 'CLONE'
                      ? 'Elige 1 carta de tu mazo para duplicar:'
                      : 'Elige 1 carta de tu mazo para purgar gratis:'}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setRoguelikeRun({ ...roguelikeRun, activeCampfire: {} })
                    }
                    className="jojo-btn-ink px-2.5 py-1 text-[11px] font-bold uppercase"
                  >
                    Volver
                  </button>
                </div>
                <div className="grid max-h-[260px] grid-cols-2 gap-2 overflow-y-auto border border-orange-400/40 bg-[#140d0a] p-3 sm:grid-cols-3 md:grid-cols-4">
                  {roguelikeRun.deckCardIds.map((cid, idx) => {
                    const c = getCardById(cid);
                    if (!c) return null;
                    const isClone = roguelikeRun.activeCampfire?.mode === 'CLONE';
                    return (
                      <button
                        key={`${idx}-${cid}`}
                        type="button"
                        onClick={() =>
                          setRoguelikeRun(
                            isClone
                              ? resolveCampfireCloneCard(roguelikeRun, idx)
                              : resolveCampfirePurgeCard(roguelikeRun, idx),
                          )
                        }
                        className="border border-[#060508] bg-[#1f1512] px-2.5 py-2 text-left text-xs text-zinc-200 transition hover:border-orange-400"
                      >
                        <div className="truncate font-bold">{c.name}</div>
                        <div className="font-mono text-[10px] text-orange-300">
                          {isClone ? '+ Clonar' : '✕ Purgar'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setRoguelikeRun(resolveCampfireTrain(roguelikeRun))}
                  className="flex flex-col justify-between gap-2 border-2 border-[#060508] bg-[#1a1210] p-4 text-left transition hover:border-orange-400"
                >
                  <div className="text-2xl">🔥</div>
                  <div className="font-jojo-heading text-base text-[#f2c12e] uppercase">
                    Templar el Espíritu
                  </div>
                  <p className="text-xs text-zinc-300">
                    Todos tus personajes ganan <strong>+10 PV máx.</strong> permanentes para el
                    resto de la expedición.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRoguelikeRun(openCampfireMode(roguelikeRun, 'CLONE'))}
                  className="flex flex-col justify-between gap-2 border-2 border-[#060508] bg-[#14101d] p-4 text-left transition hover:border-[#00e599]"
                >
                  <div className="text-2xl">🪞</div>
                  <div className="font-jojo-heading text-base text-[#00e599] uppercase">
                    Clonar 1 Carta
                  </div>
                  <p className="text-xs text-zinc-300">
                    Elige cualquier carta de tu mazo actual y añade una copia extra al instante.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRoguelikeRun(openCampfireMode(roguelikeRun, 'PURGE'))}
                  className="flex flex-col justify-between gap-2 border-2 border-[#060508] bg-[#1c0f15] p-4 text-left transition hover:border-rose-400"
                >
                  <div className="text-2xl">🗑️</div>
                  <div className="font-jojo-heading text-base text-rose-300 uppercase">
                    Purgar 1 Carta Gratis
                  </div>
                  <p className="text-xs text-zinc-300">
                    Elimina una carta sobrante sin gastar Oro (mín. {ROGUELIKE_MIN_DECK_SIZE}{' '}
                    cartas).
                  </p>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ==================== MYSTERY EVENT ROOM ==================== */}
        {roguelikeRun.status === 'EVENT' && activeEventDef && roguelikeRun.activeEvent && (
          <div className="jojo-panel mx-auto max-w-3xl space-y-5 p-6">
            <div className="flex flex-wrap items-center gap-4 border-b-2 border-[#060508] pb-4">
              {getCardById(activeEventDef.featuredCardId) && (
                <CardView
                  card={getCardById(activeEventDef.featuredCardId)!}
                  size="sm"
                  onClick={() => openInspector(activeEventDef.featuredCardId)}
                />
              )}
              <div>
                <div className="font-jojo-heading text-xs tracking-[0.22em] text-purple-300 uppercase">
                  {activeEventDef.subtitle} · PISO {roguelikeRun.currentFloor}
                </div>
                <h2 className="font-jojo-display text-3xl text-[#f2c12e] uppercase">
                  {activeEventDef.title}
                </h2>
                <p className="mt-1 text-xs text-zinc-300">{activeEventDef.description}</p>
              </div>
            </div>

            {roguelikeRun.activeEvent.energyPickCount ? (
              <div className="space-y-3">
                <div className="text-xs font-bold text-sky-300">
                  Elige el tipo de Energía básica (+{roguelikeRun.activeEvent.energyPickCount}{' '}
                  copias):
                </div>
                <div className="flex flex-wrap gap-2">
                  {BASIC_ENERGY_IDS.map((eid) => {
                    const eCard = getCardById(eid);
                    if (!eCard) return null;
                    return (
                      <button
                        key={eid}
                        type="button"
                        onClick={() => {
                          const count = roguelikeRun.activeEvent?.energyPickCount ?? 2;
                          const extras = Array.from({ length: count }, () => eid);
                          setRoguelikeRun({
                            ...roguelikeRun,
                            deckCardIds: [...roguelikeRun.deckCardIds, ...extras],
                            activeEvent: {
                              eventId: activeEventDef.id,
                              resolvedMessage: `Añadidas ${count}× ${eCard.name} a tu mazo.`,
                            },
                          });
                        }}
                        className="jojo-btn-primary px-3 py-2 text-xs font-bold uppercase"
                      >
                        +{roguelikeRun.activeEvent?.energyPickCount ?? 2} {eCard.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : roguelikeRun.activeEvent.purgePickOpen ? (
              <div className="space-y-3">
                <div className="text-xs font-bold text-rose-300">
                  Elige 1 carta de tu mazo para purgar
                  {roguelikeRun.activeEvent.purgePickBonusGold
                    ? ` (+${roguelikeRun.activeEvent.purgePickBonusGold} Oro)`
                    : ''}
                  :
                </div>
                <div className="grid max-h-[240px] grid-cols-2 gap-2 overflow-y-auto border border-rose-500/40 bg-[#140b12] p-3 sm:grid-cols-3 md:grid-cols-4">
                  {roguelikeRun.deckCardIds.map((cid, idx) => {
                    const c = getCardById(cid);
                    if (!c) return null;
                    return (
                      <button
                        key={`${idx}-${cid}`}
                        type="button"
                        onClick={() => setRoguelikeRun(resolveEventPurgeCard(roguelikeRun, idx))}
                        className="border border-[#060508] bg-[#1d121a] px-2.5 py-2 text-left text-xs text-zinc-200 transition hover:border-rose-400"
                      >
                        <div className="truncate font-bold">{c.name}</div>
                        <div className="font-mono text-[10px] text-rose-300">Purgar ✕</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : roguelikeRun.activeEvent.resolvedMessage ? (
              <div className="space-y-4">
                <div className="border-l-4 border-[#00e599] bg-[#0b241d] p-3 text-sm font-bold text-emerald-100">
                  {roguelikeRun.activeEvent.resolvedMessage}
                </div>
                <button
                  type="button"
                  onClick={handleLeaveRoomToMap}
                  className="jojo-btn-primary px-5 py-2.5 font-jojo-heading text-sm tracking-widest uppercase"
                >
                  Continuar al Mapa ➔
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeEventDef.choices.map((ch) => {
                  const cantAfford = Boolean(ch.goldCost && roguelikeRun.gold < ch.goldCost);
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      disabled={cantAfford}
                      onClick={() =>
                        setRoguelikeRun(resolveRoguelikeEventChoice(roguelikeRun, activeEventDef, ch.id))
                      }
                      className="flex w-full items-center justify-between gap-3 border-2 border-[#060508] bg-[#14101d] p-3.5 text-left transition hover:border-[#f2c12e] disabled:opacity-40"
                    >
                      <div>
                        <div className="font-jojo-heading text-sm text-[#f2c12e] uppercase">
                          {ch.label}
                        </div>
                        <div className="text-xs text-zinc-300">{ch.description}</div>
                      </div>
                      <span className="font-mono text-xs text-zinc-400">Elegir ➔</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================== 30-FLOOR BRANCHING ROADMAP ==================== */}
        {roguelikeRun.status === 'MAP' && (
          <div className="jojo-panel space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#060508] pb-3">
              <div>
                <div className="font-jojo-heading text-xs tracking-[0.22em] text-[#f2c12e] uppercase">
                  HOJA DE RUTA · ELIGE LA SIGUIENTE SALA CONECTADA
                </div>
                <h2 className="font-jojo-display text-2xl text-[#f5efe0] uppercase">
                  {currentActDef.name}
                </h2>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {ROGUELIKE_ACTS.map((act) => (
                  <button
                    key={act.act}
                    type="button"
                    onClick={() => setActiveActTab(act.act)}
                    className={`px-3 py-1.5 font-jojo-heading text-xs tracking-wider uppercase ${
                      activeActTab === act.act
                        ? 'jojo-btn-primary'
                        : 'jojo-btn-ink text-zinc-300'
                    }`}
                  >
                    Acto {act.act} (Pisos {act.floorRange[0]}–{act.floorRange[1]})
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              {/* 3-Lane Header */}
              <div className="hidden items-center gap-3 px-2.5 pb-1 sm:flex">
                <div className="w-20 shrink-0" />
                <div className="grid flex-1 grid-cols-3 gap-2.5 text-center font-jojo-heading text-[11px] tracking-[0.2em] text-zinc-400 uppercase">
                  <span>Carril Izquierdo</span>
                  <span>Carril Central</span>
                  <span>Carril Derecho</span>
                </div>
              </div>

              {actFloors.map(({ floor, nodes }, rowIdx) => {
                const isNextFloor = floor === roguelikeRun.currentFloor + 1;
                const nextRow = actFloors[rowIdx + 1];
                const laneCenters = [16.66, 50, 83.33];

                return (
                  <div key={floor}>
                    <div
                      className={`flex flex-wrap items-center gap-3 border-2 p-2.5 ${
                        isNextFloor
                          ? 'border-[#f2c12e] bg-[#1e172c]'
                          : 'border-[#060508] bg-[#0e0b14]'
                      }`}
                    >
                      <div className="w-20 shrink-0 font-mono text-xs font-black text-zinc-400">
                        PISO {floor}
                        {isNextFloor && (
                          <div className="text-[10px] text-[#f2c12e]">SIGUIENTE</div>
                        )}
                      </div>

                      <div className="grid flex-1 grid-cols-1 gap-2.5 sm:grid-cols-3">
                        {[0, 1, 2].map((laneIdx) => {
                          const node = nodes.find((n) => n.lane === laneIdx);
                          if (!node) {
                            return <div key={laneIdx} className="hidden sm:block" />;
                          }
                          const style = ROOM_STYLE[node.type];
                          const isSelectable = selectableNodeIds.has(node.id);
                          const isCurrent = roguelikeRun.currentNodeId === node.id;
                          return (
                            <button
                              key={node.id}
                              type="button"
                              disabled={!isSelectable}
                              onClick={() => handleSelectNode(node)}
                              className={`flex items-center justify-between gap-2 border-2 p-3 text-left transition ${
                                isSelectable
                                  ? `${style.border} ${style.bg} cursor-pointer shadow-[3px_3px_0_#060508] ring-2 ring-[#f2c12e]/70 hover:-translate-y-0.5`
                                  : isCurrent
                                    ? 'border-[#00e599] bg-emerald-950/50 ring-2 ring-[#00e599]/60'
                                    : node.visited
                                      ? 'border-emerald-600/60 bg-emerald-950/30 opacity-80'
                                      : 'border-[#060508] bg-[#120e1a] opacity-40'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className={style.text}>
                                  <RoomIcon type={node.type} size={18} />
                                </span>
                                <div>
                                  <div className={`font-jojo-heading text-xs uppercase ${style.text}`}>
                                    {node.label}
                                  </div>
                                  <div className="font-mono text-[10px] text-zinc-400">
                                    {isCurrent
                                      ? 'Estás aquí'
                                      : node.visited
                                        ? 'Completada'
                                        : isSelectable
                                          ? 'Entrar ➔'
                                          : 'Bloqueada'}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Visual SVG connectors between adjacent lanes */}
                    {nextRow && (
                      <div className="hidden items-center gap-3 px-2.5 sm:flex">
                        <div className="w-20 shrink-0" />
                        <svg
                          viewBox="0 0 100 22"
                          preserveAspectRatio="none"
                          className="h-5 flex-1 overflow-visible"
                        >
                          {nodes.flatMap((src) =>
                            src.nextNodeIds.map((targetId) => {
                              const dst = nextRow.nodes.find((n) => n.id === targetId);
                              if (!dst) return null;
                              const isActiveEdge =
                                roguelikeRun.currentNodeId === src.id &&
                                selectableNodeIds.has(dst.id);
                              const isVisitedEdge = src.visited && dst.visited;
                              return (
                                <line
                                  key={`${src.id}-${dst.id}`}
                                  x1={laneCenters[src.lane]}
                                  y1={0}
                                  x2={laneCenters[dst.lane]}
                                  y2={22}
                                  stroke={
                                    isActiveEdge
                                      ? '#f2c12e'
                                      : isVisitedEdge
                                        ? '#00e599'
                                        : 'rgba(255,255,255,0.14)'
                                  }
                                  strokeWidth={isActiveEdge ? 1.4 : isVisitedEdge ? 1.1 : 0.6}
                                  strokeDasharray={isActiveEdge || isVisitedEdge ? undefined : '2 2'}
                                />
                              );
                            }),
                          )}
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ==================== RUN DECK VIEWER MODAL ==================== */}
      <AnimatePresence>
        {showDeckModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDeckModal(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#060508]/90 p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="jojo-panel flex max-h-[85vh] w-full max-w-4xl flex-col gap-4 p-5"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="font-jojo-display text-2xl text-[#f2c12e] uppercase">
                  MAZO DE EXPEDICIÓN ({roguelikeRun.deckCardIds.length} CARTAS)
                </h3>
                <button
                  type="button"
                  onClick={() => setShowDeckModal(false)}
                  className="jojo-btn-ink flex h-8 w-8 items-center justify-center"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-5">
                {roguelikeRun.deckCardIds.map((cid, idx) => {
                  const c = getCardById(cid);
                  if (!c) return null;
                  return (
                    <div key={`${idx}-${cid}`} className="flex flex-col items-center gap-1">
                      <CardView card={c} size="sm" onClick={() => openInspector(cid)} />
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <RoguelikeGuideModal open={showGuideModal} onClose={() => setShowGuideModal(false)} />
      <PackOpeningModal
        pack={victoryPackModal?.pack ?? null}
        outcomes={victoryPackModal?.outcomes ?? null}
        canBuyAnother={false}
        onBuyAnother={() => {}}
        onClose={() => setVictoryPackModal(null)}
      />
    </div>
  );
}

function RoguelikeGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Instrucciones del Modo Roguelike"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#060508]/90 p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            className="jojo-panel max-h-[88vh] w-full max-w-3xl space-y-4 overflow-y-auto p-6"
          >
            <div className="flex items-center justify-between border-b-2 border-[#060508] pb-3">
              <div>
                <div className="font-jojo-heading text-xs tracking-[0.22em] text-[#9333ea] uppercase">
                  MANUAL DE EXPEDICIÓN · 30 NIVELES
                </div>
                <h3 className="font-jojo-display text-3xl text-[#f2c12e] uppercase">
                  INSTRUCCIONES DEL ROGUELIKE
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="jojo-btn-ink flex h-8 w-8 items-center justify-center"
                title="Cerrar"
              >
                <X size={15} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="border-2 border-[#060508] bg-[#0e0b14] p-3.5 text-xs text-zinc-300 space-y-1.5">
                <h4 className="font-jojo-heading text-sm tracking-wider text-[#f2c12e] uppercase">
                  Reglas de la Expedición
                </h4>
                <ul className="space-y-1">
                  <li>
                    • Empiezas con un mazo inicial de <strong>16 cartas</strong> (10 en baraja + 6
                    Premios) y <strong>30 de Oro de Expedición</strong>.
                  </li>
                  <li>
                    • Mano inicial de <strong>5 cartas</strong> y{' '}
                    <strong>sin derrota por mazo vacío</strong>: si tu mazo llega a 0 se recicla el
                    descarte, y si ambos están vacíos simplemente no robas ese turno.
                  </li>
                  <li>
                    • Si pierdes un combate, la expedición termina (sin revancha) y cobras tu
                    recompensa final en <strong>Monedas Speedwagon</strong> reales.
                  </li>
                  <li>
                    • Tu progreso se guarda automáticamente: puedes salir y continuar más tarde.
                  </li>
                </ul>
              </div>

              <div className="border-2 border-[#060508] bg-[#0e0b14] p-3.5 text-xs text-zinc-300 space-y-1.5">
                <h4 className="font-jojo-heading text-sm tracking-wider text-[#00e599] uppercase">
                  Carriles y Hoja de Ruta (30 Pisos)
                </h4>
                <ul className="space-y-1">
                  <li>
                    • El mapa tiene <strong>3 Actos</strong> (Pisos 1–10, 11–20 y 21–30) repartidos
                    en <strong>3 carriles</strong>: Izquierdo, Central y Derecho.
                  </li>
                  <li>
                    • Desde tu sala actual solo puedes avanzar a{' '}
                    <strong>carriles adyacentes</strong> del siguiente piso (marcados con líneas
                    doradas).
                  </li>
                  <li>
                    • Los <strong>Jefes de Acto</strong> aparecen siempre en el{' '}
                    <strong>Carril Central</strong> en los Pisos <strong>10, 20 y 30</strong>.
                  </li>
                </ul>
              </div>

              <div className="border-2 border-[#060508] bg-[#0e0b14] p-3.5 text-xs text-zinc-300 space-y-1.5">
                <h4 className="font-jojo-heading text-sm tracking-wider text-sky-300 uppercase">
                  Tipos de Salas
                </h4>
                <ul className="space-y-1">
                  <li>
                    • <strong className="text-sky-300">Combate</strong>: rival escalado; al vencer
                    ganas Oro y eliges <strong>1 carta entre 3</strong> para tu mazo.
                  </li>
                  <li>
                    • <strong className="text-[#f2c12e]">Élite</strong>: rival más duro con más Oro,
                    mejores rarezas y elección de <strong>Reliquia</strong>.
                  </li>
                  <li>
                    • <strong className="text-[#00e599]">Tesoro</strong>: cofre gratuito con gran
                    botín de Oro y <strong>Reliquia pasiva</strong>.
                  </li>
                  <li>
                    • <strong className="text-amber-300">Tienda</strong>: compra cartas, Reliquias,
                    packs de <strong>+2 Energías</strong> o <strong>purga</strong> una carta de tu
                    mazo (mín. 16).
                  </li>
                  <li>
                    • <strong className="text-purple-300">Evento</strong>: encuentros temáticos de
                    JoJo con decisiones de riesgo y recompensa.
                  </li>
                  <li>
                    • <strong className="text-[#ff4d79]">Jefe</strong>: gran combate de cierre de
                    Acto con cartas de alta rareza y Reliquias.
                  </li>
                </ul>
              </div>

              <div className="border-2 border-[#060508] bg-[#0e0b14] p-3.5 text-xs text-zinc-300 space-y-1.5">
                <h4 className="font-jojo-heading text-sm tracking-wider text-purple-300 uppercase">
                  Reliquias y Recompensa Final
                </h4>
                <ul className="space-y-1">
                  <li>
                    • Las <strong>Reliquias Bizarras</strong> dan mejoras permanentes durante toda
                    la expedición (+PV, +daño, +mano inicial, descuentos en Tienda, +Oro, o elegir
                    entre 4 cartas).
                  </li>
                  <li>
                    • El <strong>Oro de Expedición</strong> solo sirve dentro del Roguelike.
                  </li>
                  <li>
                    • Al finalizar la expedición recibes <strong>Monedas Speedwagon</strong> reales
                    según los pisos superados (+18/piso), élites (+35), jefes (+90) y un gran bonus
                    de <strong>+400 monedas</strong> si conquistas el Piso 30.
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="jojo-btn-primary px-6 py-2 font-jojo-heading text-xs tracking-widest uppercase"
              >
                ¡Entendido!
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
