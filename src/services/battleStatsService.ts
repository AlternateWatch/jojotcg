import { getCardById } from '../data/cardRegistry';
import type { GameState, PlayerId } from '../engine/types/state';

export interface PlayerBattleStats {
  damageDealt: number;
  kosScored: number;
  hpHealed: number;
  itemsPlayed: number;
  evolutionsPlayed: number;
  coinHeads: number;
  coinTails: number;
}

export interface BattleMvpSummary {
  cardId: string;
  cardName: string;
  ownerId: PlayerId;
  damageDealt: number;
  kosScored: number;
  topAttackName: string | null;
}

export interface BattlePostSummary {
  turnsPlayed: number;
  p1: PlayerBattleStats;
  p2: PlayerBattleStats;
  mvp: BattleMvpSummary | null;
}

function emptyStats(): PlayerBattleStats {
  return {
    damageDealt: 0,
    kosScored: 0,
    hpHealed: 0,
    itemsPlayed: 0,
    evolutionsPlayed: 0,
    coinHeads: 0,
    coinTails: 0,
  };
}

/**
 * Purely derives post-battle statistics and the Match MVP card from the engine's eventLog.
 */
export function computeBattlePostSummary(state: GameState): BattlePostSummary {
  const stats: Record<PlayerId, PlayerBattleStats> = {
    P1: emptyStats(),
    P2: emptyStats(),
  };

  // Track each player's current active card (Character or attached Stand) to attribute damage & KOs
  const activeCharByPlayer: Record<PlayerId, string | null> = { P1: null, P2: null };
  const activeStandByPlayer: Record<PlayerId, string | null> = { P1: null, P2: null };
  let lastAttackPlayer: PlayerId | null = null;
  let lastAttackName: string | null = null;

  const cardScores = new Map<
    string,
    { cardId: string; ownerId: PlayerId; damage: number; kos: number; topAttack: string | null }
  >();

  const creditCard = (
    ownerId: PlayerId,
    cardId: string | null,
    dmg: number,
    ko: number,
    attackName: string | null,
  ) => {
    if (!cardId) return;
    const key = `${ownerId}:${cardId}`;
    const prev = cardScores.get(key) ?? {
      cardId,
      ownerId,
      damage: 0,
      kos: 0,
      topAttack: null,
    };
    prev.damage += dmg;
    prev.kos += ko;
    if (attackName && !prev.topAttack) prev.topAttack = attackName;
    cardScores.set(key, prev);
  };

  for (const ev of state.eventLog) {
    switch (ev.type) {
      case 'CHARACTER_PLAYED': {
        if (ev.zone === 'ACTIVE') {
          activeCharByPlayer[ev.playerId] = ev.cardId;
          activeStandByPlayer[ev.playerId] = null;
        }
        break;
      }
      case 'BENCH_SWAP': {
        activeCharByPlayer[ev.playerId] = ev.newActiveCardId;
        activeStandByPlayer[ev.playerId] = null;
        break;
      }
      case 'STAND_EQUIPPED': {
        if (activeCharByPlayer[ev.playerId] === ev.characterCardId) {
          activeStandByPlayer[ev.playerId] = ev.standCardId;
        }
        break;
      }
      case 'CARD_EVOLVED': {
        stats[ev.playerId].evolutionsPlayed += 1;
        const evo = getCardById(ev.evolutionCardId);
        if (evo?.type === 'EVOLUTION') {
          if (evo.evolutionTarget === 'STAND') {
            activeStandByPlayer[ev.playerId] = ev.evolutionCardId;
          } else {
            activeCharByPlayer[ev.playerId] = ev.evolutionCardId;
          }
        }
        break;
      }
      case 'ITEM_PLAYED': {
        stats[ev.playerId].itemsPlayed += 1;
        break;
      }
      case 'ATTACK_DECLARED': {
        lastAttackPlayer = ev.playerId;
        lastAttackName = ev.attackName;
        break;
      }
      case 'COIN_FLIPPED': {
        for (const r of ev.results) {
          if (r === 'HEADS') stats[ev.playerId].coinHeads += 1;
          else stats[ev.playerId].coinTails += 1;
        }
        break;
      }
      case 'HEALED': {
        stats[ev.targetPlayerId].hpHealed += ev.amount;
        break;
      }
      case 'DAMAGE_DEALT': {
        if (ev.source === 'RECOIL') break;
        const attackerId: PlayerId = ev.targetPlayerId === 'P1' ? 'P2' : 'P1';
        stats[attackerId].damageDealt += ev.amount;
        if (ev.source === 'ATTACK' || ev.source === 'BENCH') {
          const mvpCardId =
            activeStandByPlayer[attackerId] ?? activeCharByPlayer[attackerId];
          creditCard(
            attackerId,
            mvpCardId,
            ev.amount,
            0,
            lastAttackPlayer === attackerId ? lastAttackName : null,
          );
        }
        break;
      }
      case 'CHARACTER_KO': {
        const scorerId: PlayerId = ev.ownerPlayerId === 'P1' ? 'P2' : 'P1';
        stats[scorerId].kosScored += 1;
        const mvpCardId = activeStandByPlayer[scorerId] ?? activeCharByPlayer[scorerId];
        creditCard(
          scorerId,
          mvpCardId,
          0,
          1,
          lastAttackPlayer === scorerId ? lastAttackName : null,
        );
        break;
      }
      default:
        break;
    }
  }

  // Pick MVP (prioritizing winning player's top contributor, then highest damage + 40*KOs)
  let best:
    | { cardId: string; ownerId: PlayerId; damage: number; kos: number; topAttack: string | null }
    | null = null;
  let bestScore = -1;

  for (const entry of cardScores.values()) {
    const winnerBonus = state.winnerId === entry.ownerId ? 25 : 0;
    const score = entry.damage + entry.kos * 45 + winnerBonus;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  const mvp: BattleMvpSummary | null = best
    ? {
        cardId: best.cardId,
        cardName: getCardById(best.cardId)?.name ?? best.cardId,
        ownerId: best.ownerId,
        damageDealt: best.damage,
        kosScored: best.kos,
        topAttackName: best.topAttack,
      }
    : null;

  return {
    turnsPlayed: Math.max(1, state.turnNumber),
    p1: stats.P1,
    p2: stats.P2,
    mvp,
  };
}
