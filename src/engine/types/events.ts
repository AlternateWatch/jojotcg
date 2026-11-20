import type { EnergyType, StatusType } from '../../data/schemas/cardTypes';
import type { CoinResult } from '../rng';
import type { GamePhase, PlayerId } from './state';

export type CombatEvent =
  | {
      id: string;
      turn: number;
      type: 'PHASE_CHANGED';
      playerId: PlayerId;
      phase: GamePhase;
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'MULLIGAN';
      playerId: PlayerId;
      opponentDrewCard: boolean;
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'CARD_DRAWN';
      playerId: PlayerId;
      count: number;
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'CHARACTER_PLAYED';
      playerId: PlayerId;
      cardId: string;
      zone: 'ACTIVE' | 'BENCH';
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'BENCH_SWAP';
      playerId: PlayerId;
      newActiveCardId: string;
      endedTurn: boolean;
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'STAND_EQUIPPED';
      playerId: PlayerId;
      standCardId: string;
      characterCardId: string;
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'ENERGY_ATTACHED';
      playerId: PlayerId;
      energyType: EnergyType;
      targetCardId: string;
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'ITEM_PLAYED';
      playerId: PlayerId;
      itemCardId: string;
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'CARD_EVOLVED';
      playerId: PlayerId;
      evolutionCardId: string;
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'ATTACK_DECLARED';
      playerId: PlayerId;
      attackName: string;
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'COIN_FLIPPED';
      playerId: PlayerId;
      attackName: string;
      results: CoinResult[];
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'DAMAGE_DEALT';
      targetPlayerId: PlayerId;
      targetInstanceId: string;
      targetCardId: string;
      amount: number;
      source: 'ATTACK' | 'BLEED' | 'BURN' | 'RECOIL' | 'COUNTER' | 'BENCH';
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'HEALED';
      targetPlayerId: PlayerId;
      targetInstanceId: string;
      amount: number;
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'STATUS_APPLIED';
      targetPlayerId: PlayerId;
      targetInstanceId: string;
      status: StatusType;
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'STATUS_PREVENTED';
      targetPlayerId: PlayerId;
      targetInstanceId: string;
      status: StatusType;
      reason: string;
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'STATUS_CLEARED';
      targetPlayerId: PlayerId;
      targetInstanceId: string;
      status: StatusType;
      reason: string;
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'ABILITY_TRIGGERED';
      playerId: PlayerId;
      abilityName: string;
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'CHARACTER_KO';
      ownerPlayerId: PlayerId;
      cardId: string;
      reason: string;
      message: string;
    }
  | {
      id: string;
      turn: number;
      type: 'GAME_OVER';
      winnerId: PlayerId;
      reason: string;
      message: string;
    };
