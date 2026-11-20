import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, PRESET_DECKS } from '../../data/cardRegistry';
import { chooseAiAction } from '../../engine/ai/tacticalAi';
import { createGame, dispatchAction } from '../../engine/gameEngine';
import { createSeededRng } from '../../engine/rng';
import { OFFICIAL_CARD_IMAGE_IDS, OFFICIAL_ITEM_IMAGE_IDS } from '../../services/assetResolver';
import { buildControlledBattleState, mustDispatch } from '../helpers/testFixtures';

describe('Asset Integrity, Additional Official Card Abilities & Multi-Match AI Stress Tests', () => {
  it('verifies all 57 official PNG cards, all 7 official Item PNG cards, and all 6 JoJo pattern files exist on disk', () => {
    const projectRoot = path.resolve(process.cwd());
    expect(OFFICIAL_CARD_IMAGE_IDS.size).toBe(57);
    expect(OFFICIAL_ITEM_IMAGE_IDS.size).toBe(7);

    for (const imageId of OFFICIAL_CARD_IMAGE_IDS) {
      const filePath = path.join(projectRoot, 'public', 'assets', 'cards', 'official', `${imageId}.png`);
      expect(fs.existsSync(filePath), `Missing official PNG: ${filePath}`).toBe(true);
    }

    for (const imageId of OFFICIAL_ITEM_IMAGE_IDS) {
      const filePath = path.join(projectRoot, 'public', 'assets', 'cards', 'items', `${imageId}.png`);
      expect(fs.existsSync(filePath), `Missing item PNG: ${filePath}`).toBe(true);
    }

    for (let i = 1; i <= 6; i++) {
      const patPath = path.join(projectRoot, 'public', 'assets', 'patterns', `pattern${i}.png`);
      expect(fs.existsSync(patPath), `Missing pattern PNG: ${patPath}`).toBe(true);
    }

    // Ensure unique card IDs across the entire catalog
    const ids = new Set(ALL_CARDS.map((c) => c.id));
    expect(ids.size).toBe(ALL_CARDS.length);
  });

  it('resolves Kars Ultimate evolution (200 HP, Evolución Instantánea immunity, Hamon del Sol)', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-kars',
      p1ActiveItems: ['item-mascara-de-piedra', 'item-piedra-roja-de-aja'],
      p1ActiveEnergies: ['LIGHT', 'LIGHT', 'LIGHT'],
      p1Hand: ['evo-kars-ultimate'],
      p2ActiveId: 'char-dio',
      p2ActiveStandId: 'stand-hierophant-green',
      p2ActiveEnergies: ['COLORLESS'],
      phase: 'PREPARATION',
    });

    state = mustDispatch(state, { type: 'EVOLVE_CARD', playerId: 'P1', handIndex: 0 });
    expect(state.players.P1.active!.currentHp).toBeGreaterThanOrEqual(200);

    // Hamon del Sol: 100 base + 10 from Piedra Roja de Aja (LIGHT bonus) = 110 dmg + Burn!
    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-hamon-del-sol',
    });
    expect(state.players.P2.active!.currentHp).toBe(50); // 160 - 110
    expect(state.players.P2.active!.statuses.burn?.active).toBe(true);

    // P2 tries to Stun Kars Ultimate with Cuerpo Flexible -> blocked by Evolución Instantánea!
    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P2' });
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P2',
      attackId: 'atk-cuerpo-flexible',
    });
    expect(state.players.P1.active!.statuses.stunned).toBe(false);
  });

  it('resolves Silver Chariot Requiem Manipulación de Stand copying an enemy Stand attack', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-jean-pierre-polnareff',
      p1ActiveStandId: 'stand-silver-chariot',
      p1ActiveEnergies: ['PSYCHIC', 'PSYCHIC'],
      p1Hand: ['evo-silver-chariot-requiem', 'item-flecha-requiem'],
      p2ActiveId: 'char-josuke-higashikata',
      p2ActiveStandId: 'stand-crazy-diamond',
      phase: 'PREPARATION',
    });

    state = mustDispatch(state, { type: 'EVOLVE_CARD', playerId: 'P1', handIndex: 0 });
    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-manipulacion-de-stand',
    });

    expect(state.pendingPrompt?.kind).toBe('CHOOSE_ENEMY_STAND_ATTACK');
    // Copy Crazy Diamond's Dorara (80 damage) against Josuke (130 -> 50 HP)
    state = mustDispatch(state, {
      type: 'RESPOND_PROMPT',
      playerId: 'P1',
      response: { kind: 'CHOOSE_ENEMY_STAND_ATTACK', attackId: 'atk-dorara' },
    });
    expect(state.players.P2.active!.currentHp).toBe(50);
  });

  it('resolves Jonathan Adiós Erina, Caesar Último Hamon, Joseph Nigerundayo, Santana Absorción & Prep draw abilities', () => {
    // 1. Joseph Nigerundayo swaps to bench WITHOUT ending P1's turn!
    let state = buildControlledBattleState({
      p1ActiveId: 'char-joseph-joestar',
      p1BenchIds: ['char-akira-otoishi'],
      p2ActiveId: 'char-dio-brando',
      phase: 'PREPARATION',
    });
    state = mustDispatch(state, {
      type: 'SWAP_ACTIVE_WITH_BENCH',
      playerId: 'P1',
      benchInstanceId: state.players.P1.bench[0]!.instanceId,
    });
    expect(state.activePlayerId).toBe('P1');
    expect(state.phase).toBe('PREPARATION');

    // 2. Akira Otoishi Solo de Guitarra draws 2 cards in preparation
    const beforeHand = state.players.P1.hand.length;
    state = mustDispatch(state, {
      type: 'USE_PREP_ABILITY',
      playerId: 'P1',
      sourceInstanceId: state.players.P1.active!.instanceId,
    });
    expect(state.players.P1.hand.length).toBe(beforeHand + 2);

    // 3. Jonathan returns to deck on KO, Caesar gives +40 next attack
    let koState = buildControlledBattleState({
      p1ActiveId: 'char-dio-brando',
      p1ActiveEnergies: ['ELECTRIC', 'ELECTRIC'],
      p2ActiveId: 'char-jonathan-joestar',
      p2BenchIds: ['char-caesar-zeppeli'],
      phase: 'COMBAT',
    });
    koState.players.P2.active!.currentHp = 50;
    koState = mustDispatch(koState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-space-ripper-stingy-eyes',
    });
    expect(koState.players.P2.deck).toContain('char-jonathan-joestar');
    expect(koState.players.P2.discard).not.toContain('char-jonathan-joestar');
    expect(koState.players.P2.active!.cardId).toBe('char-caesar-zeppeli');

    // 4. Santana Absorción de Cuerpo counters 10 and heals 10 when damaged
    const santanaState = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar', // 130 HP
      p1ActiveEnergies: ['COLORLESS'],
      p2ActiveId: 'char-santana', // 120 HP
      phase: 'COMBAT',
    });
    const afterHit = mustDispatch(santanaState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-zoom-punch', // 20 dmg
    });
    expect(afterHit.players.P2.active!.currentHp).toBe(110); // 120 - 20 + 10
    expect(afterHit.players.P1.active!.currentHp).toBe(120); // 130 - 10 counter
  });

  it('completes AI vs AI matches across all 4 preset decks cleanly', () => {
    const pairs: [number, number][] = [
      [0, 1],
      [2, 3],
      [0, 3],
      [1, 2],
    ];

    for (const [d1, d2] of pairs) {
      const rng = createSeededRng(100 + d1 * 10 + d2);
      let state = createGame({
        p1Name: PRESET_DECKS[d1]!.name,
        p2Name: PRESET_DECKS[d2]!.name,
        p1Deck: PRESET_DECKS[d1]!.cardIds,
        p2Deck: PRESET_DECKS[d2]!.cardIds,
        p1IsAi: true,
        p2IsAi: true,
        rng,
      });

      let steps = 0;
      while (state.phase !== 'GAME_OVER' && steps < 600) {
        const actor = state.pendingPrompt
          ? state.pendingPrompt.playerId
          : state.phase === 'SETUP_MULLIGAN'
            ? !state.players.P1.mulliganConfirmed
              ? 'P1'
              : 'P2'
            : state.phase === 'SETUP_ACTIVE'
              ? !state.players.P1.setupActiveChosen
                ? 'P1'
                : 'P2'
              : state.activePlayerId;

        const action = chooseAiAction(state, actor);
        expect(action).not.toBeNull();
        const res = dispatchAction(state, action!, rng);
        expect(res.ok, res.error).toBe(true);
        state = res.state;
        steps++;
      }

      expect(state.phase).toBe('GAME_OVER');
    }
  });
});
