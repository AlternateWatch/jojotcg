import { ALL_CARDS } from './cardRegistry';
import { getCardRarity, type BoosterPackDef } from './progressionData';

export type RoguelikeRoomType = 'BATTLE' | 'ELITE' | 'TREASURE' | 'SHOP' | 'EVENT' | 'BOSS';
export type RoguelikeDifficulty = 'EASY' | 'NORMAL' | 'HARD';

export interface RoguelikeDifficultyMeta {
  id: RoguelikeDifficulty;
  label: string;
  badge: string;
  description: string;
  startingGold: number;
  victoryPackCount: number;
  metaCoinMultiplier: number;
  accentHex: string;
}

export const ROGUELIKE_DIFFICULTY_META: Record<RoguelikeDifficulty, RoguelikeDifficultyMeta> = {
  EASY: {
    id: 'EASY',
    label: 'Fácil',
    badge: '1 SOBRE GENERAL',
    description: 'IA más permisiva, enemigos sin bonos fuertes y 40 Oro inicial. Al vencer el Piso 30: 1 Sobre General.',
    startingGold: 40,
    victoryPackCount: 1,
    metaCoinMultiplier: 0.85,
    accentHex: '#00b87c',
  },
  NORMAL: {
    id: 'NORMAL',
    label: 'Normal',
    badge: '2 SOBRES GENERALES',
    description: 'Curva equilibrada, mazos enemigos coherentes y 30 Oro inicial. Al vencer el Piso 30: 2 Sobres Generales.',
    startingGold: 30,
    victoryPackCount: 2,
    metaCoinMultiplier: 1.0,
    accentHex: '#f2c12e',
  },
  HARD: {
    id: 'HARD',
    label: 'Difícil',
    badge: '3 SOBRES GENERALES',
    description: 'IA Difícil desde el Piso 1, enemigos reforzados (+PV y daño) y 20 Oro inicial. Al vencer el Piso 30: 3 Sobres Generales y +35% monedas.',
    startingGold: 20,
    victoryPackCount: 3,
    metaCoinMultiplier: 1.35,
    accentHex: '#e6194b',
  },
};

/**
 * General Booster Pack awarded for conquering Floor 30 of the Roguelike Expedition.
 * Can pull ANY collectible (non-Energy) card in the entire game!
 */
export function createRoguelikeGeneralPack(): BoosterPackDef {
  const poolCardIds = ALL_CARDS.filter((c) => c.type !== 'ENERGY').map((c) => c.id);
  const chaseCardIds = poolCardIds.filter((id) => getCardRarity(id) === 'BIZARRE_RARE');
  return {
    id: 'pack-roguelike-general',
    name: 'Sobre General · Expedición Bizarra',
    subtitle: 'Puede contener cualquier carta coleccionable del juego completo (Partes 1 a 5).',
    series: 'CORRELATION',
    badge: 'GENERAL · TODAS LAS CARTAS',
    price: 0,
    cardsPerPack: 5,
    accentHex: '#9333ea',
    patternUrl: '/assets/patterns/pattern3.png',
    coverCardId: 'evo-gold-experience-requiem',
    chaseCardIds,
    poolCardIds,
  };
}

export interface RoguelikeStarterDeckDef {
  id: string;
  name: string;
  subtitle: string;
  badge: string;
  accentHex: string;
  coverCardId: string;
  cardIds: string[]; // 16 cards (10 in deck + 6 Prize Cards)
}

export interface RoguelikeRelicDef {
  id: string;
  name: string;
  description: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC';
  price: number;
  icon: string;
  bonusMaxHp?: number;
  bonusDamage?: number;
  extraInitialHand?: number;
  goldBonusPercent?: number;
  shopDiscountPercent?: number;
  extraDraftChoices?: number;
  grantCardIdsOnPickup?: string[];
}

export interface RoguelikeEventChoice {
  id: string;
  label: string;
  description: string;
  goldCost?: number;
  effect:
    | { kind: 'ADD_GOLD'; amount: number }
    | { kind: 'ADD_RANDOM_CARDS'; count: number; minRarity: 'COMMON' | 'RARE' | 'SUPER_RARE' | 'BIZARRE_RARE' }
    | { kind: 'ADD_SPECIFIC_CARDS'; cardIds: string[] }
    | { kind: 'ADD_RANDOM_RELIC' }
    | { kind: 'OPEN_ENERGY_PICK'; count: number }
    | { kind: 'GAMBLE_GOLD'; stake: number; winGold: number };
}

