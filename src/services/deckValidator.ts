import { getCardById } from '../data/cardRegistry';
import { DEFAULT_RULES_CONFIG, type GameRulesConfig } from '../data/rulesConfig';
import {
  ENERGY_META,
  type CardType,
  type CharacterCategory,
  type EnergyType,
} from '../data/schemas/cardTypes';

export interface DeckValidationIssue {
  severity: 'ERROR' | 'WARNING';
  code: string;
  message: string;
  cardId?: string;
}

export interface DeckStats {
  totalCards: number;
  byType: Record<CardType, number>;
  byCategory: Partial<Record<CharacterCategory, number>>;
  byEnergy: Partial<Record<EnergyType, number>>;
  selfSufficientCharacters: number;
  compatibleStandPairs: number;
}

export interface DeckValidationResult {
  valid: boolean;
  errors: DeckValidationIssue[];
  warnings: DeckValidationIssue[];
  stats: DeckStats;
}

export function validateDeck(
  cardIds: readonly string[],
  rules: GameRulesConfig = DEFAULT_RULES_CONFIG,
): DeckValidationResult {
  const errors: DeckValidationIssue[] = [];
  const warnings: DeckValidationIssue[] = [];

  const stats: DeckStats = {
    totalCards: cardIds.length,
    byType: {
      CHARACTER: 0,
      STAND: 0,
      EVOLUTION: 0,
      ITEM: 0,
      ENERGY: 0,
    },
    byCategory: {},
    byEnergy: {},
    selfSufficientCharacters: 0,
    compatibleStandPairs: 0,
  };

  const counts = new Map<string, number>();
  const standUsers: { id: string; dg: number }[] = [];
  const stands: { id: string; requiredDg: number }[] = [];
  const maxColorNeededByAnyAttack = new Map<
    EnergyType,
    { maxCount: number; cardName: string; isStandAttack: boolean }
  >();

  const recordAttackCosts = (
    cardName: string,
    attacks: readonly { energyCost: EnergyType[] }[],
    isStandAttack: boolean,
  ) => {
    for (const atk of attacks) {
      const perColor = new Map<EnergyType, number>();
      for (const req of atk.energyCost) {
        if (req === 'COLORLESS') continue;
        perColor.set(req, (perColor.get(req) ?? 0) + 1);
      }
      for (const [color, needed] of perColor.entries()) {
        const prev = maxColorNeededByAnyAttack.get(color);
        if (!prev || needed > prev.maxCount) {
          maxColorNeededByAnyAttack.set(color, { maxCount: needed, cardName, isStandAttack });
        }
      }
    }
  };

  for (const id of cardIds) {
    const card = getCardById(id);
    if (!card) {
      errors.push({
        severity: 'ERROR',
        code: 'UNKNOWN_CARD',
        message: `Carta desconocida en el mazo: ${id}`,
        cardId: id,
      });
      continue;
    }

    counts.set(id, (counts.get(id) ?? 0) + 1);
    stats.byType[card.type]++;

    if (card.type === 'CHARACTER') {
      for (const cat of card.categories) {
        stats.byCategory[cat] = (stats.byCategory[cat] ?? 0) + 1;
      }
      const isSelfSufficient = card.attacks.length > 0;
      if (isSelfSufficient) {
        stats.selfSufficientCharacters++;
      }
      if (card.categories.includes('STAND_USER') && card.dg !== null) {
        standUsers.push({ id: card.id, dg: card.dg });
      }
      recordAttackCosts(card.name, card.attacks, false);
    } else if (card.type === 'STAND') {
      stands.push({ id: card.id, requiredDg: card.requiredDg });
      recordAttackCosts(card.name, card.attacks, true);
    } else if (card.type === 'EVOLUTION') {
      recordAttackCosts(card.name, card.attacks, card.evolutionTarget === 'STAND');
    } else if (card.type === 'ENERGY') {
      stats.byEnergy[card.energyType] = (stats.byEnergy[card.energyType] ?? 0) + 1;
    }
  }

  for (const user of standUsers) {
    if (stands.some((s) => user.dg >= s.requiredDg)) {
      stats.compatibleStandPairs++;
    }
  }

  // Deck size check
  if (cardIds.length < rules.minDeckSize) {
    errors.push({
      severity: 'ERROR',
      code: 'DECK_TOO_SMALL',
      message: `El mazo tiene ${cardIds.length} cartas (mínimo requerido: ${rules.minDeckSize}).`,
    });
  }
  if (cardIds.length > rules.maxDeckSize) {
    errors.push({
      severity: 'ERROR',
      code: 'DECK_TOO_LARGE',
      message: `El mazo tiene ${cardIds.length} cartas (máximo permitido: ${rules.maxDeckSize}).`,
    });
  }

  // Copy limits per card type (special cap of 8 for Energía de Stand)
  for (const [id, count] of counts.entries()) {
    const card = getCardById(id);
    if (!card) continue;
    const limit =
      card.type === 'ENERGY' && card.energyType === 'STAND'
        ? rules.maxStandEnergyCopies
        : rules.maxCopiesByType[card.type];
    if (limit !== null && count > limit) {
      errors.push({
        severity: 'ERROR',
        code: 'COPY_LIMIT_EXCEEDED',
        message: `${card.name} supera el límite de copias (${count}/${limit}).`,
        cardId: id,
      });
    }
  }

  // Must have at least 1 valid starting condition to avoid infinite mulligans
  if (stats.selfSufficientCharacters === 0 && stats.compatibleStandPairs === 0) {
    errors.push({
      severity: 'ERROR',
      code: 'NO_VALID_STARTER',
      message:
        'El mazo debe incluir al menos un personaje autosuficiente (Hamon/Vampiro/Hombre del Pilar/Convencional) o una pareja compatible Usuario de Stand + Stand.',
    });
  }

  // Helpful tactical warnings
  if (stats.byType.CHARACTER < 5) {
    warnings.push({
      severity: 'WARNING',
      code: 'FEW_CHARACTERS',
      message: 'Tienes menos de 5 personajes; podrías quedarte sin banca rápidamente.',
    });
  }
  if (stats.byType.ENERGY < 10) {
    warnings.push({
      severity: 'WARNING',
      code: 'FEW_ENERGIES',
      message: 'Tienes pocas cartas de Energía (< 10); puede costarte activar ataques potentes.',
    });
  }
  if (stats.byType.STAND > 0 && standUsers.length === 0) {
    warnings.push({
      severity: 'WARNING',
      code: 'ORPHAN_STANDS',
      message: 'Incluyes cartas de Stand pero ningún Usuario de Stand para equiparlos.',
    });
  }

  // Energy color consistency diagnostics (Energía de Stand is a wildcard for Stands, so don't penalize it as an extra color)
  const standEnergyCount = stats.byEnergy.STAND ?? 0;
  const distinctEnergyColors = Object.keys(stats.byEnergy).filter(
    (k) => k !== 'STAND' && (stats.byEnergy[k as EnergyType] ?? 0) > 0,
  );
  if (distinctEnergyColors.length > 3) {
    warnings.push({
      severity: 'WARNING',
      code: 'TOO_MANY_ENERGY_TYPES',
      message: `Usas ${distinctEnergyColors.length} tipos distintos de Energía. Centrarte en 1–2 tipos (+ Brújula de Energía) evita quedarte sin ataques.`,
    });
  }
  if ((stats.byEnergy.COLORLESS ?? 0) > 0 && distinctEnergyColors.length > 1) {
    warnings.push({
      severity: 'WARNING',
      code: 'COLORLESS_ENERGY_TIP',
      message:
        'Cualquier Energía elemental también paga costes Incoloros; cambiar Energía Incolora por tus colores principales mejora la consistencia.',
    });
  }
  for (const [color, req] of maxColorNeededByAnyAttack.entries()) {
    const inDeck = (stats.byEnergy[color] ?? 0) + (req.isStandAttack ? standEnergyCount : 0);
    const label = ENERGY_META[color].label;
    if (inDeck === 0) {
      warnings.push({
        severity: 'WARNING',
        code: 'MISSING_REQUIRED_ENERGY',
        message: `${req.cardName} requiere Energía ${label}, pero tu mazo no tiene ninguna copia.`,
      });
    } else if (inDeck < req.maxCount) {
      warnings.push({
        severity: 'WARNING',
        code: 'SCARCE_REQUIRED_ENERGY',
        message: `${req.cardName} pide ${req.maxCount}× ${label} y solo llevas ${inDeck} en el mazo.`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}
