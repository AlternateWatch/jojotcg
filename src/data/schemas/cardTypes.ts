export type CardType = 'CHARACTER' | 'STAND' | 'ITEM' | 'EVOLUTION' | 'ENERGY';

export type CharacterCategory =
  | 'STAND_USER'
  | 'HAMON_USER'
  | 'VAMPIRE'
  | 'PILLAR_MAN'
  | 'CONVENTIONAL_FIGHTER';

export type EnergyType =
  | 'COLORLESS'
  | 'ELECTRIC'
  | 'FIRE'
  | 'WATER'
  | 'PSYCHIC'
  | 'LIGHT'
  | 'NATURE'
  | 'METAL';

export type StatusType = 'STUNNED' | 'BLEED' | 'BURN';

export type JoJoPart = 1 | 2 | 3 | 4 | 5;

export interface BaseCard {
  id: string;
  name: string;
  type: CardType;
  part: JoJoPart;
  imageId: string;
  assetFolder: 'official' | 'items' | 'energies';
  description?: string;
  tags?: string[];
}

export type CoinEffectOutcome =
  | { kind: 'STATUS'; status: StatusType; target: 'DEFENDER' | 'SELF' | 'ENEMY_BENCH_CHOOSE' }
  | { kind: 'INSTANT_KO'; target: 'DEFENDER' | 'SELF' }
  | { kind: 'CANCEL_ATTACK' }
  | { kind: 'DODGE_NEXT_ENEMY_ATTACK' }
  | { kind: 'DAMAGE_AND_HEAL'; damageToDefender: number; healSelf: number }
  | { kind: 'DAMAGE'; target: 'DEFENDER' | 'SELF'; amount: number };

export interface CoinFlipSpec {
  count: number;
  /** Applied per flip when count > 1 or once when count === 1 */
  onHeads?: CoinEffectOutcome[];
  onTails?: CoinEffectOutcome[];
  /** If true, baseDamage is replaced by coin damage outcomes (e.g. Muda Muda, Light Blades, Horda) */
  replacesBaseDamage?: boolean;
  /** If true, the attack only takes effect when heads > tails (e.g. Gold Experience 7-Page Muda) */
  requireMajorityHeads?: boolean;
  /** Special effect triggered only if EVERY coin flipped lands on HEADS (e.g. Sticky Fingers Zipper Man) */
  allHeadsEffect?: 'BOUNCE_DEFENDER_TO_HAND';
}

export type AttackSpecialEffect =
  | { kind: 'APPLY_STATUS'; status: StatusType; target: 'DEFENDER' | 'SELF' }
  | { kind: 'DISTRIBUTE_BENCH_DAMAGE'; totalDamage: number; increment: number }
  | { kind: 'GLOBAL_BENCH_DAMAGE'; damage: number }
  | { kind: 'HEAL_SELF'; amount: number }
  | { kind: 'HEAL_DEFENDER'; amount: number }
  | { kind: 'HEAL_ALLY_BENCH'; amount: number }
  | { kind: 'HEAL_SELF_OR_BENCH'; amount: number }
  | { kind: 'RETURN_TO_ZERO' }
  | { kind: 'RAPID_RELOAD_BUFF'; nextTurnDamage: number }
  | { kind: 'EXTRA_COMBAT_ACTIONS'; extraActions: number; oncePerTurnKey: string }
  | { kind: 'SELF_KO_AFTER_ATTACK' }
  | { kind: 'RETREAT_SELF_AFTER_ATTACK' }
  | { kind: 'PERMANENT_STAND_DAMAGE_BUFF'; amount: number }
  | { kind: 'ARMOR_OFF_BUFF'; maxHpLoss: number; damageGain: number }
  | { kind: 'ENEMY_STAND_DAMAGE_DEBUFF'; amount: number }
  | { kind: 'PERMANENT_WATER_ATTACK_BUFF'; amount: number }
  | { kind: 'PSYCHOPHOTOGRAPHY_SCRY'; lookCount: number; pickCount: number; restTo: 'BOTTOM' | 'TOP' }
  | { kind: 'RECOVER_ITEM_FROM_DISCARD'; destination: 'HAND' | 'DECK' }
  | { kind: 'COPY_ENEMY_STAND_ATTACK' }
  | { kind: 'SOUL_SWAP_HP' }
  | { kind: 'RETURN_ENEMY_BENCH_TO_DECK' };

