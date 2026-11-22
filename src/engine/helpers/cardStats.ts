import {
  getCardById,
  getCharacterCard,
  getEvolutionCard,
  getItemCard,
  getStandCard,
} from '../../data/cardRegistry';
import type {
  AttackDef,
  CharacterCategory,
  EnergyType,
  EvolutionCard,
  SignatureAbilityDef,
  StandCard,
} from '../../data/schemas/cardTypes';
import type {
  CharacterInstance,
  GameState,
  PlayerId,
  StandInstance,
} from '../types/state';
import { getOpponentId } from './stateHelpers';

export interface EffectiveCharacterProfile {
  currentCardId: string;
  name: string;
  categories: CharacterCategory[];
  baseMaxHp: number;
  dg: number | null;
  signatureAbility: SignatureAbilityDef;
  ownAttacks: AttackDef[];
}

export interface EffectiveStandProfile {
  currentCardId: string;
  name: string;
  requiredDg: number;
  attacks: AttackDef[];
}

export function getEffectiveCharacterProfile(
  inst: CharacterInstance,
): EffectiveCharacterProfile {
  const base = getCharacterCard(inst.cardId);
  if (!base) {
    throw new Error(`Invalid character cardId: ${inst.cardId}`);
  }

  let currentCardId = base.id;
  let name = base.name;
  let categories = [...base.categories];
  let baseMaxHp = base.maxHp;
  let dg = base.dg;
  let signatureAbility = base.signatureAbility;
  let ownAttacks = [...base.attacks];

  for (const evoId of inst.evolvedCardIds) {
    const evo = getEvolutionCard(evoId);
    if (!evo || evo.evolutionTarget !== 'CHARACTER') continue;
    currentCardId = evo.id;
    name = evo.name;
    if (evo.categories) categories = [...evo.categories];
    if (typeof evo.maxHp === 'number') baseMaxHp = evo.maxHp;
    if (evo.dg !== undefined) dg = evo.dg;
    if (evo.signatureAbility) signatureAbility = evo.signatureAbility;
    if (evo.attacks.length > 0) ownAttacks = [...evo.attacks];
  }

  return {
    currentCardId,
    name,
    categories,
    baseMaxHp,
    dg,
    signatureAbility,
    ownAttacks,
  };
}

export function getEffectiveStandProfile(stand: StandInstance): EffectiveStandProfile {
  const latestEvoId = stand.evolvedCardIds[stand.evolvedCardIds.length - 1];
  if (latestEvoId) {
    const evo = getEvolutionCard(latestEvoId);
    if (evo && evo.evolutionTarget === 'STAND') {
      return {
        currentCardId: evo.id,
        name: evo.name,
        requiredDg: evo.requiredDg ?? 0,
        attacks: [...evo.attacks],
      };
    }
  }

  const base = getStandCard(stand.cardId);
  if (base) {
    return {
      currentCardId: base.id,
      name: base.name,
      requiredDg: base.requiredDg,
      attacks: [...base.attacks],
    };
  }

  // Direct Stand Evolution played onto Jotaro (Star Platinum: The World without base Star Platinum)
  const directEvo = getEvolutionCard(stand.cardId);
  if (directEvo && directEvo.evolutionTarget === 'STAND') {
    return {
      currentCardId: directEvo.id,
      name: directEvo.name,
      requiredDg: directEvo.requiredDg ?? 0,
      attacks: [...directEvo.attacks],
    };
  }

  throw new Error(`Invalid stand cardId: ${stand.cardId}`);
}

export function getAvailableAttacks(inst: CharacterInstance): {
  attack: AttackDef;
  source: 'CHARACTER' | 'STAND';
}[] {
  const profile = getEffectiveCharacterProfile(inst);
  const result: { attack: AttackDef; source: 'CHARACTER' | 'STAND' }[] = [];

  for (const atk of profile.ownAttacks) {
    result.push({ attack: atk, source: 'CHARACTER' });
  }
  if (inst.attachedStand) {
    const standProfile = getEffectiveStandProfile(inst.attachedStand);
    for (const atk of standProfile.attacks) {
      result.push({ attack: atk, source: 'STAND' });
    }
  }
  return result;
}

