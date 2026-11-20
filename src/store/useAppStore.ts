import { create } from 'zustand';
import { PRESET_DECKS } from '../data/cardRegistry';
import { getBoosterPackById } from '../data/progressionData';
import type { AiDifficulty } from '../engine/ai/tacticalAi';
import { authService, type AuthUser } from '../services/authService';
import {
  craftRandomCard,
  createInitialProgression,
  openBoosterPack,
  type CraftOutcome,
  type CraftRecipeId,
  type OpenPackOutcome,
  type PlayerProgression,
} from '../services/progressionService';
import {
  DEFAULT_SETTINGS,
  type PlaymatThemeId,
  type SavedDeck,
  type UserSettings,
} from '../services/storageService';

export type AppScreen =
  | 'HOME'
  | 'BATTLE_SETUP'
  | 'BATTLE'
  | 'COLLECTION'
  | 'DECK_BUILDER'
  | 'SHOP';

interface AppStoreState {
  screen: AppScreen;
  authUser: AuthUser | null;
  authReady: boolean;
  showAuthModal: boolean;
  settings: UserSettings;
  progression: PlayerProgression;
  customDecks: SavedDeck[];
  allDecks: SavedDeck[];
  inspectedCardId: string | null;
  preferredBattleMode: 'VS_AI' | 'HOTSEAT' | 'ONLINE';
  preselectedDeckId: string | null;

  setScreen: (screen: AppScreen) => void;
  setShowAuthModal: (open: boolean) => void;
  hydrateAuthSession: () => Promise<void>;
  loginAccount: (
    username: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  registerAccount: (
    username: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  logoutAccount: () => Promise<void>;

  openBattleSetup: (mode: 'VS_AI' | 'HOTSEAT' | 'ONLINE', preselectedDeckId?: string) => void;
  openInspector: (cardId: string) => void;
  closeInspector: () => void;

  setPlaymatTheme: (theme: PlaymatThemeId) => void;
  setHotseatPrivacyScreen: (enabled: boolean) => void;
  setAnimationSpeed: (speed: UserSettings['animationSpeed']) => void;
  setEnable3dVfx: (enabled: boolean) => void;
  setAiDifficulty: (difficulty: AiDifficulty) => void;
  setCustomImageOverride: (imageId: string, url: string) => void;
  clearCustomImageOverride: (imageId: string) => void;

  saveDeck: (deck: Omit<SavedDeck, 'updatedAt'>) => void;
  deleteDeck: (deckId: string) => void;

  buyAndOpenPack: (packId: string, count?: number) => OpenPackOutcome[] | null;
  craftCard: (
    recipeId: CraftRecipeId,
    customSelection?: Record<string, number>,
  ) => CraftOutcome;
  awardBattleReward: (coins: number, won: boolean) => void;
  grantTestCoins: (amount: number) => void;
  resetProgression: () => void;
}

// Legacy localStorage cleanup so guest mode never persists data across window closes
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    window.localStorage.removeItem('jojo_tcg_progression_v1');
    window.localStorage.removeItem('jojo_tcg_decks_v1');
    window.localStorage.removeItem('jojo_tcg_settings_v1');
  } catch {
    // Ignore
  }
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  screen: 'HOME',
  authUser: null,
  authReady: false,
  showAuthModal: false,
  settings: { ...DEFAULT_SETTINGS },
  progression: createInitialProgression(),
  customDecks: [],
  allDecks: [...PRESET_DECKS],
  inspectedCardId: null,
  preferredBattleMode: 'VS_AI',
  preselectedDeckId: null,

  setScreen: (screen) => set({ screen }),
  setShowAuthModal: (showAuthModal) => set({ showAuthModal }),

  hydrateAuthSession: async () => {
    const me = await authService.fetchMe();
    if (me) {
      set({
        authUser: me.user,
        authReady: true,
        progression: me.progression,
        customDecks: me.customDecks,
        allDecks: [...PRESET_DECKS, ...me.customDecks],
        settings: me.settings,
      });
    } else {
      set({ authReady: true });
    }
  },

  loginAccount: async (username, password) => {
    const res = await authService.login(username, password);
    if (!res.ok) return res;
    set({
      authUser: res.data.user,
      progression: res.data.progression,
      customDecks: res.data.customDecks,
      allDecks: [...PRESET_DECKS, ...res.data.customDecks],
      settings: res.data.settings,
      showAuthModal: false,
    });
    return { ok: true };
  },

  registerAccount: async (username, password) => {
    const { progression, customDecks, settings } = get();
    const res = await authService.register(username, password, {
      progression,
      customDecks,
      settings,
    });
    if (!res.ok) return res;
    set({
      authUser: res.data.user,
      progression: res.data.progression,
      customDecks: res.data.customDecks,
      allDecks: [...PRESET_DECKS, ...res.data.customDecks],
      settings: res.data.settings,
      showAuthModal: false,
    });
    return { ok: true };
  },

  logoutAccount: async () => {
    await authService.logout();
    set({
      authUser: null,
      settings: { ...DEFAULT_SETTINGS },
      progression: createInitialProgression(),
      customDecks: [],
      allDecks: [...PRESET_DECKS],
    });
  },

