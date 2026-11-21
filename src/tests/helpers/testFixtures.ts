import { createGame, dispatchAction } from '../../engine/gameEngine';
import { createCharacterInstance } from '../../engine/helpers/stateHelpers';
import { createMockRng, createSeededRng } from '../../engine/rng';
import type { CharacterInstance, GameState, PlayerId } from '../../engine/types/state';
import type { EnergyType } from '../../data/schemas/cardTypes';

export function buildControlledBattleState(options: {
  p1ActiveId: string;
  p2ActiveId: string;
  p1BenchIds?: string[];
  p2BenchIds?: string[];
  p1Hand?: string[];
  p2Hand?: string[];
  p1Deck?: string[];
  p2Deck?: string[];
  p1PrizeCards?: string[];
  p2PrizeCards?: string[];
  p1ActiveStandId?: string;
  p2ActiveStandId?: string;
  p1ActiveEnergies?: EnergyType[];
  p2ActiveEnergies?: EnergyType[];
  p1ActiveItems?: string[];
  p2ActiveItems?: string[];
  phase?: 'PREPARATION' | 'COMBAT';
  turnNumber?: number;
  activePlayerId?: PlayerId;
}): GameState {
  const defaultFiller = Array.from({ length: 15 }, () => 'energy-colorless');
  const base = createGame({
    p1Name: 'Jugador 1',
    p2Name: 'Jugador 2',
    p1Deck: options.p1Deck ?? defaultFiller,
    p2Deck: options.p2Deck ?? defaultFiller,
    rng: createSeededRng(42),
  });

  base.phase = options.phase ?? 'PREPARATION';
  base.turnNumber = options.turnNumber ?? 2;
  base.activePlayerId = options.activePlayerId ?? 'P1';
  base.players.P1.mulliganConfirmed = true;
  base.players.P2.mulliganConfirmed = true;
  base.players.P1.setupActiveChosen = true;
  base.players.P2.setupActiveChosen = true;
  base.players.P1.hand = [...(options.p1Hand ?? [])];
  base.players.P2.hand = [...(options.p2Hand ?? [])];
  base.players.P1.deck = [...(options.p1Deck ?? defaultFiller)];
  base.players.P2.deck = [...(options.p2Deck ?? defaultFiller)];
  base.players.P1.prizeCards = [
    ...(options.p1PrizeCards ?? Array.from({ length: 6 }, () => 'energy-colorless')),
  ];
  base.players.P2.prizeCards = [
    ...(options.p2PrizeCards ?? Array.from({ length: 6 }, () => 'energy-colorless')),
  ];

  const setupChar = (
    cardId: string,
    standId?: string,
    energies?: EnergyType[],
    items?: string[],
  ): CharacterInstance => {
    const inst = createCharacterInstance(base, cardId);
    if (standId) {
      inst.attachedStand = {
        instanceId: `std-test-${inst.instanceId}`,
        cardId: standId,
        evolvedCardIds: [],
        permanentDamageBonus: 0,
        damageDebuff: 0,
      };
    }
    if (energies) inst.attachedEnergies = [...energies];
    if (items) {
      inst.attachedItems = items.map((itemCardId, idx) => ({
        instanceId: `itm-test-${inst.instanceId}-${idx}`,
        cardId: itemCardId,
      }));
    }
    return inst;
  };

  base.players.P1.active = setupChar(
    options.p1ActiveId,
    options.p1ActiveStandId,
    options.p1ActiveEnergies,
    options.p1ActiveItems,
  );
  base.players.P2.active = setupChar(
    options.p2ActiveId,
    options.p2ActiveStandId,
    options.p2ActiveEnergies,
    options.p2ActiveItems,
  );

  base.players.P1.bench = (options.p1BenchIds ?? []).map((id) => setupChar(id));
  base.players.P2.bench = (options.p2BenchIds ?? []).map((id) => setupChar(id));

  return base;
}

export function mustDispatch(
  state: GameState,
  action: Parameters<typeof dispatchAction>[1],
  rng = createMockRng([]),
): GameState {
  const res = dispatchAction(state, action, rng);
  if (!res.ok) {
    throw new Error(`Expected action ${action.type} to succeed, got error: ${res.error}`);
  }
  return res.state;
}
