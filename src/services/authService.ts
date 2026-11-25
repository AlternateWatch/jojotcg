import {
  createInitialProgression,
  type PlayerProgression,
} from './progressionService';
import {
  DEFAULT_SETTINGS,
  type SavedDeck,
  type UserSettings,
} from './storageService';

export interface AuthUser {
  id: number;
  username: string;
}

export interface AuthStatePayload {
  token?: string;
  user: AuthUser;
  progression: PlayerProgression;
  customDecks: SavedDeck[];
  settings: UserSettings;
}

const TOKEN_STORAGE_KEY = 'jojo_tcg_auth_token_v1';

export function getSavedAuthToken(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setSavedAuthToken(token: string | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function normalizeProgression(
  raw: Partial<PlayerProgression> | null | undefined,
): PlayerProgression {
  const baseline = createInitialProgression();
  if (!raw || typeof raw !== 'object') return baseline;

  const hasOwned = raw.ownedCards && typeof raw.ownedCards === 'object';
  const ownedCards: Record<string, number> = hasOwned ? {} : { ...baseline.ownedCards };
  if (hasOwned && raw.ownedCards) {
    for (const [id, count] of Object.entries(raw.ownedCards)) {
      if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
        ownedCards[id] = Math.floor(count);
      }
    }
  }

  const hasFoil = raw.foilCards && typeof raw.foilCards === 'object';
  const foilCards: Record<string, number> = hasFoil ? {} : { ...(baseline.foilCards ?? {}) };
  if (hasFoil && raw.foilCards) {
    for (const [id, count] of Object.entries(raw.foilCards)) {
      if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
        foilCards[id] = Math.floor(count);
      }
    }
  }

  const equippedFoilCardIds = Array.isArray(raw.equippedFoilCardIds)
    ? Array.from(
        new Set(raw.equippedFoilCardIds.filter((id): id is string => typeof id === 'string')),
      )
    : [];

  const completedCampaignStages = Array.isArray(raw.completedCampaignStages)
    ? Array.from(
        new Set(raw.completedCampaignStages.filter((id): id is string => typeof id === 'string')),
      )
    : [];

  const completedTutorialLessons = Array.isArray(raw.completedTutorialLessons)
    ? Array.from(
        new Set(raw.completedTutorialLessons.filter((id): id is string => typeof id === 'string')),
      )
    : [];

  const claimedMilestones = Array.isArray(raw.claimedMilestones)
    ? Array.from(
        new Set(raw.claimedMilestones.filter((id): id is string => typeof id === 'string')),
      )
    : [];

  return {
    coins:
      typeof raw.coins === 'number' && Number.isFinite(raw.coins) && raw.coins >= 0
        ? Math.floor(raw.coins)
        : baseline.coins,
    ownedCards,
    foilCards,
    equippedFoilCardIds,
    packsOpened:
      typeof raw.packsOpened === 'number' && raw.packsOpened >= 0 ? Math.floor(raw.packsOpened) : 0,
    wins: typeof raw.wins === 'number' && raw.wins >= 0 ? Math.floor(raw.wins) : 0,
    losses: typeof raw.losses === 'number' && raw.losses >= 0 ? Math.floor(raw.losses) : 0,
    completedCampaignStages,
    completedTutorialLessons,
    claimedMilestones,
  };
}

export function normalizeSettings(
  raw: Partial<UserSettings> | null | undefined,
): UserSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    customImageOverrides: {
      ...DEFAULT_SETTINGS.customImageOverrides,
      ...(raw.customImageOverrides ?? {}),
    },
  };
}

export function normalizeDecks(raw: unknown): SavedDeck[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (d): d is SavedDeck =>
      typeof d === 'object' &&
      d !== null &&
      typeof (d as SavedDeck).id === 'string' &&
      typeof (d as SavedDeck).name === 'string' &&
      Array.isArray((d as SavedDeck).cardIds),
  );
}

export const authService = {
  async register(
    username: string,
    password: string,
    initialState: {
      progression: PlayerProgression;
      customDecks: SavedDeck[];
      settings: UserSettings;
    },
  ): Promise<{ ok: true; data: AuthStatePayload } | { ok: false; error: string }> {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          progression: initialState.progression,
          customDecks: initialState.customDecks,
          settings: initialState.settings,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        token?: string;
        user?: AuthUser;
        progression?: Partial<PlayerProgression>;
        customDecks?: unknown;
        settings?: Partial<UserSettings>;
      };
      if (!res.ok || !json.user || !json.token) {
        return { ok: false, error: json.error ?? 'Error al registrar la cuenta.' };
      }
      setSavedAuthToken(json.token);
      return {
        ok: true,
        data: {
          token: json.token,
          user: json.user,
          progression: normalizeProgression(json.progression),
          customDecks: normalizeDecks(json.customDecks),
          settings: normalizeSettings(json.settings),
        },
      };
    } catch {
      return { ok: false, error: 'No se pudo conectar con el servidor.' };
    }
  },

  async login(
    username: string,
    password: string,
  ): Promise<{ ok: true; data: AuthStatePayload } | { ok: false; error: string }> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const json = (await res.json()) as {
        error?: string;
        token?: string;
        user?: AuthUser;
        progression?: Partial<PlayerProgression>;
        customDecks?: unknown;
        settings?: Partial<UserSettings>;
      };
      if (!res.ok || !json.user || !json.token) {
        return { ok: false, error: json.error ?? 'Credenciales incorrectas.' };
      }
      setSavedAuthToken(json.token);
      return {
        ok: true,
        data: {
          token: json.token,
          user: json.user,
          progression: normalizeProgression(json.progression),
          customDecks: normalizeDecks(json.customDecks),
          settings: normalizeSettings(json.settings),
        },
      };
    } catch {
      return { ok: false, error: 'No se pudo conectar con el servidor.' };
    }
  },

  async fetchMe(): Promise<AuthStatePayload | null> {
    const token = getSavedAuthToken();
    if (!token) return null;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401) setSavedAuthToken(null);
        return null;
      }
      const json = (await res.json()) as {
        user?: AuthUser;
        progression?: Partial<PlayerProgression>;
        customDecks?: unknown;
        settings?: Partial<UserSettings>;
      };
      if (!json.user) return null;
      return {
        token,
        user: json.user,
        progression: normalizeProgression(json.progression),
        customDecks: normalizeDecks(json.customDecks),
        settings: normalizeSettings(json.settings),
      };
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    const token = getSavedAuthToken();
    setSavedAuthToken(null);
    if (!token) return;
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignore network errors on logout
    }
  },

  async syncAccountData(payload: {
    progression?: PlayerProgression;
    customDecks?: SavedDeck[];
    settings?: UserSettings;
  }): Promise<void> {
    const token = getSavedAuthToken();
    if (!token) return;
    try {
      await fetch('/api/user/sync', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      // Ignore transient network errors
    }
  },
};
