import { create } from 'zustand';
import { getCardById } from '../data/cardRegistry';
import type { BoosterPackDef } from '../data/progressionData';
import { chooseAiAction, type AiDifficulty } from '../engine/ai/tacticalAi';
import { createGame, dispatchAction } from '../engine/gameEngine';
import { createSystemRng, type CoinResult, type RngProvider } from '../engine/rng';
import type { GameAction } from '../engine/types/actions';
import type { CombatEvent } from '../engine/types/events';
import type { GameState, PlayerId } from '../engine/types/state';
import {
  onlineService,
  type OnlineChatMessage,
  type OnlineRole,
  type OnlineRoomSnapshot,
} from '../services/onlineService';
import type { OpenPackOutcome } from '../services/progressionService';
import {
  extractAttackingPlayerId,
  extractCardPopups,
  extractThreeVfxCue,
  extractTurnSplash,
  formatActionTickerEntries,
  type IActionTickerEntry,
  type ICardFloatingPopup,
  type IThreeVfxCue,
  type ITurnSplash,
} from '../ui/vfx/vfxClassifier';

export type BattleMode = 'VS_AI' | 'HOTSEAT' | 'ONLINE';

export interface CoinShowcaseState {
  id: string;
  attackName: string;
  results: CoinResult[];
  message: string;
}

export interface BattleImpactBanner {
  id: string;
  kind: 'DAMAGE' | 'HEAL' | 'EVOLUTION' | 'TIME_STOP' | 'KO' | 'DEFENSE';
  headline: string;
  subline: string;
  sfx: string;
}

export interface StartBattleConfig {
  mode: BattleMode;
  p1Name: string;
  p2Name: string;
  p1DeckIds: string[];
  p2DeckIds: string[];
  firstPlayerId: PlayerId;
  aiDifficulty?: AiDifficulty;
  campaignStageId?: string;
  p2GuaranteedOpeningCardId?: string;
}

interface BattleStoreState {
  gameState: GameState | null;
  mode: BattleMode;
  aiDifficulty: AiDifficulty;
  lastConfig: StartBattleConfig | null;
  rng: RngProvider;
  lastError: string | null;
  coinShowcase: CoinShowcaseState | null;
  impactBanner: BattleImpactBanner | null;
  vfxCue: IThreeVfxCue | null;
  cardPopups: ICardFloatingPopup[];
  attackingPlayerId: PlayerId | null;
  turnSplash: ITurnSplash | null;
  recentTicker: IActionTickerEntry[];
  aiPaused: boolean;
  extraAiDelayMs: number;
  hotseatHandoffTo: PlayerId | null;
  selectedHandIndex: number | null;
  isAiThinking: boolean;
  battleRewardClaimed: boolean;
  lastBattleReward: { coins: number; label: string } | null;
  activeCampaignStageId: string | null;
  campaignPackReward: { pack: BoosterPackDef; outcomes: OpenPackOutcome[] } | null;
  onlineRoomCode: string | null;
  onlineRole: OnlineRole | null;
  onlineVersion: number;
  onlineRoomStatus: 'WAITING' | 'PLAYING' | 'FINISHED' | null;
  onlineChatMessages: OnlineChatMessage[];
  onlineSpectatorCount: number;

  startBattle: (config: StartBattleConfig, usePrivacyCurtain: boolean) => void;
  startOnlineBattle: (room: OnlineRoomSnapshot) => Promise<void>;
  startSpectatorBattle: (room: OnlineRoomSnapshot) => void;
  applyRemoteOnlineRoom: (room: OnlineRoomSnapshot) => void;
  setOnlineChatMessages: (messages: OnlineChatMessage[]) => void;
  rematch: (usePrivacyCurtain: boolean) => void;
  dispatch: (action: GameAction, usePrivacyCurtain?: boolean) => boolean;
  stepAiIfNeeded: () => void;
  claimBattleReward: (reward: { coins: number; label: string }) => void;
  setCampaignPackReward: (
    reward: { pack: BoosterPackDef; outcomes: OpenPackOutcome[] } | null,
  ) => void;
  toggleAiPaused: () => void;
  dismissCoinShowcase: () => void;
  clearImpactBanner: () => void;
  clearCardPopups: () => void;
  clearAttackingPlayer: () => void;
  clearTurnSplash: () => void;
  confirmHotseatHandoff: () => void;
  clearError: () => void;
  setSelectedHandIndex: (idx: number | null) => void;
  resetBattle: () => void;
}