export function computeEffectiveMaxHp(
  state: GameState,
  playerId: PlayerId,
  inst: CharacterInstance,
): number {
  const profile = getEffectiveCharacterProfile(inst);
  const player = state.players[playerId];
  let maxHp =
    profile.baseMaxHp -
    inst.maxHpPenalty +
    (inst.erinaHpBonus ?? 0) +
    (inst.wangChanHpBonus ?? 0);

  // Okuyasu + Josuke on bench: +20 max HP while Okuyasu is active
  if (
    profile.signatureAbility.id === 'OI_JOSUKE_OKUYASU' &&
    player.active?.instanceId === inst.instanceId &&
    player.bench.some((b) => getEffectiveCharacterProfile(b).currentCardId === 'char-josuke-higashikata')
  ) {
    maxHp += 20;
  }

  // Yoshikage Kira + Killer Queen active: +10 max HP
  if (
    profile.signatureAbility.id === 'QUIET_LIFE_KIRA' &&
    inst.attachedStand &&
    (inst.attachedStand.cardId === 'stand-killer-queen' ||
      getEffectiveStandProfile(inst.attachedStand).currentCardId === 'stand-killer-queen')
  ) {
    maxHp += 10;
  }

  // Equippable item passive HP bonuses (e.g. Stone Mask +10 HP)
  for (const attachedItem of inst.attachedItems) {
    const itemCard = getItemCard(attachedItem.cardId);
    if (!itemCard) continue;
    for (const effect of itemCard.effects) {
      if (effect.kind === 'EQUIP_PASSIVE_MAX_HP') {
        maxHp += effect.bonusHp;
      }
    }
  }

  return Math.max(10, maxHp);
}

/**
 * Classic Pokémon TCG energy cost validation:
 * Specific energy requirements must be satisfied by matching energy types;
 * remaining attached energies of ANY type can satisfy COLORLESS requirements.
 *
 * Special rule for Energía de Stand ('STAND'):
 * - ONLY works for Stand attacks (`attackSource !== 'CHARACTER'`).
 * - Acts as a universal wildcard paying ANY specific or colorless energy cost.
 */
export function canPayEnergyCost(
  attachedEnergies: readonly EnergyType[],
  cost: readonly EnergyType[],
  attackSource: 'CHARACTER' | 'STAND' = 'STAND',
): boolean {
  if (cost.length === 0) return true;

  const pool = new Map<EnergyType, number>();
  let standWildcards = 0;
  let usableCount = 0;

  for (const e of attachedEnergies) {
    if (e === 'STAND') {
      if (attackSource === 'STAND') {
        standWildcards++;
        usableCount++;
      }
      // For CHARACTER (non-Stand) attacks, STAND energy cannot pay any cost
      continue;
    }
    pool.set(e, (pool.get(e) ?? 0) + 1);
    usableCount++;
  }

  if (usableCount < cost.length) return false;

  let colorlessNeeded = 0;
  for (const req of cost) {
    if (req === 'COLORLESS') {
      colorlessNeeded++;
    } else {
      const avail = pool.get(req) ?? 0;
      if (avail > 0) {
        pool.set(req, avail - 1);
      } else if (standWildcards > 0) {
        standWildcards--;
      } else {
        return false;
      }
    }
  }

  let totalRemaining = standWildcards;
  for (const count of pool.values()) {
    totalRemaining += count;
  }
  return totalRemaining >= colorlessNeeded;
}

export function isStandCompatibleWithCharacter(
  stand: StandCard,
  character: CharacterInstance,
): { ok: boolean; reason?: string } {
  const profile = getEffectiveCharacterProfile(character);
  if (!profile.categories.includes('STAND_USER')) {
    return { ok: false, reason: `${profile.name} no es un Usuario de Stand.` };
  }
  if (character.attachedStand !== null) {
    return {
      ok: false,
      reason: `${profile.name} ya tiene un Stand equipado y no se puede sustituir.`,
    };
  }
  if (profile.dg === null || profile.dg < stand.requiredDg) {
    return {
      ok: false,
      reason: `${stand.name} requiere DG ${stand.requiredDg}, pero ${profile.name} tiene DG ${profile.dg ?? 0}.`,
    };
  }
  if (
    stand.compatibleCharacterIds &&
    stand.compatibleCharacterIds.length > 0 &&
    !stand.compatibleCharacterIds.includes(profile.currentCardId)
  ) {
    return {
      ok: false,
      reason: `${stand.name} no es compatible con ${profile.name}.`,
    };
  }
  return { ok: true };
}

export function getMaxEnergyAttachmentsThisTurn(state: GameState, playerId: PlayerId): number {
  return (
    state.rules.maxEnergyAttachmentsPerTurn +
    state.players[playerId].bonusEnergyAttachmentsThisTurn
  );
}

/**
 * Progressive DG unlock rule for the Active slot:
 * - Setup & Turn 1: max DG 4 (non-Stand characters with dg === null are always allowed;
 *   Stand Users of higher DG can still be placed on the Bench from Turn 1)
 * - Turn 2: max DG 5
 * - Turn 3+: max DG 6 (all unlocked)
 */
