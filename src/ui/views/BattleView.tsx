import { lazy, Suspense, useEffect, useState } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import {
  AlertCircle,
  BookOpen,
  Eye,
  Flag,
  Gauge,
  LogOut,
  Palette,
  Pause,
  Play,
  ScrollText,
  Sparkles,
  Swords,
} from 'lucide-react';
import { getCampaignStageById } from '../../data/campaignData';
import { getCardById } from '../../data/cardRegistry';
import { validateAction } from '../../engine/gameEngine';
import {
  getEffectiveCharacterProfile,
  getMaxEnergyAttachmentsThisTurn,
  getMaxPlayableCharacterDg,
} from '../../engine/helpers/cardStats';
import { getOpponentId } from '../../engine/helpers/stateHelpers';
import type { GamePhase } from '../../engine/types/state';
import { CARD_BACK_PATTERN_URL, PLAYMAT_THEMES } from '../../services/assetResolver';
import { onlineService } from '../../services/onlineService';
import { computeBattleReward } from '../../services/progressionService';
import type { PlaymatThemeId, UserSettings } from '../../services/storageService';
import { useAppStore } from '../../store/useAppStore';
import {
  getControllingPlayerId,
  getNextActingPlayer,
  useBattleStore,
} from '../../store/useBattleStore';
import { BattleEffectsOverlay } from '../components/battlefield/BattleEffectsOverlay';
import { BattleModals } from '../components/battlefield/BattleModals';
import { CharacterSlot } from '../components/battlefield/CharacterSlot';
import { CoinFlipOverlay } from '../components/battlefield/CoinFlipOverlay';
import { CombatLog } from '../components/battlefield/CombatLog';
import { CombatMovePlates } from '../components/battlefield/CombatMovePlates';
import { HandActionRibbon } from '../components/battlefield/HandActionRibbon';
import { LiveActionFeed } from '../components/battlefield/LiveActionFeed';
import { PhysicalDeckPiles } from '../components/battlefield/PhysicalDeckPiles';
import { PileViewerModal } from '../components/battlefield/PileViewerModal';
import { PromptOverlay } from '../components/battlefield/PromptOverlay';
import { TurnSplashOverlay } from '../components/battlefield/TurnSplashOverlay';
import { CardView } from '../components/cards/CardView';
import { RulesModal } from '../components/common/RulesModal';
import { PackOpeningModal } from '../components/shop/PackOpeningModal';

const ThreeCombatCanvas = lazy(() =>
  import('../vfx/ThreeCombatCanvas').then((m) => ({ default: m.ThreeCombatCanvas })),
);

const PHASE_STEPS: { phase: GamePhase; label: string }[] = [
  { phase: 'DRAW', label: 'ROBO' },
  { phase: 'PREPARATION', label: 'PREP' },
  { phase: 'COMBAT', label: 'COMBATE' },
  { phase: 'END_TURN', label: 'FIN' },
];

const AI_SPEED_MS: Record<UserSettings['animationSpeed'], number> = {
  slow: 1950,
  normal: 1300,
  fast: 680,
};

const SPEED_LABELS: Record<UserSettings['animationSpeed'], string> = {
  slow: 'Lento',
  normal: 'Normal',
  fast: 'Rápido',
};

const SPEED_ORDER: UserSettings['animationSpeed'][] = ['slow', 'normal', 'fast'];

