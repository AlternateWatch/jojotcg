import type { CombatEvent } from './events';
import type { GameState, PlayerId } from './state';

export type PromptResponsePayload =
  | { kind: 'YARE_YARE_DAZE_REACTION'; accept: boolean; discardHandIndex?: number }
  | { kind: 'PROMOTE_FROM_BENCH'; benchInstanceId: string }
  | { kind: 'DISTRIBUTE_BENCH_DAMAGE'; allocation: Record<string, number> }
  | { kind: 'SELECT_TOP_CARDS'; pickedIndices: number[]; restOrderIndices?: number[] }
  | { kind: 'REORDER_OPPONENT_TOP_DECK'; orderedIndices: number[] }
  | { kind: 'CHOOSE_ENEMY_BENCH_TARGET'; benchInstanceId: string }
  | { kind: 'CHOOSE_ENEMY_STAND_ATTACK'; attackId: string }
  | { kind: 'RECOVER_ITEM_FROM_DISCARD'; discardIndex: number }
  | { kind: 'RETREAT_CHOOSE_NEW_ACTIVE'; benchInstanceId: string }
  | { kind: 'SEARCH_DECK_CARDS'; deckIndices: number[] }
  | { kind: 'RECOVER_ENERGY_FROM_DISCARD'; discardIndex: number };

export type GameAction =
  | { type: 'PERFORM_MULLIGAN'; playerId: PlayerId }
  | { type: 'CONFIRM_STARTING_HAND'; playerId: PlayerId }
  | { type: 'CHOOSE_STARTING_ACTIVE'; playerId: PlayerId; handIndex: number }
  | { type: 'EQUIP_STAND'; playerId: PlayerId; handIndex: number; targetInstanceId: string }
  | { type: 'ATTACH_ENERGY'; playerId: PlayerId; handIndex: number; targetInstanceId: string }
  | { type: 'PLAY_ITEM'; playerId: PlayerId; handIndex: number; targetInstanceId?: string }
  | { type: 'EVOLVE_CARD'; playerId: PlayerId; handIndex: number }
  | { type: 'USE_PREP_ABILITY'; playerId: PlayerId; sourceInstanceId: string }
  | { type: 'PLAY_TO_BENCH'; playerId: PlayerId; handIndex: number }
  | { type: 'SWAP_ACTIVE_WITH_BENCH'; playerId: PlayerId; benchInstanceId: string }
  | { type: 'RETREAT_ACTIVE'; playerId: PlayerId; benchInstanceId: string }
  | { type: 'ENTER_COMBAT_PHASE'; playerId: PlayerId }
  | { type: 'USE_ATTACK'; playerId: PlayerId; attackId: string }
  | { type: 'END_TURN'; playerId: PlayerId }
  | { type: 'RESPOND_PROMPT'; playerId: PlayerId; response: PromptResponsePayload }
  | { type: 'CONCEDE'; playerId: PlayerId };

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export interface ActionResult {
  ok: boolean;
  state: GameState;
  events: CombatEvent[];
  error?: string;
}