export interface AttackDef {
  id: string;
  name: string;
  energyCost: EnergyType[];
  baseDamage: number;
  damageLabel?: string;
  effectText?: string;
  coinFlip?: CoinFlipSpec;
  specialEffects?: AttackSpecialEffect[];
}

export type SignatureTrigger =
  | 'PASSIVE'
  | 'ON_ENTER_FIELD'
  | 'ONCE_PER_TURN_PREP'
  | 'ON_KO'
  | 'ON_END_TURN'
  | 'ON_RECEIVE_DAMAGE'
  | 'ON_RECEIVE_STATUS'
  | 'ON_DEAL_KO'
  | 'ON_EVOLVE_STAND';

export type SignatureEffectId =
  | 'YARE_YARE_DAZE'
  | 'VAMPIRE_REGEN'
  | 'VAMPIRE_FURY_DIO'
  | 'ADIOS_ERINA'
  | 'HAMON_MASTER_BENCH'
  | 'SPEEDWAGON_FOUNDATION'
  | 'NIGERUNDAYO'
  | 'LAST_HAMON_CAESAR'
  | 'GERMAN_TECHNOLOGY'
  | 'BODY_ABSORPTION_SANTANA'
  | 'WIND_SENSE_WAMUU'
  | 'HOT_BLOOD_ESIDISI'
  | 'SUPERIOR_INTELLECT_KARS'
  | 'INSTANT_EVOLUTION_KARS'
  | 'OH_MY_GOD_OLD_JOSEPH'
  | 'READ_CARDS_AVDOL'
  | 'LONG_RANGE_LOCK_KAKYOIN'
  | 'UNDERWEAR_SHOWING_POLNAREFF'
  | 'HATE_POLNAREFF_IGGY'
  | 'LUCKY_SHOT_HOL_HORSE'
  | 'WATER_CONTROL_NDOUL'
  | 'MAGNETIC_ATTRACTION_MARIAH'
  | 'AERIAL_RECON_PET_SHOP'
  | 'HAIR_RAGE_JOSUKE'
  | 'OI_JOSUKE_OKUYASU'
  | 'ECHOES_HEAL_KOICHI'
  | 'READ_INSIDE_ROHAN'
  | 'HE_IS_MINE_YUKAKO'
  | 'MONEY_SHIGEKIYO'
  | 'GUITAR_SOLO_AKIRA'
  | 'QUIET_LIFE_KIRA'
  | 'NOTHING_WILL_REMAIN_KOSAKU'
  | 'HAVE_A_DREAM_GIORNO'
  | 'LIE_DETECTION_BUCCIARATI'
  | 'TETRAPHOBIA_MISTA'
  | 'FLAGRANT_LOVE_ERINA'
  | 'PRECOGNITION_TONPETTY'
  | 'AFTERIMAGE_DIRE'
  | 'HAMON_SCHOLAR_STRAIZO'
  | 'NONE';

export interface SignatureAbilityDef {
  id: SignatureEffectId;
  name: string;
  text: string;
  trigger: SignatureTrigger;
}

export interface CharacterCard extends BaseCard {
  type: 'CHARACTER';
  categories: CharacterCategory[];
  maxHp: number;
  dg: number | null;
  signatureAbility: SignatureAbilityDef;
  attacks: AttackDef[];
}

export interface StandCard extends BaseCard {
  type: 'STAND';
  requiredDg: number;
  compatibleCharacterIds?: string[];
  attacks: AttackDef[];
}

export type ItemEffectDef =
  | { kind: 'HEAL_TARGET'; amount: number; curesBurn: boolean }
  | { kind: 'EQUIP_PASSIVE_MAX_HP'; bonusHp: number }
  | { kind: 'EQUIP_PASSIVE_DAMAGE_BONUS'; bonusDamage: number }
  | { kind: 'EQUIP_PASSIVE_CATEGORY_DAMAGE_BONUS'; category: CharacterCategory; bonusDamage: number }
  | { kind: 'EQUIP_PASSIVE_ELEMENT_BONUS'; energy: EnergyType; bonusDamage: number }
  | { kind: 'EQUIP_END_TURN_DRAW_IF_UNDAMAGED'; count: number }
  | { kind: 'BURN_ENEMY_ACTIVE' }
  | { kind: 'STUN_AND_LOCK_RETREAT_ENEMY_ACTIVE' }
  | { kind: 'EVOLUTION_CATALYST'; catalystTag: string }
  | { kind: 'DRAW_CARDS'; count: number }
  | {
      kind: 'SEARCH_DECK';
      filter: 'ENERGY' | 'STAND' | 'STAND_EVOLUTION' | 'CHARACTER_OR_STAND';
      maxCount: number;
    }
  | { kind: 'EXTRA_ENERGY_ALLOWANCE'; bonusAttachments: number; recoverDiscardEnergy: boolean }
  | { kind: 'FREE_BENCH_SWAP' };