export function getControllingPlayerId(
  state: GameState,
  mode: BattleMode,
  onlineRole?: OnlineRole | null,
): PlayerId {
  // In VS_AI mode, the tabletop perspective must ALWAYS remain on the human player (P1),
  // even while the AI resolves setup steps or pending prompts (e.g. deck search, bench promote).
  if (mode === 'VS_AI') {
    return 'P1';
  }
  if (mode === 'ONLINE' && onlineRole) {
    return onlineRole === 'SPECTATOR' ? 'P1' : onlineRole;
  }

  if (state.pendingPrompt) return state.pendingPrompt.playerId;

  if (state.phase === 'SETUP_MULLIGAN') {
    return !state.players.P1.mulliganConfirmed ? 'P1' : 'P2';
  }
  if (state.phase === 'SETUP_ACTIVE') {
    return !state.players.P1.setupActiveChosen ? 'P1' : 'P2';
  }
  return state.activePlayerId;
}

export function getNextActingPlayer(state: GameState): PlayerId | null {
  if (state.phase === 'GAME_OVER') return null;
  if (state.pendingPrompt) return state.pendingPrompt.playerId;
  if (state.phase === 'SETUP_MULLIGAN') {
    return !state.players.P1.mulliganConfirmed ? 'P1' : 'P2';
  }
  if (state.phase === 'SETUP_ACTIVE') {
    return !state.players.P1.setupActiveChosen ? 'P1' : 'P2';
  }
  return state.activePlayerId;
}

function extractCoinEvent(events: CombatEvent[]): CoinShowcaseState | null {
  const coinEvt = [...events].reverse().find((e) => e.type === 'COIN_FLIPPED');
  if (!coinEvt || coinEvt.type !== 'COIN_FLIPPED') return null;
  return {
    id: coinEvt.id,
    attackName: coinEvt.attackName,
    results: coinEvt.results,
    message: coinEvt.message,
  };
}

function extractImpactBanner(events: CombatEvent[]): BattleImpactBanner | null {
  const evo = events.find((e) => e.type === 'CARD_EVOLVED');
  if (evo && evo.type === 'CARD_EVOLVED') {
    const evoName = getCardById(evo.evolutionCardId)?.name ?? evo.evolutionCardId;
    return {
      id: evo.id,
      kind: 'EVOLUTION',
      headline: '¡EVOLUCIÓN!',
      subline: evoName,
      sfx: 'ゴゴゴゴ',
    };
  }

  const zaWarudo = events.find(
    (e) =>
      e.type === 'ABILITY_TRIGGERED' &&
      e.abilityName.toLowerCase().includes('za warudo'),
  );
  if (zaWarudo && zaWarudo.type === 'ABILITY_TRIGGERED') {
    return {
      id: zaWarudo.id,
      kind: 'TIME_STOP',
      headline: '¡ZA WARUDO!',
      subline: zaWarudo.message,
      sfx: 'ドドドド',
    };
  }

  const ko = events.find((e) => e.type === 'CHARACTER_KO');
  if (ko && ko.type === 'CHARACTER_KO') {
    const name = getCardById(ko.cardId)?.name ?? ko.cardId;
    return {
      id: ko.id,
      kind: 'KO',
      headline: '¡K.O.!',
      subline: `${name} eliminado (${ko.reason})`,
      sfx: 'バァーン',
    };
  }

  const defense = events.find(
    (e) =>
      e.type === 'STATUS_PREVENTED' ||
      (e.type === 'ABILITY_TRIGGERED' &&
        (e.abilityName === 'Sentido del Viento' ||
          e.abilityName === 'Intelecto Superior' ||
          e.abilityName === 'Control del Agua')),
  );
  if (defense) {
    return {
      id: defense.id,
      kind: 'DEFENSE',
      headline:
        defense.type === 'ABILITY_TRIGGERED'
          ? `¡${defense.abilityName.toUpperCase()}!`
          : '¡ESTADO ANULADO!',
      subline: defense.message,
      sfx: 'ゴゴゴ',
    };
  }

  const atk = events.find((e) => e.type === 'ATTACK_DECLARED');
  const dmgEvents = events.filter(
    (e): e is Extract<CombatEvent, { type: 'DAMAGE_DEALT' }> => e.type === 'DAMAGE_DEALT',
  );
  if (dmgEvents.length > 0) {
    const total = dmgEvents.reduce((s, d) => s + d.amount, 0);
    const primary = dmgEvents[0]!;
    const atkName = atk && atk.type === 'ATTACK_DECLARED' ? `${atk.attackName} · ` : '';
    return {
      id: primary.id,
      kind: 'DAMAGE',
      headline: `-${total} HP!`,
      subline:
        dmgEvents.length > 1
          ? `${atkName}${dmgEvents.length} objetivos golpeados`
          : `${atkName}${primary.message}`,
      sfx: total >= 80 ? 'ドドド!' : 'オラ!',
    };
  }

  const heal = events.find((e) => e.type === 'HEALED');
  if (heal && heal.type === 'HEALED' && heal.amount > 0) {
    return {
      id: heal.id,
      kind: 'HEAL',
      headline: `+${heal.amount} HP`,
      subline: heal.message,
      sfx: 'キラッ',
    };
  }

  const statusEvt = events.find((e) => e.type === 'STATUS_APPLIED');
  if (statusEvt && statusEvt.type === 'STATUS_APPLIED') {
    const label =
      statusEvt.status === 'STUNNED'
        ? '¡ATURDIDO!'
        : statusEvt.status === 'BURN'
          ? '¡QUEMADO!'
          : '¡SANGRADO!';
    return {
      id: statusEvt.id,
      kind: 'DEFENSE',
      headline: label,
      subline: statusEvt.message,
      sfx: 'ズキュゥン',
    };
  }

  return null;
}

