import { describe, expect, it } from 'vitest';
import {
  extractCardPopups,
  extractThreeVfxCue,
} from '../../ui/vfx/vfxClassifier';
import type { CombatEvent } from '../../engine/types/events';

describe('Combat Clarity & Three.js VFX Classifier', () => {
  it('maps damage, bleed, burn, heal, and status events to exact per-card floating popups', () => {
    const events: CombatEvent[] = [
      {
        id: 'e1',
        turn: 2,
        type: 'DAMAGE_DEALT',
        targetPlayerId: 'P2',
        targetInstanceId: 'chr-2',
        targetCardId: 'char-dio',
        amount: 60,
        source: 'ATTACK',
        message: 'DIO recibe 60 de daño',
      },
      {
        id: 'e2',
        turn: 2,
        type: 'STATUS_APPLIED',
        targetPlayerId: 'P2',
        targetInstanceId: 'chr-2',
        status: 'BURN',
        message: 'DIO pasa a estar Quemado',
      },
      {
        id: 'e3',
        turn: 3,
        type: 'DAMAGE_DEALT',
        targetPlayerId: 'P1',
        targetInstanceId: 'chr-1',
        targetCardId: 'char-jotaro-kujo',
        amount: 10,
        source: 'BLEED',
        message: 'Jotaro recibe 10 por Sangrado',
      },
      {
        id: 'e4',
        turn: 3,
        type: 'HEALED',
        targetPlayerId: 'P1',
        targetInstanceId: 'chr-1',
        amount: 30,
        message: 'Jotaro recupera 30 HP',
      },
    ];

    const popups = extractCardPopups(events);
    expect(popups).toHaveLength(4);
    expect(popups[0]).toMatchObject({ targetInstanceId: 'chr-2', kind: 'DAMAGE', label: '-60' });
    expect(popups[1]).toMatchObject({ targetInstanceId: 'chr-2', kind: 'STATUS', label: '¡QUEMADO!' });
    expect(popups[2]).toMatchObject({
      targetInstanceId: 'chr-1',
      kind: 'BLEED',
      label: '-10',
      sublabel: 'SANGRADO',
    });
    expect(popups[3]).toMatchObject({ targetInstanceId: 'chr-1', kind: 'HEAL', label: '+30 HP' });
  });

  it('classifies JoJo attacks, Za Warudo, Evolutions, and KOs into distinct Three.js 3D VFX cues', () => {
    const zaWarudoCue = extractThreeVfxCue(
      [
        {
          id: 'z1',
          turn: 4,
          type: 'ATTACK_DECLARED',
          playerId: 'P1',
          attackName: 'Star Platinum: Za Warudo',
          message: 'Za Warudo!',
        },
      ],
      'P1',
    );
    expect(zaWarudoCue?.vfxType).toBe('TIME_STOP');

    const fireCue = extractThreeVfxCue(
      [
        {
          id: 'f1',
          turn: 3,
          type: 'ATTACK_DECLARED',
          playerId: 'P2',
          attackName: 'Cross Fire Hurricane',
          message: 'Cross Fire Hurricane!',
        },
      ],
      'P1',
    );
    expect(fireCue).toMatchObject({ vfxType: 'FIRE_EXPLOSION', direction: 'DOWN' });

    const waterCue = extractThreeVfxCue(
      [
        {
          id: 'w1',
          turn: 3,
          type: 'ATTACK_DECLARED',
          playerId: 'P1',
          attackName: 'Garra de Agua',
          message: 'Garra de Agua!',
        },
      ],
      'P1',
    );
    expect(waterCue).toMatchObject({ vfxType: 'WATER_ICE', direction: 'UP' });

    const evoCue = extractThreeVfxCue(
      [
        {
          id: 'ev1',
          turn: 5,
          type: 'CARD_EVOLVED',
          playerId: 'P1',
          evolutionCardId: 'evo-kars-ultimate',
          message: 'Evolución!',
        },
      ],
      'P1',
    );
    expect(evoCue?.vfxType).toBe('EVOLUTION');
  });
});