export interface RoguelikeEventDef {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  featuredCardId: string;
  choices: RoguelikeEventChoice[];
}

export const ROGUELIKE_TOTAL_FLOORS = 30;
export const ROGUELIKE_MIN_DECK_SIZE = 16;
export const ROGUELIKE_STARTING_GOLD = 30;

export const ROGUELIKE_ACTS = [
  {
    act: 1 as const,
    name: 'ACTO I · SANGRE Y DESPERTAR',
    floorRange: [1, 10] as const,
    accentHex: '#2952d9',
    bossName: 'Kars & Dio Brando · Señores de la Noche',
  },
  {
    act: 2 as const,
    name: 'ACTO II · RUTA A EGIPTO',
    floorRange: [11, 20] as const,
    accentHex: '#9333ea',
    bossName: 'DIO · El Gobernante del Tiempo',
  },
  {
    act: 3 as const,
    name: 'ACTO III · RÉQUIEM DEFINITIVO',
    floorRange: [21, 30] as const,
    accentHex: '#e6194b',
    bossName: 'Destino Absoluto · Réquiem & Bites The Dust',
  },
] as const;

export const ROGUELIKE_STARTER_DECKS: RoguelikeStarterDeckDef[] = [
  {
    id: 'starter-hamon',
    name: 'Linaje Hamon',
    subtitle: 'Resistencia solar, curación y sinergias de banca con Jonathan, Zeppeli y Speedwagon.',
    badge: '16 CARTAS · HAMON',
    accentHex: '#f2c12e',
    coverCardId: 'char-jonathan-joestar',
    cardIds: [
      'char-jonathan-joestar',
      'char-will-a-zeppeli',
      'char-robert-e-o-speedwagon',
      'char-erina-pendleton',
      'item-comida-de-tonio',
      'item-clackers',
      'item-suministros-speedwagon',
      'energy-electric',
      'energy-electric',
      'energy-electric',
      'energy-electric',
      'energy-electric',
      'energy-light',
      'energy-light',
      'energy-light',
      'energy-light',
    ],
  },
  {
    id: 'starter-stands',
    name: 'Patrulla Stand',
    subtitle: 'Usuarios de Stand rápidos de DG 3 con Emperor, The Fool y Echoes Act 1 listos desde Turno 1.',
    badge: '16 CARTAS · STANDS',
    accentHex: '#9333ea',
    coverCardId: 'char-hol-horse',
    cardIds: [
      'char-hol-horse',
      'char-iggy',
      'char-koichi-hirose',
      'char-shigekiyo-yangu',
      'stand-emperor',
      'stand-the-fool',
      'stand-echoes-act-1',
      'item-atraccion-usuarios-stand',
      'item-comida-de-tonio',
      'energy-psychic',
      'energy-psychic',
      'energy-psychic',
      'energy-psychic',
      'energy-colorless',
      'energy-colorless',
      'energy-colorless',
    ],
  },
  {
    id: 'starter-shadow',
    name: 'Sombra Nocturna',
    subtitle: 'Golpe directo y presión con Bruford, Wang Chan, Donovan y Gray Fly + Tower of Gray.',
    badge: '16 CARTAS · AGRESIVO',
    accentHex: '#e6194b',
    coverCardId: 'char-bruford',
    cardIds: [
      'char-bruford',
      'char-wang-chan',
      'char-donovan',
      'char-gray-fly',
      'stand-tower-of-gray',
      'item-mascara-de-piedra',
      'item-muerte-de-danny',
      'item-comida-de-tonio',
      'energy-psychic',
      'energy-psychic',
      'energy-psychic',
      'energy-psychic',
      'energy-colorless',
      'energy-colorless',
      'energy-colorless',
      'energy-colorless',
    ],
  },
  {
    id: 'starter-ocean',
    name: 'Marea del Océano',
    subtitle: 'Rotación constante entre banca y activo con Tenille, Forever, N’Doul y Stands acuáticos.',
    badge: '16 CARTAS · AGUA',
    accentHex: '#0ea5e9',
    coverCardId: 'stand-dark-blue-moon',
    cardIds: [
      'char-capitan-tenille',
      'char-forever',
      'char-n-doul',
      'char-rubber-soul',
      'stand-dark-blue-moon',
      'stand-strength',
      'stand-geb',
      'item-atraccion-usuarios-stand',
      'item-comida-de-tonio',
      'energy-water',
      'energy-water',
      'energy-water',
      'energy-water',
      'energy-water',
      'energy-colorless',
      'energy-colorless',
    ],
  },
  {
    id: 'starter-morioh',
    name: 'Chicos de Morioh',
    subtitle: 'Control de Morioh-cho con Okuyasu, Koichi, Yukako y Shigekiyo junto a The Hand y Love Deluxe.',
    badge: '16 CARTAS · PARTE 4',
    accentHex: '#ec4899',
    coverCardId: 'char-okuyasu-nijimura',
    cardIds: [
      'char-okuyasu-nijimura',
      'char-koichi-hirose',
      'char-yukako-yamagishi',
      'char-shigekiyo-yangu',
      'stand-the-hand',
      'stand-love-deluxe',
      'stand-harvest',
      'item-comida-de-tonio',
      'item-suministros-speedwagon',
      'energy-psychic',
      'energy-psychic',
      'energy-psychic',
      'energy-psychic',
      'energy-nature',
      'energy-nature',
      'energy-nature',
    ],
  },
  {
    id: 'starter-passione',
    name: 'Fuego y Ráfaga',
    subtitle: 'Tiradores implacables con Mista, Avdol, Hol Horse y J. Geil armados con Sex Pistols y Magician’s Red.',
    badge: '16 CARTAS · FUEGO/LUZ',
    accentHex: '#f97316',
    coverCardId: 'char-guido-mista',
    cardIds: [
      'char-guido-mista',
      'char-muhammad-avdol',
      'char-hol-horse',
      'char-j-geil',
      'stand-sex-pistols',
      'stand-magicians-red',
      'stand-hanged-man',
      'item-mechero-de-polpo',
      'item-atraccion-usuarios-stand',
      'energy-fire',
      'energy-fire',
      'energy-fire',
      'energy-fire',
      'energy-light',
      'energy-light',
      'energy-light',
    ],
  },
  {
    id: 'starter-battle-tendency',
    name: 'Maestros de Battle Tendency',
    subtitle: 'Joseph, Caesar, Lisa Lisa y Stroheim con trucos tácticos, Clackers y la Cinta de Caesar.',
    badge: '16 CARTAS · PARTE 2',
    accentHex: '#a855f7',
    coverCardId: 'char-joseph-joestar',
    cardIds: [
      'char-joseph-joestar',
      'char-caesar-zeppeli',
      'char-lisa-lisa',
      'char-rudol-von-stroheim',
      'item-clackers',
      'item-cinta-de-caesar',
      'item-entrenamiento-air-supplena',
      'item-carterista-de-nueva-york',
      'energy-electric',
      'energy-electric',
      'energy-electric',
      'energy-electric',
      'energy-water',
      'energy-water',
      'energy-water',
      'energy-water',
    ],
  },
  {
    id: 'starter-temple-hamon',
    name: 'Templo del Hamon',
    subtitle: 'Sinergia de robo continuo con Tonpetty, Dire, Straizo y Zeppeli potenciados por Pluck.',
    badge: '16 CARTAS · TEMPLO',
    accentHex: '#eab308',
    coverCardId: 'char-dire',
    cardIds: [
      'char-tonpetty',
      'char-dire',
      'char-straizo',
      'char-will-a-zeppeli',
      'item-pluck',
      'item-suministros-speedwagon',
      'item-comida-de-tonio',
      'item-entrenamiento-air-supplena',
      'energy-electric',
      'energy-electric',
      'energy-electric',
      'energy-electric',
      'energy-light',
      'energy-light',
      'energy-light',
      'energy-light',
    ],
  },
  {
    id: 'starter-egypt-assassins',
    name: 'Asesinos de Egipto',
    subtitle: 'Presión mental y sangrado con Devo, Mariah, Rubber Soul y J. Geil junto a Ebony Devil y Yellow Temperance.',
    badge: '16 CARTAS · PSÍQUICO',
    accentHex: '#be123c',
    coverCardId: 'char-devo-el-maldito',
    cardIds: [
      'char-devo-el-maldito',
      'char-mariah',
      'char-rubber-soul',
      'char-j-geil',
      'stand-ebony-devil',
      'stand-bastet',
      'stand-yellow-temperance',
      'item-atraccion-usuarios-stand',
      'item-ataud-de-dio',
      'energy-psychic',
      'energy-psychic',
      'energy-psychic',
      'energy-psychic',
      'energy-psychic',
      'energy-colorless',
      'energy-colorless',
    ],
  },
];

