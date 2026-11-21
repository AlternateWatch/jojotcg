export type RulesCardType = 'CHARACTER' | 'STAND' | 'ITEM' | 'EVOLUTION' | 'ENERGY';

export interface GameRulesConfig {
  minDeckSize: number;
  maxDeckSize: number;
  prizeCardCount: number;
  maxCopiesByType: Record<RulesCardType, number | null>;
  initialHandSize: number;
  maxBenchSize: number;
  firstPlayerCanAttackTurnOne: boolean;
  maxEnergyAttachmentsPerTurn: number;
  maxEvolutionsPerTurn: number;
  maxItemsPerTurn: number | null;
  bleedDamagePerStack: number;
  bleedDurationTurns: number;
  burnDamagePerTurn: number;
  benchDamageIncrement: number;
  vampireRegenAmount: number;
  /** Prevents infinite back-to-back stun-locking on the same character */
  preventConsecutiveStun: boolean;
}

/**
 * Editable master rules configuration.
 * All engine rules and deck validation consume this configuration directly.
 */
export const DEFAULT_RULES_CONFIG: GameRulesConfig = {
  minDeckSize: 46,
  maxDeckSize: 46,
  prizeCardCount: 6,
  maxCopiesByType: {
    CHARACTER: 1,
    STAND: 1,
    EVOLUTION: 1,
    ITEM: 3,
    ENERGY: null, // Basic Energy cards have no copy limit (classic Pokémon TCG rule)
  },
  initialHandSize: 5,
  maxBenchSize: 3,
  firstPlayerCanAttackTurnOne: false,
  maxEnergyAttachmentsPerTurn: 1,
  maxEvolutionsPerTurn: 1,
  maxItemsPerTurn: null,
  bleedDamagePerStack: 10,
  bleedDurationTurns: 3,
  burnDamagePerTurn: 10,
  benchDamageIncrement: 10,
  vampireRegenAmount: 10,
  preventConsecutiveStun: true,
};
