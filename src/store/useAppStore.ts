import { create } from 'zustand';
import { PRESET_DECKS } from '../data/cardRegistry';
import { getBoosterPackById } from '../data/progressionData';
import type { AiDifficulty } from '../engine/ai/tacticalAi';
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
  storageService,
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
  settings: UserSettings;
  progression: PlayerProgression;
  customDecks: SavedDeck[];
  allDecks: SavedDeck[];
  inspectedCardId: string | null;
  preferredBattleMode: 'VS_AI' | 'HOTSEAT';
  preselectedDeckId: string | null;

  setScreen: (screen: AppScreen) => void;
  openBattleSetup: (mode: 'VS_AI' | 'HOTSEAT', preselectedDeckId?: string) => void;
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

const initialSettings = storageService.loadSettings();
const initialCustomDecks = storageService.loadDecks();
const initialProgression = storageService.loadProgression();

export const useAppStore = create<AppStoreState>((set, get) => ({
  screen: 'HOME',
  settings: initialSettings ?? DEFAULT_SETTINGS,
  progression: initialProgression,
  customDecks: initialCustomDecks,
  allDecks: [...PRESET_DECKS, ...initialCustomDecks],
  inspectedCardId: null,
  preferredBattleMode: 'VS_AI',
  preselectedDeckId: null,

  setScreen: (screen) => set({ screen }),

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
      storageService.saveSettings(next);
      return { settings: next };
    }),

  setHotseatPrivacyScreen: (hotseatPrivacyScreen) =>
    set((state) => {
      const next = { ...state.settings, hotseatPrivacyScreen };
      storageService.saveSettings(next);
      return { settings: next };
    }),

  setAnimationSpeed: (animationSpeed) =>
    set((state) => {
      const next = { ...state.settings, animationSpeed };
      storageService.saveSettings(next);
      return { settings: next };
    }),

  setEnable3dVfx: (enable3dVfx) =>
    set((state) => {
      const next = { ...state.settings, enable3dVfx };
      storageService.saveSettings(next);
      return { settings: next };
    }),

  setAiDifficulty: (aiDifficulty) =>
    set((state) => {
      const next = { ...state.settings, aiDifficulty };
      storageService.saveSettings(next);
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
      storageService.saveSettings(next);
      return { settings: next };
    }),

  clearCustomImageOverride: (imageId) =>
    set((state) => {
      const copy = { ...state.settings.customImageOverrides };
      delete copy[imageId];
      const next: UserSettings = { ...state.settings, customImageOverrides: copy };
      storageService.saveSettings(next);
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
      storageService.saveDecks(nextDecks);
      return { customDecks: nextDecks, allDecks: [...PRESET_DECKS, ...nextDecks] };
    }),

  deleteDeck: (deckId) =>
    set((state) => {
      const nextDecks = state.customDecks.filter((d) => d.id !== deckId);
      storageService.saveDecks(nextDecks);
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
    storageService.saveProgression(current);
    set({ progression: current });
    return outcomes;
  },

  craftCard: (recipeId, customSelection) => {
    const current = get().progression;
    const outcome = craftRandomCard(current, recipeId, customSelection);
    if (outcome.ok) {
      storageService.saveProgression(outcome.nextProgression);
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
      storageService.saveProgression(next);
      return { progression: next };
    }),

  grantTestCoins: (amount) =>
    set((state) => {
      const next: PlayerProgression = {
        ...state.progression,
        coins: state.progression.coins + Math.max(0, amount),
      };
      storageService.saveProgression(next);
      return { progression: next };
    }),

  resetProgression: () =>
    set(() => {
      const fresh = createInitialProgression();
      storageService.saveProgression(fresh);
      return { progression: fresh };
    }),
}));