export const ROGUELIKE_RELICS: RoguelikeRelicDef[] = [
  {
    id: 'relic-sangre-joestar',
    name: 'Sangre Joestar',
    description: 'Todos tus personajes entran al campo con +10 PV máx. y actuales.',
    rarity: 'COMMON',
    price: 110,
    icon: '🩸',
    bonusMaxHp: 10,
  },
  {
    id: 'relic-sobrecarga-hamon',
    name: 'Sobrecarga de Hamon',
    description: 'Todos tus ataques infligen +10 de daño extra.',
    rarity: 'RARE',
    price: 165,
    icon: '⚡',
    bonusDamage: 10,
  },
  {
    id: 'relic-flecha-fortuna',
    name: 'Flecha de la Fortuna',
    description: 'Robas +1 carta adicional en tu mano inicial de cada combate.',
    rarity: 'RARE',
    price: 135,
    icon: '🏹',
    extraInitialHand: 1,
  },
  {
    id: 'relic-cheque-speedwagon',
    name: 'Cheque Speedwagon',
    description: 'Ganas +25% de Oro de Expedición en combates y tesoros.',
    rarity: 'COMMON',
    price: 100,
    icon: '💼',
    goldBonusPercent: 25,
  },
  {
    id: 'relic-vip-tonio',
    name: 'Cliente VIP de Tonio',
    description: '25% de descuento permanente en todas las Tiendas de la expedición.',
    rarity: 'COMMON',
    price: 95,
    icon: '🍝',
    shopDiscountPercent: 25,
  },
  {
    id: 'relic-gravedad-destino',
    name: 'Gravedad del Destino',
    description: 'Tras ganar combates eliges entre 4 cartas en lugar de 3.',
    rarity: 'RARE',
    price: 140,
    icon: '🌀',
    extraDraftChoices: 1,
  },
  {
    id: 'relic-corazon-acero',
    name: 'Corazón de Acero',
    description: 'Todos tus personajes entran al campo con +20 PV máx. y actuales.',
    rarity: 'EPIC',
    price: 195,
    icon: '🛡️',
    bonusMaxHp: 20,
  },
  {
    id: 'relic-despertar-dorado',
    name: 'Despertar Dorado',
    description: 'Añade inmediatamente 2× Energía de Stand a tu mazo de expedición.',
    rarity: 'RARE',
    price: 120,
    icon: '✨',
    grantCardIdsOnPickup: ['energy-stand', 'energy-stand'],
  },
];