export function getMaxPlayableCharacterDg(turnNumber: number): number {
  if (turnNumber <= 1) return 4;
  if (turnNumber === 2) return 5;
  return 6;
}

export function getCharacterUnlockTurn(dg: number | null): number {
  if (dg === null || dg <= 4) return 1;
  return Math.min(3, dg - 3);
}

export function isCharacterDgAllowedOnTurn(dg: number | null, turnNumber: number): boolean {
  if (dg === null) return true;
  return dg <= getMaxPlayableCharacterDg(turnNumber);
}

export function hasAnyTurnOneEligibleCharacter(cardIds: readonly string[]): boolean {
  for (const id of cardIds) {
    const card = getCardById(id);
    if (card?.type === 'CHARACTER' && (card.dg === null || card.dg <= 4)) {
      return true;
    }
  }
  return false;
}

/**
 * Confirmed Starting Hand / Mulligan rule:
 * Valid if hand contains a Turn-1-eligible character (dg === null or dg <= maxInitialDg):
 *  - A self-sufficient character with own attacks (VAMPIRE, PILLAR_MAN, HAMON_USER, or CONVENTIONAL_FIGHTER), OR
 *  - A STAND_USER character + a compatible STAND card in hand (or in deck when `deckCardIds` is provided,
 *    since Llamada de Stand lets a Stand User summon a compatible Stand from the deck on Turn 1).
 */
export function hasValidStartingHand(
  handCardIds: readonly string[],
  maxInitialDg: number | null = 4,
  deckCardIds?: readonly string[],
): boolean {
  const standUsers: { id: string; dg: number }[] = [];
  const stands: StandCard[] = [];

  for (const id of handCardIds) {
    const card = getCardById(id);
    if (!card) continue;
    if (card.type === 'CHARACTER') {
      const dgAllowed =
        maxInitialDg === null || card.dg === null || card.dg <= maxInitialDg;
      if (!dgAllowed) continue;
      const selfSufficient = card.attacks.length > 0;
      if (selfSufficient) return true;
      if (card.categories.includes('STAND_USER') && card.dg !== null) {
        standUsers.push({ id: card.id, dg: card.dg });
      }
    } else if (card.type === 'STAND') {
      stands.push(card);
    }
  }

  if (deckCardIds) {
    for (const id of deckCardIds) {
      const card = getCardById(id);
      if (card?.type === 'STAND') {
        stands.push(card);
      }
    }
  }

  for (const user of standUsers) {
    for (const stand of stands) {
      if (
        user.dg >= stand.requiredDg &&
        (!stand.compatibleCharacterIds || stand.compatibleCharacterIds.includes(user.id))
      ) {
        return true;
      }
    }
  }

  return false;
}

export function hasElementalStatusImmunity(
  state: GameState,
  playerId: PlayerId,
  inst: CharacterInstance,
): { immune: boolean; reason?: string } {
  const profile = getEffectiveCharacterProfile(inst);
  if (profile.signatureAbility.id === 'INSTANT_EVOLUTION_KARS') {
    return { immune: true, reason: 'Evolución Instantánea (inmune a estados elementales)' };
  }

  const player = state.players[playerId];
  if (
    profile.signatureAbility.id === 'UNDERWEAR_SHOWING_POLNAREFF' &&
    player.active?.instanceId === inst.instanceId &&
    player.bench.some((b) => getEffectiveCharacterProfile(b).currentCardId === 'char-noriaki-kakyoin')
  ) {
    return {
      immune: true,
      reason: 'Se te ve la ropa interior (Kakyoin en banca: inmune a estados elementales)',
    };
  }

  return { immune: false };
}

export function isOpponentBenchLockedByKakyoin(
  state: GameState,
  actingPlayerId: PlayerId,
): boolean {
  const opponent = state.players[getOpponentId(actingPlayerId)];
  const allEnemyField = [
    ...(opponent.active ? [opponent.active] : []),
    ...opponent.bench,
  ];
  return allEnemyField.some(
    (c) => getEffectiveCharacterProfile(c).signatureAbility.id === 'LONG_RANGE_LOCK_KAKYOIN',
  );
}

