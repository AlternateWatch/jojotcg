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
  let maxHp = profile.baseMaxHp - inst.maxHpPenalty;

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
 */
export function canPayEnergyCost(
  attachedEnergies: readonly EnergyType[],
  cost: readonly EnergyType[],
): boolean {
  if (cost.length === 0) return true;
  if (attachedEnergies.length < cost.length) return false;

  const pool = new Map<EnergyType, number>();
  for (const e of attachedEnergies) {
    pool.set(e, (pool.get(e) ?? 0) + 1);
  }

  let colorlessNeeded = 0;
  for (const req of cost) {
    if (req === 'COLORLESS') {
      colorlessNeeded++;
    } else {
      const avail = pool.get(req) ?? 0;
      if (avail <= 0) return false;
      pool.set(req, avail - 1);
    }
  }

  let totalRemaining = 0;
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
 * Confirmed Starting Hand / Mulligan rule:
 * Valid if hand contains:
 *  - A self-sufficient character with own attacks (VAMPIRE, PILLAR_MAN, HAMON_USER, or CONVENTIONAL_FIGHTER), OR
 *  - A STAND_USER character + a compatible STAND card in hand (user DG >= stand requiredDg).
 */
export function hasValidStartingHand(handCardIds: readonly string[]): boolean {
  const standUsers: { id: string; dg: number }[] = [];
  const stands: StandCard[] = [];

  for (const id of handCardIds) {
    const card = getCardById(id);
    if (!card) continue;
    if (card.type === 'CHARACTER') {
      const selfSufficient = card.attacks.length > 0;
      if (selfSufficient) return true;
      if (card.categories.includes('STAND_USER') && card.dg !== null) {
        standUsers.push({ id: card.id, dg: card.dg });
      }
    } else if (card.type === 'STAND') {
      stands.push(card);
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
): { ok: boolean; reason?: string; handCatalystIndices: number[] } {
  const player = state.players[playerId];
  const handCatalystIndices: number[] = [];

  if (player.evolutionsPlayedThisTurn >= state.rules.maxEvolutionsPerTurn) {
    return {
      ok: false,
      reason: `Solo puedes realizar ${state.rules.maxEvolutionsPerTurn} evolución por turno.`,
      handCatalystIndices,
    };
  }

  const active = player.active;
  if (!active) {
    return {
      ok: false,
      reason: 'Necesitas un personaje en el Puesto Activo para evolucionar.',
      handCatalystIndices,
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
          };
        }
        if (standProfile && req.standId && standProfile.currentCardId !== req.standId) {
          return {
            ok: false,
            reason: `${activeProfile.name} ya tiene otro Stand incompatible equipado (${standProfile.name}).`,
            handCatalystIndices,
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
          };
        }
        break;
      }
    }
  }

  return { ok: true, handCatalystIndices };
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
