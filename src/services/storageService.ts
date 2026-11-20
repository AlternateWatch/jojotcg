import type { AiDifficulty } from '../engine/ai/tacticalAi';
import {
  createInitialProgression,
  type PlayerProgression,
} from './progressionService';

export interface SavedDeck {
  id: string;
  name: string;
  description?: string;
  cardIds: string[];
  updatedAt: string;
  isPreset?: boolean;
}

export type PlaymatThemeId =
  | 'killer-queen-purple'
  | 'killer-queen-dark'
  | 'jojo-emblems-dark'
  | 'bucciarati-dark'
  | 'jojo-emblems-light'
  | 'bucciarati-light';

export interface UserSettings {
  playmatTheme: PlaymatThemeId;
  hotseatPrivacyScreen: boolean;
  animationSpeed: 'slow' | 'normal' | 'fast';
  enable3dVfx: boolean;
  aiDifficulty: AiDifficulty;
  customImageOverrides: Record<string, string>;
  selectedDeckId?: string;
  selectedOpponentDeckId?: string;
}

export interface StorageAdapter {
  loadDecks(): SavedDeck[];
  saveDecks(decks: SavedDeck[]): void;
  loadSettings(): UserSettings;
  saveSettings(settings: UserSettings): void;
  loadProgression(): PlayerProgression;
  saveProgression(progression: PlayerProgression): void;
}

const DECKS_KEY = 'jojo_tcg_decks_v1';
const SETTINGS_KEY = 'jojo_tcg_settings_v1';
const PROGRESSION_KEY = 'jojo_tcg_progression_v1';

export const DEFAULT_SETTINGS: UserSettings = {
  playmatTheme: 'killer-queen-dark',
  hotseatPrivacyScreen: true,
  animationSpeed: 'normal',
  enable3dVfx: true,
  aiDifficulty: 'NORMAL',
  customImageOverrides: {},
};

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export const storageService: StorageAdapter = {
  loadDecks(): SavedDeck[] {
    if (!hasLocalStorage()) return [];
    try {
      const raw = window.localStorage.getItem(DECKS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (d): d is SavedDeck =>
          typeof d === 'object' &&
          d !== null &&
          typeof (d as SavedDeck).id === 'string' &&
          typeof (d as SavedDeck).name === 'string' &&
          Array.isArray((d as SavedDeck).cardIds),
      );
    } catch {
      return [];
    }
  },

  saveDecks(decks: SavedDeck[]): void {
    if (!hasLocalStorage()) return;
    try {
      window.localStorage.setItem(DECKS_KEY, JSON.stringify(decks));
    } catch {
      // Ignore quota errors gracefully
    }
  },

  loadSettings(): UserSettings {
    if (!hasLocalStorage()) return { ...DEFAULT_SETTINGS };
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw) as Partial<UserSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        customImageOverrides: {
          ...DEFAULT_SETTINGS.customImageOverrides,
          ...(parsed.customImageOverrides ?? {}),
        },
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  saveSettings(settings: UserSettings): void {
    if (!hasLocalStorage()) return;
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore quota errors gracefully
    }
  },

  loadProgression(): PlayerProgression {
    const baseline = createInitialProgression();
    if (!hasLocalStorage()) return baseline;
    try {
      const raw = window.localStorage.getItem(PROGRESSION_KEY);
      if (!raw) {
        window.localStorage.setItem(PROGRESSION_KEY, JSON.stringify(baseline));
        return baseline;
      }
      const parsed = JSON.parse(raw) as Partial<PlayerProgression>;
      const hasSavedOwnedMap =
        parsed.ownedCards !== undefined &&
        parsed.ownedCards !== null &&
        typeof parsed.ownedCards === 'object';
      const mergedOwned: Record<string, number> = hasSavedOwnedMap
        ? {}
        : { ...baseline.ownedCards };
      if (hasSavedOwnedMap && parsed.ownedCards) {
        for (const [id, count] of Object.entries(parsed.ownedCards)) {
          if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
            mergedOwned[id] = Math.floor(count);
          }
        }
      }
      return {
        coins:
          typeof parsed.coins === 'number' && Number.isFinite(parsed.coins) && parsed.coins >= 0
            ? Math.floor(parsed.coins)
            : baseline.coins,
        ownedCards: mergedOwned,
        packsOpened:
          typeof parsed.packsOpened === 'number' && parsed.packsOpened >= 0
            ? Math.floor(parsed.packsOpened)
            : 0,
        wins: typeof parsed.wins === 'number' && parsed.wins >= 0 ? Math.floor(parsed.wins) : 0,
        losses:
          typeof parsed.losses === 'number' && parsed.losses >= 0 ? Math.floor(parsed.losses) : 0,
      };
    } catch {
      return baseline;
    }
  },

  saveProgression(progression: PlayerProgression): void {
    if (!hasLocalStorage()) return;
    try {
      window.localStorage.setItem(PROGRESSION_KEY, JSON.stringify(progression));
    } catch {
      // Ignore quota errors gracefully
    }
  },
};
