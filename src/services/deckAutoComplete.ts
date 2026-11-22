import {
  ALL_CARDS,
  CARD_SYNERGIES,
  getCardById,
  getCharacterCard,
  getEvolutionCard,
  getStandCard,
} from '../data/cardRegistry';
import { DEFAULT_RULES_CONFIG } from '../data/rulesConfig';
import type { AttackDef, EnergyType } from '../data/schemas/cardTypes';
import { getOwnedCount, type PlayerProgression } from './progressionService';

export interface AutoCompleteResult {
  cardIds: string[];
  addedCount: number;
}

function collectAttackColors(attacks: readonly AttackDef[]): Set<EnergyType> {
  const colors = new Set<EnergyType>();
  for (const atk of attacks) {
    for (const e of atk.energyCost) {
      if (e !== 'COLORLESS') colors.add(e);
    }
  }
  return colors;
}

function getCardRequiredColors(cardId: string): Set<EnergyType> {
  const card = getCardById(cardId);
  if (!card) return new Set();
  if (card.type === 'CHARACTER' || card.type === 'STAND' || card.type === 'EVOLUTION') {
    return collectAttackColors(card.attacks);
  }
  return new Set();
}

function getDeckRequiredColors(cardIds: readonly string[]): Set<EnergyType> {
  const colors = new Set<EnergyType>();
  for (const id of cardIds) {
    for (const c of getCardRequiredColors(id)) {
      colors.add(c);
    }
  }
  return colors;
}

/**
 * Intelligently fills an incomplete deck up to 40 cards using ONLY cards owned by the player
 * (plus unlimited Basic Energies), preserving all existing cards and optimizing synergies,
 * Stand/User DG compatibility, utility items, and elemental energy ratios.
 */
