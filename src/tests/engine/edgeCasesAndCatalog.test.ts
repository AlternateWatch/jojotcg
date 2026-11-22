import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, PRESET_DECKS } from '../../data/cardRegistry';
import { chooseAiAction } from '../../engine/ai/tacticalAi';
import { createGame, dispatchAction } from '../../engine/gameEngine';
import { createSeededRng } from '../../engine/rng';
import {
  OFFICIAL_CARD_IMAGE_IDS,
  OFFICIAL_ENERGY_IMAGE_IDS,
  OFFICIAL_ITEM_IMAGE_IDS,
} from '../../services/assetResolver';
import { buildControlledBattleState, mustDispatch } from '../helpers/testFixtures';

describe('Asset Integrity, Additional Official Card Abilities & Multi-Match AI Stress Tests', () => {
  it('verifies all 69 official PNG cards, all 12 official Item PNG cards, and all 6 JoJo pattern files exist on disk', () => {
    const projectRoot = path.resolve(process.cwd());
    expect(OFFICIAL_CARD_IMAGE_IDS.size).toBe(73);
    expect(OFFICIAL_ITEM_IMAGE_IDS.size).toBe(16);
    expect(OFFICIAL_ENERGY_IMAGE_IDS.size).toBe(8);

    for (const imageId of OFFICIAL_CARD_IMAGE_IDS) {
      const filePath = path.join(projectRoot, 'public', 'assets', 'cards', 'official', `${imageId}.png`);
      expect(fs.existsSync(filePath), `Missing official PNG: ${filePath}`).toBe(true);
    }

    for (const imageId of OFFICIAL_ITEM_IMAGE_IDS) {
      const filePath = path.join(projectRoot, 'public', 'assets', 'cards', 'items', `${imageId}.png`);
      expect(fs.existsSync(filePath), `Missing item PNG: ${filePath}`).toBe(true);
    }

    for (const imageId of OFFICIAL_ENERGY_IMAGE_IDS) {
      const filePath = path.join(projectRoot, 'public', 'assets', 'cards', 'energies', `${imageId}.png`);
      expect(fs.existsSync(filePath), `Missing energy PNG: ${filePath}`).toBe(true);
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

  it('resolves Silver Chariot Réquiem Manipulación de Cuerpos copying enemy Stand or non-Stand attacks & 2-Psychic Intercambio de Almas', () => {
    // 1. Copies enemy Stand attack (Crazy Diamond Dorara)
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
      attackId: 'atk-manipulacion-de-cuerpos',
    });

    expect(state.pendingPrompt?.kind).toBe('CHOOSE_ENEMY_STAND_ATTACK');
    // Copy Crazy Diamond's Dorara (80 damage) against Josuke (130 -> 50 HP)
    state = mustDispatch(state, {
      type: 'RESPOND_PROMPT',
      playerId: 'P1',
      response: { kind: 'CHOOSE_ENEMY_STAND_ATTACK', attackId: 'atk-dorara' },
    });
    expect(state.players.P2.active!.currentHp).toBe(50);

    // 2. Also copies attacks from a non-Stand character (Jonathan Joestar) & can use Intercambio de Almas for 2 PSYCHIC!
    let vsNonStand = buildControlledBattleState({
      p1ActiveId: 'char-jean-pierre-polnareff',
      p1ActiveStandId: 'stand-silver-chariot',
      p1ActiveEnergies: ['PSYCHIC', 'PSYCHIC'],
      p1Hand: ['evo-silver-chariot-requiem', 'item-flecha-requiem'],
      p2ActiveId: 'char-jonathan-joestar', // 130 HP, no Stand
      phase: 'PREPARATION',
    });
    vsNonStand = mustDispatch(vsNonStand, { type: 'EVOLVE_CARD', playerId: 'P1', handIndex: 0 });
    vsNonStand = mustDispatch(vsNonStand, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    vsNonStand = mustDispatch(vsNonStand, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-manipulacion-de-cuerpos',
    });
    expect(vsNonStand.pendingPrompt?.kind).toBe('CHOOSE_ENEMY_STAND_ATTACK');
    vsNonStand = mustDispatch(vsNonStand, {
      type: 'RESPOND_PROMPT',
      playerId: 'P1',
      response: { kind: 'CHOOSE_ENEMY_STAND_ATTACK', attackId: 'atk-sendo-hamon-overdrive' },
    });
    expect(vsNonStand.players.P2.active!.currentHp).toBe(60); // 130 - 70
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

  it('resolves Giorno Giovanna (130 HP, DG 6) I, Giorno Giovanna, Have a Dream healing a bench ally by 20 HP only the first time he is played', () => {
    // 1. Multi-bench case -> prompts to pick which bench ally to heal +20 HP
    let state = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1BenchIds: ['char-koichi-hirose', 'char-jean-pierre-polnareff'],
      p1Hand: ['char-giorno-giovanna'],
      p2ActiveId: 'char-dio-brando',
      phase: 'PREPARATION',
    });
    state.turnNumber = 4; // DG 6 unlocked on Turn 4+
    const koichi = state.players.P1.bench[0]!;
    const polnareff = state.players.P1.bench[1]!;
    koichi.currentHp = 60;
    koichi.statuses.burn = { active: true, damagePerTurn: 10 };
    polnareff.currentHp = 100;

    state = mustDispatch(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: 0 });
    expect(state.pendingPrompt?.kind).toBe('CHOOSE_ALLY_BENCH_HEAL');

    state = mustDispatch(state, {
      type: 'RESPOND_PROMPT',
      playerId: 'P1',
      response: { kind: 'CHOOSE_ALLY_BENCH_HEAL', benchInstanceId: koichi.instanceId },
    });
    const healedKoichi = state.players.P1.bench.find((b) => b.instanceId === koichi.instanceId)!;
    expect(healedKoichi.currentHp).toBe(80);
    expect(healedKoichi.statuses.burn).toBeNull();
    expect(state.players.P1.giornoDreamUsed).toBe(true);
    // Turn ended after playing to bench and resolving prompt
    expect(state.activePlayerId).toBe('P2');

    // 2. Single-bench case -> auto-heals the only other bench ally by +20 HP immediately
    let singleState = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1BenchIds: ['char-koichi-hirose'],
      p1Hand: ['char-giorno-giovanna'],
      p2ActiveId: 'char-dio-brando',
      phase: 'PREPARATION',
    });
    singleState.turnNumber = 4;
    singleState.players.P1.bench[0]!.currentHp = 50;
    singleState = mustDispatch(singleState, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: 0 });
    expect(singleState.pendingPrompt).toBeNull();
    expect(singleState.players.P1.bench[0]!.currentHp).toBe(70);
    expect(singleState.players.P1.giornoDreamUsed).toBe(true);
  });

  it('resolves Bruno Bucciarati (130 HP, DG 5) Detección de Mentiras drawing 1 card when opponent draws extra cards while Bruno is Active', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-akira-otoishi',
      p1Hand: ['item-suministros-speedwagon'],
      p2ActiveId: 'char-bruno-bucciarati',
      phase: 'PREPARATION',
    });

    const p2HandBefore = state.players.P2.hand.length;
    const p2DeckBefore = state.players.P2.deck.length;

    // 1. P1 plays Suministros Speedwagon (draws 2) -> P2 (Bruno Active) draws 1!
    state = mustDispatch(state, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: 0 });
    expect(state.players.P2.hand.length).toBe(p2HandBefore + 1);
    expect(state.players.P2.deck.length).toBe(p2DeckBefore - 1);

    // 2. P1 uses Akira's Solo de Guitarra (draws 2) -> P2 (Bruno Active) draws 1 again!
    state = mustDispatch(state, {
      type: 'USE_PREP_ABILITY',
      playerId: 'P1',
      sourceInstanceId: state.players.P1.active!.instanceId,
    });
    expect(state.players.P2.hand.length).toBe(p2HandBefore + 2);

    // 3. When Bruno is on the bench instead of Active, he does NOT trigger on opponent extra draw
    let benchState = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1Hand: ['item-suministros-speedwagon'],
      p2ActiveId: 'char-dio-brando',
      p2BenchIds: ['char-bruno-bucciarati'],
      phase: 'PREPARATION',
    });
    const benchP2Hand = benchState.players.P2.hand.length;
    benchState = mustDispatch(benchState, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: 0 });
    expect(benchState.players.P2.hand.length).toBe(benchP2Hand);
  });

  it('resolves Gold Experience (7-Page Muda + Live Giver), Gold Experience Requiem (Flecha Réquiem + Return to Zero), and Sticky Fingers (Zipper Man 3-heads bounce)', () => {
    // 1. Gold Experience: Live Giver heals bench ally +20 HP; 7-Page Muda hits for 70 only on majority heads
    let geState = buildControlledBattleState({
      p1ActiveId: 'char-giorno-giovanna',
      p1ActiveStandId: 'stand-gold-experience',
      p1BenchIds: ['char-bruno-bucciarati'],
      p1ActiveEnergies: ['NATURE', 'NATURE', 'WATER'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'COMBAT',
    });
    geState.players.P1.bench[0]!.currentHp = 80;
    const afterLiveGiver = mustDispatch(geState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-live-giver',
    });
    expect(afterLiveGiver.players.P1.bench[0]!.currentHp).toBe(100);

    const allHeadsRng = {
      ...createSeededRng(1),
      flipCoin: () => 'HEADS' as const,
    };
    const allTailsRng = {
      ...createSeededRng(1),
      flipCoin: () => 'TAILS' as const,
    };
    const mudaHit = mustDispatch(
      geState,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-7-page-muda' },
      allHeadsRng,
    );
    expect(mudaHit.players.P2.active!.currentHp).toBe(90); // 160 - 70
    const mudaMiss = mustDispatch(
      geState,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-7-page-muda' },
      allTailsRng,
    );
    expect(mudaMiss.players.P2.active!.currentHp).toBe(160);

    // 2. Gold Experience Requiem evolution + Return to Zero (0 dmg utility reset) + Muda-Muda-Muda (60 dmg)
    let gerState = buildControlledBattleState({
      p1ActiveId: 'char-giorno-giovanna', // 130 HP, DG 6
      p1ActiveStandId: 'stand-gold-experience',
      p1ActiveEnergies: ['NATURE', 'COLORLESS', 'COLORLESS', 'COLORLESS', 'COLORLESS'],
      p1Hand: ['evo-gold-experience-requiem', 'item-flecha-requiem'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'PREPARATION',
    });
    gerState.players.P1.active!.currentHp = 40;
    gerState.players.P1.active!.statuses.burn = { active: true, damagePerTurn: 10 };
    gerState.players.P1.active!.statuses.bleedStacks = [{ turnsRemaining: 2, damagePerTurn: 10 }];
    gerState.players.P1.active!.attachedStand!.damageDebuff = 20;

    gerState = mustDispatch(gerState, { type: 'EVOLVE_CARD', playerId: 'P1', handIndex: 0 });
    gerState = mustDispatch(gerState, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    gerState = mustDispatch(gerState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-return-to-zero',
    });
    expect(gerState.players.P1.active!.currentHp).toBe(130);
    expect(gerState.players.P1.active!.statuses.burn).toBeNull();
    expect(gerState.players.P1.active!.statuses.bleedStacks).toHaveLength(0);
    expect(gerState.players.P1.active!.attachedStand!.damageDebuff).toBe(0);
    // Return to Zero is pure reset (0 damage)
    expect(gerState.players.P2.active!.currentHp).toBe(160);

    // Next P1 turn: Muda-Muda-Muda deals 60 damage cleanly (since debuff was cleared by Return to Zero!)
    gerState = mustDispatch(gerState, { type: 'END_TURN', playerId: 'P2' });
    gerState = mustDispatch(gerState, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    gerState = mustDispatch(gerState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-ger-muda-muda-muda',
    });
    expect(gerState.players.P2.active!.currentHp).toBe(100); // 160 - 60

    // 3. Sticky Fingers — Zipper Man with 3/3 heads bounces enemy user + Stand to hand and promotes bench
    let sfState = buildControlledBattleState({
      p1ActiveId: 'char-bruno-bucciarati',
      p1ActiveStandId: 'stand-sticky-fingers',
      p1ActiveEnergies: ['PSYCHIC', 'PSYCHIC', 'PSYCHIC'],
      p2ActiveId: 'char-dio',
      p2ActiveStandId: 'stand-the-world',
      p2BenchIds: ['char-hol-horse'],
      phase: 'COMBAT',
    });
    sfState = mustDispatch(
      sfState,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-zipper-man' },
      allHeadsRng,
    );
    expect(sfState.players.P2.hand).toContain('char-dio');
    expect(sfState.players.P2.hand).toContain('stand-the-world');
    expect(sfState.players.P2.active!.cardId).toBe('char-hol-horse');
  });

  it('resolves Mechero de Polpo drawing 1 extra card at end of turn only if the equipped character took no damage', () => {
    // 1. Equipped character takes NO damage -> draws 1 extra card at end of turn (+ opponent Bruno reacts!)
    let state = buildControlledBattleState({
      p1ActiveId: 'char-giorno-giovanna',
      p1Hand: ['item-mechero-de-polpo'],
      p2ActiveId: 'char-bruno-bucciarati',
      phase: 'PREPARATION',
    });
    const p1HandBefore = state.players.P1.hand.length;
    const p2HandBefore = state.players.P2.hand.length;

    state = mustDispatch(state, {
      type: 'PLAY_ITEM',
      playerId: 'P1',
      handIndex: 0,
      targetInstanceId: state.players.P1.active!.instanceId,
    });
    expect(state.players.P1.hand.length).toBe(p1HandBefore - 1);

    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P1' });
    // P1 drew 1 extra card from Mechero de Polpo at end of P1's turn
    expect(state.players.P1.hand.length).toBe(p1HandBefore);
    // P2 drew 1 from Bruno's Detección de Mentiras + 1 mandatory start-of-turn draw!
    expect(state.players.P2.hand.length).toBe(p2HandBefore + 2);

    // 2. If the equipped character DID take damage this turn -> Mechero de Polpo does NOT draw
    let damagedState = buildControlledBattleState({
      p1ActiveId: 'char-giorno-giovanna',
      p1ActiveItems: ['item-mechero-de-polpo'],
      p2ActiveId: 'char-dio-brando',
      phase: 'PREPARATION',
    });
    damagedState.players.P1.active!.tookDamageThisTurn = true;
    const p1HandDamaged = damagedState.players.P1.hand.length;
    damagedState = mustDispatch(damagedState, { type: 'END_TURN', playerId: 'P1' });
    expect(damagedState.players.P1.hand.length).toBe(p1HandDamaged);
  });

  it('resolves Ataúd de DIO stunning enemy active and locking their retreat to bench until end of their turn', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-dio-brando',
      p1Hand: ['item-ataud-de-dio'],
      p2ActiveId: 'char-jonathan-joestar',
      p2BenchIds: ['char-will-a-zeppeli'],
      phase: 'PREPARATION',
    });

    state = mustDispatch(state, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: 0 });
    expect(state.players.P2.active!.statuses.stunned).toBe(true);
    expect(state.players.P2.active!.retreatLockedUntilEndOfTurn).toBe(true);
    expect(state.players.P1.discard).toContain('item-ataud-de-dio');

    // End P1 turn -> now P2's turn: P2 cannot swap active to bench!
    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P1' });
    expect(state.activePlayerId).toBe('P2');
    const blockedRetreat = dispatchAction(state, {
      type: 'SWAP_ACTIVE_WITH_BENCH',
      playerId: 'P2',
      benchInstanceId: state.players.P2.bench[0]!.instanceId,
    });
    expect(blockedRetreat.ok).toBe(false);
    expect(blockedRetreat.error).toContain('Ataúd de DIO');

    // After P2 ends their turn, both stun and retreat lock clear
    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P2' });
    expect(state.players.P2.active!.statuses.stunned).toBe(false);
    expect(state.players.P2.active!.retreatLockedUntilEndOfTurn).toBe(false);
  });

  it('resolves Guido Mista (Tetrafobia +10 permanent Stand dmg vs explicit 4) and Sex Pistols (Recarga Rápida 3x10 -> 6x10 next turn)', () => {
    // 1. Against Dio Brando (140 HP -> contains explicit "4"!), Mista's Sex Pistols gets permanent +10 dmg!
    let state = buildControlledBattleState({
      p1ActiveId: 'char-guido-mista',
      p1ActiveStandId: 'stand-sex-pistols',
      p1ActiveEnergies: ['COLORLESS', 'COLORLESS'],
      p2ActiveId: 'char-dio-brando', // 140 HP (has "4"!)
      phase: 'COMBAT',
    });

    // Use Recarga Rápida on Turn 2 -> triggers Tetrafobia (+10 permanent) and arms 6x10 for next turn!
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-recarga-rapida',
    });
    expect(state.players.P1.active!.tetraphobiaTriggered).toBe(true);
    expect(state.players.P1.active!.attachedStand!.permanentDamageBonus).toBe(10);
    expect(state.players.P1.active!.attachedStand!.rapidReloadTurnsRemaining).toBe(1);

    // P2 ends turn -> P1's next turn: Control de las Balas deals 60 (Recarga Rápida) + 10 (Tetrafobia) = 70!
    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P2' });
    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-control-de-las-balas',
    });
    expect(state.players.P2.active!.currentHp).toBe(70); // 140 - 70
    expect(state.players.P1.active!.attachedStand!.rapidReloadTurnsRemaining).toBe(0);

    // 2. Against a rival with NO explicit "4" in any stat (e.g. DIO: 160 HP, DG 6, no attacks), Tetrafobia does NOT trigger
    let noFourState = buildControlledBattleState({
      p1ActiveId: 'char-guido-mista',
      p1ActiveStandId: 'stand-sex-pistols',
      p1ActiveEnergies: ['COLORLESS', 'COLORLESS'],
      p2ActiveId: 'char-dio', // 160 HP, DG 6, 0 attacks -> no "4"!
      phase: 'COMBAT',
    });
    noFourState = mustDispatch(noFourState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-control-de-las-balas',
    });
    expect(noFourState.players.P1.active!.tetraphobiaTriggered).toBeFalsy();
    expect(noFourState.players.P2.active!.currentHp).toBe(130); // 160 - 30 (no +10 bonus)
  });

  it('resolves Erina Pendleton (Amor Flagrante +10 HP & +10 next attack to Jonathan on entry, and Tratamiento bench heal +10 HP)', () => {
    // 1. Erina on bench when Jonathan enters play -> Jonathan gets 140 HP and +10 on his next attack!
    let state = buildControlledBattleState({
      p1ActiveId: 'char-robert-e-o-speedwagon',
      p1BenchIds: ['char-erina-pendleton'],
      p1Hand: ['char-jonathan-joestar'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'PREPARATION',
    });

    state = mustDispatch(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: 0 });
    const jonathan = state.players.P1.bench.find((b) => b.cardId === 'char-jonathan-joestar')!;
    expect(jonathan.currentHp).toBe(140); // 130 + 10
    expect(jonathan.erinaHpBonus).toBe(10);
    expect(jonathan.erinaNextAttackBonus).toBe(true);

    // Move Jonathan to active with 1 Colorless energy -> Zoom Punch deals 20 + 10 = 30 once!
    state.activePlayerId = 'P1';
    state.phase = 'COMBAT';
    state.players.P1.active = jonathan;
    jonathan.attachedEnergies = ['COLORLESS'];
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-zoom-punch',
    });
    expect(state.players.P2.active!.currentHp).toBe(130); // 160 - 30
    expect(state.players.P1.active!.erinaNextAttackBonus).toBe(false);

    // 2. Erina's Tratamiento heals a bench ally by +10 HP
    let healState = buildControlledBattleState({
      p1ActiveId: 'char-erina-pendleton',
      p1ActiveEnergies: ['COLORLESS'],
      p1BenchIds: ['char-jonathan-joestar'],
      p2ActiveId: 'char-dio-brando',
      phase: 'COMBAT',
    });
    healState.players.P1.bench[0]!.currentHp = 80;
    healState = mustDispatch(healState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-tratamiento',
    });
    expect(healState.players.P1.bench[0]!.currentHp).toBe(90);
  });

  it('resolves Tonpetty (Precognición peeking top 3 cards without mutating decks, and Mano a Mano Curtido 60 dmg + Zeppeli Hamon +20)', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1Hand: ['char-tonpetty'],
      p1Deck: ['item-pluck', 'energy-electric', 'char-erina-pendleton', 'energy-colorless'],
      p2ActiveId: 'char-dio', // 160 HP
      p2Deck: ['item-mascara-de-piedra', 'energy-water', 'char-dio-brando', 'energy-psychic'],
      phase: 'PREPARATION',
    });

    state = mustDispatch(state, { type: 'PLAY_TO_BENCH', playerId: 'P1', handIndex: 0 });
    expect(state.pendingPrompt?.kind).toBe('PEEK_TOP_DECK');
    if (state.pendingPrompt?.kind === 'PEEK_TOP_DECK') {
      expect(state.pendingPrompt.ownTopCards).toEqual([
        'item-pluck',
        'energy-electric',
        'char-erina-pendleton',
      ]);
      expect(state.pendingPrompt.opponentTopCards).toEqual([
        'item-mascara-de-piedra',
        'energy-water',
        'char-dio-brando',
      ]);
    }

    state = mustDispatch(state, {
      type: 'RESPOND_PROMPT',
      playerId: 'P1',
      response: { kind: 'PEEK_TOP_DECK', target: 'OPPONENT' },
    });
    expect(state.pendingPrompt).toBeNull();
    // P1 deck untouched; P2 drew 1 card on start of P2's turn after P1's PLAY_TO_BENCH ended P1's turn
    expect(state.players.P1.deck).toEqual([
      'item-pluck',
      'energy-electric',
      'char-erina-pendleton',
      'energy-colorless',
    ]);

    // Tonpetty's Mano a Mano Curtido (60) + Will A. Zeppeli on bench (+20 Hamon) = 80 dmg!
    let atkState = buildControlledBattleState({
      p1ActiveId: 'char-tonpetty',
      p1BenchIds: ['char-will-a-zeppeli'],
      p1ActiveEnergies: ['ELECTRIC', 'COLORLESS'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'COMBAT',
    });
    atkState = mustDispatch(atkState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-mano-a-mano-curtido',
    });
    expect(atkState.players.P2.active!.currentHp).toBe(80); // 160 - 80
  });

  it('resolves Dire (Imagen Residual +10 next attack after moving to Active with >1 energy, and Thunder Cross Split Attack 60 + 20 on heads)', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-joseph-joestar', // Nigerundayo swaps to Dire without ending P1 turn!
      p1BenchIds: ['char-dire'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'PREPARATION',
    });
    state.players.P1.bench[0]!.attachedEnergies = ['ELECTRIC', 'ELECTRIC'];

    state = mustDispatch(state, {
      type: 'SWAP_ACTIVE_WITH_BENCH',
      playerId: 'P1',
      benchInstanceId: state.players.P1.bench[0]!.instanceId,
    });
    expect(state.players.P1.active!.cardId).toBe('char-dire');
    expect(state.players.P1.active!.direAfterimageBonus).toBe(true);

    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    const headsRng = { ...createSeededRng(1), flipCoin: () => 'HEADS' as const };
    state = mustDispatch(
      state,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-thunder-cross-split-attack' },
      headsRng,
    );
    // 60 base + 20 heads + 10 Imagen Residual = 90 dmg -> 160 - 90 = 70 HP!
    expect(state.players.P2.active!.currentHp).toBe(70);
    expect(state.players.P1.active!.direAfterimageBonus).toBe(false);
  });

  it('resolves Straizo (Estudioso del Hamon draws +1 extra card each turn when Straizo is on bench and Tonpetty or Dire is Active)', () => {
    // 1. P2 has Dire active + Straizo on bench -> when P1 ends turn, P2 draws 1 mandatory + 1 extra = 2 cards!
    let state = buildControlledBattleState({
      p1ActiveId: 'char-dio-brando',
      p2ActiveId: 'char-dire',
      p2BenchIds: ['char-straizo'],
      phase: 'PREPARATION',
    });
    const p2HandBefore = state.players.P2.hand.length;
    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P1' });
    expect(state.players.P2.hand.length).toBe(p2HandBefore + 2);

    // 2. When P2 has Jonathan active instead of Tonpetty/Dire, Straizo does NOT grant the extra draw
    let noSynergyState = buildControlledBattleState({
      p1ActiveId: 'char-dio-brando',
      p2ActiveId: 'char-jonathan-joestar',
      p2BenchIds: ['char-straizo'],
      phase: 'PREPARATION',
    });
    const noSynHandBefore = noSynergyState.players.P2.hand.length;
    noSynergyState = mustDispatch(noSynergyState, { type: 'END_TURN', playerId: 'P1' });
    expect(noSynergyState.players.P2.hand.length).toBe(noSynHandBefore + 1);
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

  it('resolves Bruford (120 HP, Colorless): Lealtad de Caballero doubles (P)luck bonus (+20) and Danse Macab-Hair inflicts Bleed on TAILS', () => {
    const baseState = buildControlledBattleState({
      p1ActiveId: 'char-bruford',
      p1ActiveItems: ['item-pluck'],
      p1ActiveEnergies: ['COLORLESS', 'COLORLESS'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'COMBAT',
    });

    // Luck (30) + (P)luck boosted by Lealtad de Caballero (+20 instead of +10) = 50 dmg -> 110 HP
    const afterLuck = mustDispatch(baseState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-luck',
    });
    expect(afterLuck.players.P2.active!.currentHp).toBe(110);

    // Danse Macab-Hair (60 + 20 = 80 dmg): TAILS inflicts Bleed!
    const tailsRng = { ...createSeededRng(1), flipCoin: () => 'TAILS' as const };
    const afterDanseTails = mustDispatch(
      baseState,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-danse-macab-hair' },
      tailsRng,
    );
    expect(afterDanseTails.players.P2.active!.currentHp).toBe(80);
    expect(afterDanseTails.players.P2.active!.statuses.bleedStacks).toHaveLength(1);

    // HEADS deals 80 dmg without Bleed
    const headsRng = { ...createSeededRng(1), flipCoin: () => 'HEADS' as const };
    const afterDanseHeads = mustDispatch(
      baseState,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-danse-macab-hair' },
      headsRng,
    );
    expect(afterDanseHeads.players.P2.active!.currentHp).toBe(80);
    expect(afterDanseHeads.players.P2.active!.statuses.bleedStacks).toHaveLength(0);
  });

  it('resolves Tarkus (150 HP, Colorless): Fuerza Sobrehumana gains permanent +10 dmg on end-of-turn HEADS while Active', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-tarkus',
      p1ActiveEnergies: ['COLORLESS', 'COLORLESS'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'PREPARATION',
    });

    // End P1 turn with HEADS -> Tarkus gains +10 permanent damage!
    const headsRng = { ...createSeededRng(1), flipCoin: () => 'HEADS' as const };
    const tailsRng = { ...createSeededRng(1), flipCoin: () => 'TAILS' as const };

    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P1' }, headsRng);
    expect(state.players.P1.active!.tarkusDamageBonus).toBe(10);

    // P2 ends turn -> back to P1 -> Hell Heaven Snake Kill deals 40 + 10 = 50 dmg (160 -> 110)
    // and at end of P1 turn with TAILS -> bonus stays 10!
    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P2' }, tailsRng);
    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' }, tailsRng);
    state = mustDispatch(
      state,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-hell-heaven-snake-kill' },
      tailsRng,
    );
    expect(state.players.P2.active!.currentHp).toBe(110);
    expect(state.players.P1.active!.tarkusDamageBonus).toBe(10);
  });

  it('resolves Muerte de Danny (+20 extra damage on next active Character or Stand attack, consumed once)', () => {
    // 1. Character attack (Jonathan Zoom Punch 20 + 20 = 40 dmg)
    let state = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1ActiveEnergies: ['COLORLESS'],
      p1Hand: ['item-muerte-de-danny'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'PREPARATION',
    });

    state = mustDispatch(state, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: 0 });
    expect(state.players.P1.pendingNextAttackBonus).toBe(20);
    expect(state.players.P1.discard).toContain('item-muerte-de-danny');

    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-zoom-punch',
    });
    expect(state.players.P2.active!.currentHp).toBe(120); // 160 - 40
    expect(state.players.P1.pendingNextAttackBonus).toBe(0);

    // Next attack has NO bonus (120 - 20 = 100)
    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P2' });
    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-zoom-punch',
    });
    expect(state.players.P2.active!.currentHp).toBe(100);

    // 2. Stand attack (Star Platinum Ora Ora 60 + 20 = 80)
    let standState = buildControlledBattleState({
      p1ActiveId: 'char-jotaro-kujo',
      p1ActiveStandId: 'stand-star-platinum',
      p1ActiveEnergies: ['PSYCHIC', 'PSYCHIC', 'PSYCHIC'],
      p1Hand: ['item-muerte-de-danny'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'PREPARATION',
    });
    standState = mustDispatch(standState, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: 0 });
    standState = mustDispatch(standState, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    standState = mustDispatch(standState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-ora-ora',
    });
    expect(standState.players.P2.active!.currentHp).toBe(80); // 160 - (60 + 20)
    expect(standState.players.P1.pendingNextAttackBonus).toBe(0);
  });

  it('resolves Wang Chan (90 HP): Lacayo de DIO (+20 HP to bench DIO on KO), Falsa Medicina (coin ±20 bench), and Garras Metálicas (20 dmg + Bleed on TAILS)', () => {
    const headsRng = { ...createSeededRng(1), flipCoin: () => 'HEADS' as const };
    const tailsRng = { ...createSeededRng(1), flipCoin: () => 'TAILS' as const };

    // 1. Falsa Medicina (0 energy): HEADS heals bench ally +20, TAILS damages bench ally -20
    let medState = buildControlledBattleState({
      p1ActiveId: 'char-wang-chan',
      p1BenchIds: ['char-bruford'],
      p2ActiveId: 'char-jonathan-joestar',
      phase: 'COMBAT',
    });
    medState.players.P1.bench[0]!.currentHp = 80; // 80/120

    const afterMedHeads = mustDispatch(
      medState,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-falsa-medicina' },
      headsRng,
    );
    expect(afterMedHeads.players.P1.bench[0]!.currentHp).toBe(100);

    const afterMedTails = mustDispatch(
      medState,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-falsa-medicina' },
      tailsRng,
    );
    expect(afterMedTails.players.P1.bench[0]!.currentHp).toBe(60);

    // 2. Garras Metálicas (1 METAL, 20 dmg): TAILS inflicts Bleed
    let clawState = buildControlledBattleState({
      p1ActiveId: 'char-wang-chan',
      p1ActiveEnergies: ['COLORLESS'],
      p1BenchIds: ['char-dio-brando'],
      p2ActiveId: 'char-jonathan-joestar', // 130 HP
      phase: 'COMBAT',
    });
    clawState = mustDispatch(
      clawState,
      { type: 'USE_ATTACK', playerId: 'P1', attackId: 'atk-garras-metalicas' },
      tailsRng,
    );
    expect(clawState.players.P2.active!.currentHp).toBe(110); // 130 - 20
    expect(clawState.players.P2.active!.statuses.bleedStacks).toHaveLength(1);

    // 3. Lacayo de DIO: when Wang Chan is KO'd with Dio Brando on bench, Dio gains +20 HP (140 -> 160)
    let koState = buildControlledBattleState({
      p1ActiveId: 'char-dio-brando',
      p1ActiveEnergies: ['ELECTRIC', 'ELECTRIC'],
      p2ActiveId: 'char-wang-chan', // 90 HP
      p2BenchIds: ['char-dio-brando'], // 140 HP
      phase: 'COMBAT',
    });
    koState = mustDispatch(koState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-space-ripper-stingy-eyes', // guaranteed 90 dmg -> KOs Wang Chan!
    });
    // Dio Brando is auto-promoted from bench (only bench char) with +20 HP bonus!
    expect(koState.players.P2.active!.cardId).toBe('char-dio-brando');
    expect(koState.players.P2.active!.wangChanHpBonus).toBe(20);
    expect(koState.players.P2.active!.currentHp).toBe(160);
  });

  it('resolves ¡Estilo de combate de Ogre Street! (standalone search Conventional Fighter / fizzles if none; equipped +20 dmg to Conventional Fighter only)', () => {
    // 1. Standalone with a Conventional Fighter in deck -> searches and adds to hand
    let searchState = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1Hand: ['item-estilo-de-combate-ogre-street'],
      p1Deck: ['energy-electric', 'char-tarkus', 'char-will-a-zeppeli'],
      p2ActiveId: 'char-dio',
      phase: 'PREPARATION',
    });
    searchState = mustDispatch(searchState, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: 0 });
    expect(searchState.pendingPrompt?.kind).toBe('SEARCH_DECK_CARDS');
    if (searchState.pendingPrompt?.kind === 'SEARCH_DECK_CARDS') {
      expect(searchState.pendingPrompt.filter).toBe('CONVENTIONAL_FIGHTER');
    }
    const tarkusIdx = searchState.players.P1.deck.indexOf('char-tarkus');
    searchState = mustDispatch(searchState, {
      type: 'RESPOND_PROMPT',
      playerId: 'P1',
      response: { kind: 'SEARCH_DECK_CARDS', deckIndices: [tarkusIdx] },
    });
    expect(searchState.players.P1.hand).toContain('char-tarkus');
    expect(searchState.players.P1.discard).toContain('item-estilo-de-combate-ogre-street');

    // 2. Standalone with NO Conventional Fighter in deck -> fizzles cleanly ("no hace nada")
    let emptySearchState = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1Hand: ['item-estilo-de-combate-ogre-street'],
      p1Deck: ['energy-electric', 'char-will-a-zeppeli'],
      p2ActiveId: 'char-dio',
      phase: 'PREPARATION',
    });
    emptySearchState = mustDispatch(emptySearchState, {
      type: 'PLAY_ITEM',
      playerId: 'P1',
      handIndex: 0,
    });
    expect(emptySearchState.pendingPrompt).toBeNull();
    expect(emptySearchState.players.P1.discard).toContain('item-estilo-de-combate-ogre-street');

    // 3. Equipped onto a Conventional Fighter (Tarkus) -> +20 permanent damage (40 + 20 = 60 -> 160 - 60 = 100)
    let equipConvState = buildControlledBattleState({
      p1ActiveId: 'char-tarkus',
      p1ActiveEnergies: ['COLORLESS', 'COLORLESS'],
      p1Hand: ['item-estilo-de-combate-ogre-street'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'PREPARATION',
    });
    equipConvState = mustDispatch(equipConvState, {
      type: 'PLAY_ITEM',
      playerId: 'P1',
      handIndex: 0,
      targetInstanceId: equipConvState.players.P1.active!.instanceId,
    });
    equipConvState = mustDispatch(equipConvState, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    equipConvState = mustDispatch(equipConvState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-hell-heaven-snake-kill',
    });
    expect(equipConvState.players.P2.active!.currentHp).toBe(100);

    // 4. Equipped onto a non-Conventional Fighter (Jonathan, HAMON_USER) -> +0 bonus (Zoom Punch = 20 -> 160 - 20 = 140)
    let equipNonConvState = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1ActiveEnergies: ['COLORLESS'],
      p1Hand: ['item-estilo-de-combate-ogre-street'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'PREPARATION',
    });
    equipNonConvState = mustDispatch(equipNonConvState, {
      type: 'PLAY_ITEM',
      playerId: 'P1',
      handIndex: 0,
      targetInstanceId: equipNonConvState.players.P1.active!.instanceId,
    });
    equipNonConvState = mustDispatch(equipNonConvState, {
      type: 'ENTER_COMBAT_PHASE',
      playerId: 'P1',
    });
    equipNonConvState = mustDispatch(equipNonConvState, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-zoom-punch',
    });
    expect(equipNonConvState.players.P2.active!.currentHp).toBe(140);
  });

  it('resolves Straizo (Vampiro) (130 HP, HAMON_USER + VAMPIRE): Clackers synergy (+20) and Regeneración Vampírica (+10 HP at end of turn if undamaged)', () => {
    let state = buildControlledBattleState({
      p1ActiveId: 'char-straizo-vampiro',
      p1ActiveEnergies: ['COLORLESS', 'ELECTRIC', 'ELECTRIC', 'ELECTRIC'],
      p1ActiveItems: ['item-clackers'], // +20 to HAMON_USER!
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'COMBAT',
    });
    state.players.P1.active!.currentHp = 100;

    // Satiporoja Beetle Cloth: 30 + 20 (Clackers Hamon bonus) = 50 -> 160 - 50 = 110
    // End of turn undamaged -> Vampire Regen +10 HP (100 -> 110)!
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-satiporoja-beetle-cloth',
    });
    expect(state.players.P2.active!.currentHp).toBe(110);
    expect(state.players.P1.active!.currentHp).toBe(110);

    // Next turn: Space Ripper Stingy Eyes: 80 + 20 (Clackers) = 100 -> 110 - 100 = 10 HP
    state = mustDispatch(state, { type: 'END_TURN', playerId: 'P2' });
    state = mustDispatch(state, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    state = mustDispatch(state, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-straizo-space-ripper-stingy-eyes',
    });
    expect(state.players.P2.active!.currentHp).toBe(10);
  });

  it('resolves ¡Entrenamiento en la isla Air Supplena! (standalone search Hamon User / fizzles if none; equipped +10 dmg to Hamon User only)', () => {
    // 1. Standalone with a Hamon User in deck -> searches and adds to hand
    let searchState = buildControlledBattleState({
      p1ActiveId: 'char-joseph-joestar',
      p1Hand: ['item-entrenamiento-air-supplena'],
      p1Deck: ['energy-electric', 'char-caesar-zeppeli', 'char-tarkus'],
      p2ActiveId: 'char-dio',
      phase: 'PREPARATION',
    });
    searchState = mustDispatch(searchState, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: 0 });
    expect(searchState.pendingPrompt?.kind).toBe('SEARCH_DECK_CARDS');
    if (searchState.pendingPrompt?.kind === 'SEARCH_DECK_CARDS') {
      expect(searchState.pendingPrompt.filter).toBe('HAMON_USER');
    }
    const caesarIdx = searchState.players.P1.deck.indexOf('char-caesar-zeppeli');
    searchState = mustDispatch(searchState, {
      type: 'RESPOND_PROMPT',
      playerId: 'P1',
      response: { kind: 'SEARCH_DECK_CARDS', deckIndices: [caesarIdx] },
    });
    expect(searchState.players.P1.hand).toContain('char-caesar-zeppeli');
    expect(searchState.players.P1.discard).toContain('item-entrenamiento-air-supplena');

    // 2. Standalone with NO Hamon User in deck -> fizzles cleanly ("no hace nada")
    let emptyState = buildControlledBattleState({
      p1ActiveId: 'char-tarkus',
      p1Hand: ['item-entrenamiento-air-supplena'],
      p1Deck: ['energy-colorless', 'char-bruford'],
      p2ActiveId: 'char-dio',
      phase: 'PREPARATION',
    });
    emptyState = mustDispatch(emptyState, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: 0 });
    expect(emptyState.pendingPrompt).toBeNull();
    expect(emptyState.players.P1.discard).toContain('item-entrenamiento-air-supplena');

    // 3. Equipped onto a Hamon User (Jonathan) -> +10 permanent dmg (Zoom Punch 20 + 10 = 30 -> 160 - 30 = 130)
    let equipHamon = buildControlledBattleState({
      p1ActiveId: 'char-jonathan-joestar',
      p1ActiveEnergies: ['COLORLESS'],
      p1Hand: ['item-entrenamiento-air-supplena'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'PREPARATION',
    });
    equipHamon = mustDispatch(equipHamon, {
      type: 'PLAY_ITEM',
      playerId: 'P1',
      handIndex: 0,
      targetInstanceId: equipHamon.players.P1.active!.instanceId,
    });
    equipHamon = mustDispatch(equipHamon, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    equipHamon = mustDispatch(equipHamon, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-zoom-punch',
    });
    expect(equipHamon.players.P2.active!.currentHp).toBe(130);

    // 4. Equipped onto a non-Hamon character (Tarkus) -> +0 bonus (40 -> 160 - 40 = 120)
    let equipNonHamon = buildControlledBattleState({
      p1ActiveId: 'char-tarkus',
      p1ActiveEnergies: ['COLORLESS', 'COLORLESS'],
      p1Hand: ['item-entrenamiento-air-supplena'],
      p2ActiveId: 'char-dio', // 160 HP
      phase: 'PREPARATION',
    });
    equipNonHamon = mustDispatch(equipNonHamon, {
      type: 'PLAY_ITEM',
      playerId: 'P1',
      handIndex: 0,
      targetInstanceId: equipNonHamon.players.P1.active!.instanceId,
    });
    equipNonHamon = mustDispatch(equipNonHamon, { type: 'ENTER_COMBAT_PHASE', playerId: 'P1' });
    equipNonHamon = mustDispatch(equipNonHamon, {
      type: 'USE_ATTACK',
      playerId: 'P1',
      attackId: 'atk-hell-heaven-snake-kill',
    });
    expect(equipNonHamon.players.P2.active!.currentHp).toBe(120);
  });

  it('resolves Carterista de Nueva York (discards an enemy equipped item on active or bench and draws 1 card)', () => {
    // 1. Fails if opponent has no equipped items
    const noItemsState = buildControlledBattleState({
      p1ActiveId: 'char-joseph-joestar',
      p1Hand: ['item-carterista-de-nueva-york'],
      p2ActiveId: 'char-kars',
      phase: 'PREPARATION',
    });
    const blocked = dispatchAction(noItemsState, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: 0 });
    expect(blocked.ok).toBe(false);

    // 2. Auto-discards single enemy equipped item & draws 1 card
    let singleState = buildControlledBattleState({
      p1ActiveId: 'char-joseph-joestar',
      p1Hand: ['item-carterista-de-nueva-york'],
      p1Deck: ['energy-electric', 'energy-colorless'],
      p2ActiveId: 'char-kars',
      p2ActiveItems: ['item-mascara-de-piedra'],
      phase: 'PREPARATION',
    });
    singleState = mustDispatch(singleState, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: 0 });
    expect(singleState.pendingPrompt).toBeNull();
    expect(singleState.players.P2.active!.attachedItems).toHaveLength(0);
    expect(singleState.players.P2.discard).toContain('item-mascara-de-piedra');
    expect(singleState.players.P1.hand).toContain('energy-electric');
    expect(singleState.players.P1.discard).toContain('item-carterista-de-nueva-york');

    // 3. Opens CHOOSE_ENEMY_EQUIPPED_ITEM when opponent has 2+ equipped items across active/bench
    let multiState = buildControlledBattleState({
      p1ActiveId: 'char-joseph-joestar',
      p1Hand: ['item-carterista-de-nueva-york'],
      p1Deck: ['char-caesar-zeppeli', 'energy-electric'],
      p2ActiveId: 'char-kars',
      p2ActiveItems: ['item-mascara-de-piedra', 'item-piedra-roja-de-aja'],
      phase: 'PREPARATION',
    });
    multiState = mustDispatch(multiState, { type: 'PLAY_ITEM', playerId: 'P1', handIndex: 0 });
    expect(multiState.pendingPrompt?.kind).toBe('CHOOSE_ENEMY_EQUIPPED_ITEM');
    const ajaItem = multiState.players.P2.active!.attachedItems.find(
      (it) => it.cardId === 'item-piedra-roja-de-aja',
    )!;
    multiState = mustDispatch(multiState, {
      type: 'RESPOND_PROMPT',
      playerId: 'P1',
      response: {
        kind: 'CHOOSE_ENEMY_EQUIPPED_ITEM',
        characterInstanceId: multiState.players.P2.active!.instanceId,
        itemInstanceId: ajaItem.instanceId,
      },
    });
    expect(multiState.players.P2.active!.attachedItems).toHaveLength(1);
    expect(multiState.players.P2.active!.attachedItems[0]!.cardId).toBe('item-mascara-de-piedra');
    expect(multiState.players.P2.discard).toContain('item-piedra-roja-de-aja');
    expect(multiState.players.P1.hand).toContain('char-caesar-zeppeli');
  });
});
