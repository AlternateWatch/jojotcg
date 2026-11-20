import { getCardById } from '../../data/cardRegistry';
import type { CombatEvent } from '../../engine/types/events';
import type { GameState, PlayerId } from '../../engine/types/state';

export type ThreeVfxType =
  | 'STAND_RUSH'
  | 'FIRE_EXPLOSION'
  | 'HAMON_ELECTRIC'
  | 'WATER_ICE'
  | 'TIME_STOP'
  | 'VOID_PSYCHIC'
  | 'HEAL_RESTORE'
  | 'EVOLUTION'
  | 'KO_SHATTER';

export interface IThreeVfxCue {
  id: string;
  vfxType: ThreeVfxType;
  /** Direction of projectile/impact relative to viewer: UP = player->enemy, DOWN = enemy->player, CENTER = arena-wide */
  direction: 'UP' | 'DOWN' | 'CENTER';
  intensity: number;
  sourcePlayerId?: PlayerId;
  targetPlayerId?: PlayerId;
  targetInstanceId?: string;
}

export interface ICardFloatingPopup {
  id: string;
  targetInstanceId: string;
  kind: 'DAMAGE' | 'BLEED' | 'BURN' | 'HEAL' | 'STATUS' | 'SHIELD' | 'BUFF';
  label: string;
  sublabel?: string;
}

export interface ITurnSplash {
  id: string;
  playerId: PlayerId;
  playerName: string;
  turnNumber: number;
}

export interface IActionTickerEntry {
  id: string;
  turn: number;
  actorTag: string;
  tone: 'ATTACK' | 'DAMAGE' | 'HEAL' | 'STATUS' | 'EVO' | 'SETUP' | 'KO' | 'INFO';
  text: string;
}

const FIRE_KEYWORDS = ['fire', 'flame', 'bomba', 'bites the dust', 'blaze', 'hamon del sol', 'sheer heart'];
const WATER_KEYWORDS = ['agua', 'hielo', 'bubble', 'freezing', 'salpicadura', 'temperaturas'];
const HAMON_KEYWORDS = ['hamon', 'overdrive', 'chilli', 'muffler', 'electric', 'light', 'luz', 'ultraviolet'];
const VOID_KEYWORDS = ['vacío', 'vacio', 'hando', 'requiem', 'almas', 'manipulación', 'safety', 'pégate', 'decapit'];

function classifyAttackVfx(attackName: string): ThreeVfxType {
  const lower = attackName.toLowerCase();
  if (lower.includes('za warudo')) return 'TIME_STOP';
  if (FIRE_KEYWORDS.some((k) => lower.includes(k))) return 'FIRE_EXPLOSION';
  if (WATER_KEYWORDS.some((k) => lower.includes(k))) return 'WATER_ICE';
  if (VOID_KEYWORDS.some((k) => lower.includes(k))) return 'VOID_PSYCHIC';
  if (HAMON_KEYWORDS.some((k) => lower.includes(k))) return 'HAMON_ELECTRIC';
  return 'STAND_RUSH';
}

export function extractCardPopups(events: CombatEvent[]): ICardFloatingPopup[] {
  const popups: ICardFloatingPopup[] = [];

  for (const evt of events) {
    if (evt.type === 'DAMAGE_DEALT') {
      const kind =
        evt.source === 'BLEED'
          ? 'BLEED'
          : evt.source === 'BURN'
            ? 'BURN'
            : 'DAMAGE';
      const sublabel =
        evt.source === 'BLEED'
          ? 'SANGRADO'
          : evt.source === 'BURN'
            ? 'QUEMADO'
            : evt.source === 'COUNTER'
              ? 'CONTRA'
              : evt.source === 'RECOIL'
                ? 'RETROCESO'
                : evt.source === 'BENCH'
                  ? 'DAÑO BANCA'
                  : undefined;
      popups.push({
        id: `${evt.id}-pop`,
        targetInstanceId: evt.targetInstanceId,
        kind,
        label: `-${evt.amount}`,
        sublabel,
      });
    } else if (evt.type === 'HEALED' && evt.amount > 0) {
      popups.push({
        id: `${evt.id}-pop`,
        targetInstanceId: evt.targetInstanceId,
        kind: 'HEAL',
        label: `+${evt.amount} HP`,
      });
    } else if (evt.type === 'STATUS_APPLIED') {
      const text =
        evt.status === 'BURN'
          ? '¡QUEMADO!'
          : evt.status === 'BLEED'
            ? '¡SANGRADO!'
            : '¡ATURDIDO!';
      popups.push({
        id: `${evt.id}-pop`,
        targetInstanceId: evt.targetInstanceId,
        kind: 'STATUS',
        label: text,
      });
    } else if (evt.type === 'STATUS_PREVENTED') {
      popups.push({
        id: `${evt.id}-pop`,
        targetInstanceId: evt.targetInstanceId,
        kind: 'SHIELD',
        label: '¡ANULADO!',
        sublabel: evt.reason,
      });
    } else if (evt.type === 'STATUS_CLEARED' && evt.status === 'BURN') {
      popups.push({
        id: `${evt.id}-pop`,
        targetInstanceId: evt.targetInstanceId,
        kind: 'HEAL',
        label: 'QUEMADURA CURADA',
      });
    }
  }

  return popups;
}

