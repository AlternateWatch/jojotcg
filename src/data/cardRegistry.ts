import { CHARACTER_CARDS } from './cards/characters';
import { STAND_CARDS } from './cards/stands';
import { EVOLUTION_CARDS } from './cards/evolutions';
import { ITEM_CARDS } from './cards/items';
import { ENERGY_CARDS } from './cards/energies';
import { STARTER_DECK } from './progressionData';
import type {
  AnyCard,
  CharacterCard,
  EnergyCard,
  EvolutionCard,
  ItemCard,
  StandCard,
} from './schemas/cardTypes';
import type { SavedDeck } from '../services/storageService';

export const ALL_CARDS: AnyCard[] = [
  ...CHARACTER_CARDS,
  ...STAND_CARDS,
  ...EVOLUTION_CARDS,
  ...ITEM_CARDS,
  ...ENERGY_CARDS,
];

const cardMap = new Map<string, AnyCard>(ALL_CARDS.map((card) => [card.id, card]));

export function getCardById(cardId: string): AnyCard | undefined {
  return cardMap.get(cardId);
}

export function requireCardById(cardId: string): AnyCard {
  const card = cardMap.get(cardId);
  if (!card) {
    throw new Error(`Card not found in registry: ${cardId}`);
  }
  return card;
}

export function getCharacterCard(cardId: string): CharacterCard | undefined {
  const card = cardMap.get(cardId);
  return card?.type === 'CHARACTER' ? card : undefined;
}

export function getStandCard(cardId: string): StandCard | undefined {
  const card = cardMap.get(cardId);
  return card?.type === 'STAND' ? card : undefined;
}

export function getEvolutionCard(cardId: string): EvolutionCard | undefined {
  const card = cardMap.get(cardId);
  return card?.type === 'EVOLUTION' ? card : undefined;
}

export function getItemCard(cardId: string): ItemCard | undefined {
  const card = cardMap.get(cardId);
  return card?.type === 'ITEM' ? card : undefined;
}

export function getEnergyCard(cardId: string): EnergyCard | undefined {
  const card = cardMap.get(cardId);
  return card?.type === 'ENERGY' ? card : undefined;
}

export function getEvolutionsForBase(baseCardId: string): EvolutionCard[] {
  return EVOLUTION_CARDS.filter((evo) => evo.baseCardId === baseCardId);
}

export interface CardSynergyInfo {
  partnerCardIds: string[];
  summary: string;
}

export const CARD_SYNERGIES: Record<string, CardSynergyInfo> = {
  'char-will-a-zeppeli': {
    partnerCardIds: ['char-jonathan-joestar', 'char-joseph-joestar', 'char-caesar-zeppeli', 'char-lisa-lisa'],
    summary: '+20 daño desde banca a todos los Usuarios de Hamon.',
  },
  'char-lisa-lisa': {
    partnerCardIds: ['char-jonathan-joestar', 'char-joseph-joestar', 'char-caesar-zeppeli', 'char-will-a-zeppeli'],
    summary: '+20 daño desde banca a todos los Usuarios de Hamon.',
  },
  'char-jean-pierre-polnareff': {
    partnerCardIds: ['char-noriaki-kakyoin', 'stand-silver-chariot', 'evo-silver-chariot-requiem'],
    summary: 'Con Kakyoin en banca, inmune a estados elementales. Evoluciona a Silver Chariot Requiem.',
  },
  'char-iggy': {
    partnerCardIds: ['char-jean-pierre-polnareff', 'stand-the-fool'],
    summary: 'Con Polnareff en banca, su Stand recibe +10 daño adicional.',
  },
  'char-okuyasu-nijimura': {
    partnerCardIds: ['char-josuke-higashikata', 'stand-the-hand'],
    summary: 'Con Josuke en banca, aumenta su HP máximo en +20.',
  },
  'char-yukako-yamagishi': {
    partnerCardIds: ['char-koichi-hirose', 'stand-love-deluxe'],
    summary: 'Con Koichi en banca, su Stand activo inflige +10 daño.',
  },
  'char-yoshikage-kira': {
    partnerCardIds: ['stand-killer-queen', 'evo-kosaku-kawajiri', 'evo-killer-queen-bites-the-dust', 'char-stray-cat'],
    summary: 'Con Killer Queen: +10 HP max y +10 daño. Evoluciona a Kosaku Kawajiri y Bites The Dust.',
  },
  'char-jotaro-kujo': {
    partnerCardIds: ['stand-star-platinum', 'evo-star-platinum-the-world'],
    summary: 'Único usuario capaz de desbloquear Star Platinum: The World.',
  },
  'char-kars': {
    partnerCardIds: ['evo-kars-ultimate', 'item-mascara-de-piedra', 'item-piedra-roja-de-aja'],
    summary: 'Evoluciona a Forma de Vida Definitiva con Máscara de Piedra + Piedra Roja de Aja.',
  },
  'char-koichi-hirose': {
    partnerCardIds: ['stand-echoes-act-1', 'char-yukako-yamagishi'],
    summary: 'Se cura 60 HP al evolucionar Echoes y potencia a Yukako desde la banca.',
  },
};

