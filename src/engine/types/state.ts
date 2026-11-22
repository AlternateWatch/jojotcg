import type { EnergyType, StatusType } from '../../data/schemas/cardTypes';
import type { GameRulesConfig } from '../../data/rulesConfig';
import type { CombatEvent } from './events';

export type PlayerId = 'P1' | 'P2';

export type GamePhase =
  | 'SETUP_MULLIGAN'
  | 'SETUP_ACTIVE'
  | 'DRAW'
  | 'PREPARATION'
  | 'COMBAT'
  | 'END_TURN'
  | 'GAME_OVER';

export interface BleedStack {
  id: string;
  turnsRemaining: number;
  damagePerTurn: number;
}

export interface BurnState {
  active: boolean;
  damagePerTurn: number;
}

export interface AttachedItemInstance {
  instanceId: string;
  cardId: string;
}

export interface StandInstance {
  instanceId: string;
  cardId: string;
  evolvedCardIds: string[];
  permanentDamageBonus: number;
  damageDebuff: number;
  /** Sex Pistols — Recarga Rápida: >0 upgrades next Control de las Balas to 6x10 (60) */
  rapidReloadTurnsRemaining?: number;
}

export interface CharacterInstance {
  instanceId: string;
  cardId: string;
  evolvedCardIds: string[];
  /** May temporarily exceed effectiveMaxHp after Silver Chariot Requiem's Soul Swap */
  currentHp: number;
  maxHpPenalty: number;
  attachedStand: StandInstance | null;
  attachedItems: AttachedItemInstance[];
  attachedEnergies: EnergyType[];
  statuses: {
    stunned: boolean;
    /** Grants 1-turn immunity to Stun immediately after recovering from Stun (anti-stun-lock) */
    stunImmuneNextTurn: boolean;
    bleedStacks: BleedStack[];
    burn: BurnState | null;
  };
  tookDamageThisTurn: boolean;
  /** Wamuu: once per life (resets only if revived from discard, NOT on bench swap) */
  windSenseUsed: boolean;
  /** Kars: once per life/match, saves from ANY KO at 1 HP */
  superiorIntellectUsed: boolean;
  /** Cream: dodges the next incoming enemy attack */
  dodgeNextAttack: boolean;
  /** Esidisi: +20 damage on next attack after taking damage */
  hotBloodBonusReady: boolean;
  /** Hol Horse: +40 on very first Stand attack */
  luckyShotUsed: boolean;
  /** Josuke: triggered permanently once HP <= 60 */
  hairRageTriggered: boolean;
  /** Preparation signature ability usage tracking */
  usedPrepAbilityThisTurn: boolean;
  usedOnceEnterPrepAbility: boolean;
  /** Ataúd de DIO: disables retreating/swapping this character to the bench until end of its next turn */
  retreatLockedUntilEndOfTurn?: boolean;
  /** Guido Mista — Tetrafobia: true once +10 permanent Stand damage has been triggered */
  tetraphobiaTriggered?: boolean;
  /** Erina Pendleton — Amor Flagrante: +10 HP & +10 next attack granted to Jonathan on entry */
  erinaHpBonus?: number;
  erinaNextAttackBonus?: boolean;
  /** Dire — Imagen Residual: +10 next attack after moving to Active with >1 energy attached */
  direAfterimageBonus?: boolean;
  /** Tarkus — Fuerza Sobrehumana: permanent +10 damage stacks gained on end-of-turn HEADS while Active */
  tarkusDamageBonus?: number;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  isAi: boolean;
  deck: string[];
  hand: string[];
  discard: string[];
  /** Face-down Prize Cards (6 set aside at start; draw 1 per opponent KO, take all to win!) */
  prizeCards: string[];
  active: CharacterInstance | null;
  bench: CharacterInstance[];
  mulliganConfirmed: boolean;
  mulliganCount: number;
  setupActiveChosen: boolean;
  energyAttachedThisTurn: number;
  /** Temporary extra energy attachments granted by items this turn */
  bonusEnergyAttachmentsThisTurn: number;
  evolutionsPlayedThisTurn: number;
  itemsPlayedThisTurn: number;
  extraCombatActionsRemaining: number;
  usedOncePerTurnKeys: string[];
  /** Caesar Zeppeli's Last Hamon bonus waiting for next attack */
  pendingNextAttackBonus: number;
  /** Horus's Caída de las Temperaturas permanent water attack bonus */
  permanentWaterAttackBonus: number;
  /** Rohan Kishibe reveals opponent hand */
  handRevealedToOpponent: boolean;
  /** Optional campaign featured card guaranteed in this player's starting hand (including after mulligan) */
  guaranteedOpeningCardId?: string;
  /** Giorno Giovanna: triggers "I, Giorno Giovanna, Have a Dream" only the first time Giorno is played */
  giornoDreamUsed?: boolean;
}

