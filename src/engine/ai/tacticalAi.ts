import {
  getCardById,
  getCharacterCard,
  getEnergyCard,
  getItemCard,
  getStandCard,
} from '../../data/cardRegistry';
import type { AttackDef, EnergyType } from '../../data/schemas/cardTypes';
import {
  canPayEnergyCost,
  computeEffectiveMaxHp,
  getAttackNominalMaxDamage,
  getAvailableAttacks,
  getEffectiveCharacterProfile,
  getMaxEnergyAttachmentsThisTurn,
  hasElementalStatusImmunity,
} from '../helpers/cardStats';
import { getLegalActions, getOpponentId, validateAction } from '../gameEngine';
import type { GameAction, PromptResponsePayload } from '../types/actions';
import type { CharacterInstance, GameState, PlayerId, PlayerPrompt } from '../types/state';

export type AiDifficulty = 'EASY' | 'NORMAL' | 'HARD';

/** Deterministic pseudo-random roll in [0, 1) derived from current game state (pure & replayable). */
function deterministicRoll(state: GameState, salt: number): number {
  const seed = (state.turnNumber * 2654435761 + state.nextEntitySeq * 40503 + salt * 12289) >>> 0;
  return (seed % 1000) / 1000;
}

function collectNeededEnergyColors(chars: CharacterInstance[]): Map<EnergyType, number> {
  const needed = new Map<EnergyType, number>();
  for (const ch of chars) {
    const attacks = getAvailableAttacks(ch);
    for (const { attack } of attacks) {
      if (canPayEnergyCost(ch.attachedEnergies, attack.energyCost)) continue;
      // Count unmet specific colors
      const have = new Map<EnergyType, number>();
      for (const e of ch.attachedEnergies) have.set(e, (have.get(e) ?? 0) + 1);
      for (const req of attack.energyCost) {
        if (req === 'COLORLESS') continue;
        const avail = have.get(req) ?? 0;
        if (avail > 0) {
          have.set(req, avail - 1);
        } else {
          needed.set(req, (needed.get(req) ?? 0) + 1);
        }
      }
    }
  }
  return needed;
}

function expectedAttackScore(
  state: GameState,
  playerId: PlayerId,
  attack: AttackDef,
): number {
  const opponent = state.players[getOpponentId(playerId)];
  const enemyActive = opponent.active;
  const player = state.players[playerId];
  const selfActive = player.active;
  if (!enemyActive || !selfActive) return 0;

  let score = 0;

  // Check if N'Doul blocks water attack
  const enemyProfile = getEffectiveCharacterProfile(enemyActive);
  if (
    enemyProfile.signatureAbility.id === 'WATER_CONTROL_NDOUL' &&
    attack.energyCost.includes('WATER')
  ) {
    return -50;
  }

  if (attack.specialEffects?.some((e) => e.kind === 'EXTRA_COMBAT_ACTIONS')) {
    score += 130;
  }
  if (attack.specialEffects?.some((e) => e.kind === 'SOUL_SWAP_HP')) {
    score += enemyActive.currentHp > selfActive.currentHp + 20 ? 120 : -20;
  }
  if (attack.specialEffects?.some((e) => e.kind === 'COPY_ENEMY_STAND_ATTACK')) {
    const copyable = getAvailableAttacks(enemyActive).filter(
      (a) => !a.attack.specialEffects?.some((se) => se.kind === 'COPY_ENEMY_STAND_ATTACK'),
    );
    const bestCopiedDmg =
      copyable.length > 0 ? Math.max(...copyable.map((a) => getAttackNominalMaxDamage(a.attack))) : 0;
    score += copyable.length > 0 ? Math.max(65, bestCopiedDmg) : -30;
  }
  if (attack.specialEffects?.some((e) => e.kind === 'HEAL_SELF')) {
    const maxHp = computeEffectiveMaxHp(state, playerId, selfActive);
    score += selfActive.statuses.burn ? 90 : maxHp - selfActive.currentHp >= 40 ? 55 : 5;
  }

  let expectedDamage = 0;
  if (attack.coinFlip?.replacesBaseDamage) {
    let avgPerFlip = 0;
    for (const o of attack.coinFlip.onHeads ?? []) {
      if (o.kind === 'DAMAGE' && o.target === 'DEFENDER') avgPerFlip += o.amount * 0.5;
      if (o.kind === 'DAMAGE_AND_HEAL') avgPerFlip += (o.damageToDefender + o.healSelf * 0.8) * 0.5;
    }
    for (const o of attack.coinFlip.onTails ?? []) {
      if (o.kind === 'DAMAGE' && o.target === 'DEFENDER') avgPerFlip += o.amount * 0.5;
      // Weight recoil lighter when user has healthy HP so Kars actually uses Light Blades instead of stun-stalling
      if (o.kind === 'DAMAGE' && o.target === 'SELF') {
        const recoilFactor = selfActive.currentHp > 50 ? 0.16 : 0.45;
        avgPerFlip -= o.amount * recoilFactor;
      }
    }
    expectedDamage = avgPerFlip * attack.coinFlip.count;
    score += expectedDamage;
  } else {
    const cancelRisk = attack.coinFlip?.onTails?.some((o) => o.kind === 'CANCEL_ATTACK');
    expectedDamage = cancelRisk ? attack.baseDamage * 0.5 : attack.baseDamage;
    score += expectedDamage;
  }

  // Account for HEAL_DEFENDER (Crazy Diamond: only net +80 unless lethal 100 KO!)
  const healDefender = attack.specialEffects?.find(
    (e): e is Extract<typeof e, { kind: 'HEAL_DEFENDER' }> => e.kind === 'HEAL_DEFENDER',
  );
  if (healDefender && attack.baseDamage < enemyActive.currentHp) {
    score -= healDefender.amount;
  }

  const isSelfKo = Boolean(
    attack.specialEffects?.some((e) => e.kind === 'SELF_KO_AFTER_ATTACK'),
  );
  const defenderSurvivesLethal =
    (enemyProfile.signatureAbility.id === 'WIND_SENSE_WAMUU' && !enemyActive.windSenseUsed) ||
    (enemyProfile.signatureAbility.id === 'SUPERIOR_INTELLECT_KARS' &&
      !enemyActive.superiorIntellectUsed) ||
    enemyActive.dodgeNextAttack;

  // Never use a self-KO attack (e.g. Wamuu's Final Mode) if we have no bench and it doesn't win the game!
  if (isSelfKo && player.bench.length === 0) {
    const winsMatchImmediately =
      !defenderSurvivesLethal &&
      enemyActive.currentHp <= attack.baseDamage &&
      opponent.bench.length === 0;
    if (!winsMatchImmediately) {
      return -1000;
    }
    return 400;
  }

  // Huge lethal bonus so AI finishes KOs decisively instead of stalling!
  const isGuaranteedLethal =
    !attack.coinFlip?.replacesBaseDamage &&
    !attack.coinFlip?.onTails?.some((o) => o.kind === 'CANCEL_ATTACK') &&
    attack.baseDamage >= enemyActive.currentHp &&
    !defenderSurvivesLethal;
  if (isGuaranteedLethal && !isSelfKo) {
    score += 180;
  } else if (expectedDamage >= enemyActive.currentHp && !isSelfKo) {
    score += 75;
  }

  // Status value — check if enemy is immune or stun-resistant!
  const enemyImmune = hasElementalStatusImmunity(state, opponent.id, enemyActive).immune;
  const applyStatusEff = attack.specialEffects?.find(
    (e): e is Extract<typeof e, { kind: 'APPLY_STATUS' }> => e.kind === 'APPLY_STATUS',
  );
  if (applyStatusEff && !enemyImmune) {
    if (applyStatusEff.status === 'STUNNED') {
      const stunBlocked =
        state.rules.preventConsecutiveStun && enemyActive.statuses.stunImmuneNextTurn;
      if (!stunBlocked) {
        // Moderate value so low-damage stuns don't beat high-damage attacks every turn
        score += attack.baseDamage <= 10 ? 18 : 26;
      }
    } else if (applyStatusEff.status === 'BURN') {
      score += enemyActive.statuses.burn ? 2 : 22;
    } else {
      score += 24;
    }
  }
  if (attack.coinFlip?.onHeads?.some((o) => o.kind === 'STATUS') && !enemyImmune) {
    score += 14;
  }
  if (attack.specialEffects?.some((e) => e.kind === 'GLOBAL_BENCH_DAMAGE')) {
    score += opponent.bench.length * 15;
  }
  if (attack.specialEffects?.some((e) => e.kind === 'RETURN_ENEMY_BENCH_TO_DECK')) {
    score += opponent.bench.length > 0 ? 35 : 0;
  }
  const drawEff = attack.specialEffects?.find(
    (e): e is Extract<typeof e, { kind: 'DRAW_CARDS' }> => e.kind === 'DRAW_CARDS',
  );
  if (drawEff) {
    score += player.hand.length <= 4 ? 22 * drawEff.count : 12 * drawEff.count;
  }
  if (attack.specialEffects?.some((e) => e.kind === 'CONTROL_BY_WOUNDS')) {
    const enemyAttacks = getAvailableAttacks(enemyActive);
    if (enemyActive.statuses.bleedStacks.length > 0 && enemyAttacks.length > 0) {
      const bestEnemyDmg = enemyAttacks.reduce((m, a) => Math.max(m, a.attack.baseDamage), 0);
      score += 40 + bestEnemyDmg;
    } else {
      score -= 100;
    }
  }
  if (attack.specialEffects?.some((e) => e.kind === 'REFLECT_NEXT_INCOMING_ATTACK')) {
    score += selfActive.reflectNextAttackBonus != null ? -40 : 42;
  }

  // Avoid risky self-KO unless desperate or lethal
  if (isSelfKo) {
    if (!defenderSurvivesLethal && enemyActive.currentHp <= attack.baseDamage && opponent.bench.length === 0) {
      score += 220;
    } else if (!defenderSurvivesLethal && enemyActive.currentHp <= attack.baseDamage && selfActive.currentHp <= 50) {
      score += 70;
    } else {
      score -= 80;
    }
  }
  if (attack.coinFlip?.onTails?.some((o) => o.kind === 'INSTANT_KO' && o.target === 'SELF')) {
    if (player.bench.length === 0) {
      return -500;
    }
    score += enemyActive.currentHp >= 100 ? 45 : -150;
  }

  return score;
}