export function BattleView() {
  const gameState = useBattleStore((s) => s.gameState);
  const mode = useBattleStore((s) => s.mode);
  const aiDifficulty = useBattleStore((s) => s.aiDifficulty);
  const dispatch = useBattleStore((s) => s.dispatch);
  const stepAiIfNeeded = useBattleStore((s) => s.stepAiIfNeeded);
  const coinShowcase = useBattleStore((s) => s.coinShowcase);
  const dismissCoinShowcase = useBattleStore((s) => s.dismissCoinShowcase);
  const impactBanner = useBattleStore((s) => s.impactBanner);
  const clearImpactBanner = useBattleStore((s) => s.clearImpactBanner);
  const vfxCue = useBattleStore((s) => s.vfxCue);
  const cardPopups = useBattleStore((s) => s.cardPopups);
  const clearCardPopups = useBattleStore((s) => s.clearCardPopups);
  const attackingPlayerId = useBattleStore((s) => s.attackingPlayerId);
  const clearAttackingPlayer = useBattleStore((s) => s.clearAttackingPlayer);
  const turnSplash = useBattleStore((s) => s.turnSplash);
  const clearTurnSplash = useBattleStore((s) => s.clearTurnSplash);
  const recentTicker = useBattleStore((s) => s.recentTicker);
  const aiPaused = useBattleStore((s) => s.aiPaused);
  const toggleAiPaused = useBattleStore((s) => s.toggleAiPaused);
  const extraAiDelayMs = useBattleStore((s) => s.extraAiDelayMs);
  const hotseatHandoffTo = useBattleStore((s) => s.hotseatHandoffTo);
  const confirmHotseatHandoff = useBattleStore((s) => s.confirmHotseatHandoff);
  const lastError = useBattleStore((s) => s.lastError);
  const clearError = useBattleStore((s) => s.clearError);
  const selectedHandIndex = useBattleStore((s) => s.selectedHandIndex);
  const setSelectedHandIndex = useBattleStore((s) => s.setSelectedHandIndex);
  const rematch = useBattleStore((s) => s.rematch);
  const resetBattle = useBattleStore((s) => s.resetBattle);
  const battleRewardClaimed = useBattleStore((s) => s.battleRewardClaimed);
  const lastBattleReward = useBattleStore((s) => s.lastBattleReward);
  const claimBattleReward = useBattleStore((s) => s.claimBattleReward);
  const activeCampaignStageId = useBattleStore((s) => s.activeCampaignStageId);
  const campaignPackReward = useBattleStore((s) => s.campaignPackReward);
  const setCampaignPackReward = useBattleStore((s) => s.setCampaignPackReward);
  const onlineRoomCode = useBattleStore((s) => s.onlineRoomCode);
  const onlineRole = useBattleStore((s) => s.onlineRole);
  const applyRemoteOnlineRoom = useBattleStore((s) => s.applyRemoteOnlineRoom);

  const settings = useAppStore((s) => s.settings);
  const awardBattleReward = useAppStore((s) => s.awardBattleReward);
  const completeCampaignStage = useAppStore((s) => s.completeCampaignStage);
  const setPlaymatTheme = useAppStore((s) => s.setPlaymatTheme);
  const setAnimationSpeed = useAppStore((s) => s.setAnimationSpeed);
  const setEnable3dVfx = useAppStore((s) => s.setEnable3dVfx);
  const setSelectedCampaignPart = useAppStore((s) => s.setSelectedCampaignPart);
  const setScreen = useAppStore((s) => s.setScreen);

  const [showLog, setShowLog] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showCampaignPacks, setShowCampaignPacks] = useState(false);
  const [pileModal, setPileModal] = useState<{ title: string; cardIds: string[] } | null>(null);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const tabletopControls = useAnimationControls();

  // Tactile tabletop screen-shake on heavy impacts, KO, Time Stop & Evolution
  useEffect(() => {
    if (!impactBanner) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    let amp = 0;
    if (impactBanner.kind === 'KO') amp = 11;
    else if (impactBanner.kind === 'TIME_STOP') amp = 9;
    else if (impactBanner.kind === 'EVOLUTION') amp = 7;
    else if (impactBanner.kind === 'DAMAGE') {
      const m = impactBanner.headline.match(/(\d+)/);
      const dmg = m ? Number.parseInt(m[1]!, 10) : 0;
      amp = dmg >= 70 ? 9 : dmg >= 40 ? 5 : 3;
    }
    if (amp <= 0) return;

    void tabletopControls.start({
      x: [0, -amp, amp, -amp * 0.65, amp * 0.45, -amp * 0.2, 0],
      y: [0, amp * 0.45, -amp * 0.4, amp * 0.25, 0],
      transition: { duration: 0.34, ease: 'easeOut' },
    });
  }, [impactBanner, tabletopControls]);

  // Readable, speed-configurable AI turn pacing (pauses during coin showcase or user pause)
  useEffect(() => {
    if (!gameState || mode !== 'VS_AI' || gameState.phase === 'GAME_OVER' || coinShowcase || aiPaused) {
      return;
    }
    const actor = getNextActingPlayer(gameState);
    if (!actor || !gameState.players[actor].isAi) return;

    const baseMs = AI_SPEED_MS[settings.animationSpeed] ?? 1300;
    const totalDelay = baseMs + extraAiDelayMs;

    const timer = window.setTimeout(() => {
      stepAiIfNeeded();
    }, totalDelay);

    return () => window.clearTimeout(timer);
  }, [gameState, mode, coinShowcase, aiPaused, settings.animationSpeed, extraAiDelayMs, stepAiIfNeeded]);

  // Award coins / campaign one-time pickup rewards exactly once when a battle finishes
  useEffect(() => {
    if (!gameState || gameState.phase !== 'GAME_OVER' || !gameState.winnerId || battleRewardClaimed) {
      return;
    }
    const localPlayerId = mode === 'ONLINE' && onlineRole ? onlineRole : 'P1';
    const didWin = gameState.winnerId === localPlayerId;

    if (activeCampaignStageId) {
      const stage = getCampaignStageById(activeCampaignStageId);
      if (didWin && stage) {
        const res = completeCampaignStage(activeCampaignStageId);
        if (res?.firstClear) {
          claimBattleReward({
            coins: res.coinsAwarded,
            label: `Campaña Nivel ${stage.stageNumber} completado (1.ª vez)${
              res.packOutcomes ? ` + ${res.packOutcomes.length} sobre(s)` : ''
            }`,
          });
          if (res.pack && res.packOutcomes) {
            setCampaignPackReward({ pack: res.pack, outcomes: res.packOutcomes });
          }
        } else {
          claimBattleReward({
            coins: 0,
            label: `Nivel ${stage.stageNumber} completado · Recompensa única ya recogida`,
          });
        }
      } else {
        const lossReward = computeBattleReward('VS_AI', aiDifficulty, false);
        awardBattleReward(lossReward.coins, false);
        claimBattleReward(lossReward);
      }
    } else {
      const reward = computeBattleReward(mode, aiDifficulty, didWin);
      awardBattleReward(reward.coins, didWin);
      claimBattleReward(reward);
    }

    if (mode !== 'ONLINE') {
      void fetch('/api/matches/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: activeCampaignStageId ? `CAMPAIGN_${activeCampaignStageId}` : mode,
          p1Name: gameState.players.P1.name,
          p2Name: gameState.players.P2.name,
          winnerId: gameState.winnerId,
          winnerName: gameState.players[gameState.winnerId].name,
          winReason: gameState.winReason,
          turnNumber: gameState.turnNumber,
          p1DeckRemaining: gameState.players.P1.deck.length,
          p2DeckRemaining: gameState.players.P2.deck.length,
          p1HandCount: gameState.players.P1.hand.length,
          p2HandCount: gameState.players.P2.hand.length,
          eventLog: gameState.eventLog.slice(-40),
        }),
      }).catch(() => undefined);
    }
  }, [
    gameState,
    mode,
    onlineRole,
    aiDifficulty,
    activeCampaignStageId,
    battleRewardClaimed,
    awardBattleReward,
    completeCampaignStage,
    claimBattleReward,
    setCampaignPackReward,
  ]);

  // Live polling synchronization for ONLINE 1v1 matches
  useEffect(() => {
    if (mode !== 'ONLINE' || !onlineRoomCode) return;
    let cancelled = false;
    const poll = async () => {
      const res = await onlineService.pollRoom(onlineRoomCode);
      if (!cancelled && res.ok) {
        applyRemoteOnlineRoom(res.room);
      }
    };
    const interval = window.setInterval(() => {
      void poll();
    }, 900);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [mode, onlineRoomCode, applyRemoteOnlineRoom]);

  // Auto-clear floating per-card damage/status popups after readable window
  useEffect(() => {
    if (cardPopups.length === 0) return;
    const timer = window.setTimeout(clearCardPopups, 2000);
    return () => window.clearTimeout(timer);
  }, [cardPopups, clearCardPopups]);

  // Reset attack lunge flag after lunge finishes
  useEffect(() => {
    if (!attackingPlayerId) return;
    const timer = window.setTimeout(clearAttackingPlayer, 500);
    return () => window.clearTimeout(timer);
  }, [attackingPlayerId, clearAttackingPlayer]);

  // Auto-dismiss error toasts
  useEffect(() => {
    if (!lastError) return;
    const t = window.setTimeout(() => clearError(), 4000);
    return () => window.clearTimeout(t);
  }, [lastError, clearError]);

  // Keyboard accessibility: Escape closes overlays & hand selection
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (coinShowcase) dismissCoinShowcase();
      else if (pileModal) setPileModal(null);
      else if (showThemePicker) setShowThemePicker(false);
      else if (selectedHandIndex !== null) setSelectedHandIndex(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [coinShowcase, dismissCoinShowcase, pileModal, showThemePicker, selectedHandIndex, setSelectedHandIndex]);

  if (!gameState) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0b090e] p-6">
        <p className="text-zinc-300">No hay ninguna partida en curso.</p>
        <button
          type="button"
          onClick={() => setScreen('BATTLE_SETUP')}
          className="jojo-btn-primary px-6 py-2.5 font-jojo-heading text-base uppercase"
        >
          Preparar Combate
        </button>
      </div>
    );
  }

  const theme = PLAYMAT_THEMES[settings.playmatTheme];
  const myId = getControllingPlayerId(gameState, mode, onlineRole);
  const enemyId = getOpponentId(myId);
  const myPlayer = gameState.players[myId];
  const enemyPlayer = gameState.players[enemyId];

  const isHumanTurn =
    !myPlayer.isAi &&
    gameState.phase !== 'GAME_OVER' &&
    !gameState.pendingPrompt &&
    (gameState.phase === 'SETUP_MULLIGAN' ||
      gameState.phase === 'SETUP_ACTIVE' ||
      gameState.activePlayerId === myId);

  const selectedCardId =
    selectedHandIndex !== null ? myPlayer.hand[selectedHandIndex] : undefined;
  const selectedCard = selectedCardId ? getCardById(selectedCardId) : undefined;

  const isTargetingStand =
    isHumanTurn && gameState.phase === 'PREPARATION' && selectedCard?.type === 'STAND';

  const maxEnergyThisTurn = getMaxEnergyAttachmentsThisTurn(gameState, myId);

  const isTargetingEnergy =
    isHumanTurn &&
    gameState.phase === 'PREPARATION' &&
    selectedCard?.type === 'ENERGY' &&
    myPlayer.energyAttachedThisTurn < maxEnergyThisTurn;

  const isTargetingEquippable =
    isHumanTurn &&
    gameState.phase === 'PREPARATION' &&
    selectedCard?.type === 'ITEM' &&
    selectedCard.itemKind === 'EQUIPPABLE';

  const canTargetBoardCharacter = (instanceId: string): boolean => {
    if (selectedHandIndex === null) return false;
    if (isTargetingStand) {
      return validateAction(gameState, {
        type: 'EQUIP_STAND',
        playerId: myId,
        handIndex: selectedHandIndex,
        targetInstanceId: instanceId,
      }).ok;
    }
    if (isTargetingEquippable) {
      return validateAction(gameState, {
        type: 'PLAY_ITEM',
        playerId: myId,
        handIndex: selectedHandIndex,
        targetInstanceId: instanceId,
      }).ok;
    }
    return isTargetingEnergy;
  };

  const targetHint = isTargetingStand
    ? 'EQUIPAR STAND'
    : isTargetingEnergy
      ? 'UNIR ENERGÍA'
      : isTargetingEquippable
        ? 'EQUIPAR OBJETO'
        : undefined;

  const myActiveProfile = myPlayer.active ? getEffectiveCharacterProfile(myPlayer.active) : null;
  const isJosephFreeRetreat = myActiveProfile?.signatureAbility.id === 'NIGERUNDAYO';

  const enterCombatCheck = validateAction(gameState, {
    type: 'ENTER_COMBAT_PHASE',
    playerId: myId,
  });

  const usablePrepAbilities =
    isHumanTurn && gameState.phase === 'PREPARATION'
      ? [...(myPlayer.active ? [myPlayer.active] : []), ...myPlayer.bench].filter(
          (ch) =>
            validateAction(gameState, {
              type: 'USE_PREP_ABILITY',
              playerId: myId,
              sourceInstanceId: ch.instanceId,
            }).ok,
        )
      : [];

  const handleDispatch = (action: Parameters<typeof dispatch>[0]) => {
    dispatch(action, settings.hotseatPrivacyScreen);
  };

  const handleTargetBoardCharacter = (targetInstanceId: string) => {
    if (selectedHandIndex === null) return;
    if (isTargetingStand) {
      handleDispatch({
        type: 'EQUIP_STAND',
        playerId: myId,
        handIndex: selectedHandIndex,
        targetInstanceId,
      });
    } else if (isTargetingEnergy) {
      handleDispatch({
        type: 'ATTACH_ENERGY',
        playerId: myId,
        handIndex: selectedHandIndex,
        targetInstanceId,
      });
    } else if (isTargetingEquippable) {
      handleDispatch({
        type: 'PLAY_ITEM',
        playerId: myId,
        handIndex: selectedHandIndex,
        targetInstanceId,
      });
    }
  };

  const cycleSpeed = () => {
    const idx = SPEED_ORDER.indexOf(settings.animationSpeed);
    const next = SPEED_ORDER[(idx + 1) % SPEED_ORDER.length]!;
    setAnimationSpeed(next);
  };

  const popupsFor = (instanceId: string) =>
    cardPopups.filter((p) => p.targetInstanceId === instanceId);

  const handLen = myPlayer.hand.length;

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#0b090e]"
      style={{
        backgroundImage: `url(${theme.patternUrl})`,
        backgroundSize: '340px',
      }}
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: theme.overlayGradient }}
      />

      {/* THREE.JS 3D WEBGL COMBAT VFX STAGE */}
      <Suspense fallback={null}>
        <ThreeCombatCanvas cue={vfxCue} enabled={settings.enable3dVfx} />
      </Suspense>

      {/* COMPACT ARCADE TOP BAR */}
      <header className="relative z-30 flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#060508] bg-[#110d17] px-3 py-1.5 shadow-[0_3px_0_#060508]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              resetBattle();
              setScreen('HOME');
            }}
            className="jojo-btn-ink flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold uppercase"
          >
            <LogOut size={13} /> Salir
          </button>

          <div className="flex items-center gap-2">
            <span className="-skew-x-10 border border-[#060508] bg-[#f2c12e] px-2 py-0.5 font-jojo-display text-xs text-[#0b090e]">
              <span className="inline-block skew-x-10">T{gameState.turnNumber}</span>
            </span>
            <span className="font-jojo-heading text-sm tracking-wider text-[#f5efe0] uppercase">
              {gameState.players[gameState.activePlayerId].name}
            </span>
            {mode === 'VS_AI' && (
              <span className="border border-[#060508] bg-[#1d1728] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#f2c12e] uppercase">
                IA {aiDifficulty === 'EASY' ? 'Fácil' : aiDifficulty === 'HARD' ? 'Difícil' : 'Normal'}
              </span>
            )}
            {mode === 'ONLINE' && (
              <span className="border border-[#060508] bg-[#00b87c] px-2 py-0.5 font-mono text-[10px] font-black text-[#0b090e] uppercase">
                ONLINE · SALA {onlineRoomCode}
              </span>
            )}
            {mode === 'ONLINE' &&
              gameState.phase !== 'GAME_OVER' &&
              ((gameState.pendingPrompt && gameState.pendingPrompt.playerId !== myId) ||
                (!gameState.pendingPrompt &&
                  gameState.phase !== 'SETUP_MULLIGAN' &&
                  gameState.phase !== 'SETUP_ACTIVE' &&
                  gameState.activePlayerId !== myId)) && (
                <span className="border border-[#060508] bg-[#e6194b] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white uppercase">
                  TURNO DEL RIVAL...
                </span>
              )}
            {mode === 'VS_AI' && gameState.players[gameState.activePlayerId].isAi && (
              <span className="border border-[#060508] bg-[#e6194b] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white uppercase">
                {aiPaused ? 'IA PAUSADA' : 'IA ACTUANDO...'}
              </span>
            )}
          </div>
        </div>

        {/* 4-Phase Stepper */}
        <div className="flex items-center gap-1" aria-label="Fases del turno">
          {PHASE_STEPS.map((step) => {
            const active = gameState.phase === step.phase;
            return (
              <span
                key={step.phase}
                className={`-skew-x-10 border px-2.5 py-0.5 font-jojo-heading text-xs tracking-widest uppercase ${
                  active
                    ? 'border-[#060508] bg-[#e6194b] text-white shadow-[2px_2px_0_#060508]'
                    : 'border-white/10 bg-[#1a1424] text-zinc-500'
                }`}
              >
                <span className="inline-block skew-x-10">{step.label}</span>
              </span>
            );
          })}
        </div>

        {/* Right Controls: Speed, Pause AI, 3D VFX, Rules, Playmat, Log */}
        <div className="relative flex flex-wrap items-center gap-1.5">
          {mode === 'VS_AI' && (
            <>
              <button
                type="button"
                onClick={cycleSpeed}
                title="Cambiar velocidad de la IA"
                className="jojo-btn-ink flex items-center gap-1 px-2 py-1 text-[11px] font-bold uppercase"
              >
                <Gauge size={13} className="text-[#f2c12e]" />
                {SPEED_LABELS[settings.animationSpeed]}
              </button>
              <button
                type="button"
                onClick={toggleAiPaused}
                title={aiPaused ? 'Reanudar IA' : 'Pausar IA para leer el tablero'}
                className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold uppercase ${
                  aiPaused ? 'jojo-btn-primary' : 'jojo-btn-ink'
                }`}
              >
                {aiPaused ? <Play size={12} /> : <Pause size={12} />}
                {aiPaused ? 'Seguir' : 'Pausa'}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setEnable3dVfx(!settings.enable3dVfx)}
            title="Activar/desactivar efectos 3D Three.js"
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold uppercase ${
              settings.enable3dVfx ? 'jojo-btn-ink text-[#00e599]' : 'jojo-btn-ink text-zinc-500'
            }`}
          >
            <Sparkles size={12} /> 3D {settings.enable3dVfx ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            onClick={() => setShowRules(true)}
            className="jojo-btn-ink flex items-center gap-1 px-2 py-1 text-[11px] font-bold uppercase"
          >
            <BookOpen size={13} /> Reglas
          </button>
          <button
            type="button"
            onClick={() => setShowThemePicker((v) => !v)}
            className="jojo-btn-ink flex items-center gap-1 px-2 py-1 text-[11px] font-bold uppercase"
          >
            <Palette size={13} />
          </button>
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold uppercase ${
              showLog ? 'jojo-btn-primary' : 'jojo-btn-ink'
            }`}
          >
            <ScrollText size={13} /> ({gameState.eventLog.length})
          </button>
          {gameState.phase !== 'GAME_OVER' && (
            <button
              type="button"
              onClick={() => handleDispatch({ type: 'CONCEDE', playerId: myId })}
              className="jojo-btn-crimson flex items-center gap-1 px-2 py-1 text-[11px] font-bold uppercase"
            >
              <Flag size={12} />
            </button>
          )}

          <AnimatePresence>
            {showThemePicker && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.95 }}
                transition={{ duration: 0.14 }}
                className="jojo-panel absolute top-9 right-0 z-50 w-56 space-y-1 p-2"
              >
                {(Object.keys(PLAYMAT_THEMES) as PlaymatThemeId[]).map((tid) => (
                  <button
                    key={tid}
                    type="button"
                    onClick={() => {
                      setPlaymatTheme(tid);
                      setShowThemePicker(false);
                    }}
                    className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs ${
                      settings.playmatTheme === tid
                        ? 'bg-[#f2c12e] font-bold text-[#0b090e]'
                        : 'text-zinc-200 hover:bg-white/10'
                    }`}
                  >
                    <span
                      className="h-4 w-5 border border-[#060508] bg-cover"
                      style={{ backgroundImage: `url(${PLAYMAT_THEMES[tid].patternUrl})` }}
                    />
                    <span className="truncate">{PLAYMAT_THEMES[tid].label}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Error Toast */}
      <AnimatePresence>
        {lastError && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-14 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 border-2 border-[#060508] bg-[#e6194b] px-4 py-2 text-xs font-bold text-white shadow-[4px_4px_0_#060508]"
          >
            <AlertCircle size={15} />
            <span>{lastError}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DRAMATIC COMBAT IMPACT CUT-IN & TURN SPLASH */}
      <BattleEffectsOverlay banner={impactBanner} onClear={clearImpactBanner} />
      <TurnSplashOverlay
        splash={turnSplash}
        isMyTurn={turnSplash?.playerId === myId}
        onClear={clearTurnSplash}
      />

      {/* ALWAYS-VISIBLE LIVE ACTION NARRATOR STRIP */}
      <LiveActionFeed entries={recentTicker} />

      {/* PHYSICAL DUEL TABLETOP */}
      <motion.div
        animate={tabletopControls}
        className="relative z-10 mx-auto flex w-full max-w-[1520px] flex-1 flex-col justify-between px-3 pt-2 pb-3"
      >
        <div className="relative flex flex-1 flex-col justify-between gap-2 border-2 border-[#f2c12e]/25 bg-[#0b090e]/35 p-3">
          {/* ============ ENEMY SIDE ============ */}
          <div className="grid grid-cols-1 items-center gap-3 xl:grid-cols-[auto_1fr_auto]">
            <PhysicalDeckPiles
              deckCount={enemyPlayer.deck.length}
              discardIds={enemyPlayer.discard}
              label={enemyPlayer.name}
              onOpenDiscard={() =>
                setPileModal({
                  title: `Descartes — ${enemyPlayer.name}`,
                  cardIds: enemyPlayer.discard,
                })
              }
            />

            <div className="flex flex-wrap items-start justify-center gap-6">
              {/* Enemy Bench */}
              <div className="flex flex-col items-center">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="font-jojo-heading text-[11px] tracking-[0.2em] text-zinc-400 uppercase">
                    Banca — {enemyPlayer.name} ({enemyPlayer.bench.length}/
                    {gameState.rules.maxBenchSize})
                  </span>
                  {enemyPlayer.handRevealedToOpponent && (
                    <span className="inline-flex items-center gap-1 border border-[#060508] bg-[#00b87c] px-1.5 py-0.5 text-[9px] font-bold text-[#0b090e]">
                      <Eye size={10} /> MANO REVELADA
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-start justify-center gap-2.5">
                  {enemyPlayer.bench.map((b) => (
                    <CharacterSlot
                      key={b.instanceId}
                      state={gameState}
                      ownerId={enemyId}
                      character={b}
                      zone="BENCH"
                      popups={popupsFor(b.instanceId)}
                    />
                  ))}
                  {Array.from({
                    length: Math.max(0, gameState.rules.maxBenchSize - enemyPlayer.bench.length),
                  }).map((_, i) => (
                    <div
                      key={`eb-slot-${i}`}
                      className="flex h-[152px] w-[108px] items-center justify-center rounded-[7px] border border-dashed border-[#f2c12e]/20 bg-[#0b090e]/35 font-jojo-heading text-[11px] tracking-[0.2em] text-zinc-600 uppercase"
                    >
                      BANCA
                    </div>
                  ))}
                </div>
              </div>

              {/* Enemy Active */}
              <div className="flex flex-col items-center">
                <span className="mb-1.5 font-jojo-heading text-[11px] tracking-[0.2em] text-[#e6194b] uppercase">
                  Puesto Activo Rival
                </span>
                {enemyPlayer.active ? (
                  <CharacterSlot
                    state={gameState}
                    ownerId={enemyId}
                    character={enemyPlayer.active}
                    zone="ACTIVE"
                    popups={popupsFor(enemyPlayer.active.instanceId)}
                    isLunging={attackingPlayerId === enemyId}
                    lungeDirection="DOWN"
                  />
                ) : (
                  <div
                    data-vfx-owner={enemyId}
                    data-vfx-zone="ACTIVE"
                    className="flex h-[207px] w-[148px] items-center justify-center rounded-[7px] border-2 border-dashed border-[#e6194b]/35 bg-[#0b090e]/40 font-jojo-heading text-xs tracking-widest text-zinc-500 uppercase"
                  >
                    ACTIVO
                  </div>
                )}
              </div>
            </div>

            {/* Enemy Hand Preview */}
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center justify-center">
                {enemyPlayer.hand.slice(0, 6).map((cid, i) => {
                  if (enemyPlayer.handRevealedToOpponent) {
                    const c = getCardById(cid);
                    return c ? (
                      <div key={`${cid}-${i}`} style={{ marginLeft: i === 0 ? 0 : -18 }}>
                        <CardView card={c} size="xs" />
                      </div>
                    ) : null;
                  }
                  return (
                    <div
                      key={`eb-${i}`}
                      style={{ marginLeft: i === 0 ? 0 : -16 }}
                      className="h-14 w-10 overflow-hidden rounded-[4px] border-2 border-[#060508] shadow-[2px_2px_0_#060508]"
                    >
                      <div
                        className="h-full w-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${CARD_BACK_PATTERN_URL})` }}
                      />
                    </div>
                  );
                })}
              </div>
              <span className="font-mono text-[10px] font-bold text-zinc-400">
                MANO RIVAL: {enemyPlayer.hand.length}
              </span>
            </div>
          </div>

          {/* ============ CENTER CLASH DIVIDER & CONTROLS ============ */}
          <div className="relative my-1 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent via-[#f2c12e]/50 to-[#e6194b]" />
              <div className="flex flex-wrap items-center justify-center gap-2">
                {gameState.phase === 'PREPARATION' && (
                  <>
                    <div className="flex items-center gap-2 border-2 border-[#060508] bg-[#14101c] px-3 py-1 text-[11px] shadow-[3px_3px_0_#060508]">
                      <span className="text-zinc-400">
                        Energía:{' '}
                        <strong className="text-[#00e599]">
                          {myPlayer.energyAttachedThisTurn}/{maxEnergyThisTurn}
                        </strong>
                        {myPlayer.bonusEnergyAttachmentsThisTurn > 0 && (
                          <span className="ml-1 text-[10px] font-bold text-[#f2c12e]">
                            (+{myPlayer.bonusEnergyAttachmentsThisTurn})
                          </span>
                        )}
                      </span>
                      <span className="text-zinc-600">|</span>
                      <span className="text-zinc-400">
                        Evo:{' '}
                        <strong className="text-[#f2c12e]">
                          {myPlayer.evolutionsPlayedThisTurn}/
                          {gameState.rules.maxEvolutionsPerTurn}
                        </strong>
                      </span>
                      <span className="text-zinc-600">|</span>
                      <span
                        title="Límite de DG de personajes que puedes bajar este turno (T1: DG 3 · T2: DG 4 · T3: DG 5 · T4+: DG 6)"
                        className="text-zinc-400"
                      >
                        DG máx:{' '}
                        <strong className="text-[#e6194b]">
                          {getMaxPlayableCharacterDg(gameState.turnNumber)}
                        </strong>
                      </span>
                    </div>

                    {isHumanTurn && (
                      <>
                        {usablePrepAbilities.map((ch) => {
                          const prof = getEffectiveCharacterProfile(ch);
                          return (
                            <button
                              key={ch.instanceId}
                              type="button"
                              onClick={() =>
                                handleDispatch({
                                  type: 'USE_PREP_ABILITY',
                                  playerId: myId,
                                  sourceInstanceId: ch.instanceId,
                                })
                              }
                              className="jojo-btn-primary px-3 py-1.5 font-jojo-heading text-xs tracking-widest uppercase"
                            >
                              ★ {prof.signatureAbility.name}
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          disabled={!enterCombatCheck.ok}
                          title={enterCombatCheck.reason}
                          onClick={() =>
                            handleDispatch({ type: 'ENTER_COMBAT_PHASE', playerId: myId })
                          }
                          className="jojo-btn-crimson inline-flex items-center gap-1.5 px-4 py-1.5 font-jojo-heading text-sm tracking-[0.14em] uppercase disabled:opacity-35"
                        >
                          <Swords size={15} /> Fase de Combate
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDispatch({ type: 'END_TURN', playerId: myId })}
                          className="jojo-btn-ink px-3.5 py-1.5 font-jojo-heading text-xs tracking-widest uppercase"
                        >
                          Terminar Turno
                        </button>
                      </>
                    )}
                  </>
                )}

                {gameState.phase === 'COMBAT' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="-skew-x-10 border-2 border-[#060508] bg-[#e6194b] px-3 py-1 font-jojo-display text-sm tracking-wider text-white uppercase shadow-[3px_3px_0_#060508]">
                      <span className="inline-block skew-x-10">
                        ¡FASE DE COMBATE!
                        {myPlayer.extraCombatActionsRemaining > 0
                          ? ` · ZA WARUDO (+${myPlayer.extraCombatActionsRemaining})`
                          : ''}
                      </span>
                    </span>
                    {isHumanTurn && (
                      <button
                        type="button"
                        onClick={() => handleDispatch({ type: 'END_TURN', playerId: myId })}
                        className="jojo-btn-ink px-3 py-1 font-jojo-heading text-xs tracking-widest uppercase"
                      >
                        Terminar Turno
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="h-[2px] flex-1 bg-gradient-to-l from-transparent via-[#f2c12e]/50 to-[#e6194b]" />
            </div>

            {gameState.phase === 'PREPARATION' &&
              isHumanTurn &&
              !enterCombatCheck.ok &&
              enterCombatCheck.reason && (
                <div className="mx-auto border border-[#f2c12e]/40 bg-[#14101c]/90 px-3 py-1 text-[11px] font-medium text-[#f2c12e]">
                  {enterCombatCheck.reason}
                </div>
              )}

            {gameState.phase === 'COMBAT' && isHumanTurn && (
              <CombatMovePlates
                gameState={gameState}
                playerId={myId}
                onDispatch={handleDispatch}
              />
            )}
          </div>

          {/* ============ PLAYER SIDE ============ */}
          <div className="grid grid-cols-1 items-center gap-3 xl:grid-cols-[auto_1fr_auto]">
            <div className="hidden xl:block xl:w-[66px]" />

            <div className="flex flex-wrap items-start justify-center gap-6">
              {/* Player Active */}
              <div className="flex flex-col items-center">
                <span className="mb-1.5 font-jojo-heading text-[11px] tracking-[0.2em] text-[#f2c12e] uppercase">
                  Tu Puesto Activo
                </span>
                {myPlayer.active ? (
                  <CharacterSlot
                    state={gameState}
                    ownerId={myId}
                    character={myPlayer.active}
                    zone="ACTIVE"
                    isTargetable={canTargetBoardCharacter(myPlayer.active.instanceId)}
                    targetHint={targetHint}
                    popups={popupsFor(myPlayer.active.instanceId)}
                    isLunging={attackingPlayerId === myId}
                    lungeDirection="UP"
                    onClick={() => handleTargetBoardCharacter(myPlayer.active!.instanceId)}
                  />
                ) : (
                  <div
                    data-vfx-owner={myId}
                    data-vfx-zone="ACTIVE"
                    className="flex h-[207px] w-[148px] items-center justify-center rounded-[7px] border-2 border-dashed border-[#f2c12e]/35 bg-[#0b090e]/40 font-jojo-heading text-xs tracking-widest text-zinc-500 uppercase"
                  >
                    ACTIVO
                  </div>
                )}
              </div>

              {/* Player Bench */}
              <div className="flex flex-col items-center">
                <span className="mb-1.5 font-jojo-heading text-[11px] tracking-[0.2em] text-zinc-300 uppercase">
                  Tu Banca ({myPlayer.bench.length}/{gameState.rules.maxBenchSize})
                </span>
                <div className="flex flex-wrap items-start justify-center gap-2.5">
                  {myPlayer.bench.map((b) => {
                    const canSwap =
                      isHumanTurn &&
                      gameState.phase === 'PREPARATION' &&
                      validateAction(gameState, {
                        type: 'SWAP_ACTIVE_WITH_BENCH',
                        playerId: myId,
                        benchInstanceId: b.instanceId,
                      }).ok;
                    return (
                      <CharacterSlot
                        key={b.instanceId}
                        state={gameState}
                        ownerId={myId}
                        character={b}
                        zone="BENCH"
                        isTargetable={canTargetBoardCharacter(b.instanceId)}
                        targetHint={targetHint}
                        popups={popupsFor(b.instanceId)}
                        onClick={() => handleTargetBoardCharacter(b.instanceId)}
                        actionButton={
                          canSwap
                            ? {
                                label: isJosephFreeRetreat ? 'Nigerundayo!' : 'Cambiar (Fin)',
                                variant: isJosephFreeRetreat ? 'gold' : 'warn',
                                onClick: () =>
                                  handleDispatch({
                                    type: 'SWAP_ACTIVE_WITH_BENCH',
                                    playerId: myId,
                                    benchInstanceId: b.instanceId,
                                  }),
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                  {Array.from({
                    length: Math.max(0, gameState.rules.maxBenchSize - myPlayer.bench.length),
                  }).map((_, i) => (
                    <div
                      key={`mb-slot-${i}`}
                      className="flex h-[152px] w-[108px] items-center justify-center rounded-[7px] border border-dashed border-[#f2c12e]/25 bg-[#0b090e]/35 font-jojo-heading text-[11px] tracking-[0.2em] text-zinc-500 uppercase"
                    >
                      BANCA
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <PhysicalDeckPiles
              deckCount={myPlayer.deck.length}
              discardIds={myPlayer.discard}
              label={myPlayer.name}
              onOpenDiscard={() =>
                setPileModal({
                  title: `Descartes — ${myPlayer.name}`,
                  cardIds: myPlayer.discard,
                })
              }
            />
          </div>
        </div>

        {/* ============ SELECTED CARD RIBBON + INTERACTIVE CARD FAN ============ */}
        <div className="relative mt-2 flex flex-col items-center">
          <AnimatePresence>
            {isHumanTurn &&
              gameState.phase === 'PREPARATION' &&
              selectedHandIndex !== null &&
              selectedCard && (
                <motion.div
                  key={`ribbon-${selectedHandIndex}`}
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ duration: 0.14 }}
                >
                  <HandActionRibbon
                    gameState={gameState}
                    playerId={myId}
                    handIndex={selectedHandIndex}
                    card={selectedCard}
                    onDispatch={handleDispatch}
                    onCancel={() => setSelectedHandIndex(null)}
                  />
                </motion.div>
              )}
          </AnimatePresence>

          <div
            aria-label="Cartas en mano"
            className="flex max-w-full items-end justify-center overflow-x-auto px-6 pt-6 pb-2"
          >
            {myPlayer.hand.map((cid, idx) => {
              const card = getCardById(cid);
              if (!card) return null;
              const isSelected = selectedHandIndex === idx;
              const mid = (handLen - 1) / 2;
              const offset = idx - mid;
              const angle = handLen > 1 ? Math.max(-12, Math.min(12, offset * 2.6)) : 0;
              const dropY = Math.abs(offset) * 3;
              const overlap = handLen > 7 ? -26 : handLen > 5 ? -16 : -6;

              return (
                <motion.div
                  key={`${cid}-${idx}`}
                  initial={false}
                  animate={{
                    rotate: isSelected ? 0 : angle,
                    y: isSelected ? -24 : dropY,
                    scale: isSelected ? 1.08 : 1,
                    zIndex: isSelected ? 40 : idx + 1,
                  }}
                  whileHover={{
                    y: -30,
                    rotate: 0,
                    scale: 1.2,
                    zIndex: 50,
                  }}
                  transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                  style={{ marginLeft: idx === 0 ? 0 : overlap }}
                >
                  <CardView
                    card={card}
                    size="sm"
                    selected={isSelected}
                    onClick={
                      isHumanTurn && gameState.phase === 'PREPARATION'
                        ? () => setSelectedHandIndex(isSelected ? null : idx)
                        : undefined
                    }
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* SLIDE-OVER COMBAT LOG */}
      <AnimatePresence>
        {showLog && (
          <motion.aside
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed top-12 right-3 bottom-3 z-30 w-[300px]"
          >
            <CombatLog events={gameState.eventLog} />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* SETUP, HOTSEAT & GAME OVER MODALS */}
      <BattleModals
        gameState={gameState}
        mode={mode}
        myId={myId}
        hotseatHandoffTo={hotseatHandoffTo}
        battleReward={lastBattleReward}
        isCampaign={Boolean(activeCampaignStageId)}
        campaignPackReward={campaignPackReward}
        onOpenCampaignPacks={() => setShowCampaignPacks(true)}
        onReturnToCampaign={() => {
          if (activeCampaignStageId) {
            const stage = getCampaignStageById(activeCampaignStageId);
            if (stage) setSelectedCampaignPart(stage.part);
          }
          resetBattle();
          setScreen('CAMPAIGN');
        }}
        onDispatch={handleDispatch}
        onConfirmHandoff={confirmHotseatHandoff}
        onRematch={() => rematch(settings.hotseatPrivacyScreen)}
        onOpenShop={() => {
          resetBattle();
          setScreen('SHOP');
        }}
        onExitToMenu={() => {
          resetBattle();
          setScreen('HOME');
        }}
      />

      {/* CAMPAIGN REWARD PACK OPENING MODAL */}
      <PackOpeningModal
        pack={showCampaignPacks && campaignPackReward ? campaignPackReward.pack : null}
        outcomes={showCampaignPacks && campaignPackReward ? campaignPackReward.outcomes : null}
        canBuyAnother={false}
        onBuyAnother={() => undefined}
        onClose={() => {
          setShowCampaignPacks(false);
          setCampaignPackReward(null);
        }}
      />

      {/* INTERACTIVE PENDING PROMPT */}
      <AnimatePresence>
        {gameState.pendingPrompt &&
          !gameState.players[gameState.pendingPrompt.playerId].isAi &&
          (mode !== 'ONLINE' || gameState.pendingPrompt.playerId === myId) &&
          !hotseatHandoffTo && (
            <PromptOverlay
              key={gameState.pendingPrompt.kind}
              state={gameState}
              prompt={gameState.pendingPrompt}
              onRespond={(response) =>
                handleDispatch({
                  type: 'RESPOND_PROMPT',
                  playerId: gameState.pendingPrompt!.playerId,
                  response,
                })
              }
            />
          )}
      </AnimatePresence>

      <CoinFlipOverlay showcase={coinShowcase} onClose={dismissCoinShowcase} />

      <AnimatePresence>
        {pileModal && (
          <PileViewerModal
            key={pileModal.title}
            title={pileModal.title}
            cardIds={pileModal.cardIds}
            onClose={() => setPileModal(null)}
          />
        )}
      </AnimatePresence>

      <RulesModal open={showRules} onClose={() => setShowRules(false)} />
    </div>
  );
}