export interface ItemCard extends BaseCard {
  type: 'ITEM';
  itemKind: 'CONSUMABLE' | 'EQUIPPABLE';
  targetScope: 'ACTIVE_ALLY' | 'ANY_ALLY' | 'PLAYER';
  catalystTag?: string;
  effects: ItemEffectDef[];
}

export type EvolutionRequirement =
  | { kind: 'BASE_ACTIVE_CHARACTER'; characterId: string }
  | { kind: 'BASE_ATTACHED_STAND'; standId: string }
  | { kind: 'BASE_ACTIVE_CHARACTER_OR_STAND'; characterId: string; standId?: string }
  | { kind: 'CONSUME_HAND_ITEM_TAG'; catalystTag: string; label: string }
  | { kind: 'EQUIPPED_ITEM_TAG'; catalystTag: string; label: string }
  | { kind: 'BENCH_CHARACTER_PRESENT'; characterId: string; label: string }
  | { kind: 'BENCH_STAND_PRESENT'; standId: string; consumeOnEvolve?: boolean; label: string };

export interface EvolutionCard extends BaseCard {
  type: 'EVOLUTION';
  evolutionTarget: 'CHARACTER' | 'STAND';
  baseCardId: string;
  requirements: EvolutionRequirement[];
  requirementText: string;
  /** For Character evolutions (e.g., Kars Ultimate, Kosaku Kawajiri) */
  categories?: CharacterCategory[];
  maxHp?: number;
  dg?: number | null;
  signatureAbility?: SignatureAbilityDef;
  /** For Stand evolutions (e.g., Silver Chariot Requiem, Bites The Dust, Star Platinum: The World) */
  requiredDg?: number;
  attacks: AttackDef[];
}

export interface EnergyCard extends BaseCard {
  type: 'ENERGY';
  energyType: EnergyType;
}

export type AnyCard = CharacterCard | StandCard | ItemCard | EvolutionCard | EnergyCard;

export const ENERGY_META: Record<
  EnergyType,
  { label: string; short: string; color: string; bgClass: string; textClass: string }
> = {
  COLORLESS: {
    label: 'Incolora',
    short: 'INC',
    color: '#d4d4d8',
    bgClass: 'bg-zinc-300/20 border-zinc-400',
    textClass: 'text-zinc-200',
  },
  ELECTRIC: {
    label: 'Hamon / Rayo',
    short: 'HAM',
    color: '#facc15',
    bgClass: 'bg-yellow-400/20 border-yellow-400',
    textClass: 'text-yellow-300',
  },
  FIRE: {
    label: 'Fuego',
    short: 'FUE',
    color: '#f97316',
    bgClass: 'bg-orange-500/20 border-orange-500',
    textClass: 'text-orange-300',
  },
  WATER: {
    label: 'Agua',
    short: 'AGU',
    color: '#38bdf8',
    bgClass: 'bg-sky-500/20 border-sky-400',
    textClass: 'text-sky-300',
  },
  PSYCHIC: {
    label: 'Psíquica',
    short: 'PSI',
    color: '#c084fc',
    bgClass: 'bg-purple-500/20 border-purple-400',
    textClass: 'text-purple-300',
  },
  LIGHT: {
    label: 'Luz / Sol',
    short: 'LUZ',
    color: '#fde047',
    bgClass: 'bg-amber-300/20 border-amber-300',
    textClass: 'text-amber-200',
  },
  NATURE: {
    label: 'Naturaleza',
    short: 'NAT',
    color: '#4ade80',
    bgClass: 'bg-emerald-500/20 border-emerald-400',
    textClass: 'text-emerald-300',
  },
  METAL: {
    label: 'Metal',
    short: 'MET',
    color: '#94a3b8',
    bgClass: 'bg-slate-400/25 border-slate-300',
    textClass: 'text-slate-200',
  },
};

export const CATEGORY_LABELS: Record<CharacterCategory, string> = {
  STAND_USER: 'Usuario de Stand',
  HAMON_USER: 'Usuario de Hamon',
  VAMPIRE: 'Vampiro',
  PILLAR_MAN: 'Hombre del Pilar',
  CONVENTIONAL_FIGHTER: 'Luchador Convencional',
};