export function extractThreeVfxCue(
  events: CombatEvent[],
  viewerPlayerId: PlayerId,
): IThreeVfxCue | null {
  if (events.length === 0) return null;

  const otherPlayer = (pid: PlayerId): PlayerId => (pid === 'P1' ? 'P2' : 'P1');

  const evo = events.find((e) => e.type === 'CARD_EVOLVED');
  if (evo && evo.type === 'CARD_EVOLVED') {
    return {
      id: evo.id,
      vfxType: 'EVOLUTION',
      direction: 'CENTER',
      intensity: 1.3,
      sourcePlayerId: evo.playerId,
      targetPlayerId: evo.playerId,
    };
  }

  const zaWarudo = events.find(
    (e) =>
      (e.type === 'ATTACK_DECLARED' && e.attackName.toLowerCase().includes('za warudo')) ||
      (e.type === 'ABILITY_TRIGGERED' && e.abilityName.toLowerCase().includes('za warudo')),
  );
  if (zaWarudo) {
    return { id: zaWarudo.id, vfxType: 'TIME_STOP', direction: 'CENTER', intensity: 1.4 };
  }

  const ko = events.find((e) => e.type === 'CHARACTER_KO');
  if (ko && ko.type === 'CHARACTER_KO') {
    const dir = ko.ownerPlayerId === viewerPlayerId ? 'DOWN' : 'UP';
    const koDmg = events.find(
      (e) => e.type === 'DAMAGE_DEALT' && e.targetPlayerId === ko.ownerPlayerId,
    );
    return {
      id: ko.id,
      vfxType: 'KO_SHATTER',
      direction: dir,
      intensity: 1.35,
      sourcePlayerId: otherPlayer(ko.ownerPlayerId),
      targetPlayerId: ko.ownerPlayerId,
      targetInstanceId: koDmg && koDmg.type === 'DAMAGE_DEALT' ? koDmg.targetInstanceId : undefined,
    };
  }

  const atk = events.find((e) => e.type === 'ATTACK_DECLARED');
  if (atk && atk.type === 'ATTACK_DECLARED') {
    const dir = atk.playerId === viewerPlayerId ? 'UP' : 'DOWN';
    const primaryTargetPlayer = otherPlayer(atk.playerId);
    const primaryDmg = events.find(
      (e) =>
        e.type === 'DAMAGE_DEALT' &&
        e.targetPlayerId === primaryTargetPlayer &&
        e.source === 'ATTACK',
    );
    const anyEnemyDmg =
      primaryDmg ??
      events.find((e) => e.type === 'DAMAGE_DEALT' && e.targetPlayerId === primaryTargetPlayer);
    return {
      id: atk.id,
      vfxType: classifyAttackVfx(atk.attackName),
      direction: dir,
      intensity: 1.0,
      sourcePlayerId: atk.playerId,
      targetPlayerId: primaryTargetPlayer,
      targetInstanceId:
        anyEnemyDmg && anyEnemyDmg.type === 'DAMAGE_DEALT'
          ? anyEnemyDmg.targetInstanceId
          : undefined,
    };
  }

  const dmg = events.find((e) => e.type === 'DAMAGE_DEALT');
  if (dmg && dmg.type === 'DAMAGE_DEALT') {
    const dir = dmg.targetPlayerId === viewerPlayerId ? 'DOWN' : 'UP';
    const vfxType: ThreeVfxType =
      dmg.source === 'BURN'
        ? 'FIRE_EXPLOSION'
        : dmg.source === 'BLEED'
          ? 'VOID_PSYCHIC'
          : 'STAND_RUSH';
    return {
      id: dmg.id,
      vfxType,
      direction: dir,
      intensity: 0.78,
      sourcePlayerId: dmg.targetPlayerId,
      targetPlayerId: dmg.targetPlayerId,
      targetInstanceId: dmg.targetInstanceId,
    };
  }

  const heal = events.find((e) => e.type === 'HEALED' && e.amount > 0);
  if (heal && heal.type === 'HEALED') {
    const dir = heal.targetPlayerId === viewerPlayerId ? 'DOWN' : 'UP';
    return {
      id: heal.id,
      vfxType: 'HEAL_RESTORE',
      direction: dir,
      intensity: 0.9,
      sourcePlayerId: heal.targetPlayerId,
      targetPlayerId: heal.targetPlayerId,
      targetInstanceId: heal.targetInstanceId,
    };
  }

  return null;
}