export function getRoguelikeRelicById(id: string): RoguelikeRelicDef | undefined {
  return ROGUELIKE_RELICS.find((r) => r.id === id);
}

export const ROGUELIKE_EVENTS: RoguelikeEventDef[] = [
  {
    id: 'evt-tonio-trattoria',
    title: 'Trattoria Trussardi',
    subtitle: 'EVENTO DE MORIOH',
    description:
      'Tonio te invita a pasar a su cocina. Su comida revitaliza cualquier estrategia y prepara provisiones para el viaje.',
    featuredCardId: 'item-comida-de-tonio',
    choices: [
      {
        id: 'tonio-feast',
        label: 'Menú Completo (Gratis)',
        description: 'Añade 2× Comida de Tonio a tu mazo de expedición.',
        effect: { kind: 'ADD_SPECIFIC_CARDS', cardIds: ['item-comida-de-tonio', 'item-comida-de-tonio'] },
      },
      {
        id: 'tonio-tip',
        label: 'Dejar propina generosa (-50 Oro)',
        description: 'Recibe 1 Reliquia aleatoria para toda la expedición.',
        goldCost: 50,
        effect: { kind: 'ADD_RANDOM_RELIC' },
      },
      {
        id: 'tonio-work',
        label: 'Ayudar en cocina (+35 Oro)',
        description: 'Gana 35 de Oro de Expedición.',
        effect: { kind: 'ADD_GOLD', amount: 35 },
      },
    ],
  },
  {
    id: 'evt-speedwagon-convoy',
    title: 'Convoy de la Fundación Speedwagon',
    subtitle: 'EVENTO DE SUMINISTROS',
    description:
      'Un helicóptero de la Fundación aterriza con cajas de apoyo logístico y reservas de energía.',
    featuredCardId: 'char-robert-e-o-speedwagon',
    choices: [
      {
        id: 'spw-draw',
        label: 'Cargar Suministros',
        description: 'Añade 1× Suministros de la Fundación y 1× Atracción de Usuarios de Stand.',
        effect: {
          kind: 'ADD_SPECIFIC_CARDS',
          cardIds: ['item-suministros-speedwagon', 'item-atraccion-usuarios-stand'],
        },
      },
      {
        id: 'spw-energy',
        label: 'Recargar Energías',
        description: 'Elige 2 cartas de Energía básica del color que prefieras.',
        effect: { kind: 'OPEN_ENERGY_PICK', count: 2 },
      },
      {
        id: 'spw-funds',
        label: 'Solicitar Fondos (+45 Oro)',
        description: 'Gana 45 de Oro de Expedición.',
        effect: { kind: 'ADD_GOLD', amount: 45 },
      },
    ],
  },
  {
    id: 'evt-stand-arrow-altar',
    title: 'Altar de la Flecha de Stand',
    subtitle: 'EVENTO DE DESTINO',
    description:
      'Una Flecha de Stand vibra frente a ti, atrayendo poderes de rareza superior.',
    featuredCardId: 'item-flecha-de-stand',
    choices: [
      {
        id: 'arrow-pay',
        label: 'Aceptar la prueba (-75 Oro)',
        description: 'Recibe 1 carta Súper Rara (SR) o Bizarre Rare (UR) aleatoria para tu mazo.',
        goldCost: 75,
        effect: { kind: 'ADD_RANDOM_CARDS', count: 1, minRarity: 'SUPER_RARE' },
      },
      {
        id: 'arrow-take',
        label: 'Recoger la Flecha (Gratis)',
        description: 'Añade 1× Flecha de Stand a tu mazo.',
        effect: { kind: 'ADD_SPECIFIC_CARDS', cardIds: ['item-flecha-de-stand'] },
      },
      {
        id: 'arrow-sell',
        label: 'Informar a la Fundación (+30 Oro)',
        description: 'Gana 30 de Oro de Expedición sin riesgos.',
        effect: { kind: 'ADD_GOLD', amount: 30 },
      },
    ],
  },
  {
    id: 'evt-darby-bet',
    title: 'Mesa de Apuestas en El Cairo',
    subtitle: 'EVENTO DE AZAR',
    description:
      'Un jugador misterioso te propone una apuesta rápida: dobla tu oro o llévate una carta rara.',
    featuredCardId: 'char-dio',
    choices: [
      {
        id: 'darby-gamble',
        label: 'Apostar 30 Oro (55% ganar 85 Oro)',
        description: 'Arriesga 30 Oro: si ganas te llevas 85 Oro.',
        goldCost: 30,
        effect: { kind: 'GAMBLE_GOLD', stake: 30, winGold: 85 },
      },
      {
        id: 'darby-safe-card',
        label: 'Reclamar Carta Rara (Gratis)',
        description: 'Añade 1 carta Rara (R) aleatoria a tu mazo.',
        effect: { kind: 'ADD_RANDOM_CARDS', count: 1, minRarity: 'RARE' },
      },
    ],
  },
];

export const BASIC_ENERGY_IDS = [
  'energy-electric',
  'energy-fire',
  'energy-water',
  'energy-psychic',
  'energy-light',
  'energy-nature',
  'energy-colorless',
] as const;
