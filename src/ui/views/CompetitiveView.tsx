import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Coins,
  Crown,
  Gift,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Swords,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { pickRandomRoguelikeTrack } from '../../data/battleMusic';
import { PRESET_DECKS } from '../../data/cardRegistry';
import type { BoosterPackDef } from '../../data/progressionData';
import { validateDeck } from '../../services/deckValidator';
import {
  COMPETITIVE_ENTRY_FEE,
  COMPETITIVE_WEEKLY_REWARD_TIERS,
  computeWeeklyRankReward,
  fetchCompetitiveRankings,
  getCompetitiveClaimKey,
  getIsoWeekKey,
  getPreviousIsoWeekKey,
  getWeeklyResetCountdown,
  type CompetitiveLeaderboardEntry,
  type CompetitiveMode,
} from '../../services/competitiveService';
import { onlineService } from '../../services/onlineService';
import type { OpenPackOutcome } from '../../services/progressionService';
import { useAppStore } from '../../store/useAppStore';
import { useBattleStore } from '../../store/useBattleStore';
import { PackOpeningModal } from '../components/shop/PackOpeningModal';

interface PendingWeeklyReward {
  weekKey: string;
  mode: CompetitiveMode;
  rank: number;
  points: number;
  tierLabel: string;
  coins: number;
  packCount: number;
}