function computeExtraDelay(events: CombatEvent[]): number {
  if (events.some((e) => e.type === 'CARD_EVOLVED' || e.type === 'CHARACTER_KO')) return 850;
  if (events.some((e) => e.type === 'ATTACK_DECLARED' || e.type === 'DAMAGE_DEALT')) return 650;
  if (events.some((e) => e.type === 'STATUS_APPLIED' || e.type === 'HEALED')) return 450;
  return 0;
}

export const useBattleStore = create<BattleStoreState>((set, get) => ({
  gameState: null,
  mode: 'VS_AI',
  aiDifficulty: 'NORMAL',
  lastConfig: null,
  rng: createSystemRng(),
  lastError: null,
  coinShowcase: null,
  impactBanner: null,
  vfxCue: null,
  cardPopups: [],
  attackingPlayerId: null,
  turnSplash: null,
  recentTicker: [],
  aiPaused: false,
  extraAiDelayMs: 0,
  hotseatHandoffTo: null,
  selectedHandIndex: null,
  isAiThinking: false,
  battleRewardClaimed: false,
  lastBattleReward: null,
  activeCampaignStageId: null,
  campaignPackReward: null,
  onlineRoomCode: null,
  onlineRole: null,
  onlineVersion: 0,
  onlineRoomStatus: null,
  onlineChatMessages: [],
  onlineSpectatorCount: 0,

  startBattle: (config, _usePrivacyCurtain) => {
    const rng = createSystemRng();
    const state = createGame({
      p1Name: config.p1Name,
      p2Name: config.p2Name,
      p1Deck: config.p1DeckIds,
      p2Deck: config.p2DeckIds,
      p1IsAi: false,
      p2IsAi: config.mode === 'VS_AI',
      p2GuaranteedOpeningCardId: config.p2GuaranteedOpeningCardId,
      firstPlayerId: config.firstPlayerId,
      rng,
    });
    set({
      gameState: state,
      mode: config.mode,
      aiDifficulty: config.aiDifficulty ?? 'NORMAL',
      lastConfig: config,
      rng,
      lastError: null,
      coinShowcase: null,
      impactBanner: null,
      vfxCue: null,
      cardPopups: [],
      attackingPlayerId: null,
      turnSplash: null,
      recentTicker: [],
      aiPaused: false,
      extraAiDelayMs: 0,
      hotseatHandoffTo: null,
      selectedHandIndex: null,
      isAiThinking: false,
      battleRewardClaimed: false,
      lastBattleReward: null,
      activeCampaignStageId: config.campaignStageId ?? null,
      campaignPackReward: null,
      onlineRoomCode: null,
      onlineRole: null,
      onlineVersion: 0,
      onlineRoomStatus: null,
      onlineChatMessages: [],
      onlineSpectatorCount: 0,
    });
  },

  startOnlineBattle: async (room) => {
    const rng = createSystemRng();
    let initialState = room.gameState;
    let nextVersion = room.version;

    if (!initialState && room.p1 && room.p2) {
      const created = createGame({
        p1Name: room.p1.name,
        p2Name: room.p2.name,
        p1Deck: room.p1.deckIds,
        p2Deck: room.p2.deckIds,
        p1IsAi: false,
        p2IsAi: false,
        firstPlayerId: room.firstPlayerId ?? 'P1',
        rng,
      });
      const pushRes = await onlineService.pushRoomState({
        roomCode: room.roomCode,
        gameState: created,
        lastEvents: [],
        isInitial: true,
      });
      initialState = pushRes.gameState ?? created;
      if (typeof pushRes.version === 'number') {
        nextVersion = pushRes.version;
      }
    }

    set({
      gameState: initialState,
      mode: 'ONLINE',
      onlineRoomCode: room.roomCode,
      onlineRole: room.role,
      onlineVersion: nextVersion,
      onlineRoomStatus: room.status,
      onlineChatMessages: Array.isArray(room.chatMessages) ? room.chatMessages : [],
      onlineSpectatorCount: room.spectatorCount ?? 0,
      rng,
      lastError: null,
      coinShowcase: null,
      impactBanner: null,
      vfxCue: null,
      cardPopups: [],
      attackingPlayerId: null,
      turnSplash: null,
      recentTicker: [],
      aiPaused: false,
      extraAiDelayMs: 0,
      hotseatHandoffTo: null,
      selectedHandIndex: null,
      isAiThinking: false,
      battleRewardClaimed: false,
      lastBattleReward: null,
    });
  },

  startSpectatorBattle: (room) => {
    set({
      gameState: room.gameState,
      mode: 'ONLINE',
      onlineRoomCode: room.roomCode,
      onlineRole: 'SPECTATOR',
      onlineVersion: room.version,
      onlineRoomStatus: room.status,
      onlineChatMessages: Array.isArray(room.chatMessages) ? room.chatMessages : [],
      onlineSpectatorCount: room.spectatorCount ?? 1,
      rng: createSystemRng(),
      lastError: null,
      coinShowcase: null,
      impactBanner: null,
      vfxCue: null,
      cardPopups: [],
      attackingPlayerId: null,
      turnSplash: null,
      recentTicker: [],
      aiPaused: false,
      extraAiDelayMs: 0,
      hotseatHandoffTo: null,
      selectedHandIndex: null,
      isAiThinking: false,
      battleRewardClaimed: true,
      lastBattleReward: null,
      activeCampaignStageId: null,
      campaignPackReward: null,
    });
  },

  setOnlineChatMessages: (onlineChatMessages) => set({ onlineChatMessages }),

  applyRemoteOnlineRoom: (room) => {
    const {
      gameState: prevGameState,
      onlineVersion,
      onlineRole,
      recentTicker,
      onlineChatMessages: prevChat,
      onlineSpectatorCount: prevSpectators,
      onlineRoomStatus: prevStatus,
    } = get();

    const incomingChat = Array.isArray(room.chatMessages) ? room.chatMessages : prevChat;
    const chatChanged =
      incomingChat.length !== prevChat.length ||
      incomingChat[incomingChat.length - 1]?.id !== prevChat[prevChat.length - 1]?.id;
    const nextSpectators =
      typeof room.spectatorCount === 'number' ? room.spectatorCount : prevSpectators;
    const metaChanged =
      chatChanged || nextSpectators !== prevSpectators || room.status !== prevStatus;

    const shouldUpdateGame =
      Boolean(room.gameState) && (!prevGameState || room.version > onlineVersion);

    if (!shouldUpdateGame) {
      if (metaChanged) {
        set({
          onlineChatMessages: chatChanged ? incomingChat : prevChat,
          onlineSpectatorCount: nextSpectators,
          onlineRoomStatus: room.status,
        });
      }
      return;
    }

    const nextGameState = room.gameState!;
    const effectiveRole = onlineRole ?? room.role;
    const viewerId: PlayerId = effectiveRole === 'P2' ? 'P2' : 'P1';
    const events: CombatEvent[] = Array.isArray(room.lastEvents) ? room.lastEvents : [];
    const coinShowcase = extractCoinEvent(events) ?? get().coinShowcase;
    const impactBanner = extractImpactBanner(events);
    const vfxCue = extractThreeVfxCue(events, viewerId);
    const cardPopups = extractCardPopups(events);
    const attackingPlayerId = extractAttackingPlayerId(events);
    const turnSplash = prevGameState ? extractTurnSplash(prevGameState, nextGameState) : null;
    const addedTicker = formatActionTickerEntries(events, nextGameState);
    const nextTicker =
      addedTicker.length > 0 ? [...recentTicker, ...addedTicker].slice(-5) : recentTicker;

    set({
      gameState: nextGameState,
      onlineVersion: room.version,
      onlineRoomStatus: room.status,
      onlineChatMessages: chatChanged ? incomingChat : prevChat,
      onlineSpectatorCount: nextSpectators,
      coinShowcase,
      impactBanner: impactBanner ?? get().impactBanner,
      vfxCue: vfxCue ?? get().vfxCue,
      cardPopups: cardPopups.length > 0 ? cardPopups : get().cardPopups,
      attackingPlayerId,
      turnSplash: turnSplash ?? get().turnSplash,
      recentTicker: nextTicker,
      selectedHandIndex: null,
    });
  },

  rematch: (usePrivacyCurtain) => {
    const { lastConfig, startBattle } = get();
    if (lastConfig) {
      startBattle(lastConfig, usePrivacyCurtain);
    }
  },

  dispatch: (action, usePrivacyCurtain = true) => {
    const { gameState, rng, mode, recentTicker, onlineRoomCode, onlineRole } = get();
    if (!gameState) return false;

    if (mode === 'ONLINE' && onlineRole === 'SPECTATOR') {
      return false;
    }

    if (mode === 'ONLINE' && onlineRole && action.playerId !== onlineRole) {
      set({ lastError: 'Espera a que tu rival online realice su acción.' });
      return false;
    }

    const prevActor = getNextActingPlayer(gameState);
    const result = dispatchAction(gameState, action, rng);
    if (!result.ok) {
      set({ lastError: result.error ?? 'Acción no permitida.' });
      return false;
    }

    const viewerId = getControllingPlayerId(result.state, mode, onlineRole);
    const nextActor = getNextActingPlayer(result.state);
    const coinShowcase = extractCoinEvent(result.events) ?? get().coinShowcase;
    const impactBanner = extractImpactBanner(result.events);
    const vfxCue = extractThreeVfxCue(result.events, viewerId);
    const cardPopups = extractCardPopups(result.events);
    const attackingPlayerId = extractAttackingPlayerId(result.events);
    const turnSplash = extractTurnSplash(gameState, result.state);
    const addedTicker = formatActionTickerEntries(result.events, result.state);
    const nextTicker = [...recentTicker, ...addedTicker].slice(-5);
    const extraAiDelayMs = computeExtraDelay(result.events) + (turnSplash ? 450 : 0);

    let hotseatHandoffTo: PlayerId | null = null;
    if (
      mode === 'HOTSEAT' &&
      usePrivacyCurtain &&
      prevActor &&
      nextActor &&
      prevActor !== nextActor &&
      result.state.phase !== 'GAME_OVER'
    ) {
      hotseatHandoffTo = nextActor;
    }

    const nextVersion = get().onlineVersion + 1;

    set({
      gameState: result.state,
      onlineVersion: nextVersion,
      lastError: null,
      coinShowcase,
      impactBanner: impactBanner ?? get().impactBanner,
      vfxCue: vfxCue ?? get().vfxCue,
      cardPopups: cardPopups.length > 0 ? cardPopups : get().cardPopups,
      attackingPlayerId,
      turnSplash: turnSplash ?? get().turnSplash,
      recentTicker: nextTicker,
      extraAiDelayMs,
      hotseatHandoffTo,
      selectedHandIndex: null,
    });

    if (mode === 'ONLINE' && onlineRoomCode) {
      void onlineService
        .pushRoomState({
          roomCode: onlineRoomCode,
          gameState: result.state,
          lastEvents: result.events,
        })
        .then((res) => {
          if (res.ok && typeof res.version === 'number') {
            set((s) => ({ onlineVersion: Math.max(s.onlineVersion, res.version!) }));
          }
        });
    }

    return true;
  },

  stepAiIfNeeded: () => {
    const { gameState, mode, aiDifficulty, rng, coinShowcase, aiPaused, recentTicker } = get();
    if (!gameState || mode !== 'VS_AI' || gameState.phase === 'GAME_OVER' || coinShowcase || aiPaused) {
      set({ isAiThinking: false });
      return;
    }

    const actor = getNextActingPlayer(gameState);
    if (!actor || !gameState.players[actor].isAi) {
      set({ isAiThinking: false });
      return;
    }

    const aiAction = chooseAiAction(gameState, actor, aiDifficulty);
    if (!aiAction) {
      set({ isAiThinking: false });
      return;
    }

    const res = dispatchAction(gameState, aiAction, rng);
    if (!res.ok) {
      set({ lastError: res.error ?? 'Error interno de la IA.', isAiThinking: false });
      return;
    }

    const viewerId: PlayerId = 'P1';
    const nextCoin = extractCoinEvent(res.events);
    const impactBanner = extractImpactBanner(res.events);
    const vfxCue = extractThreeVfxCue(res.events, viewerId);
    const cardPopups = extractCardPopups(res.events);
    const attackingPlayerId = extractAttackingPlayerId(res.events);
    const turnSplash = extractTurnSplash(gameState, res.state);
    const addedTicker = formatActionTickerEntries(res.events, res.state);
    const nextTicker = [...recentTicker, ...addedTicker].slice(-5);
    const extraAiDelayMs = computeExtraDelay(res.events) + (turnSplash ? 450 : 0);

    set({
      gameState: res.state,
      coinShowcase: nextCoin ?? null,
      impactBanner: impactBanner ?? get().impactBanner,
      vfxCue: vfxCue ?? get().vfxCue,
      cardPopups: cardPopups.length > 0 ? cardPopups : get().cardPopups,
      attackingPlayerId,
      turnSplash: turnSplash ?? get().turnSplash,
      recentTicker: nextTicker,
      extraAiDelayMs,
      isAiThinking: false,
    });
  },

  toggleAiPaused: () => set((s) => ({ aiPaused: !s.aiPaused })),
  claimBattleReward: (lastBattleReward) => set({ battleRewardClaimed: true, lastBattleReward }),
  setCampaignPackReward: (campaignPackReward) => set({ campaignPackReward }),
  dismissCoinShowcase: () => set({ coinShowcase: null }),
  clearImpactBanner: () => set({ impactBanner: null }),
  clearCardPopups: () => set({ cardPopups: [] }),
  clearAttackingPlayer: () => set({ attackingPlayerId: null }),
  clearTurnSplash: () => set({ turnSplash: null }),
  confirmHotseatHandoff: () => set({ hotseatHandoffTo: null }),
  clearError: () => set({ lastError: null }),
  setSelectedHandIndex: (selectedHandIndex) => set({ selectedHandIndex }),
  resetBattle: () => {
    const { mode, onlineRoomCode } = get();
    if (mode === 'ONLINE' && onlineRoomCode) {
      void onlineService.leaveRoom(onlineRoomCode);
    }
    set({
      gameState: null,
      lastError: null,
      coinShowcase: null,
      impactBanner: null,
      vfxCue: null,
      cardPopups: [],
      attackingPlayerId: null,
      turnSplash: null,
      recentTicker: [],
      aiPaused: false,
      extraAiDelayMs: 0,
      hotseatHandoffTo: null,
      selectedHandIndex: null,
      isAiThinking: false,
      battleRewardClaimed: false,
      lastBattleReward: null,
      activeCampaignStageId: null,
      campaignPackReward: null,
      onlineRoomCode: null,
      onlineRole: null,
      onlineVersion: 0,
      onlineRoomStatus: null,
      onlineChatMessages: [],
      onlineSpectatorCount: 0,
    });
  },
}));