function chooseEnergyTarget(
  state: GameState,
  playerId: PlayerId,
  energyType: EnergyType,
): string | null {
  const player = state.players[playerId];
  const candidates: CharacterInstance[] = [
    ...(player.active ? [player.active] : []),
    ...player.bench,
  ].filter((ch) => {
    if (energyType === 'STAND') {
      return getEffectiveCharacterProfile(ch).categories.includes('STAND_USER');
    }
    return true;
  });
  if (candidates.length === 0) return null;

  // 1. Active specifically needs this color (or any color for COLORLESS, or STAND wildcard)
  if (player.active && candidates.some((c) => c.instanceId === player.active!.instanceId)) {
    const attacks = getAvailableAttacks(player.active);
    const activeNeeded = collectNeededEnergyColors([player.active]);
    const activeNeedsMore = attacks.some(
      (a) => !canPayEnergyCost(player.active!.attachedEnergies, a.attack.energyCost, a.source),
    );
    if (energyType === 'STAND' && activeNeedsMore) {
      return player.active.instanceId;
    }
    if ((activeNeeded.get(energyType) ?? 0) > 0) {
      return player.active.instanceId;
    }
    if (activeNeedsMore && attacks.some((a) => a.attack.energyCost.includes('COLORLESS'))) {
      return player.active.instanceId;
    }
  }

  // 2. Bench character specifically needs this color
  for (const benchChar of player.bench) {
    if (!candidates.some((c) => c.instanceId === benchChar.instanceId)) continue;
    if (energyType === 'STAND') {
      const bAttacks = getAvailableAttacks(benchChar);
      if (
        bAttacks.length === 0 ||
        bAttacks.some((a) => !canPayEnergyCost(benchChar.attachedEnergies, a.attack.energyCost, a.source))
      ) {
        return benchChar.instanceId;
      }
    }
    const benchNeeded = collectNeededEnergyColors([benchChar]);
    if ((benchNeeded.get(energyType) ?? 0) > 0) {
      return benchChar.instanceId;
    }
  }

  // 3. Active still lacks energy or is waiting for a Stand
  if (player.active && candidates.some((c) => c.instanceId === player.active!.instanceId)) {
    const attacks = getAvailableAttacks(player.active);
    const activeNeedsAny =
      attacks.length === 0 ||
      attacks.some((a) => !canPayEnergyCost(player.active!.attachedEnergies, a.attack.energyCost, a.source));
    if (activeNeedsAny && player.active.attachedEnergies.length < 4) {
      return player.active.instanceId;
    }
  }

  // 4. Any bench character that needs energy
  for (const benchChar of player.bench) {
    if (!candidates.some((c) => c.instanceId === benchChar.instanceId)) continue;
    const attacks = getAvailableAttacks(benchChar);
    if (
      attacks.some((a) => !canPayEnergyCost(benchChar.attachedEnergies, a.attack.energyCost, a.source)) ||
      benchChar.attachedEnergies.length < 2
    ) {
      return benchChar.instanceId;
    }
  }

  return candidates[0]!.instanceId;
}

