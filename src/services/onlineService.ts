import type { CombatEvent } from '../engine/types/events';
import type { GameState, PlayerId } from '../engine/types/state';

export interface OnlinePlayerInfo {
  name: string;
  deckIds: string[];
}

export interface OnlineRoomSnapshot {
  roomCode: string;
  role: PlayerId;
  status: 'WAITING' | 'PLAYING' | 'FINISHED';
  isPrivate: boolean;
  p1: OnlinePlayerInfo | null;
  p2: OnlinePlayerInfo | null;
  firstPlayerId: PlayerId;
  gameState: GameState | null;
  lastEvents: CombatEvent[];
  version: number;
}

let cachedPlayerToken: string | null = null;

export function getOnlinePlayerToken(): string {
  if (cachedPlayerToken) return cachedPlayerToken;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const existing = window.sessionStorage.getItem('jojo_tcg_online_token');
      if (existing) {
        cachedPlayerToken = existing;
        return existing;
      }
      const created = `plr_${Math.random().toString(36).slice(2, 11)}_${Date.now().toString(36)}`;
      window.sessionStorage.setItem('jojo_tcg_online_token', created);
      cachedPlayerToken = created;
      return created;
    } catch {
      // Fallback to in-memory
    }
  }
  cachedPlayerToken = `plr_${Math.random().toString(36).slice(2, 11)}_${Date.now().toString(36)}`;
  return cachedPlayerToken;
}

export const onlineService = {
  async findPublicMatch(
    playerName: string,
    deckIds: string[],
  ): Promise<{ ok: true; room: OnlineRoomSnapshot } | { ok: false; error: string }> {
    try {
      const res = await fetch('/api/online/find-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerToken: getOnlinePlayerToken(),
          playerName,
          deckIds,
        }),
      });
      const json = (await res.json()) as OnlineRoomSnapshot & { error?: string };
      if (!res.ok) {
        return { ok: false, error: json.error ?? 'Error al buscar partida.' };
      }
      return { ok: true, room: json };
    } catch {
      return { ok: false, error: 'No se pudo conectar con el servidor de emparejamiento.' };
    }
  },

  async createPrivateRoom(
    playerName: string,
    deckIds: string[],
  ): Promise<{ ok: true; room: OnlineRoomSnapshot } | { ok: false; error: string }> {
    try {
      const res = await fetch('/api/online/create-private', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerToken: getOnlinePlayerToken(),
          playerName,
          deckIds,
        }),
      });
      const json = (await res.json()) as OnlineRoomSnapshot & { error?: string };
      if (!res.ok) {
        return { ok: false, error: json.error ?? 'Error al crear sala privada.' };
      }
      return { ok: true, room: json };
    } catch {
      return { ok: false, error: 'No se pudo conectar con el servidor.' };
    }
  },

  async joinPrivateRoom(
    roomCode: string,
    playerName: string,
    deckIds: string[],
  ): Promise<{ ok: true; room: OnlineRoomSnapshot } | { ok: false; error: string }> {
    try {
      const res = await fetch('/api/online/join-private', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: roomCode.trim().toUpperCase(),
          playerToken: getOnlinePlayerToken(),
          playerName,
          deckIds,
        }),
      });
      const json = (await res.json()) as OnlineRoomSnapshot & { error?: string };
      if (!res.ok) {
        return { ok: false, error: json.error ?? 'No se pudo unir a la sala.' };
      }
      return { ok: true, room: json };
    } catch {
      return { ok: false, error: 'No se pudo conectar con el servidor.' };
    }
  },

  async pollRoom(
    roomCode: string,
  ): Promise<{ ok: true; room: OnlineRoomSnapshot } | { ok: false; error: string }> {
    try {
      const token = encodeURIComponent(getOnlinePlayerToken());
      const code = encodeURIComponent(roomCode.trim().toUpperCase());
      const res = await fetch(`/api/online/room?code=${code}&token=${token}`);
      const json = (await res.json()) as OnlineRoomSnapshot & { error?: string };
      if (!res.ok) {
        return { ok: false, error: json.error ?? 'Error al sincronizar sala.' };
      }
      return { ok: true, room: json };
    } catch {
      return { ok: false, error: 'Error de red sincronizando partida.' };
    }
  },

  async pushRoomState(params: {
    roomCode: string;
    gameState: GameState;
    lastEvents: CombatEvent[];
    isInitial?: boolean;
  }): Promise<{ ok: boolean; version?: number; gameState?: GameState; lastEvents?: CombatEvent[] }> {
    try {
      const res = await fetch('/api/online/push-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: params.roomCode,
          playerToken: getOnlinePlayerToken(),
          gameState: params.gameState,
          lastEvents: params.lastEvents,
          isInitial: params.isInitial,
        }),
      });
      if (!res.ok) return { ok: false };
      return (await res.json()) as {
        ok: boolean;
        version?: number;
        gameState?: GameState;
        lastEvents?: CombatEvent[];
      };
    } catch {
      return { ok: false };
    }
  },

  async leaveRoom(roomCode: string): Promise<void> {
    try {
      await fetch('/api/online/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          playerToken: getOnlinePlayerToken(),
        }),
      });
    } catch {
      // Ignore network errors when leaving
    }
  },
};