export type PromptContinuation =
  | 'NONE'
  | 'FINISH_COMBAT_ACTION'
  | 'FINISH_END_TURN';

export type PlayerPrompt =
  | {
      kind: 'YARE_YARE_DAZE_REACTION';
      playerId: PlayerId;
      targetInstanceId: string;
      status: StatusType;
      sourceLabel: string;
    }
  | {
      kind: 'PROMOTE_FROM_BENCH';
      playerId: PlayerId;
      reason: string;
    }
  | {
      kind: 'DISTRIBUTE_BENCH_DAMAGE';
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      totalDamage: number;
      increment: number;
      attackName: string;
      /** Targetable instances: active + bench */
      eligibleInstanceIds: string[];
      attackElementEnergies: EnergyType[];
    }
  | {
      kind: 'SELECT_TOP_CARDS';
      playerId: PlayerId;
      cards: string[];
      pickCount: number;
      restTo: 'TOP' | 'BOTTOM';
      sourceLabel: string;
    }
  | {
      kind: 'REORDER_OPPONENT_TOP_DECK';
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      cards: string[];
      sourceLabel: string;
    }
  | {
      kind: 'CHOOSE_ENEMY_BENCH_TARGET';
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      effect: 'APPLY_BURN' | 'RETURN_TO_DECK';
      sourceLabel: string;
    }
  | {
      kind: 'CHOOSE_ENEMY_STAND_ATTACK';
      playerId: PlayerId;
      targetPlayerId: PlayerId;
      availableAttackIds: string[];
      sourceLabel: string;
    }
  | {
      kind: 'RECOVER_ITEM_FROM_DISCARD';
      playerId: PlayerId;
      destination: 'HAND' | 'DECK';
      eligibleCardIds: string[];
      sourceLabel: string;
    }
  | {
      kind: 'RETREAT_CHOOSE_NEW_ACTIVE';
      playerId: PlayerId;
      sourceLabel: string;
    }
  | {
      kind: 'SEARCH_DECK_CARDS';
      playerId: PlayerId;
      filter: 'ENERGY' | 'STAND' | 'STAND_EVOLUTION' | 'CHARACTER_OR_STAND';
      maxPickCount: number;
      sourceLabel: string;
    }
  | {
      kind: 'RECOVER_ENERGY_FROM_DISCARD';
      playerId: PlayerId;
      eligibleCardIds: string[];
      sourceLabel: string;
    }
  | {
      kind: 'CHOOSE_ALLY_BENCH_HEAL';
      playerId: PlayerId;
      eligibleInstanceIds: string[];
      healAmount: number;
      sourceLabel: string;
    }
  | {
      kind: 'PEEK_TOP_DECK';
      playerId: PlayerId;
      ownTopCards: string[];
      opponentTopCards: string[];
      sourceLabel: string;
    }
  | {
      kind: 'CHOOSE_PRIZE_CARD';
      playerId: PlayerId;
      reason: string;
    }
  | {
      kind: 'CHOOSE_STAND_FROM_DECK';
      playerId: PlayerId;
      targetInstanceId: string;
      eligibleStandCardIds: string[];
      sourceLabel: string;
    };

export interface GameState {
  rules: GameRulesConfig;
  phase: GamePhase;
  turnNumber: number;
  activePlayerId: PlayerId;
  firstPlayerId: PlayerId;
  winnerId: PlayerId | null;
  winReason: string | null;
  players: Record<PlayerId, PlayerState>;
  pendingPrompt: PlayerPrompt | null;
  queuedPrompts: PlayerPrompt[];
  promptContinuation: PromptContinuation;
  nextEntitySeq: number;
  eventLog: CombatEvent[];
}