function buildPromptResponse(
  state: GameState,
  prompt: PlayerPrompt,
  difficulty: AiDifficulty,
  aiErrorRate?: number,
): PromptResponsePayload {
  const player = state.players[prompt.playerId];

  switch (prompt.kind) {
    case 'YARE_YARE_DAZE_REACTION': {
      // Easy AI sometimes declines reaction to save cards
      if (difficulty === 'EASY' && player.hand.length < 4) {
        return { kind: 'YARE_YARE_DAZE_REACTION', accept: false };
      }
      if (player.hand.length >= 2) {
        let discardIdx = 0;
        const energyIdx = player.hand.findIndex((id) => getEnergyCard(id));
        if (energyIdx !== -1) discardIdx = energyIdx;
        return { kind: 'YARE_YARE_DAZE_REACTION', accept: true, discardHandIndex: discardIdx };
      }
      return { kind: 'YARE_YARE_DAZE_REACTION', accept: false };
    }
    case 'PROMOTE_FROM_BENCH':
    case 'RETREAT_CHOOSE_NEW_ACTIVE': {
      const sorted = [...player.bench].sort((a, b) => {
        const attacksA = getAvailableAttacks(a);
        const attacksB = getAvailableAttacks(b);
        const readyA = attacksA.some((atk) => canPayEnergyCost(a.attachedEnergies, atk.attack.energyCost))
          ? 120
          : 0;
        const readyB = attacksB.some((atk) => canPayEnergyCost(b.attachedEnergies, atk.attack.energyCost))
          ? 120
          : 0;
        const scoreA =
          a.currentHp + readyA + (attacksA.length > 0 ? 50 : 0) + a.attachedEnergies.length * 20;
        const scoreB =
          b.currentHp + readyB + (attacksB.length > 0 ? 50 : 0) + b.attachedEnergies.length * 20;
        return scoreB - scoreA;
      });
      return { kind: prompt.kind, benchInstanceId: sorted[0]!.instanceId };
    }
    case 'DISTRIBUTE_BENCH_DAMAGE': {
      const targetPlayer = state.players[prompt.targetPlayerId];
      const targets = [
        ...(targetPlayer.active ? [targetPlayer.active] : []),
        ...targetPlayer.bench,
      ].filter((c) => prompt.eligibleInstanceIds.includes(c.instanceId));

      const allocation: Record<string, number> = {};
      for (const id of prompt.eligibleInstanceIds) allocation[id] = 0;

      // EASY (or Campaign Boss when rolling a mistake) dumps everything onto Active instead of sniping low-HP bench KOs
      const dumpAllActive =
        difficulty === 'EASY' ||
        (aiErrorRate !== undefined && deterministicRoll(state, 61) < aiErrorRate);
      if (dumpAllActive && targetPlayer.active && prompt.eligibleInstanceIds.includes(targetPlayer.active.instanceId)) {
        allocation[targetPlayer.active.instanceId] = prompt.totalDamage;
        return { kind: 'DISTRIBUTE_BENCH_DAMAGE', allocation };
      }

      // Focus lowest HP enemy for KOs first, then active
      targets.sort((a, b) => a.currentHp - b.currentHp);
      let remaining = prompt.totalDamage;
      for (const t of targets) {
        if (remaining <= 0) break;
        const needed = Math.ceil(t.currentHp / prompt.increment) * prompt.increment;
        const assign = Math.min(remaining, needed);
        allocation[t.instanceId] = assign;
        remaining -= assign;
      }
      if (remaining > 0 && targets[0]) {
        allocation[targets[0].instanceId] = (allocation[targets[0].instanceId] ?? 0) + remaining;
      }
      return { kind: 'DISTRIBUTE_BENCH_DAMAGE', allocation };
    }
    case 'SELECT_TOP_CARDS': {
      const boardChars = [...(player.active ? [player.active] : []), ...player.bench];
      const neededColors = collectNeededEnergyColors(boardChars);
      const scored = prompt.cards.map((id, index) => {
        const card = getCardById(id);
        let weight = 10;
        if (card?.type === 'EVOLUTION') weight = 50;
        else if (card?.type === 'STAND') weight = 48;
        else if (card?.type === 'CHARACTER') weight = 36;
        else if (card?.type === 'ITEM') weight = 34;
        else if (card?.type === 'ENERGY') {
          weight = (neededColors.get(card.energyType) ?? 0) > 0 ? 44 : 22;
        }
        return { index, weight };
      });
      scored.sort((a, b) => b.weight - a.weight);
      const pickedIndices = scored.slice(0, prompt.pickCount).map((s) => s.index);
      const restOrderIndices = scored.slice(prompt.pickCount).map((s) => s.index);
      return { kind: 'SELECT_TOP_CARDS', pickedIndices, restOrderIndices };
    }
    case 'REORDER_OPPONENT_TOP_DECK': {
      const scored = prompt.cards.map((id, index) => {
        const card = getCardById(id);
        const badForOpponent = card?.type === 'ENERGY' ? 1 : card?.type === 'ITEM' ? 2 : 5;
        return { index, badForOpponent };
      });
      scored.sort((a, b) => a.badForOpponent - b.badForOpponent);
      return { kind: 'REORDER_OPPONENT_TOP_DECK', orderedIndices: scored.map((s) => s.index) };
    }
    case 'CHOOSE_ENEMY_BENCH_TARGET': {
      const enemyBench = state.players[prompt.targetPlayerId].bench;
      const sorted = [...enemyBench].sort(
        (a, b) => b.currentHp + b.attachedEnergies.length * 25 - (a.currentHp + a.attachedEnergies.length * 25),
      );
      return { kind: 'CHOOSE_ENEMY_BENCH_TARGET', benchInstanceId: sorted[0]!.instanceId };
    }
    case 'CHOOSE_ENEMY_STAND_ATTACK': {
      const enemyActive = state.players[prompt.targetPlayerId].active;
      let bestId = prompt.availableAttackIds[0]!;
      if (enemyActive) {
        const attacks = getAvailableAttacks(enemyActive)
          .map((a) => a.attack)
          .filter((a) => prompt.availableAttackIds.includes(a.id));
        attacks.sort((a, b) => getAttackNominalMaxDamage(b) - getAttackNominalMaxDamage(a));
        if (attacks[0]) bestId = attacks[0].id;
      }
      return { kind: 'CHOOSE_ENEMY_STAND_ATTACK', attackId: bestId };
    }
    case 'RECOVER_ITEM_FROM_DISCARD': {
      const idx = player.discard.findIndex((id) => getCardById(id)?.type === 'ITEM');
      return { kind: 'RECOVER_ITEM_FROM_DISCARD', discardIndex: Math.max(0, idx) };
    }
    case 'RECOVER_ENERGY_FROM_DISCARD': {
      const boardChars = [...(player.active ? [player.active] : []), ...player.bench];
      const neededColors = collectNeededEnergyColors(boardChars);
      let bestIdx = player.discard.findIndex((id) => getEnergyCard(id));
      let bestScore = -1;
      for (let i = 0; i < player.discard.length; i++) {
        const energy = getEnergyCard(player.discard[i]!);
        if (!energy) continue;
        const score = (neededColors.get(energy.energyType) ?? 0) * 10 + 1;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      return { kind: 'RECOVER_ENERGY_FROM_DISCARD', discardIndex: Math.max(0, bestIdx) };
    }
    case 'CHOOSE_ALLY_BENCH_HEAL': {
      const boardChars = [...(player.active ? [player.active] : []), ...player.bench];
      const eligible = boardChars.filter((b) => prompt.eligibleInstanceIds.includes(b.instanceId));
      const sorted = [...eligible].sort((a, b) => {
        const missA =
          Math.max(0, computeEffectiveMaxHp(state, prompt.playerId, a) - a.currentHp) +
          (a.statuses.burn?.active ? 35 : 0);
        const missB =
          Math.max(0, computeEffectiveMaxHp(state, prompt.playerId, b) - b.currentHp) +
          (b.statuses.burn?.active ? 35 : 0);
        return missB - missA;
      });
      return {
        kind: 'CHOOSE_ALLY_BENCH_HEAL',
        benchInstanceId: sorted[0]?.instanceId ?? prompt.eligibleInstanceIds[0]!,
      };
    }
    case 'PEEK_TOP_DECK': {
      return {
        kind: 'PEEK_TOP_DECK',
        target: prompt.opponentTopCards.length > 0 ? 'OPPONENT' : 'SELF',
      };
    }
    case 'CHOOSE_PRIZE_CARD': {
      return {
        kind: 'CHOOSE_PRIZE_CARD',
        prizeIndex: 0,
      };
    }
    case 'CHOOSE_STAND_FROM_DECK': {
      const sorted = [...prompt.eligibleStandCardIds].sort((a, b) => {
        const sA = getStandCard(a);
        const sB = getStandCard(b);
        const scoreA = (sA?.requiredDg ?? 0) * 20 + Math.max(0, ...(sA?.attacks.map(getAttackNominalMaxDamage) ?? [0]));
        const scoreB = (sB?.requiredDg ?? 0) * 20 + Math.max(0, ...(sB?.attacks.map(getAttackNominalMaxDamage) ?? [0]));
        return scoreB - scoreA;
      });
      return { kind: 'CHOOSE_STAND_FROM_DECK', standCardId: sorted[0] ?? prompt.eligibleStandCardIds[0]! };
    }
    case 'CHOOSE_HAND_CHARACTER_SWAP': {
      const sorted = [...prompt.eligibleHandIndices].sort((a, b) => {
        const cA = getCharacterCard(player.hand[a] ?? '');
        const cB = getCharacterCard(player.hand[b] ?? '');
        return (cB?.maxHp ?? 0) - (cA?.maxHp ?? 0);
      });
      return {
        kind: 'CHOOSE_HAND_CHARACTER_SWAP',
        handIndex: sorted[0] ?? prompt.eligibleHandIndices[0]!,
      };
    }
    case 'SEARCH_DECK_CARDS': {
      const boardChars = [...(player.active ? [player.active] : []), ...player.bench];
      const candidates: { idx: number; score: number }[] = [];

      if (prompt.filter === 'ENERGY') {
        const neededColors = collectNeededEnergyColors(boardChars);
        for (let i = 0; i < player.deck.length; i++) {
          const energy = getEnergyCard(player.deck[i]!);
          if (!energy) continue;
          const needWeight = neededColors.get(energy.energyType) ?? 0;
          candidates.push({
            idx: i,
            score: needWeight * 30 + (energy.energyType !== 'COLORLESS' ? 5 : 1),
          });
        }
      } else if (prompt.filter === 'STAND_EVOLUTION') {
        for (let i = 0; i < player.deck.length; i++) {
          const card = getCardById(player.deck[i]!);
          if (!card || card.type !== 'EVOLUTION' || card.evolutionTarget !== 'STAND') continue;
          const maxAtk = Math.max(0, ...card.attacks.map(getAttackNominalMaxDamage));
          candidates.push({ idx: i, score: 100 + maxAtk });
        }
      } else if (prompt.filter === 'CONVENTIONAL_FIGHTER' || prompt.filter === 'HAMON_USER') {
        const targetCat = prompt.filter;
        for (let i = 0; i < player.deck.length; i++) {
          const card = getCardById(player.deck[i]!);
          if (!card || card.type !== 'CHARACTER' || !card.categories.includes(targetCat)) {
            continue;
          }
          const maxAtk = Math.max(0, ...card.attacks.map(getAttackNominalMaxDamage));
          candidates.push({ idx: i, score: card.maxHp * 0.5 + maxAtk });
        }
      } else {
        // STAND or CHARACTER_OR_STAND: prioritize a compatible Stand for an unequipped Stand User on board!
        const unequippedUsers = boardChars.filter((ch) => {
          const prof = getEffectiveCharacterProfile(ch);
          return prof.categories.includes('STAND_USER') && !ch.attachedStand && prof.dg !== null;
        });
        const handStandUsers = player.hand
          .map(getCharacterCard)
          .filter((c): c is NonNullable<typeof c> => Boolean(c && c.categories.includes('STAND_USER') && c.dg !== null));

        for (let i = 0; i < player.deck.length; i++) {
          const card = getCardById(player.deck[i]!);
          if (!card) continue;
          if (prompt.filter === 'STAND' && card.type !== 'STAND') continue;
          if (card.type !== 'CHARACTER' && card.type !== 'STAND') continue;
          let score = 20;
          if (card.type === 'STAND') {
            const fitsActive =
              player.active &&
              unequippedUsers.some((u) => u.instanceId === player.active!.instanceId) &&
              (getEffectiveCharacterProfile(player.active).dg ?? 0) >= card.requiredDg &&
              (!card.compatibleCharacterIds ||
                card.compatibleCharacterIds.includes(getEffectiveCharacterProfile(player.active).currentCardId));
            const fitsBench = unequippedUsers.some(
              (u) =>
                (getEffectiveCharacterProfile(u).dg ?? 0) >= card.requiredDg &&
                (!card.compatibleCharacterIds ||
                  card.compatibleCharacterIds.includes(getEffectiveCharacterProfile(u).currentCardId)),
            );
            const fitsHand = handStandUsers.some(
              (u) =>
                (u.dg ?? 0) >= card.requiredDg &&
                (!card.compatibleCharacterIds || card.compatibleCharacterIds.includes(u.id)),
            );
            const maxAtk = Math.max(0, ...card.attacks.map(getAttackNominalMaxDamage));
            score = (fitsActive ? 160 : fitsBench ? 120 : fitsHand ? 70 : 15) + maxAtk * 0.5;
          } else {
            // Character: prefer self-sufficient high-HP fighters or missing synergy pieces
            score = card.maxHp * 0.4 + (card.attacks.length > 0 ? 75 : 25);
            if (player.bench.length === 0) score += 40;
          }
          candidates.push({ idx: i, score });
        }
      }

      candidates.sort((a, b) => b.score - a.score);
      const picked = candidates.slice(0, prompt.maxPickCount).map((c) => c.idx);
      return { kind: 'SEARCH_DECK_CARDS', deckIndices: picked };
    }
    case 'CHOOSE_ENEMY_EQUIPPED_ITEM': {
      const targetPlayer = state.players[prompt.targetPlayerId];
      const enemyChars = [
        ...(targetPlayer.active ? [{ ch: targetPlayer.active, isActive: true }] : []),
        ...targetPlayer.bench.map((ch) => ({ ch, isActive: false })),
      ];
      let best: { characterInstanceId: string; itemInstanceId: string; score: number } | null = null;
      for (const { ch, isActive } of enemyChars) {
        for (const it of ch.attachedItems) {
          const score =
            (isActive ? 50 : 10) +
            (it.cardId === 'item-piedra-roja-de-aja' || it.cardId === 'item-mascara-de-piedra'
              ? 35
              : it.cardId === 'item-clackers' || it.cardId === 'item-estilo-de-combate-ogre-street'
                ? 30
                : 15);
          if (!best || score > best.score) {
            best = { characterInstanceId: ch.instanceId, itemInstanceId: it.instanceId, score };
          }
        }
      }
      return {
        kind: 'CHOOSE_ENEMY_EQUIPPED_ITEM',
        characterInstanceId: best!.characterInstanceId,
        itemInstanceId: best!.itemInstanceId,
      };
    }
  }
}

export function chooseAiAction(
  state: GameState,
  aiPlayerId: PlayerId,
  difficulty: AiDifficulty = 'NORMAL',
  aiErrorRate?: number,
): GameAction | null {
  if (state.phase === 'GAME_OVER') return null;

  const bossErr =
    aiErrorRate !== undefined ? Math.max(0, Math.min(1, aiErrorRate)) : undefined;

  // 1. Answer pending prompt if addressed to AI
  if (state.pendingPrompt) {
    if (state.pendingPrompt.playerId !== aiPlayerId) return null;
    const response = buildPromptResponse(state, state.pendingPrompt, difficulty, bossErr);
    return { type: 'RESPOND_PROMPT', playerId: aiPlayerId, response };
  }

  const legal = getLegalActions(state, aiPlayerId);
  if (legal.length === 0) return null;

  // 2. Setup Mulligan
  if (state.phase === 'SETUP_MULLIGAN') {
    const confirm = legal.find((a) => a.type === 'CONFIRM_STARTING_HAND');
    return confirm ?? legal.find((a) => a.type === 'PERFORM_MULLIGAN') ?? null;
  }

  // 3. Setup Starting Active: prefer self-sufficient or Stand User with compatible Stand in hand or deck
  if (state.phase === 'SETUP_ACTIVE') {
    const player = state.players[aiPlayerId];
    const availableStands = [...player.hand, ...player.deck]
      .map(getStandCard)
      .filter((s): s is NonNullable<typeof s> => !!s);
    const activeChoices = legal.filter(
      (a): a is Extract<GameAction, { type: 'CHOOSE_STARTING_ACTIVE' }> =>
        a.type === 'CHOOSE_STARTING_ACTIVE',
    );
    activeChoices.sort((a, b) => {
      const cA = getCharacterCard(player.hand[a.handIndex]!)!;
      const cB = getCharacterCard(player.hand[b.handIndex]!)!;
      const score = (c: typeof cA) => {
        let s = c.maxHp;
        if (c.attacks.length > 0) s += 85;
        if (
          c.dg !== null &&
          availableStands.some(
            (st) =>
              c.dg! >= st.requiredDg &&
              (!st.compatibleCharacterIds || st.compatibleCharacterIds.includes(c.id)),
          )
        ) {
          s += 115;
        }
        if (player.guaranteedOpeningCardId && c.id === player.guaranteedOpeningCardId) s += 35;
        return s;
      };
      return score(cB) - score(cA);
    });
    const bestActive = activeChoices[0];
    if (!bestActive) return null;

    // Also place up to maxBenchSize additional eligible Characters onto the starting Bench (Pokémon TCG setup)
    const benchCandidates: { idx: number; score: number }[] = [];
    for (let i = 0; i < player.hand.length; i++) {
      if (i === bestActive.handIndex) continue;
      const c = getCharacterCard(player.hand[i]!);
      if (!c) continue;
      // Stand Users of any DG and non-Stand characters are eligible for starting bench
      if (!c.categories.includes('STAND_USER') && c.dg !== null && c.dg > 4) continue;
      let bScore = c.maxHp;
      if (c.signatureAbility.id === 'HAMON_MASTER_BENCH') bScore += 90;
      if (c.categories.includes('STAND_USER') && (c.dg ?? 0) >= 5) bScore += 55;
      if (c.attacks.length > 0) bScore += 30;
      benchCandidates.push({ idx: i, score: bScore });
    }
    benchCandidates.sort((a, b) => b.score - a.score);
    const benchHandIndices = benchCandidates
      .slice(0, state.rules.maxBenchSize)
      .map((b) => b.idx);

    return {
      ...bestActive,
      benchHandIndices: benchHandIndices.length > 0 ? benchHandIndices : undefined,
    };
  }

  // 4. Preparation Phase
  if (state.phase === 'PREPARATION') {
    const player = state.players[aiPlayerId];
    const opponent = state.players[getOpponentId(aiPlayerId)];

    // 4a. Free Stand Equip (prioritize Active first, then Bench users!)
    const equipActions = legal.filter(
      (a): a is Extract<GameAction, { type: 'EQUIP_STAND' }> => a.type === 'EQUIP_STAND',
    );
    if (equipActions.length > 0) {
      equipActions.sort((a, b) => {
        const aIsActive = player.active?.instanceId === a.targetInstanceId ? 1 : 0;
        const bIsActive = player.active?.instanceId === b.targetInstanceId ? 1 : 0;
        return bIsActive - aIsActive;
      });
      return equipActions[0]!;
    }

    // 4b. Evolve if possible (EASY or Campaign Boss mistake rate occasionally delays evolution for a turn)
    const evolve = legal.find((a) => a.type === 'EVOLVE_CARD');
    const skipEvolve =
      bossErr !== undefined
        ? deterministicRoll(state, 11) < bossErr * 0.7
        : difficulty === 'EASY' && deterministicRoll(state, 11) <= 0.25;
    if (evolve && !skipEvolve) {
      return evolve;
    }

    // 4c. Use preparation signature ability (Akira, Avdol, Shigekiyo, Speedwagon)
    const prepAb = legal.find((a) => a.type === 'USE_PREP_ABILITY');
    if (prepAb && player.deck.length > 6) return prepAb;

    // 4d. Play beneficial Items
    const activeAttacksNow = player.active ? getAvailableAttacks(player.active) : [];
    const activeCanAttackNow =
      player.active !== null &&
      !player.active.statuses.stunned &&
      activeAttacksNow.some((a) => canPayEnergyCost(player.active!.attachedEnergies, a.attack.energyCost));
    const handEnergyCount = player.hand.filter((id) => Boolean(getEnergyCard(id))).length;
    const discardHasEnergy = player.discard.some((id) => Boolean(getEnergyCard(id)));

    for (let i = 0; i < player.hand.length; i++) {
      const item = getItemCard(player.hand[i]!);
      if (!item) continue;

      if (item.effects.some((e) => e.kind === 'BURN_ENEMY_ACTIVE')) {
        // Piedra Roja de Aja: equip onto Kars if on board; otherwise play standalone to Burn enemy active!
        const boardChars = [...(player.active ? [player.active] : []), ...player.bench];
        const karsOnBoard = boardChars.find(
          (ch) =>
            getEffectiveCharacterProfile(ch).currentCardId === 'char-kars' &&
            !ch.attachedItems.some((it) => it.cardId === item.id),
        );
        if (karsOnBoard) {
          const act: GameAction = {
            type: 'PLAY_ITEM',
            playerId: aiPlayerId,
            handIndex: i,
            targetInstanceId: karsOnBoard.instanceId,
          };
          if (validateAction(state, act).ok) return act;
        } else if (opponent.active && !opponent.active.statuses.burn?.active) {
          const act: GameAction = {
            type: 'PLAY_ITEM',
            playerId: aiPlayerId,
            handIndex: i,
          };
          if (validateAction(state, act).ok) return act;
        }
      } else if (
        item.itemKind === 'EQUIPPABLE' &&
        item.effects.some((e) => e.kind === 'SEARCH_DECK')
      ) {
        // Dual-mode equippable + search item (¡Estilo de combate de Ogre Street!):
        // Prefer equipping onto an unequipped Conventional Fighter on board (+20 dmg); otherwise search deck!
        const boardChars = [...(player.active ? [player.active] : []), ...player.bench];
        const catBonusEff = item.effects.find(
          (e): e is Extract<typeof e, { kind: 'EQUIP_PASSIVE_CATEGORY_DAMAGE_BONUS' }> =>
            e.kind === 'EQUIP_PASSIVE_CATEGORY_DAMAGE_BONUS',
        );
        const targetChar = catBonusEff
          ? boardChars.find(
              (ch) =>
                !ch.attachedItems.some((it) => it.cardId === item.id) &&
                getEffectiveCharacterProfile(ch).categories.includes(catBonusEff.category),
            )
          : undefined;
        const searchEff = item.effects.find(
          (e): e is Extract<typeof e, { kind: 'SEARCH_DECK' }> => e.kind === 'SEARCH_DECK',
        );
        if (targetChar) {
          const act: GameAction = {
            type: 'PLAY_ITEM',
            playerId: aiPlayerId,
            handIndex: i,
            targetInstanceId: targetChar.instanceId,
          };
          if (validateAction(state, act).ok) return act;
        } else if (
          player.deck.length > 7 &&
          searchEff &&
          player.deck.some((id) => {
            const c = getCharacterCard(id);
            if (!c) return false;
            if (searchEff.filter === 'HAMON_USER') return c.categories.includes('HAMON_USER');
            if (searchEff.filter === 'CONVENTIONAL_FIGHTER') {
              return c.categories.includes('CONVENTIONAL_FIGHTER');
            }
            return false;
          })
        ) {
          const act: GameAction = { type: 'PLAY_ITEM', playerId: aiPlayerId, handIndex: i };
          if (validateAction(state, act).ok) return act;
        }
      } else if (item.itemKind === 'EQUIPPABLE' && player.active) {
        // Human-like imperfection: hold an equippable item for a turn based on bossErr or difficulty
        const equipHoldChance =
          bossErr !== undefined
            ? bossErr
            : difficulty === 'HARD'
              ? 0.2
              : difficulty === 'EASY'
                ? 0.35
                : 0;
        if (equipHoldChance > 0 && deterministicRoll(state, 19 + i) < equipHoldChance) {
          continue;
        }
        const boardChars = [player.active, ...player.bench];
        const catBonusEff = item.effects.find(
          (e): e is Extract<typeof e, { kind: 'EQUIP_PASSIVE_CATEGORY_DAMAGE_BONUS' }> =>
            e.kind === 'EQUIP_PASSIVE_CATEGORY_DAMAGE_BONUS',
        );
        const targetChar = catBonusEff
          ? boardChars.find(
              (ch) =>
                !ch.attachedItems.some((it) => it.cardId === item.id) &&
                getEffectiveCharacterProfile(ch).categories.includes(catBonusEff.category),
            )
          : boardChars.find((ch) => !ch.attachedItems.some((it) => it.cardId === item.id));
        if (!targetChar) continue;
        const act: GameAction = {
          type: 'PLAY_ITEM',
          playerId: aiPlayerId,
          handIndex: i,
          targetInstanceId: targetChar.instanceId,
        };
        if (validateAction(state, act).ok) return act;
      } else if (item.effects.some((e) => e.kind === 'SEARCH_DECK')) {
        // If this item is also an evolution catalyst and the matching evolution card is already in hand, keep it as catalyst!
        const keepAsCatalyst =
          (item.catalystTag === 'stand-arrow' &&
            player.hand.includes('evo-killer-queen-bites-the-dust')) ||
          (item.catalystTag === 'requiem-arrow' &&
            (player.hand.includes('evo-silver-chariot-requiem') ||
              player.hand.includes('evo-gold-experience-requiem')));
        if (keepAsCatalyst) continue;

        const searchEff = item.effects.find(
          (e): e is Extract<typeof e, { kind: 'SEARCH_DECK' }> => e.kind === 'SEARCH_DECK',
        )!;
        const wantEnergy =
          searchEff.filter === 'ENERGY' &&
          (handEnergyCount < 2 || !activeCanAttackNow) &&
          player.deck.length > 7;
        const hasUnequippedUser = [
          ...(player.active ? [player.active] : []),
          ...player.bench,
        ].some((ch) => getEffectiveCharacterProfile(ch).categories.includes('STAND_USER') && !ch.attachedStand);
        const wantStandOrEvo =
          (searchEff.filter === 'STAND' ||
            searchEff.filter === 'STAND_EVOLUTION' ||
            searchEff.filter === 'CHARACTER_OR_STAND') &&
          (hasUnequippedUser || searchEff.filter === 'STAND_EVOLUTION' || !activeCanAttackNow) &&
          player.deck.length > 7;
        if ((wantEnergy || wantStandOrEvo) && (difficulty !== 'EASY' || deterministicRoll(state, 17 + i) > 0.3)) {
          const act: GameAction = { type: 'PLAY_ITEM', playerId: aiPlayerId, handIndex: i };
          if (validateAction(state, act).ok) return act;
        }
      } else if (item.effects.some((e) => e.kind === 'EXTRA_ENERGY_ALLOWANCE')) {
        const needsRamp =
          player.active !== null &&
          activeAttacksNow.some(
            (a) => !canPayEnergyCost(player.active!.attachedEnergies, a.attack.energyCost),
          );
        const canUseExtra = handEnergyCount >= 2 || (handEnergyCount >= 1 && discardHasEnergy) || discardHasEnergy;
        if (needsRamp && canUseExtra && (difficulty !== 'EASY' || deterministicRoll(state, 23 + i) > 0.35)) {
          const act: GameAction = { type: 'PLAY_ITEM', playerId: aiPlayerId, handIndex: i };
          if (validateAction(state, act).ok) return act;
        }
      } else if (item.effects.some((e) => e.kind === 'FREE_BENCH_SWAP') && difficulty !== 'EASY') {
        // Use Switch if active is stunned or cannot attack and bench has a ready attacker!
        const readyBench = player.bench.find(
          (b) =>
            !b.statuses.stunned &&
            getAvailableAttacks(b).some((a) => canPayEnergyCost(b.attachedEnergies, a.attack.energyCost)),
        );
        if (readyBench && player.active && (!activeCanAttackNow || player.active.currentHp <= 30)) {
          const act: GameAction = { type: 'PLAY_ITEM', playerId: aiPlayerId, handIndex: i };
          if (validateAction(state, act).ok) return act;
        }
      } else if (item.effects.some((e) => e.kind === 'STUN_AND_LOCK_RETREAT_ENEMY_ACTIVE')) {
        if (
          opponent.active &&
          !opponent.active.statuses.stunned &&
          !opponent.active.statuses.stunImmuneNextTurn &&
          !hasElementalStatusImmunity(state, opponent.id, opponent.active).immune
        ) {
          const act: GameAction = { type: 'PLAY_ITEM', playerId: aiPlayerId, handIndex: i };
          if (validateAction(state, act).ok) return act;
        }
      } else if (item.effects.some((e) => e.kind === 'NEXT_ATTACK_DAMAGE_BONUS')) {
        if (activeCanAttackNow && opponent.active) {
          const act: GameAction = { type: 'PLAY_ITEM', playerId: aiPlayerId, handIndex: i };
          if (validateAction(state, act).ok) return act;
        }
      } else if (item.effects.some((e) => e.kind === 'DISCARD_ENEMY_EQUIPPED_ITEM_AND_DRAW')) {
        const enemyBoard = [...(opponent.active ? [opponent.active] : []), ...opponent.bench];
        if (
          player.deck.length + player.discard.length >= 6 &&
          enemyBoard.some((ch) => ch.attachedItems.length > 0)
        ) {
          const act: GameAction = { type: 'PLAY_ITEM', playerId: aiPlayerId, handIndex: i };
          if (validateAction(state, act).ok) return act;
        }
      } else if (item.effects.some((e) => e.kind === 'DRAW_CARDS')) {
        // Avoid deck-out suicide: only play draw items when deck + discard has plenty of cards left
        // Also occasionally hold draw items when hand is already comfortable so bosses/HARD feel more human
        const drawHoldChance =
          bossErr !== undefined ? bossErr : difficulty === 'HARD' ? 0.22 : 0;
        const holdDraw =
          drawHoldChance > 0 &&
          player.hand.length >= 4 &&
          deterministicRoll(state, 29 + i) < drawHoldChance;
        if (player.deck.length + player.discard.length >= 10 && !holdDraw) {
          const act: GameAction = { type: 'PLAY_ITEM', playerId: aiPlayerId, handIndex: i };
          if (validateAction(state, act).ok) return act;
        }
      } else if (item.effects.some((e) => e.kind === 'HEAL_TARGET')) {
        const candidates =
          item.targetScope === 'ANY_ALLY'
            ? [...(player.active ? [player.active] : []), ...player.bench]
            : player.active
              ? [player.active]
              : [];
        const bestTarget = candidates
          .map((ch) => {
            const maxHp = computeEffectiveMaxHp(state, aiPlayerId, ch);
            const missingHp = Math.max(0, maxHp - ch.currentHp);
            const hasBurn = Boolean(ch.statuses.burn?.active);
            const isActive = player.active?.instanceId === ch.instanceId;
            const score = missingHp + (hasBurn ? 35 : 0) + (isActive && (missingHp >= 40 || hasBurn) ? 15 : 0);
            return { ch, missingHp, hasBurn, score };
          })
          .filter((entry) => entry.hasBurn || entry.missingHp >= 40)
          .sort((a, b) => b.score - a.score)[0];

        if (bestTarget) {
          const act: GameAction = {
            type: 'PLAY_ITEM',
            playerId: aiPlayerId,
            handIndex: i,
            targetInstanceId: bestTarget.ch.instanceId,
          };
          if (validateAction(state, act).ok) return act;
        }
      }
    }

    // 4e. Attach Energy (respecting bonus energy attachments from Impulso Espiritual!)
    const maxAttachments = getMaxEnergyAttachmentsThisTurn(state, aiPlayerId);
    if (player.energyAttachedThisTurn < maxAttachments) {
      const boardChars = [...(player.active ? [player.active] : []), ...player.bench];
      const activeNeeded = player.active ? collectNeededEnergyColors([player.active]) : new Map<EnergyType, number>();
      const boardNeeded = collectNeededEnergyColors(boardChars);

      const energyIndices = player.hand
        .map((id, idx) => ({ card: getEnergyCard(id), idx }))
        .filter((x): x is { card: NonNullable<typeof x.card>; idx: number } => !!x.card);

      if (energyIndices.length > 0) {
        const activeIsStandUser =
          player.active !== null &&
          getEffectiveCharacterProfile(player.active).categories.includes('STAND_USER');
        energyIndices.sort((a, b) => {
          const scoreEnergy = (etype: EnergyType) => {
            if (etype === 'STAND') return activeIsStandUser ? 14 : 6;
            return (activeNeeded.get(etype) ?? 0) * 10 + (boardNeeded.get(etype) ?? 0) * 3;
          };
          return scoreEnergy(b.card.energyType) - scoreEnergy(a.card.energyType);
        });
        for (const chosen of energyIndices) {
          let targetId = chooseEnergyTarget(state, aiPlayerId, chosen.card.energyType);
          // Human-like opening: occasionally invest energy into a bench character when active can already attack
          const benchEnergyChance =
            bossErr !== undefined ? bossErr * 0.85 : difficulty === 'HARD' ? 0.16 : 0;
          if (
            benchEnergyChance > 0 &&
            activeCanAttackNow &&
            player.bench.length > 0 &&
            deterministicRoll(state, 37) < benchEnergyChance &&
            (chosen.card.energyType !== 'STAND' ||
              getEffectiveCharacterProfile(player.bench[0]!).categories.includes('STAND_USER'))
          ) {
            targetId = player.bench[0]!.instanceId;
          }
          if (targetId) {
            const act: GameAction = {
              type: 'ATTACH_ENERGY',
              playerId: aiPlayerId,
              handIndex: chosen.idx,
              targetInstanceId: targetId,
            };
            if (validateAction(state, act).ok) return act;
          }
        }
      }
    }

    // Check if we can actually attack in Combat Phase right now
    const canEnterCombat = validateAction(state, {
      type: 'ENTER_COMBAT_PHASE',
      playerId: aiPlayerId,
    }).ok;
    const payableAttacks =
      canEnterCombat && player.active !== null
        ? getAvailableAttacks(player.active).filter((a) =>
            canPayEnergyCost(player.active!.attachedEnergies, a.attack.energyCost, a.source),
          )
        : [];
    const hasPayableAttack = payableAttacks.length > 0;

    const bestPayableDamage = payableAttacks.reduce(
      (max, entry) => Math.max(max, getAttackNominalMaxDamage(entry.attack)),
      0,
    );
    const canScoreKoNow =
      hasPayableAttack &&
      opponent.active !== null &&
      bestPayableDamage >= opponent.active.currentHp;

    // 4e-bis. Llamada de Stand (ends turn like bench actions): use when we cannot attack this turn
    // (e.g. Active has no Stand, Turn 1 first player, or insufficient energy), prioritizing Active first!
    if (!hasPayableAttack) {
      const summonActions = legal.filter(
        (a): a is Extract<GameAction, { type: 'SUMMON_STAND_FROM_DECK' }> =>
          a.type === 'SUMMON_STAND_FROM_DECK',
      );
      if (summonActions.length > 0) {
        summonActions.sort((a, b) => {
          const aIsActive = player.active?.instanceId === a.targetInstanceId ? 1 : 0;
          const bIsActive = player.active?.instanceId === b.targetInstanceId ? 1 : 0;
          return bIsActive - aIsActive;
        });
        return summonActions[0]!;
      }
    }

    // 4f. Proactive Bench Building (balanced so AI builds safety bench without stalling attacks endlessly)
    const playBenchActions = legal.filter(
      (a): a is Extract<GameAction, { type: 'PLAY_TO_BENCH' }> => a.type === 'PLAY_TO_BENCH',
    );
    if (playBenchActions.length > 0) {
      const handStands = player.hand.map(getStandCard).filter((s): s is NonNullable<typeof s> => !!s);
      const activeProfile = player.active ? getEffectiveCharacterProfile(player.active) : null;

      const scoreBenchCandidate = (handIndex: number): { score: number; isSynergy: boolean } => {
        const c = getCharacterCard(player.hand[handIndex]!);
        if (!c) return { score: 0, isSynergy: false };
        let s = c.maxHp;
        let isSynergy = false;

        if (
          (c.id === 'char-will-a-zeppeli' || c.id === 'char-lisa-lisa') &&
          activeProfile?.categories.includes('HAMON_USER')
        ) {
          s += 120;
          isSynergy = true;
        }
        if (c.id === 'char-noriaki-kakyoin') {
          s += activeProfile?.currentCardId === 'char-jean-pierre-polnareff' ? 140 : 90;
          isSynergy = true;
        }
        if (c.id === 'char-josuke-higashikata' && activeProfile?.currentCardId === 'char-okuyasu-nijimura') {
          s += 120;
          isSynergy = true;
        }
        if (c.id === 'char-koichi-hirose' && activeProfile?.currentCardId === 'char-yukako-yamagishi') {
          s += 120;
          isSynergy = true;
        }
        if (c.id === 'char-jean-pierre-polnareff' && activeProfile?.currentCardId === 'char-iggy') {
          s += 120;
          isSynergy = true;
        }
        if (c.id === 'char-stray-cat' && activeProfile?.currentCardId === 'char-yoshikage-kira') {
          s += 130;
          isSynergy = true;
        }

        if (c.attacks.length > 0) s += 55;
        if (c.dg !== null && handStands.some((st) => c.dg! >= st.requiredDg)) s += 70;
        return { score: s, isSynergy };
      };

      const ranked = playBenchActions
        .map((action) => ({ action, ...scoreBenchCandidate(action.handIndex) }))
        .sort((a, b) => b.score - a.score);
      const bestBench = ranked[0]!;

      const activeMaxHp = player.active ? computeEffectiveMaxHp(state, aiPlayerId, player.active) : 100;
      const activeHpRatio = player.active ? player.active.currentHp / activeMaxHp : 0;

      const shouldBuildBench =
        !hasPayableAttack ||
        (player.bench.length === 0 && !canScoreKoNow && (difficulty !== 'EASY' || activeHpRatio <= 0.75)) ||
        (difficulty === 'HARD' &&
          player.bench.length === 1 &&
          !canScoreKoNow &&
          bestPayableDamage < 60 &&
          (activeHpRatio <= 0.45 || bestBench.isSynergy)) ||
        // Occasional greedy bench setup on HARD / Campaign Bosses (gives the player a turn of breathing room without throwing lethal)
        ((bossErr !== undefined || difficulty === 'HARD') &&
          !canScoreKoNow &&
          activeHpRatio >= 0.75 &&
          player.bench.length < 2 &&
          deterministicRoll(state, 41) < (bossErr !== undefined ? bossErr * 0.75 : 0.12));

      if (shouldBuildBench) {
        return bestBench.action;
      }
    }

    // 4g. If active is Stunned or has no usable attacks and bench has a ready attacker -> swap!
    if (!hasPayableAttack && player.active) {
      const readyBench = player.bench.find(
        (b) =>
          !b.statuses.stunned &&
          getAvailableAttacks(b).some((a) => canPayEnergyCost(b.attachedEnergies, a.attack.energyCost)),
      );
      if (readyBench && (difficulty !== 'EASY' || deterministicRoll(state, 31) > 0.35)) {
        const swap: GameAction = {
          type: 'SWAP_ACTIVE_WITH_BENCH',
          playerId: aiPlayerId,
          benchInstanceId: readyBench.instanceId,
        };
        if (validateAction(state, swap).ok) return swap;
      }
    }

    if (hasPayableAttack) {
      return { type: 'ENTER_COMBAT_PHASE', playerId: aiPlayerId };
    }

    return { type: 'END_TURN', playerId: aiPlayerId };
  }

  // 5. Combat Phase: pick best attack according to difficulty
  if (state.phase === 'COMBAT' && state.players[aiPlayerId].active) {
    const active = state.players[aiPlayerId].active!;
    const available = getAvailableAttacks(active);
    const attackActions = legal.filter(
      (a): a is Extract<GameAction, { type: 'USE_ATTACK' }> => a.type === 'USE_ATTACK',
    );

    if (attackActions.length > 0) {
      const scored = attackActions
        .map((action) => {
          const atk = available.find((x) => x.attack.id === action.attackId)!.attack;
          return { action, score: expectedAttackScore(state, aiPlayerId, atk) };
        })
        .sort((a, b) => b.score - a.score);

      // EASY / NORMAL / HARD (or Campaign Boss with progressive error rate) occasionally pick a slightly suboptimal non-lethal move
      if (bossErr !== undefined && scored.length > 1 && scored[0]!.score < 170) {
        if (deterministicRoll(state, 59) < bossErr && scored[1]!.score > 0) {
          return scored[1]!.action;
        }
      } else if (difficulty === 'EASY' && scored.length > 1 && scored[0]!.score < 170) {
        if (deterministicRoll(state, 47) < 0.32 && scored[1]!.score > 0) {
          return scored[1]!.action;
        }
      } else if (difficulty === 'NORMAL' && scored.length > 1 && scored[0]!.score < 170) {
        if (deterministicRoll(state, 53) < 0.1 && scored[1]!.score >= scored[0]!.score - 15) {
          return scored[1]!.action;
        }
      } else if (difficulty === 'HARD' && scored.length > 1 && scored[0]!.score < 170) {
        if (deterministicRoll(state, 59) < 0.14 && scored[1]!.score > 0) {
          return scored[1]!.action;
        }
      }

      return scored[0]!.action;
    }
    return { type: 'END_TURN', playerId: aiPlayerId };
  }

  return legal[0] ?? null;
}