export function extractAttackingPlayerId(events: CombatEvent[]): PlayerId | null {
  const atk = events.find((e) => e.type === 'ATTACK_DECLARED');
  return atk && atk.type === 'ATTACK_DECLARED' ? atk.playerId : null;
}

export function extractTurnSplash(
  prevState: GameState,
  nextState: GameState,
): ITurnSplash | null {
  if (
    nextState.phase !== 'GAME_OVER' &&
    nextState.turnNumber > 0 &&
    (prevState.turnNumber !== nextState.turnNumber ||
      prevState.activePlayerId !== nextState.activePlayerId)
  ) {
    const p = nextState.players[nextState.activePlayerId];
    return {
      id: `turn-splash-${nextState.turnNumber}-${nextState.activePlayerId}`,
      playerId: p.id,
      playerName: p.name,
      turnNumber: nextState.turnNumber,
    };
  }
  return null;
}

export function formatActionTickerEntries(
  events: CombatEvent[],
  state: GameState,
): IActionTickerEntry[] {
  const entries: IActionTickerEntry[] = [];
  for (const evt of events) {
    if (evt.type === 'PHASE_CHANGED' || evt.type === 'CARD_DRAWN') continue;
    let tone: IActionTickerEntry['tone'] = 'INFO';
    let actorTag = 'DUELO';

    switch (evt.type) {
      case 'ATTACK_DECLARED':
        tone = 'ATTACK';
        actorTag = state.players[evt.playerId].name;
        break;
      case 'DAMAGE_DEALT':
        tone = 'DAMAGE';
        actorTag = getCardById(evt.targetCardId)?.name ?? 'DAÑO';
        break;
      case 'HEALED':
        tone = 'HEAL';
        actorTag = 'CURA';
        break;
      case 'STATUS_APPLIED':
      case 'STATUS_PREVENTED':
      case 'STATUS_CLEARED':
        tone = 'STATUS';
        actorTag = 'ESTADO';
        break;
      case 'CARD_EVOLVED':
        tone = 'EVO';
        actorTag = state.players[evt.playerId].name;
        break;
      case 'CHARACTER_KO':
      case 'GAME_OVER':
        tone = 'KO';
        actorTag = 'K.O.';
        break;
      case 'STAND_EQUIPPED':
      case 'ENERGY_ATTACHED':
      case 'ITEM_PLAYED':
      case 'CHARACTER_PLAYED':
      case 'BENCH_SWAP':
        tone = 'SETUP';
        actorTag = state.players[evt.playerId].name;
        break;
      case 'ABILITY_TRIGGERED':
        tone = 'STATUS';
        actorTag = evt.abilityName;
        break;
      case 'COIN_FLIPPED':
        tone = 'ATTACK';
        actorTag = 'MONEDA';
        break;
      case 'MULLIGAN':
        tone = 'SETUP';
        actorTag = state.players[evt.playerId].name;
        break;
    }

    entries.push({
      id: evt.id,
      turn: evt.turn,
      actorTag,
      tone,
      text: evt.message,
    });
  }
  return entries;
}