  openBattleSetup: (mode, preselectedDeckId) =>
    set({
      screen: 'BATTLE_SETUP',
      preferredBattleMode: mode,
      preselectedDeckId: preselectedDeckId ?? null,
    }),

  openInspector: (cardId) => set({ inspectedCardId: cardId }),
  closeInspector: () => set({ inspectedCardId: null }),

  setPlaymatTheme: (playmatTheme) =>
    set((state) => {
      const next = { ...state.settings, playmatTheme };
      if (state.authUser) void authService.syncAccountData({ settings: next });
      return { settings: next };
    }),

  setHotseatPrivacyScreen: (hotseatPrivacyScreen) =>
    set((state) => {
      const next = { ...state.settings, hotseatPrivacyScreen };
      if (state.authUser) void authService.syncAccountData({ settings: next });
      return { settings: next };
    }),

  setAnimationSpeed: (animationSpeed) =>
    set((state) => {
      const next = { ...state.settings, animationSpeed };
      if (state.authUser) void authService.syncAccountData({ settings: next });
      return { settings: next };
    }),

  setEnable3dVfx: (enable3dVfx) =>
    set((state) => {
      const next = { ...state.settings, enable3dVfx };
      if (state.authUser) void authService.syncAccountData({ settings: next });
      return { settings: next };
    }),

  setAiDifficulty: (aiDifficulty) =>
    set((state) => {
      const next = { ...state.settings, aiDifficulty };
      if (state.authUser) void authService.syncAccountData({ settings: next });
      return { settings: next };
    }),

  setCustomImageOverride: (imageId, url) =>
    set((state) => {
      const next: UserSettings = {
        ...state.settings,
        customImageOverrides: {
          ...state.settings.customImageOverrides,
          [imageId]: url,
        },
      };
      if (state.authUser) void authService.syncAccountData({ settings: next });
      return { settings: next };
    }),

  clearCustomImageOverride: (imageId) =>
    set((state) => {
      const copy = { ...state.settings.customImageOverrides };
      delete copy[imageId];
      const next: UserSettings = { ...state.settings, customImageOverrides: copy };
      if (state.authUser) void authService.syncAccountData({ settings: next });
      return { settings: next };
    }),

  saveDeck: (deck) =>
    set((state) => {
      const saved: SavedDeck = {
        ...deck,
        isPreset: false,
        updatedAt: new Date().toISOString(),
      };
      const exists = state.customDecks.some((d) => d.id === saved.id);
      const nextDecks = exists
        ? state.customDecks.map((d) => (d.id === saved.id ? saved : d))
        : [...state.customDecks, saved];
      if (state.authUser) void authService.syncAccountData({ customDecks: nextDecks });
      return { customDecks: nextDecks, allDecks: [...PRESET_DECKS, ...nextDecks] };
    }),

  deleteDeck: (deckId) =>
    set((state) => {
      const nextDecks = state.customDecks.filter((d) => d.id !== deckId);
      if (state.authUser) void authService.syncAccountData({ customDecks: nextDecks });
      return { customDecks: nextDecks, allDecks: [...PRESET_DECKS, ...nextDecks] };
    }),

  buyAndOpenPack: (packId, count = 1) => {
    const pack = getBoosterPackById(packId);
    if (!pack || count <= 0) return null;
    let current = get().progression;
    const totalCost = pack.price * count;
    if (current.coins < totalCost) return null;

    const outcomes: OpenPackOutcome[] = [];
    for (let i = 0; i < count; i++) {
      const out = openBoosterPack(pack, current);
      outcomes.push(out);
      current = out.nextProgression;
    }
    if (get().authUser) void authService.syncAccountData({ progression: current });
    set({ progression: current });
    return outcomes;
  },

  craftCard: (recipeId, customSelection) => {
    const current = get().progression;
    const outcome = craftRandomCard(current, recipeId, customSelection);
    if (outcome.ok) {
      if (get().authUser) {
        void authService.syncAccountData({ progression: outcome.nextProgression });
      }
      set({ progression: outcome.nextProgression });
    }
    return outcome;
  },

  awardBattleReward: (coins, won) =>
    set((state) => {
      const next: PlayerProgression = {
        ...state.progression,
        coins: state.progression.coins + Math.max(0, coins),
        wins: state.progression.wins + (won ? 1 : 0),
        losses: state.progression.losses + (won ? 0 : 1),
      };
      if (state.authUser) void authService.syncAccountData({ progression: next });
      return { progression: next };
    }),

  grantTestCoins: (amount) =>
    set((state) => {
      const next: PlayerProgression = {
        ...state.progression,
        coins: state.progression.coins + Math.max(0, amount),
      };
      if (state.authUser) void authService.syncAccountData({ progression: next });
      return { progression: next };
    }),

  resetProgression: () =>
    set((state) => {
      const fresh = createInitialProgression();
      if (state.authUser) void authService.syncAccountData({ progression: fresh });
      return { progression: fresh };
    }),
}));