export function checkEvolutionRequirements(
  state: GameState,
  playerId: PlayerId,
  evo: EvolutionCard,
): {
  ok: boolean;
  reason?: string;
  handCatalystIndices: number[];
  consumedBenchStandIndices: number[];
} {
  const player = state.players[playerId];
  const handCatalystIndices: number[] = [];
  const consumedBenchStandIndices: number[] = [];

  if (player.evolutionsPlayedThisTurn >= state.rules.maxEvolutionsPerTurn) {
    return {
      ok: false,
      reason: `Solo puedes realizar ${state.rules.maxEvolutionsPerTurn} evolución por turno.`,
      handCatalystIndices,
      consumedBenchStandIndices,
    };
  }

  const active = player.active;
  if (!active) {
    return {
      ok: false,
      reason: 'Necesitas un personaje en el Puesto Activo para evolucionar.',
      handCatalystIndices,
      consumedBenchStandIndices,
    };
  }

  const activeProfile = getEffectiveCharacterProfile(active);
  const standProfile = active.attachedStand
    ? getEffectiveStandProfile(active.attachedStand)
    : null;

  for (const req of evo.requirements) {
    switch (req.kind) {
      case 'BASE_ACTIVE_CHARACTER': {
        if (activeProfile.currentCardId !== req.characterId) {
          return {
            ok: false,
            reason: `Requiere tener a ${getCharacterCard(req.characterId)?.name ?? req.characterId} en el Puesto Activo.`,
            handCatalystIndices,
            consumedBenchStandIndices,
          };
        }
        break;
      }
      case 'BASE_ATTACHED_STAND': {
        if (!standProfile || standProfile.currentCardId !== req.standId) {
          return {
            ok: false,
            reason: `Requiere tener equipado a ${getStandCard(req.standId)?.name ?? req.standId} en el Puesto Activo.`,
            handCatalystIndices,
            consumedBenchStandIndices,
          };
        }
        break;
      }
      case 'BASE_ACTIVE_CHARACTER_OR_STAND': {
        if (activeProfile.currentCardId !== req.characterId) {
          return {
            ok: false,
            reason: `Solo se puede jugar si el usuario activo es ${getCharacterCard(req.characterId)?.name ?? req.characterId}.`,
            handCatalystIndices,
            consumedBenchStandIndices,
          };
        }
        if (standProfile && req.standId && standProfile.currentCardId !== req.standId) {
          return {
            ok: false,
            reason: `${activeProfile.name} ya tiene otro Stand incompatible equipado (${standProfile.name}).`,
            handCatalystIndices,
            consumedBenchStandIndices,
          };
        }
        break;
      }
      case 'EQUIPPED_ITEM_TAG': {
        const hasEquipped = active.attachedItems.some(
          (it) => getItemCard(it.cardId)?.catalystTag === req.catalystTag,
        );
        if (!hasEquipped) {
          return {
            ok: false,
            reason: `Falta requisito: ${req.label}.`,
            handCatalystIndices,
            consumedBenchStandIndices,
          };
        }
        break;
      }
      case 'CONSUME_HAND_ITEM_TAG': {
        const idx = player.hand.findIndex(
          (cardId, i) =>
            !handCatalystIndices.includes(i) &&
            getItemCard(cardId)?.catalystTag === req.catalystTag,
        );
        if (idx === -1) {
          return {
            ok: false,
            reason: `Falta requisito: ${req.label}.`,
            handCatalystIndices,
            consumedBenchStandIndices,
          };
        }
        handCatalystIndices.push(idx);
        break;
      }
      case 'BENCH_CHARACTER_PRESENT': {
        const hasBench = player.bench.some(
          (b) => getEffectiveCharacterProfile(b).currentCardId === req.characterId,
        );
        if (!hasBench) {
          return {
            ok: false,
            reason: `Falta requisito: ${req.label}.`,
            handCatalystIndices,
            consumedBenchStandIndices,
          };
        }
        break;
      }
      case 'BENCH_STAND_PRESENT': {
        const benchIdx = player.bench.findIndex(
          (b, i) =>
            !consumedBenchStandIndices.includes(i) &&
            b.attachedStand !== null &&
            getEffectiveStandProfile(b.attachedStand).currentCardId === req.standId,
        );
        if (benchIdx === -1) {
          return {
            ok: false,
            reason: `Falta requisito: ${req.label}.`,
            handCatalystIndices,
            consumedBenchStandIndices,
          };
        }
        if (req.consumeOnEvolve) {
          consumedBenchStandIndices.push(benchIdx);
        }
        break;
      }
    }
  }

  return { ok: true, handCatalystIndices, consumedBenchStandIndices };
}

export function getAttackNominalMaxDamage(atk: AttackDef): number {
  if (atk.coinFlip?.replacesBaseDamage) {
    let bestPerFlip = 0;
    for (const outcome of atk.coinFlip.onHeads ?? []) {
      if (outcome.kind === 'DAMAGE' && outcome.target === 'DEFENDER') {
        bestPerFlip = Math.max(bestPerFlip, outcome.amount);
      } else if (outcome.kind === 'DAMAGE_AND_HEAL') {
        bestPerFlip = Math.max(bestPerFlip, outcome.damageToDefender);
      }
    }
    return bestPerFlip * atk.coinFlip.count;
  }
  return atk.baseDamage;
}
