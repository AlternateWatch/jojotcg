import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Coins,
  Crown,
  Layers,
  Shuffle,
  Skull,
  Sparkles,
  Swords,
  Trophy,
  X,
} from 'lucide-react';
import { pickRandomRoguelikeTrack } from '../../data/battleMusic';
import { getCardById } from '../../data/cardRegistry';
import { getCardRarity, RARITY_META, type BoosterPackDef } from '../../data/progressionData';
import {
  buildDraftOpponent,
  computeDraftMetaReward,
  DRAFT_MAX_LOSSES,
  DRAFT_MAX_WINS,
  DRAFT_TOTAL_PICKS,
  pickDraftCard,
  resolveDraftBattleOutcome,
} from '../../services/draftService';
import type { OpenPackOutcome } from '../../services/progressionService';
import { useAppStore } from '../../store/useAppStore';
import { useBattleStore } from '../../store/useBattleStore';
import { CardView } from '../components/cards/CardView';
import { PackOpeningModal } from '../components/shop/PackOpeningModal';

export function DraftView() {
  const draftRun = useAppStore((s) => s.draftRun);
  const startDraftRun = useAppStore((s) => s.startDraftRun);
  const setDraftRun = useAppStore((s) => s.setDraftRun);
  const claimDraftEndReward = useAppStore((s) => s.claimDraftEndReward);
  const abandonDraftRun = useAppStore((s) => s.abandonDraftRun);
  const progression = useAppStore((s) => s.progression);
  const authUser = useAppStore((s) => s.authUser);
  const settings = useAppStore((s) => s.settings);
  const openInspector = useAppStore((s) => s.openInspector);
  const setScreen = useAppStore((s) => s.setScreen);

  const startBattle = useBattleStore((s) => s.startBattle);
  const lastBattleTrackId = useBattleStore((s) => s.activeBattleTrackId);

  const [showDeckModal, setShowDeckModal] = useState(false);
  const [abandonNotice, setAbandonNotice] = useState(false);
  const [rewardPackModal, setRewardPackModal] = useState<{
    pack: BoosterPackDef;
    outcomes: OpenPackOutcome[];
  } | null>(null);

  // If the player returned to Draft (or reloaded the page) while a Draft battle was marked IN_BATTLE,
  // automatically count it as a loss so the Arena never gets stuck or exploited.
  useEffect(() => {
    if (draftRun && draftRun.status === 'IN_BATTLE') {
      setDraftRun(resolveDraftBattleOutcome(draftRun, false));
      setAbandonNotice(true);
    }
  }, [draftRun, setDraftRun]);

  const nextOpponent = useMemo(() => {
    if (!draftRun || draftRun.status !== 'READY') return null;
    return buildDraftOpponent(draftRun.wins, draftRun.matchesPlayed, draftRun.seed);
  }, [draftRun]);

  const deckCounts = useMemo(() => {
    const ids = draftRun
      ? draftRun.finalDeckIds.length > 0
        ? draftRun.finalDeckIds
        : draftRun.pickedCardIds
      : [];
    let characters = 0;
    let stands = 0;
    let evolutions = 0;
    let items = 0;
    let energies = 0;
    for (const id of ids) {
      const c = getCardById(id);
      if (!c) continue;
      if (c.type === 'CHARACTER') characters++;
      else if (c.type === 'STAND') stands++;
      else if (c.type === 'EVOLUTION') evolutions++;
      else if (c.type === 'ITEM') items++;
      else if (c.type === 'ENERGY') energies++;
    }
    return { total: ids.length, characters, stands, evolutions, items, energies, ids };
  }, [draftRun]);

  // ==================== 1. INTRO / START SCREEN ====================
  if (!draftRun) {
    return (
      <div
        className="relative min-h-[calc(100vh-56px)] py-8"
        style={{
          backgroundImage: 'url(/assets/patterns/pattern3.png)',
          backgroundSize: '340px',
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[#0b090e]/92" />
        <div className="relative z-10 mx-auto max-w-[1160px] space-y-6 px-4">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#00b87c]/40 pb-4">
            <div>
              <div className="font-jojo-heading text-xs tracking-[0.26em] text-[#00e599] uppercase">
                MODO ARENA · CONSTRUCCIÓN DESDE CERO · 5 VICTORIAS / 3 DERROTAS
              </div>
              <h1 className="font-jojo-display text-4xl text-[#f5efe0] uppercase sm:text-5xl">
                ARENA <span className="text-[#00e599]">DRAFT</span>
              </h1>
              <p className="mt-1 max-w-2xl text-xs text-zinc-300">
                Construye un mazo oficial de <strong>46 cartas</strong> desde cero eligiendo{' '}
                <strong>1 carta entre 3</strong> durante {DRAFT_TOTAL_PICKS} rondas (las 22 Energías
                óptimas se añaden automáticamente). Compite hasta lograr{' '}
                <strong>{DRAFT_MAX_WINS} victorias</strong> o acumular{' '}
                <strong>{DRAFT_MAX_LOSSES} derrotas</strong>. ¡Gratis y con recompensas reales!
              </p>
            </div>
            {(progression.draftChampionWins ?? 0) > 0 && (
              <div className="border-2 border-[#060508] bg-[#0e241c] px-4 py-2 font-mono text-xs text-[#00e599] shadow-[3px_3px_0_#060508]">
                <Crown size={14} className="mr-1.5 inline" />
                CAMPEONATOS DRAFT: <strong>{progression.draftChampionWins}</strong>
              </div>
            )}
          </div>

          {/* Rules + Reward Tiers */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="jojo-panel space-y-3 p-5">
              <div className="font-jojo-heading text-xs tracking-[0.2em] text-[#00e599] uppercase">
                Cómo funciona la Arena Draft
              </div>
              <ul className="space-y-2 text-xs text-zinc-300">
                <li>
                  • <strong>Rondas 1–5:</strong> Personajes jugables en Turno 1 garantizados para
                  que tu mazo nunca se atasque.
                </li>
                <li>
                  • <strong>Rondas 6–20:</strong> Personajes, Stands compatibles con tu DG, Objetos
                  tácticos y Evoluciones si ya elegiste su carta base.
                </li>
                <li>
                  • <strong>Rondas 21–24:</strong> Elecciones de alta rareza (SR / UR) para rematar
                  tu estrategia.
                </li>
                <li>
                  • <strong>Energías automáticas:</strong> Al terminar las 24 elecciones se añaden
                  automáticamente las 22 Energías exactas que piden tus ataques (46 cartas legales).
                </li>
              </ul>
            </div>

            <div className="jojo-panel space-y-3 p-5">
              <div className="font-jojo-heading text-xs tracking-[0.2em] text-[#f2c12e] uppercase">
                Tabla de Recompensas (Monedas + Sobres Generales)
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                {[
                  { w: '0 Victorias', r: '+40 Monedas' },
                  { w: '1 Victoria', r: '+90 Monedas' },
                  { w: '2 Victorias', r: '+160 Monedas' },
                  { w: '3 Victorias', r: '+240 Monedas + 1 Sobre General' },
                  { w: '4 Victorias', r: '+340 Monedas + 1 Sobre General' },
                  { w: '5 Victorias (CAMPEÓN)', r: '+500 Monedas + 2 Sobres Generales' },
                ].map((tier, idx) => (
                  <div
                    key={tier.w}
                    className={`border border-[#060508] p-2.5 ${
                      idx === 5
                        ? 'col-span-2 border-[#f2c12e] bg-[#21190c] text-[#f2c12e]'
                        : 'bg-[#0e0b14] text-zinc-200'
                    }`}
                  >
                    <div className="font-bold">{tier.w}</div>
                    <div className="text-[11px] opacity-90">{tier.r}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => startDraftRun()}
              className="jojo-btn-primary inline-flex items-center gap-2 px-8 py-3.5 font-jojo-heading text-base tracking-widest uppercase"
            >
              <Shuffle size={18} /> Comenzar Nuevo Draft (Gratis)
            </button>
          </div>
        </div>

        <PackOpeningModal
          pack={rewardPackModal?.pack ?? null}
          outcomes={rewardPackModal?.outcomes ?? null}
          canBuyAnother={false}
          onBuyAnother={() => {}}
          onClose={() => setRewardPackModal(null)}
        />
      </div>
    );
  }

  // ==================== 2. DRAFTING SCREEN ====================
  if (draftRun.status === 'DRAFTING') {
    const progressPct = Math.round(((draftRun.currentPick - 1) / draftRun.totalPicks) * 100);
    return (
      <div
        className="relative min-h-[calc(100vh-56px)] py-6"
        style={{
          backgroundImage: 'url(/assets/patterns/pattern3.png)',
          backgroundSize: '340px',
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[#0b090e]/92" />
        <div className="relative z-10 mx-auto max-w-[1280px] space-y-5 px-4">
          {/* Draft Top Bar */}
          <div className="jojo-panel flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="font-jojo-heading text-xs tracking-[0.22em] text-[#00e599] uppercase">
                CONSTRUYENDO MAZO DE ARENA · ELECCIÓN {draftRun.currentPick} DE {draftRun.totalPicks}
              </div>
              <h2 className="font-jojo-display text-3xl text-[#f2c12e] uppercase">
                ELIGE 1 CARTA PARA TU MAZO
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="border-2 border-[#060508] bg-[#0e0b14] px-3 py-1.5 font-mono text-xs text-zinc-200">
                P: <strong>{deckCounts.characters}</strong> · S: <strong>{deckCounts.stands}</strong> ·
                E: <strong>{deckCounts.evolutions}</strong> · O: <strong>{deckCounts.items}</strong>
              </div>
              <button
                type="button"
                onClick={() => setShowDeckModal(true)}
                className="jojo-btn-ink inline-flex items-center gap-1.5 px-3 py-1.5 font-jojo-heading text-xs tracking-wider text-[#f5efe0] uppercase"
              >
                <Layers size={13} /> Ver Draft ({draftRun.pickedCardIds.length})
              </button>
              <button
                type="button"
                onClick={() => abandonDraftRun()}
                className="jojo-btn-crimson px-3 py-1.5 font-jojo-heading text-xs tracking-wider uppercase"
              >
                Cancelar Draft
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2.5 w-full overflow-hidden border-2 border-[#060508] bg-[#0e0b14]">
            <div
              className="h-full bg-[#00e599] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* 3 Card Choices */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {draftRun.currentChoices.map((cid) => {
              const card = getCardById(cid);
              if (!card) return null;
              const rarity = getCardRarity(cid);
              const rMeta = RARITY_META[rarity];
              return (
                <div
                  key={cid}
                  className="jojo-panel flex flex-col items-center justify-between gap-4 p-5"
                >
                  <div className="flex w-full items-center justify-between">
                    <span
                      className={`border border-[#060508] px-2 py-0.5 font-mono text-[10px] font-black uppercase ${rMeta.badgeClass}`}
                    >
                      {rMeta.short}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-400 uppercase">
                      {card.type}
                    </span>
                  </div>

                  <CardView card={card} size="md" onClick={() => openInspector(card.id)} />

                  <div className="w-full space-y-2 text-center">
                    <div className="font-jojo-heading text-base text-[#f5efe0]">{card.name}</div>
                    <button
                      type="button"
                      onClick={() => setDraftRun(pickDraftCard(draftRun, cid))}
                      className="jojo-btn-primary w-full py-2.5 font-jojo-heading text-xs tracking-widest uppercase"
                    >
                      <Sparkles size={14} className="mr-1 inline" /> Elegir Carta
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DraftDeckModal
          open={showDeckModal}
          onClose={() => setShowDeckModal(false)}
          cardIds={deckCounts.ids}
          onInspect={openInspector}
        />
      </div>
    );
  }

  // ==================== 3. FINISHED SUMMARY ====================
  if (draftRun.status === 'FINISHED') {
    const reward = computeDraftMetaReward(draftRun);
    return (
      <div
        className="relative min-h-[calc(100vh-56px)] py-8"
        style={{
          backgroundImage: 'url(/assets/patterns/pattern3.png)',
          backgroundSize: '340px',
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[#0b090e]/92" />
        <div className="relative z-10 mx-auto max-w-2xl px-4">
          <div className="jojo-panel space-y-5 p-6 text-center">
            <div
              className={`mx-auto inline-flex items-center gap-2 border-2 border-[#060508] px-4 py-1 font-jojo-heading text-xs tracking-widest uppercase ${
                reward.isChampion
                  ? 'bg-[#00b87c] text-[#0b090e]'
                  : 'bg-[#e6194b] text-white'
              }`}
            >
              {reward.isChampion ? (
                <>
                  <Crown size={15} /> ¡CAMPEÓN DE ARENA DRAFT!
                </>
              ) : (
                <>
                  <Skull size={15} /> FIN DE LA ARENA DRAFT
                </>
              )}
            </div>

            <h2 className="font-jojo-display text-4xl text-[#f2c12e] uppercase">
              RESULTADO FINAL: {draftRun.wins}V - {draftRun.losses}D
            </h2>

            <div className="border-2 border-[#f2c12e] bg-[#1e170a] p-4">
              <div className="font-jojo-heading text-xs tracking-widest text-amber-300 uppercase">
                RECOMPENSA PERMANENTE DE ARENA
              </div>
              <div className="mt-1 font-jojo-display text-4xl text-[#f2c12e]">
                +{reward.coins} MONEDAS
                {reward.packCount > 0 && (
                  <span className="block text-2xl text-[#00e599]">
                    + {reward.packCount}× SOBRE GENERAL (CUALQUIER CARTA)
                  </span>
                )}
              </div>
              <div className="mt-1 font-mono text-[11px] text-zinc-300">{reward.breakdown}</div>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              {draftRun.metaCoinsClaimed === null ? (
                <button
                  type="button"
                  onClick={() => {
                    const claimed = claimDraftEndReward();
                    if (claimed?.pack && claimed.packOutcomes) {
                      setRewardPackModal({
                        pack: claimed.pack,
                        outcomes: claimed.packOutcomes,
                      });
                    }
                    abandonDraftRun();
                  }}
                  className="jojo-btn-primary inline-flex items-center gap-2 px-6 py-3 font-jojo-heading text-sm tracking-widest uppercase"
                >
                  <Coins size={16} />{' '}
                  {reward.packCount > 0
                    ? `Reclamar +${reward.coins} Monedas y Abrir ${reward.packCount} Sobre(s)`
                    : `Reclamar +${reward.coins} Monedas`}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => abandonDraftRun()}
                  className="jojo-btn-primary px-6 py-3 font-jojo-heading text-sm tracking-widest uppercase"
                >
                  Nuevo Draft
                </button>
              )}
            </div>
          </div>
        </div>

        <PackOpeningModal
          pack={rewardPackModal?.pack ?? null}
          outcomes={rewardPackModal?.outcomes ?? null}
          canBuyAnother={false}
          onBuyAnother={() => {}}
          onClose={() => setRewardPackModal(null)}
        />
      </div>
    );
  }

  // ==================== 4. ARENA HUB (READY / IN_BATTLE) ====================
  const handleLaunchMatch = () => {
    if (!nextOpponent) return;
    setDraftRun({ ...draftRun, status: 'IN_BATTLE' });
    const battleTrack = pickRandomRoguelikeTrack(
      draftRun.wins >= 4 ? 'BOSS' : draftRun.wins >= 2 ? 'ELITE' : 'BATTLE',
      lastBattleTrackId,
    );
    startBattle(
      {
        mode: 'VS_AI',
        p1Name: authUser?.username ?? 'Duelista Draft',
        p2Name: nextOpponent.name,
        p1DeckIds: draftRun.finalDeckIds,
        p2DeckIds: nextOpponent.deckIds,
        firstPlayerId: draftRun.matchesPlayed % 2 === 0 ? 'P1' : 'P2',
        aiDifficulty: nextOpponent.difficulty,
        aiErrorRate: nextOpponent.aiErrorRate,
        draftMatchIndex: draftRun.matchesPlayed,
        p2GuaranteedOpeningCardId: nextOpponent.featuredCardId,
        battleTrackId: battleTrack?.id ?? null,
      },
      settings.hotseatPrivacyScreen,
    );
    setScreen('BATTLE');
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
      <div className="relative z-10 mx-auto max-w-[1040px] space-y-5 px-4">
        {abandonNotice && (
          <div className="flex items-center justify-between border-2 border-[#e6194b] bg-[#2a0c15] px-4 py-2.5 text-xs text-rose-200">
            <span>
              Abandonaste el combate anterior de Arena Draft. Se ha contabilizado automáticamente
              como <strong>1 derrota</strong>.
            </span>
            <button type="button" onClick={() => setAbandonNotice(false)}>
              <X size={14} />
            </button>
          </div>
        )}
        {/* Arena Scoreboard */}
        <div className="jojo-panel flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <div className="font-jojo-heading text-xs tracking-[0.22em] text-[#00e599] uppercase">
              ARENA DRAFT ACTIVA · MAZO DE 46 CARTAS LISTO
            </div>
            <h2 className="font-jojo-display text-3xl text-[#f5efe0] uppercase">
              MARCADOR DE ARENA
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="border-2 border-[#00b87c] bg-[#0b241d] px-4 py-2 text-center">
              <div className="font-mono text-[10px] text-[#00e599] uppercase">Victorias</div>
              <div className="font-jojo-display text-2xl text-white">
                {draftRun.wins} / {DRAFT_MAX_WINS}
              </div>
            </div>
            <div className="border-2 border-[#e6194b] bg-[#2a0c15] px-4 py-2 text-center">
              <div className="font-mono text-[10px] text-[#ff6b8d] uppercase">Derrotas</div>
              <div className="font-jojo-display text-2xl text-white">
                {draftRun.losses} / {DRAFT_MAX_LOSSES}
              </div>
            </div>
          </div>
        </div>

        {/* Next Opponent Card */}
        {nextOpponent && (
          <div className="jojo-panel flex flex-col items-center justify-between gap-5 p-6 sm:flex-row">
            <div className="space-y-2">
              <div className="font-jojo-heading text-xs tracking-[0.22em] text-[#f2c12e] uppercase">
                PRÓXIMO COMBATE · {nextOpponent.subtitle}
              </div>
              <h3 className="font-jojo-display text-3xl text-[#f5efe0] uppercase">
                {nextOpponent.name}
              </h3>
              <p className="text-xs text-zinc-300">
                Gana {DRAFT_MAX_WINS - draftRun.wins} combate(s) más para coronarte Campeón y llevarte{' '}
                <strong>500 Monedas + 2 Sobres Generales</strong>.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleLaunchMatch}
                  className="jojo-btn-primary inline-flex items-center gap-2 px-6 py-3 font-jojo-heading text-sm tracking-widest uppercase"
                >
                  <Swords size={16} /> Lanzar Combate de Arena
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeckModal(true)}
                  className="jojo-btn-ink inline-flex items-center gap-1.5 px-4 py-3 font-jojo-heading text-xs tracking-wider uppercase"
                >
                  <Layers size={14} /> Ver Mi Mazo (46)
                </button>
                <button
                  type="button"
                  onClick={() => setDraftRun({ ...draftRun, status: 'FINISHED' })}
                  className="jojo-btn-crimson px-4 py-3 font-jojo-heading text-xs tracking-wider uppercase"
                >
                  Retirarse y Cobrar
                </button>
              </div>
            </div>

            {getCardById(nextOpponent.featuredCardId) && (
              <div className="shrink-0">
                <CardView
                  card={getCardById(nextOpponent.featuredCardId)!}
                  size="sm"
                  onClick={() => openInspector(nextOpponent.featuredCardId)}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <DraftDeckModal
        open={showDeckModal}
        onClose={() => setShowDeckModal(false)}
        cardIds={deckCounts.ids}
        onInspect={openInspector}
      />
    </div>
  );
}

function DraftDeckModal({
  open,
  onClose,
  cardIds,
  onInspect,
}: {
  open: boolean;
  onClose: () => void;
  cardIds: string[];
  onInspect: (cardId: string) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, number>();
    for (const id of cardIds) map.set(id, (map.get(id) ?? 0) + 1);
    return Array.from(map.entries())
      .map(([id, count]) => ({ card: getCardById(id), count }))
      .filter((x): x is { card: NonNullable<ReturnType<typeof getCardById>>; count: number } =>
        Boolean(x.card),
      );
  }, [cardIds]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
        >
          <motion.div
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 12 }}
            onClick={(e) => e.stopPropagation()}
            className="jojo-panel max-h-[85vh] w-full max-w-4xl space-y-4 overflow-y-auto p-5"
          >
            <div className="flex items-center justify-between border-b-2 border-[#060508] pb-3">
              <h3 className="font-jojo-display text-2xl text-[#f2c12e] uppercase">
                <Trophy size={18} className="mr-1.5 inline" /> Mazo de Arena Draft ({cardIds.length}{' '}
                cartas)
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="jojo-btn-ink flex h-8 w-8 items-center justify-center"
                title="Cerrar"
              >
                <X size={15} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {grouped.map(({ card, count }) => (
                <div
                  key={card.id}
                  onClick={() => onInspect(card.id)}
                  className="cursor-pointer border-2 border-[#060508] bg-[#0e0b14] p-2 text-center transition hover:border-[#f2c12e]"
                >
                  <div className="mx-auto flex justify-center">
                    <CardView card={card} size="sm" />
                  </div>
                  <div className="mt-1.5 truncate text-xs font-bold text-[#f5efe0]">
                    {count > 1 ? `${count}× ` : ''}
                    {card.name}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