export function CompetitiveView() {
  const authUser = useAppStore((s) => s.authUser);
  const progression = useAppStore((s) => s.progression);
  const settings = useAppStore((s) => s.settings);
  const allDecks = useAppStore((s) => s.allDecks);
  const setSelectedDeckId = useAppStore((s) => s.setSelectedDeckId);
  const spendCoins = useAppStore((s) => s.spendCoins);
  const refundCoins = useAppStore((s) => s.refundCoins);
  const claimCompetitiveWeeklyReward = useAppStore((s) => s.claimCompetitiveWeeklyReward);
  const setShowAuthModal = useAppStore((s) => s.setShowAuthModal);
  const setScreen = useAppStore((s) => s.setScreen);

  const startBattle = useBattleStore((s) => s.startBattle);
  const startOnlineBattle = useBattleStore((s) => s.startOnlineBattle);
  const lastBattleTrackId = useBattleStore((s) => s.activeBattleTrackId);

  const currentWeek = useMemo(() => getIsoWeekKey(), []);
  const prevWeek = useMemo(() => getPreviousIsoWeekKey(), []);
  const resetCountdown = useMemo(() => getWeeklyResetCountdown(), []);
  const playerName = authUser?.username ?? 'Duelista';

  const selectedDeck = useMemo(() => {
    return (
      allDecks.find((d) => d.id === settings.selectedDeckId) ??
      allDecks[0] ??
      PRESET_DECKS[0]!
    );
  }, [allDecks, settings.selectedDeckId]);

  const deckValidation = useMemo(() => validateDeck(selectedDeck.cardIds), [selectedDeck]);

  const [aiRankings, setAiRankings] = useState<CompetitiveLeaderboardEntry[]>([]);
  const [pvpRankings, setPvpRankings] = useState<CompetitiveLeaderboardEntry[]>([]);
  const [loadingRankings, setLoadingRankings] = useState(true);
  const [pendingRewards, setPendingRewards] = useState<PendingWeeklyReward[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchingRoomCode, setSearchingRoomCode] = useState<string | null>(null);
  const [rewardPackModal, setRewardPackModal] = useState<{
    pack: BoosterPackDef;
    outcomes: OpenPackOutcome[];
  } | null>(null);

  const searchingRoomRef = useRef<string | null>(null);
  searchingRoomRef.current = searchingRoomCode;

  const refreshAllRankings = useCallback(async () => {
    setLoadingRankings(true);
    try {
      const [aiCur, pvpCur, aiPrev, pvpPrev] = await Promise.all([
        fetchCompetitiveRankings('AI', currentWeek),
        fetchCompetitiveRankings('PVP', currentWeek),
        fetchCompetitiveRankings('AI', prevWeek),
        fetchCompetitiveRankings('PVP', prevWeek),
      ]);
      setAiRankings(aiCur);
      setPvpRankings(pvpCur);

      const claimed = new Set(progression.claimedCompetitiveWeeks ?? []);
      const pending: PendingWeeklyReward[] = [];
      const checkPrev = (mode: CompetitiveMode, entries: CompetitiveLeaderboardEntry[]) => {
        const key = getCompetitiveClaimKey(prevWeek, mode);
        if (claimed.has(key)) return;
        const idx = entries.findIndex(
          (e) => e.username.toLowerCase() === playerName.toLowerCase(),
        );
        if (idx === -1) return;
        const rank = idx + 1;
        const tier = computeWeeklyRankReward(rank);
        if (!tier) return;
        pending.push({
          weekKey: prevWeek,
          mode,
          rank,
          points: entries[idx]!.points,
          tierLabel: tier.label,
          coins: tier.coins,
          packCount: tier.packCount,
        });
      };
      checkPrev('AI', aiPrev);
      checkPrev('PVP', pvpPrev);
      setPendingRewards(pending);
    } finally {
      setLoadingRankings(false);
    }
  }, [currentWeek, prevWeek, playerName, progression.claimedCompetitiveWeeks]);

  useEffect(() => {
    void refreshAllRankings();
  }, [refreshAllRankings]);

  // Poll while waiting for a competitive 1v1 opponent
  useEffect(() => {
    if (!searchingRoomCode) return;
    let active = true;
    const poll = async () => {
      const res = await onlineService.pollRoom(searchingRoomCode);
      if (!active) return;
      if (res.ok && res.room.status === 'PLAYING') {
        setSearchingRoomCode(null);
        const track = pickRandomRoguelikeTrack('ELITE', lastBattleTrackId);
        await startOnlineBattle(res.room, track?.id ?? null, 'PVP');
        setScreen('BATTLE');
      } else if (!res.ok) {
        setSearchingRoomCode(null);
        refundCoins(COMPETITIVE_ENTRY_FEE.PVP);
        setErrorMsg('Se perdió la conexión con la cola competitiva. Se han reembolsado tus monedas.');
      }
    };
    const timer = window.setInterval(() => {
      void poll();
    }, 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [searchingRoomCode, lastBattleTrackId, startOnlineBattle, setScreen, refundCoins]);

  const handleStartCompetitiveAi = () => {
    setErrorMsg(null);
    if (!deckValidation.valid) {
      setErrorMsg('Tu mazo seleccionado no es legal (debe tener 46 cartas válidas).');
      return;
    }
    const fee = COMPETITIVE_ENTRY_FEE.AI;
    if (progression.coins < fee) {
      setErrorMsg(`Necesitas ${fee} Monedas Speedwagon para competir contra la IA.`);
      return;
    }
    if (!spendCoins(fee)) {
      setErrorMsg('Saldo insuficiente.');
      return;
    }

    const oppDeck =
      PRESET_DECKS[Math.floor(Math.random() * PRESET_DECKS.length)] ?? PRESET_DECKS[0]!;
    const track = pickRandomRoguelikeTrack('BOSS', lastBattleTrackId);
    startBattle(
      {
        mode: 'VS_AI',
        p1Name: playerName,
        p2Name: `IA Competitiva · ${oppDeck.name}`,
        p1DeckIds: [...selectedDeck.cardIds],
        p2DeckIds: [...oppDeck.cardIds],
        firstPlayerId: Math.random() < 0.5 ? 'P1' : 'P2',
        aiDifficulty: 'HARD',
        aiErrorRate: 0,
        competitiveMode: 'AI',
        battleTrackId: track?.id ?? null,
      },
      settings.hotseatPrivacyScreen,
    );
    setScreen('BATTLE');
  };

  const handleStartCompetitivePvp = async () => {
    setErrorMsg(null);
    if (!deckValidation.valid) {
      setErrorMsg('Tu mazo seleccionado no es legal (debe tener 46 cartas válidas).');
      return;
    }
    const fee = COMPETITIVE_ENTRY_FEE.PVP;
    if (progression.coins < fee) {
      setErrorMsg(`Necesitas ${fee} Monedas Speedwagon para entrar en Competitivo 1v1.`);
      return;
    }
    if (!spendCoins(fee)) {
      setErrorMsg('Saldo insuficiente.');
      return;
    }

    const res = await onlineService.findPublicMatch(
      playerName,
      [...selectedDeck.cardIds],
      'COMPETITIVE',
    );
    if (!res.ok) {
      refundCoins(fee);
      setErrorMsg(res.error);
      return;
    }

    if (res.room.status === 'PLAYING') {
      const track = pickRandomRoguelikeTrack('ELITE', lastBattleTrackId);
      await startOnlineBattle(res.room, track?.id ?? null, 'PVP');
      setScreen('BATTLE');
    } else {
      setSearchingRoomCode(res.room.roomCode);
    }
  };

  const handleCancelPvpSearch = async () => {
    const code = searchingRoomRef.current;
    setSearchingRoomCode(null);
    if (code) {
      await onlineService.leaveRoom(code);
      refundCoins(COMPETITIVE_ENTRY_FEE.PVP);
    }
  };

  const handleClaimWeeklyReward = (reward: PendingWeeklyReward) => {
    const res = claimCompetitiveWeeklyReward(reward.weekKey, reward.mode, reward.rank);
    if (!res) return;
    setPendingRewards((prev) =>
      prev.filter((r) => !(r.weekKey === reward.weekKey && r.mode === reward.mode)),
    );
    if (res.pack && res.packOutcomes) {
      setRewardPackModal({ pack: res.pack, outcomes: res.packOutcomes });
    }
  };

  return (
    <div
      className="relative min-h-[calc(100vh-56px)] py-8"
      style={{
        backgroundImage: 'url(/assets/patterns/pattern3.png)',
        backgroundSize: '340px',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[#0b090e]/92" />
      <div className="relative z-10 mx-auto max-w-[1360px] space-y-6 px-4">
        {/* HEADER */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#f2c12e]/40 pb-4">
          <div>
            <div className="font-jojo-heading text-xs tracking-[0.26em] text-[#e6194b] uppercase">
              TEMPORADA SEMANAL {currentWeek} · CIERRE EN {resetCountdown}
            </div>
            <h1 className="font-jojo-display text-4xl text-[#f5efe0] uppercase sm:text-5xl">
              LIGA <span className="text-[#f2c12e]">COMPETITIVA</span>
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-zinc-300">
              Inscríbete con <strong>Monedas Speedwagon</strong> y escala en los{' '}
              <strong>dos rankings semanales independientes</strong> (1v1 Online y Contra la IA). Al
              terminar cada semana se reparten grandes premios en Monedas y{' '}
              <strong>Sobres Generales</strong> según tu posición final.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 border-2 border-[#060508] bg-[#1e170a] px-3.5 py-2 font-mono text-xs font-black text-[#f2c12e] shadow-[3px_3px_0_#060508]">
              <Coins size={14} /> {progression.coins.toLocaleString()} Monedas
            </div>
            <button
              type="button"
              onClick={() => void refreshAllRankings()}
              className="jojo-btn-ink inline-flex items-center gap-1.5 px-3 py-2 font-jojo-heading text-xs tracking-wider uppercase"
            >
              <RefreshCw size={13} className={loadingRankings ? 'animate-spin' : ''} /> Actualizar
            </button>
          </div>
        </div>

        {/* GUEST WARNING */}
        {!authUser && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-[#f2c12e]/60 bg-[#21190c] p-3 text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className="shrink-0 text-[#f2c12e]" />
              <span>
                Inicia sesión con tu cuenta para fijar tu nombre único en los rankings semanales y
                asegurar tus recompensas al cierre de la semana.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="jojo-btn-primary px-3 py-1 font-jojo-heading text-xs tracking-wider uppercase"
            >
              Iniciar Sesión
            </button>
          </div>
        )}

        {/* PREVIOUS WEEK CLAIMABLE REWARDS */}
        {pendingRewards.length > 0 && (
          <div className="space-y-2">
            {pendingRewards.map((r) => (
              <div
                key={`${r.weekKey}-${r.mode}`}
                className="flex flex-wrap items-center justify-between gap-3 border-2 border-[#f2c12e] bg-[#241b0a] p-4 shadow-[4px_4px_0_#060508]"
              >
                <div className="space-y-0.5">
                  <div className="inline-flex items-center gap-1.5 font-jojo-heading text-xs tracking-widest text-[#f2c12e] uppercase">
                    <Gift size={14} /> ¡RECOMPENSA SEMANAL DISPONIBLE ({r.weekKey})!
                  </div>
                  <div className="text-sm font-bold text-[#f5efe0]">
                    Ranking {r.mode === 'PVP' ? '1v1 Online' : 'Contra la IA'} — Puesto{' '}
                    <span className="text-[#00e599]">#{r.rank}</span> ({r.points} pts ·{' '}
                    {r.tierLabel})
                  </div>
                  <div className="font-mono text-xs text-amber-200">
                    Premio: +{r.coins} Monedas
                    {r.packCount > 0 ? ` + ${r.packCount}× Sobre General` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleClaimWeeklyReward(r)}
                  className="jojo-btn-primary inline-flex items-center gap-2 px-5 py-2.5 font-jojo-heading text-xs tracking-widest uppercase"
                >
                  <Trophy size={14} /> Reclamar Premio
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ERROR BANNER */}
        {errorMsg && (
          <div className="flex items-center justify-between border-2 border-[#e6194b] bg-[#2c0d16] px-4 py-2.5 text-xs text-rose-200">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* DECK SELECTOR */}
        <div className="jojo-panel flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="font-jojo-heading text-xs tracking-[0.2em] text-[#f2c12e] uppercase">
              MAZO PARA COMPETITIVO (46 CARTAS LEGALES)
            </div>
            <p className="text-[11px] text-zinc-400">
              Se usará tu mazo seleccionado tanto en 1v1 Online como contra la IA Difícil.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedDeck.id}
              onChange={(e) => setSelectedDeckId(e.target.value)}
              className="border-2 border-[#060508] bg-[#0e0b14] px-3 py-2 text-xs font-bold text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
            >
              {allDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.cardIds.length} cartas){d.isPreset ? ' · Oficial' : ''}
                </option>
              ))}
            </select>
            <span
              className={`border px-2 py-1 font-mono text-[10px] font-black uppercase ${
                deckValidation.valid
                  ? 'border-[#00b87c] bg-[#0b241d] text-[#00e599]'
                  : 'border-[#e6194b] bg-[#2a0c15] text-rose-300'
              }`}
            >
              {deckValidation.valid ? 'Mazo Legal' : 'Mazo Inválido'}
            </span>
          </div>
        </div>

        {/* MATCHMAKING WAITING BANNER */}
        {searchingRoomCode && (
          <div className="jojo-panel flex flex-wrap items-center justify-between gap-4 border-2 border-[#00e599] bg-[#0c211c] p-5">
            <div className="flex items-center gap-3">
              <Loader2 size={22} className="animate-spin text-[#00e599]" />
              <div>
                <div className="font-jojo-display text-xl text-[#00e599] uppercase">
                  Buscando rival en Competitivo 1v1...
                </div>
                <div className="font-mono text-xs text-zinc-300">
                  Sala competitiva #{searchingRoomCode} · Tu entrada de {COMPETITIVE_ENTRY_FEE.PVP}{' '}
                  Monedas se reembolsa si cancelas antes de emparejar.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleCancelPvpSearch()}
              className="jojo-btn-crimson px-4 py-2 font-jojo-heading text-xs tracking-wider uppercase"
            >
              Cancelar y Reembolsar ({COMPETITIVE_ENTRY_FEE.PVP} 💰)
            </button>
          </div>
        )}

        {/* TWO COMPETITIVE ENTRY CARDS */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* 1V1 ONLINE COMPETITIVE */}
          <div className="jojo-panel flex flex-col justify-between gap-4 border-2 border-[#00b87c]/60 p-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 border border-[#060508] bg-[#00b87c] px-2.5 py-0.5 font-mono text-[10px] font-black text-[#0b090e] uppercase">
                  <Users size={12} /> RANKING SEMANAL 1V1 ONLINE
                </span>
                <span className="border border-[#f2c12e]/60 bg-[#1e170a] px-2.5 py-0.5 font-mono text-xs font-black text-[#f2c12e]">
                  Entrada: {COMPETITIVE_ENTRY_FEE.PVP} Monedas
                </span>
              </div>
              <h2 className="font-jojo-display text-3xl text-[#f5efe0] uppercase">
                DUELO COMPETITIVO 1V1
              </h2>
              <p className="text-xs text-zinc-300">
                Cola exclusiva 1v1 contra otros jugadores. Victoria: <strong>+40 pts</strong> (hasta
                +55 con racha) · Derrota: <strong>-15 pts</strong> (mín. 0).
              </p>
            </div>

            <button
              type="button"
              disabled={
                Boolean(searchingRoomCode) ||
                !deckValidation.valid ||
                progression.coins < COMPETITIVE_ENTRY_FEE.PVP
              }
              onClick={() => void handleStartCompetitivePvp()}
              className="jojo-btn-primary inline-flex w-full items-center justify-center gap-2 py-3 font-jojo-heading text-sm tracking-widest uppercase disabled:opacity-50"
            >
              <Swords size={16} />{' '}
              {progression.coins < COMPETITIVE_ENTRY_FEE.PVP
                ? `Te faltan ${COMPETITIVE_ENTRY_FEE.PVP - progression.coins} Monedas`
                : `Buscar Rival 1v1 (-${COMPETITIVE_ENTRY_FEE.PVP} Monedas)`}
            </button>
          </div>

          {/* VS AI COMPETITIVE */}
          <div className="jojo-panel flex flex-col justify-between gap-4 border-2 border-[#e6194b]/60 p-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 border border-[#060508] bg-[#e6194b] px-2.5 py-0.5 font-mono text-[10px] font-black text-white uppercase">
                  <Bot size={12} /> RANKING SEMANAL CONTRA LA IA
                </span>
                <span className="border border-[#f2c12e]/60 bg-[#1e170a] px-2.5 py-0.5 font-mono text-xs font-black text-[#f2c12e]">
                  Entrada: {COMPETITIVE_ENTRY_FEE.AI} Monedas
                </span>
              </div>
              <h2 className="font-jojo-display text-3xl text-[#f5efe0] uppercase">
                DESAFÍO COMPETITIVO VS IA
              </h2>
              <p className="text-xs text-zinc-300">
                Enfréntate a la <strong>IA Difícil (0% de error)</strong> con un mazo oficial
                aleatorio. Victoria: <strong>+40 pts</strong> (hasta +55 con racha) · Derrota:{' '}
                <strong>-15 pts</strong>.
              </p>
            </div>

            <button
              type="button"
              disabled={
                Boolean(searchingRoomCode) ||
                !deckValidation.valid ||
                progression.coins < COMPETITIVE_ENTRY_FEE.AI
              }
              onClick={handleStartCompetitiveAi}
              className="jojo-btn-crimson inline-flex w-full items-center justify-center gap-2 py-3 font-jojo-heading text-sm tracking-widest uppercase disabled:opacity-50"
            >
              <Swords size={16} />{' '}
              {progression.coins < COMPETITIVE_ENTRY_FEE.AI
                ? `Te faltan ${COMPETITIVE_ENTRY_FEE.AI - progression.coins} Monedas`
                : `Jugar vs IA Difícil (-${COMPETITIVE_ENTRY_FEE.AI} Monedas)`}
            </button>
          </div>
        </div>

        {/* TWO WEEKLY LEADERBOARDS */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <RankingTable
            title="Ranking Semanal · 1v1 Online"
            accent="text-[#00e599]"
            weekKey={currentWeek}
            entries={pvpRankings}
            currentUsername={playerName}
          />
          <RankingTable
            title="Ranking Semanal · Contra la IA"
            accent="text-[#ff4d79]"
            weekKey={currentWeek}
            entries={aiRankings}
            currentUsername={playerName}
          />
        </div>

        {/* WEEKLY REWARD TIERS */}
        <div className="jojo-panel space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-jojo-heading text-xs tracking-[0.2em] text-[#f2c12e] uppercase">
              <Crown size={14} /> RECOMPENSAS AL FINAL DE CADA SEMANA (EN CADA RANKING)
            </span>
            <span className="font-mono text-[11px] text-zinc-400">
              Se entregan por separado para 1v1 Online y Contra la IA · Reinicio lunes 00:00 UTC
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {COMPETITIVE_WEEKLY_REWARD_TIERS.map((tier, i) => (
              <div
                key={tier.label}
                className={`border-2 p-3 ${
                  i === 0
                    ? 'border-[#f2c12e] bg-[#21190c]'
                    : 'border-[#060508] bg-[#0e0b14]'
                }`}
              >
                <div className="font-jojo-heading text-xs text-[#f5efe0] uppercase">
                  {tier.label}
                </div>
                <div className="mt-1 font-mono text-sm font-black text-[#f2c12e]">
                  +{tier.coins.toLocaleString()} 💰
                </div>
                {tier.packCount > 0 && (
                  <div className="font-mono text-[11px] font-bold text-[#00e599]">
                    + {tier.packCount}× Sobre General
                  </div>
                )}
              </div>
            ))}
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

function RankingTable({
  title,
  accent,
  weekKey,
  entries,
  currentUsername,
}: {
  title: string;
  accent: string;
  weekKey: string;
  entries: CompetitiveLeaderboardEntry[];
  currentUsername: string;
}) {
  return (
    <div className="jojo-panel space-y-3 p-4">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <h3 className={`font-jojo-heading text-sm tracking-widest uppercase ${accent}`}>
          <Trophy size={14} className="mr-1.5 inline" />
          {title}
        </h3>
        <span className="font-mono text-[10px] text-zinc-400">{weekKey}</span>
      </div>

      {entries.length === 0 ? (
        <p className="py-8 text-center text-xs text-zinc-400">
          Todavía no hay combates registrados esta semana. ¡Inaugura el puesto #1!
        </p>
      ) : (
        <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
          {entries.slice(0, 25).map((entry, idx) => {
            const rank = idx + 1;
            const isMe = entry.username.toLowerCase() === currentUsername.toLowerCase();
            return (
              <div
                key={`${entry.username}-${idx}`}
                className={`flex items-center justify-between border px-3 py-2 text-xs ${
                  isMe
                    ? 'border-[#f2c12e] bg-[#21190c]'
                    : 'border-white/5 bg-[#0e0b14]'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <span
                    className={`w-7 font-mono font-black ${
                      rank === 1
                        ? 'text-[#f2c12e]'
                        : rank <= 3
                          ? 'text-[#00e599]'
                          : 'text-zinc-400'
                    }`}
                  >
                    #{rank}
                  </span>
                  <span className="truncate font-bold text-[#f5efe0]">{entry.username}</span>
                  {entry.streak >= 2 && (
                    <span className="border border-orange-400/50 bg-orange-950/60 px-1.5 py-0.5 font-mono text-[9px] font-bold text-orange-300">
                      🔥 {entry.streak}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3 font-mono text-[11px]">
                  <span className="text-zinc-400">
                    {entry.wins}V-{entry.losses}D
                  </span>
                  <span className="font-black text-[#f2c12e]">{entry.points} pts</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
