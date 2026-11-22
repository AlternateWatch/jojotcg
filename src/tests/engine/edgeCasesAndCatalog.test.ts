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
  it('verifies all 69 official PNG cards, all 12 official Item PNG cards, and all 6 JoJo pattern files exist on disk', () => {
    const projectRoot = path.resolve(process.cwd());
    expect(OFFICIAL_CARD_IMAGE_IDS.size).toBe(69);
    expect(OFFICIAL_ITEM_IMAGE_IDS.size).toBe(12);

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
});