export function autoCompleteDeck(
  currentCardIds: readonly string[],
  progression: PlayerProgression,
): AutoCompleteResult {
  const maxDeck = DEFAULT_RULES_CONFIG.maxDeckSize;
  const nextIds = [...currentCardIds];
  if (nextIds.length >= maxDeck) {
    return { cardIds: nextIds, addedCount: 0 };
  }

  const startLength = nextIds.length;
  const counts = new Map<string, number>();
  for (const id of nextIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const canAdd = (cardId: string): boolean => {
    if (nextIds.length >= maxDeck) return false;
    const card = getCardById(cardId);
    if (!card) return false;
    const owned = getOwnedCount(progression, cardId);
    if (owned <= 0) return false;
    const ruleLimit =
      card.type === 'ENERGY' && card.energyType === 'STAND'
        ? DEFAULT_RULES_CONFIG.maxStandEnergyCopies
        : DEFAULT_RULES_CONFIG.maxCopiesByType[card.type];
    const effectiveLimit = ruleLimit === null ? owned : Math.min(ruleLimit, owned);
    return (counts.get(cardId) ?? 0) < effectiveLimit;
  };

  const tryAdd = (cardId: string): boolean => {
    if (!canAdd(cardId)) return false;
    nextIds.push(cardId);
    counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
    return true;
  };

  const countByType = (type: 'CHARACTER' | 'STAND' | 'EVOLUTION' | 'ITEM' | 'ENERGY'): number =>
    nextIds.filter((id) => getCardById(id)?.type === type).length;

  const getDeckStandUsers = () =>
    nextIds
      .map(getCharacterCard)
      .filter(
        (c): c is NonNullable<typeof c> =>
          Boolean(c && c.categories.includes('STAND_USER') && c.dg !== null),
      );

  const getDeckStands = () =>
    nextIds.map(getStandCard).filter((s): s is NonNullable<typeof s> => Boolean(s));

  const getMaxUserDg = (): number =>
    getDeckStandUsers().reduce((max, u) => Math.max(max, u.dg ?? 0), 0);

  // Detect seed archetype, parts, and colors from the player's starting cards
  const seedCards = currentCardIds.map(getCardById).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const seedParts = new Set<number>(seedCards.filter((c) => c.type !== 'ENERGY').map((c) => c.part));
  const seedHasStandArchetype = seedCards.some(
    (c) =>
      c.type === 'STAND' ||
      (c.type === 'CHARACTER' && c.categories.includes('STAND_USER')) ||
      (c.type === 'EVOLUTION' && (c.evolutionTarget === 'STAND' || c.categories?.includes('STAND_USER'))) ||
      c.id === 'item-flecha-de-stand' ||
      c.id === 'item-flecha-requiem' ||
      c.id === 'energy-stand',
  );
  const seedHasHamonArchetype =
    !seedHasStandArchetype &&
    seedCards.some(
      (c) =>
        (c.type === 'CHARACTER' && c.categories.includes('HAMON_USER')) ||
        c.id === 'item-clackers' ||
        c.id === 'item-entrenamiento-air-supplena',
    );
  const seedHasConventionalArchetype =
    !seedHasStandArchetype &&
    !seedHasHamonArchetype &&
    seedCards.some(
      (c) =>
        (c.type === 'CHARACTER' && c.categories.includes('CONVENTIONAL_FIGHTER')) ||
        c.id === 'item-estilo-de-combate-ogre-street',
    );
  const seedHasVampirePillarArchetype =
    !seedHasStandArchetype &&
    seedCards.some(
      (c) =>
        c.type === 'CHARACTER' &&
        (c.categories.includes('VAMPIRE') || c.categories.includes('PILLAR_MAN')),
    );

  // Reserve space for Energies so the deck always has enough fuel (~15-18 energies, not flooded)
  const MIN_ENERGIES = 15;
  const nonEnergyBudget = () => Math.max(0, maxDeck - MIN_ENERGIES - (nextIds.length - countByType('ENERGY')));

  // 1. Evolution prerequisites (base card + catalyst items + bench partners)
  for (const id of [...nextIds]) {
    const evo = getEvolutionCard(id);
    if (!evo || nonEnergyBudget() <= 0) continue;
    tryAdd(evo.baseCardId);
    for (const req of evo.requirements) {
      if (nonEnergyBudget() <= 0) break;
      if (req.kind === 'BASE_ACTIVE_CHARACTER') {
        tryAdd(req.characterId);
      } else if (req.kind === 'BASE_ATTACHED_STAND') {
        tryAdd(req.standId);
      } else if (req.kind === 'BASE_ACTIVE_CHARACTER_OR_STAND') {
        tryAdd(req.characterId);
        if (req.standId) tryAdd(req.standId);
      } else if (req.kind === 'BENCH_CHARACTER_PRESENT') {
        tryAdd(req.characterId);
      } else if (req.kind === 'BENCH_STAND_PRESENT') {
        tryAdd(req.standId);
      } else if (req.kind === 'CONSUME_HAND_ITEM_TAG' || req.kind === 'EQUIPPED_ITEM_TAG') {
        const catalyst = ALL_CARDS.find(
          (c) => c.type === 'ITEM' && c.catalystTag === req.catalystTag,
        );
        if (catalyst) tryAdd(catalyst.id);
      }
    }
  }

  // 2. Direct synergy partners for cards already placed by the player
  const TARGET_CHARS = seedHasStandArchetype ? 10 : 12;
  const TARGET_STANDS = seedHasStandArchetype ? 8 : 5;

  for (const id of [...nextIds]) {
    const syn = CARD_SYNERGIES[id];
    if (!syn || nonEnergyBudget() <= 0) continue;
    for (const partnerId of syn.partnerCardIds) {
      if (nonEnergyBudget() <= 0) break;
      const partner = getCardById(partnerId);
      if (!partner) continue;
      if (partner.type === 'CHARACTER' && countByType('CHARACTER') >= TARGET_CHARS) continue;
      if (partner.type === 'STAND' && countByType('STAND') >= TARGET_STANDS) continue;
      if (partner.type === 'EVOLUTION') continue; // Don't force unrequested evolutions
      tryAdd(partnerId);
    }
  }

  // 3. Ensure Stands have compatible Stand Users, and fill Characters up to TARGET_CHARS
  const ownedCharacters = ALL_CARDS.filter(
    (c) => c.type === 'CHARACTER' && canAdd(c.id),
  );

  // First, if the deck already has Stands without a high-enough DG Stand User, add one!
  const deckStands = getDeckStands();
  const maxNeededDg = deckStands.reduce((max, s) => Math.max(max, s.requiredDg), 0);
  if (maxNeededDg > getMaxUserDg() && nonEnergyBudget() > 0) {
    const compatUsers = ownedCharacters
      .filter((c) => c.type === 'CHARACTER' && c.categories.includes('STAND_USER') && (c.dg ?? 0) >= maxNeededDg)
      .sort((a, b) => {
        if (a.type !== 'CHARACTER' || b.type !== 'CHARACTER') return 0;
        const partBonusA = seedParts.has(a.part) ? 50 : 0;
        const partBonusB = seedParts.has(b.part) ? 50 : 0;
        return b.maxHp + partBonusB - (a.maxHp + partBonusA);
      });
    if (compatUsers[0]) {
      tryAdd(compatUsers[0].id);
    }
  }

  // Score and add owned Characters up to TARGET_CHARS
  while (countByType('CHARACTER') < TARGET_CHARS && nonEnergyBudget() > 0) {
    const deckColors = getDeckRequiredColors(nextIds);
    const hasStandInDeckNow = seedHasStandArchetype || countByType('STAND') > 0 || getDeckStandUsers().length > 0;
    const TURN_1_MAX_DG = 4;
    const turn1StartersCount = nextIds.filter((id) => {
      const ch = getCharacterCard(id);
      return Boolean(ch && (ch.dg === null || ch.dg <= TURN_1_MAX_DG));
    }).length;
    const hasSelfSufficient = nextIds.some((id) => {
      const ch = getCharacterCard(id);
      return Boolean(ch && ch.attacks.length > 0);
    });

    const candidates = ALL_CARDS.filter((c) => c.type === 'CHARACTER' && canAdd(c.id));
    if (candidates.length === 0) break;

    candidates.sort((a, b) => {
      if (a.type !== 'CHARACTER' || b.type !== 'CHARACTER') return 0;
      const score = (ch: typeof a) => {
        let s = ch.maxHp * 0.45;
        const colors = collectAttackColors(ch.attacks);
        const newColors = [...colors].filter((col) => !deckColors.has(col)).length;

        // Archetype fidelity: strongly keep Stand decks as Stand Users, Hamon decks as Hamon, etc.
        if (seedHasStandArchetype) {
          if (ch.categories.includes('STAND_USER')) {
            s += 130;
            if (maxNeededDg > 0 && (ch.dg ?? 0) >= maxNeededDg) s += 35;
            // Ensure at least 2 Turn-1 playable Stand Users (DG <= 4) so the deck never bricks
            if (turn1StartersCount < 2 && (ch.dg ?? 99) <= TURN_1_MAX_DG) {
              s += 65;
            }
          } else {
            // Heavily penalize off-archetype non-Stand fighters (Hamon, Vampires, etc.)
            s -= 140;
          }
        } else if (seedHasHamonArchetype) {
          if (ch.categories.includes('HAMON_USER')) s += 130;
          else if (ch.categories.includes('STAND_USER')) s -= 110;
          else s -= 40;
        } else if (seedHasConventionalArchetype) {
          if (ch.categories.includes('CONVENTIONAL_FIGHTER')) s += 130;
          else if (ch.categories.includes('STAND_USER')) s -= 110;
          else s -= 30;
        } else if (seedHasVampirePillarArchetype) {
          if (ch.categories.includes('VAMPIRE') || ch.categories.includes('PILLAR_MAN')) s += 130;
          else if (ch.categories.includes('STAND_USER')) s -= 110;
          else s -= 30;
        } else {
          // Open / empty seed: balanced approach
          if (!hasSelfSufficient && ch.attacks.length > 0) s += 60;
          if (ch.attacks.length > 0) s += 20;
          if (ch.categories.includes('STAND_USER') && (ch.dg ?? 0) >= 4) s += 20;
        }

        // Color discipline: avoid introducing extra energy colors unnecessarily
        if (deckColors.size > 0 && newColors > 0) {
          s -= deckColors.size + newColors > 2 ? newColors * 80 : newColors * 35;
        } else if (colors.size > 0 && newColors === 0 && deckColors.size > 0) {
          s += 35;
        }

        // Same-Part affinity (e.g. Part 4 Morioh allies with Killer Queen)
        if (seedParts.has(ch.part)) s += 30;

        // Direct synergy with any card already in deck
        const syn = CARD_SYNERGIES[ch.id];
        if (syn && syn.partnerCardIds.some((pid) => nextIds.includes(pid))) {
          s += 55;
        }

        // Non-Stand decks benefit from at least 1 Turn-1 attacker
        if (!hasStandInDeckNow && !hasSelfSufficient && ch.attacks.length > 0) {
          s += 70;
        }

        return s;
      };
      return score(b) - score(a);
    });

    if (!tryAdd(candidates[0]!.id)) break;
  }

  // 4. Fill compatible Stands up to TARGET_STANDS if the deck has Stand Users
  const standUsers = getDeckStandUsers();
  const desiredStands =
    standUsers.length > 0 ? Math.min(TARGET_STANDS, Math.max(4, standUsers.length - 1)) : 0;

  while (countByType('STAND') < desiredStands && nonEnergyBudget() > 0) {
    const deckColors = getDeckRequiredColors(nextIds);
    const maxDg = getMaxUserDg();

    const candidates = ALL_CARDS.filter((c) => {
      if (c.type !== 'STAND' || !canAdd(c.id)) return false;
      if (c.requiredDg > maxDg) return false;
      if (
        c.compatibleCharacterIds &&
        !c.compatibleCharacterIds.some((cid) => nextIds.includes(cid))
      ) {
        return false;
      }
      return true;
    });
    if (candidates.length === 0) break;

    candidates.sort((a, b) => {
      if (a.type !== 'STAND' || b.type !== 'STAND') return 0;
      const score = (st: typeof a) => {
        const colors = collectAttackColors(st.attacks);
        const newColors = [...colors].filter((col) => !deckColors.has(col)).length;
        let s = 50;
        if (deckColors.size > 0 && newColors > 0) {
          s -= deckColors.size + newColors > 2 ? newColors * 90 : newColors * 30;
        } else if (colors.size === 0 || newColors === 0) {
          s += 50;
        }
        // Synergy with users already in deck
        const syn = CARD_SYNERGIES[st.id];
        if (syn && syn.partnerCardIds.some((pid) => nextIds.includes(pid))) {
          s += 60;
        }
        if (seedParts.has(st.part)) s += 20;
        // Prefer lower requiredDg so more Stand Users on board can equip it
        s += (6 - st.requiredDg) * 8;
        return s;
      };
      return score(b) - score(a);
    });

    if (!tryAdd(candidates[0]!.id)) break;
  }

  // 5. Fill Utility Items (preserving at least MIN_ENERGIES slots for Basic Energies)
  const hasStandsInDeck = countByType('STAND') > 0;
  const hasHamonInDeck = nextIds.some((id) => {
    const ch = getCharacterCard(id);
    return Boolean(ch && ch.categories.includes('HAMON_USER'));
  });
  const hasConventionalInDeck = nextIds.some((id) => {
    const ch = getCharacterCard(id);
    return Boolean(ch && ch.categories.includes('CONVENTIONAL_FIGHTER'));
  });
  const hasStandEvoInDeck = nextIds.some((id) => {
    const evo = getEvolutionCard(id);
    return Boolean(evo && evo.evolutionTarget === 'STAND');
  });

  const itemPlan: { id: string; target: number }[] = [
    ...(hasStandsInDeck ? [{ id: 'item-flecha-de-stand', target: 3 }] : []),
    ...(hasStandEvoInDeck ? [{ id: 'item-flecha-requiem', target: 2 }] : []),
    { id: 'item-atraccion-usuarios-stand', target: 3 },
    { id: 'item-comida-de-tonio', target: 3 },
    { id: 'item-suministros-speedwagon', target: 3 },
    ...(hasHamonInDeck
      ? [
          { id: 'item-clackers', target: 3 },
          { id: 'item-entrenamiento-air-supplena', target: 3 },
        ]
      : []),
    ...(hasConventionalInDeck ? [{ id: 'item-estilo-de-combate-ogre-street', target: 3 }] : []),
    { id: 'item-muerte-de-danny', target: 2 },
    { id: 'item-pluck', target: 2 },
    { id: 'item-cinta-de-caesar', target: 2 },
    { id: 'item-mechero-de-polpo', target: 2 },
    { id: 'item-ataud-de-dio', target: 2 },
    { id: 'item-mascara-de-piedra', target: 2 },
    { id: 'item-piedra-roja-de-aja', target: 2 },
  ];

  const MAX_ITEMS_AUTO = hasStandsInDeck ? 13 : 16;
  for (const plan of itemPlan) {
    while (
      countByType('ITEM') < MAX_ITEMS_AUTO &&
      nonEnergyBudget() > 0 &&
      (counts.get(plan.id) ?? 0) < plan.target &&
      tryAdd(plan.id)
    ) {
      // keep adding up to plan.target
    }
  }

  // 6. Fill remaining slots up to maxDeck with optimal Energies (up to 4 Stand Energies for Stand decks + matching Basic Energies)
  if (hasStandsInDeck && standUsers.length >= 2) {
    const desiredStandEnergies = Math.min(
      DEFAULT_RULES_CONFIG.maxStandEnergyCopies,
      Math.max(0, maxDeck - nextIds.length - 12),
    );
    while (
      (counts.get('energy-stand') ?? 0) < desiredStandEnergies &&
      tryAdd('energy-stand')
    ) {
      // add up to 4 Stand Energies
    }
  }

  const remainingSlots = maxDeck - nextIds.length;
  if (remainingSlots > 0) {
    const maxPerColor = new Map<EnergyType, number>();
    const weightPerColor = new Map<EnergyType, number>();

    const scanAttacks = (attacks: readonly AttackDef[]) => {
      for (const atk of attacks) {
        const atkCounts = new Map<EnergyType, number>();
        for (const req of atk.energyCost) {
          if (req === 'COLORLESS') continue;
          atkCounts.set(req, (atkCounts.get(req) ?? 0) + 1);
          weightPerColor.set(req, (weightPerColor.get(req) ?? 0) + 1);
        }
        for (const [col, n] of atkCounts.entries()) {
          maxPerColor.set(col, Math.max(maxPerColor.get(col) ?? 0, n));
        }
      }
    };

    for (const id of nextIds) {
      const card = getCardById(id);
      if (card && (card.type === 'CHARACTER' || card.type === 'STAND' || card.type === 'EVOLUTION')) {
        scanAttacks(card.attacks);
      }
    }

    const neededColors = Array.from(weightPerColor.keys());

    if (neededColors.length === 0) {
      // Deck only has COLORLESS attacks -> use a single elemental color (Psychic) so it pays COLORLESS cleanly
      const existingEnergyCard = nextIds.find((id) => {
        const c = getCardById(id);
        return c?.type === 'ENERGY' && c.energyType !== 'COLORLESS';
      });
      const fallbackEnergyId = existingEnergyCard ?? 'energy-psychic';
      for (let i = 0; i < remainingSlots; i++) {
        tryAdd(fallbackEnergyId);
      }
    } else {
      // First satisfy minimum per-attack requirements for every required color
      let slotsLeft = remainingSlots;
      const existingEnergyCount = (color: EnergyType) =>
        counts.get(`energy-${color.toLowerCase()}`) ?? 0;

      for (const col of neededColors) {
        const minNeeded = Math.max(maxPerColor.get(col) ?? 1, 2);
        const deficit = Math.max(0, minNeeded - existingEnergyCount(col));
        const toAdd = Math.min(deficit, slotsLeft);
        for (let i = 0; i < toAdd; i++) {
          if (tryAdd(`energy-${col.toLowerCase()}`)) {
            slotsLeft--;
          }
        }
      }

      // Distribute remaining energy slots proportionally to color weights
      const totalWeight = neededColors.reduce((sum, col) => sum + (weightPerColor.get(col) ?? 1), 0);
      const sortedColors = [...neededColors].sort(
        (a, b) => (weightPerColor.get(b) ?? 0) - (weightPerColor.get(a) ?? 0),
      );

      for (const col of sortedColors) {
        if (slotsLeft <= 0) break;
        const share = Math.floor(((weightPerColor.get(col) ?? 1) / totalWeight) * slotsLeft);
        for (let i = 0; i < share && slotsLeft > 0; i++) {
          if (tryAdd(`energy-${col.toLowerCase()}`)) {
            slotsLeft--;
          }
        }
      }

      // Round-robin any leftover 1-2 slots across top colors
      let idx = 0;
      while (slotsLeft > 0 && nextIds.length < maxDeck) {
        const col = sortedColors[idx % sortedColors.length]!;
        if (tryAdd(`energy-${col.toLowerCase()}`)) {
          slotsLeft--;
        } else {
          break;
        }
        idx++;
      }
    }
  }

  return {
    cardIds: nextIds,
    addedCount: nextIds.length - startLength,
  };
}