function repeat(id: string, count: number): string[] {
  return Array.from({ length: count }, () => id);
}

export const PRESET_DECKS: SavedDeck[] = [
  STARTER_DECK,
  {
    id: 'preset-stardust-crusaders',
    name: 'Stardust Crusaders',
    description:
      'Ofensiva de Stands (Psíquica + Fuego + Luz): Jotaro, Polnareff, Kakyoin, Avdol, Iggy, Speedwagon y Stroheim.',
    isPreset: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    cardIds: [
      'char-jotaro-kujo',
      'char-jean-pierre-polnareff',
      'char-noriaki-kakyoin',
      'char-muhammad-avdol',
      'char-iggy',
      'char-robert-e-o-speedwagon',
      'char-rudol-von-stroheim',
      'stand-star-platinum',
      'stand-silver-chariot',
      'stand-hierophant-green',
      'stand-magicians-red',
      'stand-the-fool',
      'evo-star-platinum-the-world',
      'evo-silver-chariot-requiem',
      'item-flecha-requiem',
      ...repeat('item-brujula-de-energia', 3),
      ...repeat('item-llamada-del-destino', 2),
      ...repeat('item-impulso-espiritual', 3),
      'item-cambio-tactico',
      'item-comida-de-tonio',
      ...repeat('energy-psychic', 8),
      ...repeat('energy-fire', 5),
      ...repeat('energy-light', 2),
    ],
  },
  {
    id: 'preset-dio-pillar-men',
    name: 'DIO & Hombres del Pilar',
    description:
      'Poder puro (Psíquica + Luz): DIO, Kars Definitivo, Wamuu, Santana, Vanilla Ice, Hol Horse y Mariah.',
    isPreset: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    cardIds: [
      'char-dio',
      'char-vanilla-ice',
      'char-hol-horse',
      'char-mariah',
      'char-kars',
      'char-wamuu',
      'char-santana',
      'stand-the-world',
      'stand-cream',
      'stand-emperor',
      'stand-bastet',
      'evo-kars-ultimate',
      'item-mascara-de-piedra',
      'item-piedra-roja-de-aja',
      ...repeat('item-brujula-de-energia', 2),
      ...repeat('item-llamada-del-destino', 2),
      ...repeat('item-impulso-espiritual', 3),
      'item-cambio-tactico',
      'item-suministros-speedwagon',
      ...repeat('energy-psychic', 9),
      ...repeat('energy-light', 8),
    ],
  },
  {
    id: 'preset-morioh-hamon',
    name: 'Alianza Morioh & Hamon',
    description:
      'Sinergias explosivas (Hamon/Rayo + Psíquica): Joseph, Zeppeli, Lisa Lisa, Josuke, Okuyasu, Koichi y Yukako.',
    isPreset: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    cardIds: [
      'char-joseph-joestar',
      'char-will-a-zeppeli',
      'char-lisa-lisa',
      'char-josuke-higashikata',
      'char-okuyasu-nijimura',
      'char-koichi-hirose',
      'char-yukako-yamagishi',
      'stand-crazy-diamond',
      'stand-the-hand',
      'stand-echoes-act-1',
      'stand-love-deluxe',
      'stand-red-hot-chilli-pepper',
      ...repeat('item-brujula-de-energia', 2),
      ...repeat('item-llamada-del-destino', 2),
      ...repeat('item-impulso-espiritual', 2),
      'item-cambio-tactico',
      'item-comida-de-tonio',
      'item-suministros-speedwagon',
      ...repeat('energy-electric', 9),
      ...repeat('energy-psychic', 7),
      ...repeat('energy-nature', 3),
    ],
  },
  {
    id: 'preset-kira-assassins',
    name: 'Kira & Asesinos de Stand',
    description:
      'Explosivos y control (Fuego + Psíquica): Yoshikage Kira, Bites The Dust, Stray Cat, Esidisi, Wamuu, Akira y Shigekiyo.',
    isPreset: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    cardIds: [
      'char-yoshikage-kira',
      'char-stray-cat',
      'char-esidisi',
      'char-wamuu',
      'char-akira-otoishi',
      'char-shigekiyo-yangu',
      'char-rohan-kishibe',
      'stand-killer-queen',
      'stand-heavens-door',
      'stand-harvest',
      'stand-emperor',
      'stand-bastet',
      'evo-kosaku-kawajiri',
      'evo-killer-queen-bites-the-dust',
      'item-flecha-de-stand',
      ...repeat('item-brujula-de-energia', 2),
      ...repeat('item-llamada-del-destino', 2),
      ...repeat('item-impulso-espiritual', 3),
      'item-cambio-tactico',
      'item-comida-de-tonio',
      'item-suministros-speedwagon',
      ...repeat('energy-fire', 8),
      ...repeat('energy-psychic', 7),
    ],
  },
];
