export type RulesCardType = 'CHARACTER' | 'STAND' | 'ITEM' | 'EVOLUTION' | 'ENERGY';

export interface GameRulesConfig {
  minDeckSize: number;
  maxDeckSize: number;
  prizeCardCount: number;
  maxCopiesByType: Record<RulesCardType, number | null>;
  maxStandEnergyCopies: number;
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
  /** Optional Roguelike run relic bonuses for P1 (default 0 in normal matches) */
  p1BonusMaxHp?: number;
  p1BonusDamage?: number;
  p1ExtraInitialHand?: number;
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
  maxStandEnergyCopies: 4,
  initialHandSize: 7,
  maxBenchSize: 3,
  firstPlayerCanAttackTurnOne: false,
  maxEnergyAttachmentsPerTurn: 1,
  maxEvolutionsPerTurn: 1,
  maxItemsPerTurn: 1,
  bleedDamagePerStack: 10,
  bleedDurationTurns: 3,
  burnDamagePerTurn: 10,
  benchDamageIncrement: 10,
  vampireRegenAmount: 10,
  preventConsecutiveStun: true,
};
