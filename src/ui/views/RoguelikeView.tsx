import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Coins,
  Compass,
  Crown,
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
import { getCardById } from '../../data/cardRegistry';
import { getCardRarity, RARITY_META } from '../../data/progressionData';
import {
  BASIC_ENERGY_IDS,
  getRoguelikeRelicById,
  ROGUELIKE_ACTS,
  ROGUELIKE_EVENTS,
  ROGUELIKE_MIN_DECK_SIZE,
  ROGUELIKE_STARTER_DECKS,
  ROGUELIKE_TOTAL_FLOORS,
  type RoguelikeRoomType,
} from '../../data/roguelikeData';
import {
  buyShopEnergyPack,
  buyShopOffer,
  computeRelicRulesOverrides,
  computeRoguelikeMetaReward,
  enterRoguelikeNode,
  getSelectableNodeIds,
  pickRoguelikeRewardCard,
  pickRoguelikeRewardRelic,
  purgeCardFromRunDeck,
  resolveRoguelikeEventChoice,
  type RoguelikeMapNode,
} from '../../services/roguelikeService';
import { useAppStore } from '../../store/useAppStore';
import { useBattleStore } from '../../store/useBattleStore';
import { CardView } from '../components/cards/CardView';

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
    case 'BOSS':
      return <Crown size={size} />;
  }
}

export function RoguelikeView() {
  const roguelikeRun = useAppStore((s) => s.roguelikeRun);
  const bestRoguelikeFloor = useAppStore((s) => s.bestRoguelikeFloor);
  const startRoguelikeRun = useAppStore((s) => s.startRoguelikeRun);
  const setRoguelikeRun = useAppStore((s) => s.setRoguelikeRun);
  const claimRoguelikeEndReward = useAppStore((s) => s.claimRoguelikeEndReward);
  const abandonRoguelikeRun = useAppStore((s) => s.abandonRoguelikeRun);
  const setScreen = useAppStore((s) => s.setScreen);
  const openInspector = useAppStore((s) => s.openInspector);
  const authUser = useAppStore((s) => s.authUser);
  const settings = useAppStore((s) => s.settings);

  const startBattle = useBattleStore((s) => s.startBattle);

  const [showDeckModal, setShowDeckModal] = useState(false);
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
            {bestRoguelikeFloor > 0 && (
              <div className="border-2 border-[#060508] bg-[#1d1727] px-4 py-2 font-mono text-xs text-[#f2c12e] shadow-[3px_3px_0_#060508]">
                <Trophy size={14} className="mr-1.5 inline" />
                RÉCORD PERSONAL: <strong>PISO {bestRoguelikeFloor}/30</strong>
              </div>
            )}
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
                      <span className="font-mono text-xs text-zinc-400">60 Oro inicial</span>
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
                      startRoguelikeRun(starter.id);
                      setActiveActTab(1);
                    }}
                    className="jojo-btn-primary w-full py-2.5 font-jojo-heading text-sm tracking-widest uppercase"
                  >
                    <Compass size={15} className="mr-1.5 inline" /> Iniciar con {starter.name}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
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
      const rules = computeRelicRulesOverrides(nextRun.relicIds);
      startBattle(
        {
          mode: 'VS_AI',
          p1Name: authUser?.username ?? 'Expedicionario',
          p2Name: enemy.name,
          p1DeckIds: nextRun.deckCardIds,
          p2DeckIds: enemy.deckIds,
          firstPlayerId: 'P1',
          aiDifficulty: enemy.difficulty,
          aiErrorRate: enemy.aiErrorRate,
          roguelikeNodeId: node.id,
          rules,
          p2GuaranteedOpeningCardId: enemy.featuredCardId,
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
                      claimRoguelikeEndReward();
                      abandonRoguelikeRun();
                    }}
                    className="jojo-btn-primary inline-flex items-center gap-2 px-6 py-3 font-jojo-heading text-sm tracking-widest uppercase"
                  >
                    <Coins size={16} /> Reclamar +{endRewardSummary.coins} Monedas y Nueva Partida
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
                  ELIGE 1 CARTA PERMANENTE PARA TU MAZO
                </h2>
              </div>
              <span className="border-2 border-[#060508] bg-[#1e170a] px-3 py-1.5 font-mono text-sm font-black text-[#f2c12e]">
                +{roguelikeRun.pendingReward.goldAwarded} Oro de Expedición
              </span>
            </div>

            {/* Optional Relic Draft (Elites, Bosses, Treasures) */}
            {roguelikeRun.pendingReward.relicChoices &&
              roguelikeRun.pendingReward.relicChoices.length > 0 && (
                <div className="space-y-2 border-2 border-[#f2c12e]/50 bg-[#1a1328] p-4">
                  <div className="font-jojo-heading text-xs tracking-widest text-[#f2c12e] uppercase">
                    <Sparkles size={13} className="mr-1 inline" /> ¡RELIQUIA DE EXPEDICIÓN! Elige 1
                    bonificación pasiva:
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {roguelikeRun.pendingReward.relicChoices.map((rid) => {
                      const rel = getRoguelikeRelicById(rid);
                      if (!rel) return null;
                      return (
                        <button
                          key={rid}
                          type="button"
                          onClick={() => setRoguelikeRun(pickRoguelikeRewardRelic(roguelikeRun, rid))}
                          className="flex items-center gap-3 border-2 border-[#f2c12e] bg-[#0e0b14] p-3 text-left transition hover:bg-[#241b35]"
                        >
                          <span className="text-2xl">{rel.icon}</span>
                          <div>
                            <div className="font-jojo-heading text-sm text-[#f2c12e] uppercase">
                              {rel.name}
                            </div>
                            <div className="text-xs text-zinc-300">{rel.description}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* 1-of-3 (or 4) Card Choices */}
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
                  const next = pickRoguelikeRewardCard(roguelikeRun, null, 25);
                  setRoguelikeRun(next);
                }}
                className="jojo-btn-ink px-4 py-2 font-jojo-heading text-xs tracking-wider text-[#f2c12e] uppercase"
              >
                Omitir carta (+25 Oro)
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

            <div className="space-y-3">
              {actFloors.map(({ floor, nodes }) => {
                const isNextFloor = floor === roguelikeRun.currentFloor + 1;
                return (
                  <div
                    key={floor}
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
                      {nodes.map((node) => {
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
                                : node.visited
                                  ? 'border-emerald-600/60 bg-emerald-950/30 opacity-80'
                                  : 'border-[#060508] bg-[#120e1a] opacity-45'
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
                                    ? 'Posición actual'
                                    : node.visited
                                      ? 'Completada'
                                      : isSelectable
                                        ? 'Entrar ➔'
                                        : `Carril ${node.lane + 1}`}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
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
    </div>
  );
}
