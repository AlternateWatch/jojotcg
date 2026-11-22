import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Copy,
  Eye,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  Search,
  ShoppingBag,
  Users,
  X,
} from 'lucide-react';
import { getCardById } from '../../data/cardRegistry';
import { STARTER_DECK_ID } from '../../data/progressionData';
import { ENERGY_META, type EnergyType } from '../../data/schemas/cardTypes';
import type { AiDifficulty } from '../../engine/ai/tacticalAi';
import { validateDeck } from '../../services/deckValidator';
import { onlineService, type OnlineRoomSnapshot } from '../../services/onlineService';
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
  const authUser = useAppStore((s) => s.authUser);
  const setHotseatPrivacyScreen = useAppStore((s) => s.setHotseatPrivacyScreen);
  const setAiDifficulty = useAppStore((s) => s.setAiDifficulty);
  const setSelectedDeckId = useAppStore((s) => s.setSelectedDeckId);
  const setSelectedOpponentDeckId = useAppStore((s) => s.setSelectedOpponentDeckId);
  const setScreen = useAppStore((s) => s.setScreen);
  const startBattle = useBattleStore((s) => s.startBattle);
  const startOnlineBattle = useBattleStore((s) => s.startOnlineBattle);
  const startSpectatorBattle = useBattleStore((s) => s.startSpectatorBattle);

  const [mode, setMode] = useState<BattleMode>(preferredMode);
  const [p1Name, setP1Name] = useState(authUser?.username ?? 'Jotaro (J1)');
  const [p2Name, setP2Name] = useState(preferredMode === 'VS_AI' ? 'IA Bizarra' : 'DIO (J2)');
  const defaultP1DeckId =
    allDecks.find((d) => d.id === STARTER_DECK_ID)?.id ?? allDecks[0]?.id ?? '';
  const defaultP2DeckId =
    allDecks.find((d) => d.id === 'preset-dio-pillar-men')?.id ??
    allDecks[1]?.id ??
    allDecks[0]?.id ??
    '';
  const preferredP1DeckId = preselectedDeckId ?? settings.selectedDeckId;
  const p1DeckId =
    preferredP1DeckId && allDecks.some((d) => d.id === preferredP1DeckId)
      ? preferredP1DeckId
      : defaultP1DeckId;
  const p2DeckId =
    settings.selectedOpponentDeckId &&
    allDecks.some((d) => d.id === settings.selectedOpponentDeckId)
      ? settings.selectedOpponentDeckId
      : defaultP2DeckId;
  const [starter, setStarter] = useState<'P1' | 'P2' | 'RANDOM'>('P1');

  // Online Lobby State
  const [waitingRoom, setWaitingRoom] = useState<OnlineRoomSnapshot | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [spectateCodeInput, setSpectateCodeInput] = useState('');
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    if (authUser?.username) {
      setP1Name(authUser.username);
    }
  }, [authUser?.username]);

  const p1Deck = allDecks.find((d) => d.id === p1DeckId);
  const p2Deck = allDecks.find((d) => d.id === p2DeckId);

  const p1Val = useMemo(() => (p1Deck ? validateDeck(p1Deck.cardIds) : null), [p1Deck]);
  const p2Val = useMemo(() => (p2Deck ? validateDeck(p2Deck.cardIds) : null), [p2Deck]);
  const p1Missing = useMemo(
    () => (p1Deck ? getMissingCardsForDeck(progression, p1Deck.cardIds) : []),
    [progression, p1Deck],
  );

  const canUseP1Deck = Boolean(p1Deck && p1Val?.valid && p1Missing.length === 0);
  const canStartLocal = Boolean(canUseP1Deck && p2Deck && p2Val?.valid);

  // Poll waiting online room until an opponent joins
  useEffect(() => {
    if (!waitingRoom || waitingRoom.status !== 'WAITING') return;
    let cancelled = false;

    const timer = window.setInterval(async () => {
      const res = await onlineService.pollRoom(waitingRoom.roomCode);
      if (cancelled) return;
      if (!res.ok) {
        setOnlineError(res.error);
        setWaitingRoom(null);
        return;
      }
      if (res.room.status === 'PLAYING' && res.room.p1 && res.room.p2) {
        cancelled = true;
        window.clearInterval(timer);
        await startOnlineBattle(res.room);
        setWaitingRoom(null);
        setScreen('BATTLE');
      }
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [waitingRoom, startOnlineBattle, setScreen]);

  const cancelOnlineWaiting = async () => {
    if (waitingRoom) {
      await onlineService.leaveRoom(waitingRoom.roomCode);
    }
    setWaitingRoom(null);
    setOnlineError(null);
  };

  const handleModeChange = (next: BattleMode) => {
    if (waitingRoom) {
      void cancelOnlineWaiting();
    }
    setMode(next);
    setOnlineError(null);
    if (next === 'VS_AI') setP2Name('IA Bizarra');
    else if (next === 'HOTSEAT') setP2Name('Jugador 2');
  };

  const handleLaunchLocal = () => {
    if (!p1Deck || !p2Deck || !canStartLocal || mode === 'ONLINE') return;
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

  const handleFindPublicMatch = async () => {
    if (!p1Deck || !canUseP1Deck) return;
    setOnlineError(null);
    setOnlineBusy(true);
    const res = await onlineService.findPublicMatch(
      p1Name.trim() || 'Jugador',
      p1Deck.cardIds,
    );
    setOnlineBusy(false);
    if (!res.ok) {
      setOnlineError(res.error);
      return;
    }
    if (res.room.status === 'PLAYING' && res.room.p1 && res.room.p2) {
      await startOnlineBattle(res.room);
      setScreen('BATTLE');
    } else {
      setWaitingRoom(res.room);
    }
  };

  const handleCreatePrivateRoom = async () => {
    if (!p1Deck || !canUseP1Deck) return;
    setOnlineError(null);
    setOnlineBusy(true);
    const res = await onlineService.createPrivateRoom(
      p1Name.trim() || 'Jugador 1',
      p1Deck.cardIds,
    );
    setOnlineBusy(false);
    if (!res.ok) {
      setOnlineError(res.error);
      return;
    }
    setWaitingRoom(res.room);
  };

  const handleJoinPrivateRoom = async () => {
    if (!p1Deck || !canUseP1Deck) return;
    const code = joinCodeInput.trim().toUpperCase();
    if (code.length < 4) {
      setOnlineError('Introduce un código de sala válido.');
      return;
    }
    setOnlineError(null);
    setOnlineBusy(true);
    const res = await onlineService.joinPrivateRoom(
      code,
      p1Name.trim() || 'Jugador 2',
      p1Deck.cardIds,
    );
    setOnlineBusy(false);
    if (!res.ok) {
      setOnlineError(res.error);
      return;
    }
    await startOnlineBattle(res.room);
    setScreen('BATTLE');
  };

  const handleSpectateRoom = async () => {
    const code = spectateCodeInput.trim().toUpperCase();
    if (code.length < 4) {
      setOnlineError('Introduce el código de la sala que quieres ver.');
      return;
    }
    setOnlineError(null);
    setOnlineBusy(true);
    const res = await onlineService.spectateRoom(code, p1Name.trim() || 'Espectador');
    setOnlineBusy(false);
    if (!res.ok) {
      setOnlineError(res.error);
      return;
    }
    startSpectatorBattle(res.room);
    setScreen('BATTLE');
  };

  const copyRoomCode = (code: string) => {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(code);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 2000);
    }
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

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleModeChange('ONLINE')}
              className={`-skew-x-10 px-4 py-2 font-jojo-heading text-sm tracking-widest uppercase ${
                mode === 'ONLINE'
                  ? 'border-2 border-[#060508] bg-[#00b87c] text-[#0b090e] shadow-[4px_4px_0_#060508]'
                  : 'jojo-btn-ink text-zinc-400'
              }`}
            >
              <span className="inline-flex skew-x-10 items-center gap-1.5">
                <Globe size={14} /> 1v1 Online
              </span>
            </button>
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
          {/* Center VS Medallion */}
          <motion.div
            initial={{ scale: 2.1, opacity: 0, rotate: -22 }}
            animate={{ scale: 1, opacity: 1, rotate: -6 }}
            transition={{ delay: 0.14, type: 'spring', stiffness: 420, damping: 20 }}
            className="pointer-events-none absolute top-1/2 left-1/2 z-20 hidden -translate-x-1/2 -translate-y-1/2 border-[3px] border-[#060508] bg-[#e6194b] px-3 py-1 font-jojo-display text-2xl text-white shadow-[4px_4px_0_#060508] md:block"
          >
            VS
          </motion.div>

          {/* LEFT PANEL: YOUR PLAYER & DECK */}
          <motion.div
            initial={{ opacity: 0, x: -34 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="jojo-panel flex flex-col justify-between p-5"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="-skew-x-8 border-2 border-[#060508] bg-[#f2c12e] px-3 py-0.5 font-jojo-heading text-sm tracking-widest text-[#0b090e] uppercase shadow-[2px_2px_0_#060508]">
                  <span className="inline-block skew-x-8">TU PERFIL Y BARAJA</span>
                </span>
                {p1Val && (
                  <span
                    className={`border border-[#060508] px-2 py-0.5 font-mono text-[11px] font-bold uppercase ${
                      p1Val.valid ? 'bg-[#00b87c] text-[#0b090e]' : 'bg-[#e6194b] text-white'
                    }`}
                  >
                    {p1Val.valid ? 'LEGAL 46/46' : 'INVÁLIDO'}
                  </span>
                )}
              </div>

              <div>
                <label className="font-jojo-heading text-xs tracking-widest text-zinc-400 uppercase">
                  Tu Nombre en Combate
                </label>
                <input
                  type="text"
                  disabled={Boolean(waitingRoom)}
                  value={p1Name}
                  onChange={(e) => setP1Name(e.target.value)}
                  className="mt-1 w-full border-2 border-[#060508] bg-[#0e0b14] px-3 py-2 text-sm font-bold text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none disabled:opacity-50"
                />
              </div>

              <div>
                <label className="font-jojo-heading text-xs tracking-widest text-zinc-400 uppercase">
                  Tu Baraja
                </label>
                <select
                  disabled={Boolean(waitingRoom)}
                  value={p1DeckId}
                  onChange={(e) => setSelectedDeckId(e.target.value)}
                  className="mt-1 w-full border-2 border-[#060508] bg-[#0e0b14] px-3 py-2.5 text-sm font-semibold text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none disabled:opacity-50"
                >
                  {allDecks.map((d) => {
                    const missingCount = getMissingCardsForDeck(progression, d.cardIds).length;
                    return (
                      <option key={d.id} value={d.id}>
                        {missingCount > 0 ? '🔒 ' : d.isPreset ? '★ ' : '♦ '}
                        {d.name} ({d.cardIds.length})
                        {missingCount > 0 ? ` — Faltan ${missingCount}` : ''}
                      </option>
                    );
                  })}
                </select>
                {p1Deck?.description && (
                  <p className="mt-1.5 text-xs text-zinc-400">{p1Deck.description}</p>
                )}
                {p1Missing.length > 0 && (
                  <div className="mt-2 space-y-1.5 border-l-4 border-[#e6194b] bg-[#2a0c16] px-2.5 py-2 text-xs text-rose-200">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5">
                        <Lock size={13} /> Te faltan <strong>{p1Missing.length}</strong> carta(s) para
                        jugar este mazo.
                      </span>
                      <button
                        type="button"
                        onClick={() => setScreen('SHOP')}
                        className="jojo-btn-primary inline-flex items-center gap-1 px-2.5 py-1 font-jojo-heading text-[11px] tracking-wider uppercase"
                      >
                        <ShoppingBag size={12} /> Abrir Sobres
                      </button>
                    </div>
                    <div className="text-[11px] text-rose-300">
                      {p1Missing
                        .map((m) => {
                          const c = getCardById(m.cardId);
                          return `${c?.name ?? m.cardId} (${m.owned}/${m.needed})`;
                        })
                        .join(' · ')}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {p1Val && (
              <div className="mt-4 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(Object.entries(p1Val.stats.byEnergy) as [EnergyType, number][])
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
                    ['PERS', p1Val.stats.byType.CHARACTER, 'text-[#f2c12e]'],
                    ['STAND', p1Val.stats.byType.STAND, 'text-[#e6194b]'],
                    ['EVO', p1Val.stats.byType.EVOLUTION, 'text-yellow-300'],
                    ['OBJ', p1Val.stats.byType.ITEM, 'text-[#00b87c]'],
                    ['ENER', p1Val.stats.byType.ENERGY, 'text-[#f5efe0]'],
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

          {/* RIGHT PANEL: ONLINE LOBBY OR AI/LOCAL RIVAL */}
          {mode === 'ONLINE' ? (
            <motion.div
              key="online-lobby-panel"
              initial={{ opacity: 0, x: 34 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="jojo-panel flex flex-col justify-between p-5"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="-skew-x-8 border-2 border-[#060508] bg-[#00b87c] px-3 py-0.5 font-jojo-heading text-sm tracking-widest text-[#0b090e] uppercase shadow-[2px_2px_0_#060508]">
                    <span className="inline-flex skew-x-8 items-center gap-1.5">
                      <Globe size={14} /> LOBBY MULTIJUGADOR ONLINE
                    </span>
                  </span>
                  <span className="border border-[#060508] bg-[#1c1626] px-2 py-0.5 font-mono text-[10px] font-bold text-[#f2c12e] uppercase">
                    VICTORIA: +300 🪙
                  </span>
                </div>

                {waitingRoom ? (
                  <div className="space-y-4 border-2 border-[#f2c12e] bg-[#0e0b14] p-5 text-center">
                    <div className="flex items-center justify-center gap-2 text-[#f2c12e]">
                      <Loader2 size={20} className="animate-spin" />
                      <span className="font-jojo-display text-2xl uppercase">
                        {waitingRoom.isPrivate
                          ? 'SALA PRIVADA CREADA'
                          : 'BUSCANDO RIVAL ONLINE...'}
                      </span>
                    </div>

                    {waitingRoom.isPrivate ? (
                      <div className="space-y-2">
                        <p className="text-xs text-zinc-300">
                          Comparte este código con tu amigo para que se una a la partida:
                        </p>
                        <div className="flex items-center justify-center gap-2">
                          <span className="border-2 border-[#060508] bg-[#f2c12e] px-5 py-2 font-mono text-2xl font-black tracking-[0.25em] text-[#0b090e] shadow-[4px_4px_0_#060508]">
                            {waitingRoom.roomCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyRoomCode(waitingRoom.roomCode)}
                            className="jojo-btn-ink inline-flex items-center gap-1 px-3 py-2.5 font-jojo-heading text-xs tracking-wider uppercase"
                          >
                            <Copy size={14} /> {codeCopied ? '¡Copiado!' : 'Copiar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-300">
                        En cuanto otro jugador pulse <strong>Buscar Partida</strong>, el combate
                        comenzará automáticamente.
                      </p>
                    )}

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={cancelOnlineWaiting}
                        className="jojo-btn-crimson inline-flex items-center gap-1.5 px-5 py-2 font-jojo-heading text-xs tracking-widest uppercase"
                      >
                        <X size={14} /> Cancelar Espera
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Option 1: Public Matchmaking */}
                    <div className="border-2 border-[#060508] bg-[#0e0b14] p-4 space-y-2.5">
                      <div className="flex items-center gap-2 font-jojo-heading text-sm tracking-wider text-[#00e599] uppercase">
                        <Search size={15} /> Emparejamiento Rápido (1v1 Público)
                      </div>
                      <p className="text-xs text-zinc-400">
                        Busca a otro jugador que esté buscando partida ahora mismo y os empareja
                        automáticamente.
                      </p>
                      <button
                        type="button"
                        disabled={!canUseP1Deck || onlineBusy}
                        onClick={handleFindPublicMatch}
                        className="jojo-btn-primary w-full inline-flex items-center justify-center gap-2 py-2.5 font-jojo-heading text-base tracking-[0.14em] uppercase disabled:opacity-35"
                      >
                        <Users size={16} /> Buscar Partida Online
                      </button>
                    </div>

                    {/* Option 2: Private Room by Code */}
                    <div className="border-2 border-[#060508] bg-[#0e0b14] p-4 space-y-3">
                      <div className="flex items-center gap-2 font-jojo-heading text-sm tracking-wider text-[#f2c12e] uppercase">
                        <KeyRound size={15} /> Partida Privada por Código
                      </div>
                      <p className="text-xs text-zinc-400">
                        Crea una sala privada para obtener un código de 6 letras o introduce el
                        código de tu rival.
                      </p>

                      <button
                        type="button"
                        disabled={!canUseP1Deck || onlineBusy}
                        onClick={handleCreatePrivateRoom}
                        className="jojo-btn-ink w-full py-2 font-jojo-heading text-sm tracking-widest text-[#f2c12e] uppercase disabled:opacity-35"
                      >
                        + Crear Sala Privada
                      </button>

                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          maxLength={8}
                          value={joinCodeInput}
                          onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                          placeholder="CÓDIGO (ej. KQ8Z4M)"
                          className="flex-1 border-2 border-[#060508] bg-[#14101c] px-3 py-2 font-mono text-sm font-black tracking-widest text-[#f5efe0] uppercase focus:border-[#f2c12e] focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={!canUseP1Deck || onlineBusy || joinCodeInput.trim().length < 4}
                          onClick={handleJoinPrivateRoom}
                          className="jojo-btn-crimson px-5 py-2 font-jojo-heading text-sm tracking-widest uppercase disabled:opacity-35"
                        >
                          Unirse
                        </button>
                      </div>
                    </div>

                    {/* Option 3: Spectator Mode */}
                    <div className="border-2 border-[#060508] bg-[#0e0b14] p-4 space-y-2.5">
                      <div className="flex items-center gap-2 font-jojo-heading text-sm tracking-wider text-[#00e599] uppercase">
                        <Eye size={15} /> Modo Espectador (Ver Partida en Vivo)
                      </div>
                      <p className="text-xs text-zinc-400">
                        Introduce el código de cualquier sala online activa para ver el combate en
                        directo, incluyendo las manos de ambos jugadores y el chat.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={8}
                          value={spectateCodeInput}
                          onChange={(e) => setSpectateCodeInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && spectateCodeInput.trim().length >= 4 && !onlineBusy) {
                              void handleSpectateRoom();
                            }
                          }}
                          placeholder="CÓDIGO DE SALA"
                          className="flex-1 border-2 border-[#060508] bg-[#14101c] px-3 py-2 font-mono text-sm font-black tracking-widest text-[#f5efe0] uppercase focus:border-[#00e599] focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={onlineBusy || spectateCodeInput.trim().length < 4}
                          onClick={handleSpectateRoom}
                          className="jojo-btn-ink inline-flex items-center gap-1.5 border-[#00b87c] px-4 py-2 font-jojo-heading text-sm tracking-widest text-[#00e599] uppercase disabled:opacity-35"
                        >
                          <Eye size={15} /> Ver
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {onlineError && (
                  <div className="border-l-4 border-[#e6194b] bg-[#2a0c16] px-3 py-2 text-xs font-bold text-rose-200">
                    {onlineError}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: 34 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="jojo-panel flex flex-col justify-between p-5"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="-skew-x-8 border-2 border-[#060508] bg-[#e6194b] px-3 py-0.5 font-jojo-heading text-sm tracking-widest text-white uppercase shadow-[2px_2px_0_#060508]">
                    <span className="inline-block skew-x-8">
                      {mode === 'VS_AI' ? 'RIVAL — IA TÁCTICA' : 'JUGADOR 2'}
                    </span>
                  </span>
                  {p2Val && (
                    <span
                      className={`border border-[#060508] px-2 py-0.5 font-mono text-[11px] font-bold uppercase ${
                        p2Val.valid ? 'bg-[#00b87c] text-[#0b090e]' : 'bg-[#e6194b] text-white'
                      }`}
                    >
                      {p2Val.valid ? 'LEGAL 46/46' : 'INVÁLIDO'}
                    </span>
                  )}
                </div>

                <div>
                  <label className="font-jojo-heading text-xs tracking-widest text-zinc-400 uppercase">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={p2Name}
                    onChange={(e) => setP2Name(e.target.value)}
                    className="mt-1 w-full border-2 border-[#060508] bg-[#0e0b14] px-3 py-2 text-sm font-bold text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-jojo-heading text-xs tracking-widest text-zinc-400 uppercase">
                    Baraja
                  </label>
                  <select
                    value={p2DeckId}
                    onChange={(e) => setSelectedOpponentDeckId(e.target.value)}
                    className="mt-1 w-full border-2 border-[#060508] bg-[#0e0b14] px-3 py-2.5 text-sm font-semibold text-[#f5efe0] focus:border-[#f2c12e] focus:outline-none"
                  >
                    {allDecks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.isPreset ? '★ ' : '♦ '}
                        {d.name} ({d.cardIds.length})
                      </option>
                    ))}
                  </select>
                  {p2Deck?.description && (
                    <p className="mt-1.5 text-xs text-zinc-400">{p2Deck.description}</p>
                  )}
                </div>
              </div>

              {p2Val && (
                <div className="mt-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(Object.entries(p2Val.stats.byEnergy) as [EnergyType, number][])
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
                      ['PERS', p2Val.stats.byType.CHARACTER, 'text-[#f2c12e]'],
                      ['STAND', p2Val.stats.byType.STAND, 'text-[#e6194b]'],
                      ['EVO', p2Val.stats.byType.EVOLUTION, 'text-yellow-300'],
                      ['OBJ', p2Val.stats.byType.ITEM, 'text-[#00b87c]'],
                      ['ENER', p2Val.stats.byType.ENERGY, 'text-[#f5efe0]'],
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
          )}
        </div>

        {/* Bottom Launch Bar for VS_AI and HOTSEAT */}
        {mode !== 'ONLINE' && (
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
              disabled={!canStartLocal}
              onClick={handleLaunchLocal}
              className="jojo-btn-primary inline-flex items-center gap-2 px-8 py-3 font-jojo-heading text-xl tracking-[0.16em] uppercase disabled:opacity-35"
            >
              Comenzar Duelo <ArrowRight size={20} />
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
