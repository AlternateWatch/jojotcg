import { BOOSTER_PACKS, CARD_RARITY_MAP, type BoosterPackDef } from './progressionData';

export type MilestoneCategory = 'PACK_COMPLETION' | 'CARD_SET';

export interface MilestoneDef {
  id: string;
  title: string;
  description: string;
  category: MilestoneCategory;
  badge: string;
  accentHex: string;
  rewardCoins: number;
  requiredCardIds: string[];
  /** Linked booster pack ID for PACK_COMPLETION milestones */
  packId?: string;
}

const PACK_COMPLETION_REWARDS: Record<string, { title: string; rewardCoins: number }> = {
  'pack-part-1': { title: 'Sobre Completo: Parte 1 (Phantom Blood)', rewardCoins: 450 },
  'pack-part-2': { title: 'Sobre Completo: Parte 2 (Battle Tendency)', rewardCoins: 750 },
  'pack-part-3': { title: 'Sobre Completo: Parte 3 (Stardust Crusaders)', rewardCoins: 1500 },
  'pack-part-4': { title: 'Sobre Completo: Parte 4 (Diamond is Unbreakable)', rewardCoins: 1300 },
  'pack-part-5': { title: 'Sobre Completo: Parte 5 (Vento Aureo · Réquiem)', rewardCoins: 550 },
  'pack-corr-jojos': { title: 'Sobre Completo: Linaje Joestar', rewardCoins: 1100 },
  'pack-corr-jobros': { title: 'Sobre Completo: JoBros & Aliados', rewardCoins: 1200 },
  'pack-corr-villains': { title: 'Sobre Completo: Villanos & Amenazas', rewardCoins: 1800 },
  'pack-corr-stands': { title: 'Sobre Completo: Despertar de Stand', rewardCoins: 1650 },
  'pack-corr-tactics': { title: 'Sobre Completo: Fundación Speedwagon', rewardCoins: 500 },
};

function buildPackMilestone(pack: BoosterPackDef): MilestoneDef {
  const uniqueCards = Array.from(new Set(pack.poolCardIds));
  const meta = PACK_COMPLETION_REWARDS[pack.id];
  const fallbackCoins = 350 + uniqueCards.length * 40 + pack.chaseCardIds.length * 150;
  return {
    id: `milestone-${pack.id}`,
    title: meta?.title ?? `Sobre Completo: ${pack.name}`,
    description: `Consigue todas las ${uniqueCards.length} cartas distintas del sobre "${pack.name}".`,
    category: 'PACK_COMPLETION',
    badge: `SOBRE · ${pack.badge}`,
    accentHex: pack.accentHex,
    rewardCoins: meta?.rewardCoins ?? fallbackCoins,
    requiredCardIds: uniqueCards,
    packId: pack.id,
  };
}

export const PACK_COMPLETION_MILESTONES: MilestoneDef[] = BOOSTER_PACKS.map(buildPackMilestone);

export const CARD_SET_MILESTONES: MilestoneDef[] = [
  {
    id: 'milestone-set-phantom-blood-heroes',
    title: 'Sangre Fantasma',
    description: 'Reúne a Jonathan, Will A. Zeppeli, Speedwagon y la espada (P)luck.',
    category: 'CARD_SET',
    badge: 'PARTE 1',
    accentHex: '#2952d9',
    rewardCoins: 350,
    requiredCardIds: [
      'char-jonathan-joestar',
      'char-will-a-zeppeli',
      'char-robert-e-o-speedwagon',
      'item-pluck',
    ],
  },
  {
    id: 'milestone-set-hamon-warriors',
    title: 'Guerreros del Hamon',
    description: 'Reúne a Joseph, Caesar, Lisa Lisa y sus armas clásicas de Battle Tendency.',
    category: 'CARD_SET',
    badge: 'PARTE 2',
    accentHex: '#10b981',
    rewardCoins: 500,
    requiredCardIds: [
      'char-joseph-joestar',
      'char-caesar-zeppeli',
      'char-lisa-lisa',
      'item-cinta-de-caesar',
      'item-clackers',
    ],
  },
  {
    id: 'milestone-set-pillar-men',
    title: 'Los Hombres del Pilar',
    description: 'Despierta a Santana, Wamuu, Esidisi, Kars, Kars Definitivo y la Piedra Roja de Aja.',
    category: 'CARD_SET',
    badge: 'PARTE 2',
    accentHex: '#9333ea',
    rewardCoins: 950,
    requiredCardIds: [
      'char-santana',
      'char-wamuu',
      'char-esidisi',
      'char-kars',
      'evo-kars-ultimate',
      'item-piedra-roja-de-aja',
    ],
  },
  {
    id: 'milestone-set-stardust-crusaders',
    title: 'Stardust Crusaders',
    description: 'Reúne a los 6 Cruzados del viaje a Egipto: Jotaro, Joseph Viejo, Avdol, Kakyoin, Polnareff e Iggy.',
    category: 'CARD_SET',
    badge: 'PARTE 3',
    accentHex: '#f2c12e',
    rewardCoins: 850,
    requiredCardIds: [
      'char-jotaro-kujo',
      'char-joseph-joestar-viejo',
      'char-muhammad-avdol',
      'char-noriaki-kakyoin',
      'char-jean-pierre-polnareff',
      'char-iggy',
    ],
  },
  {
    id: 'milestone-set-crusaders-stands',
    title: 'Stands de los Cruzados',
    description: 'Consigue los 6 Stands del grupo Stardust Crusaders.',
    category: 'CARD_SET',
    badge: 'PARTE 3',
    accentHex: '#38bdf8',
    rewardCoins: 1000,
    requiredCardIds: [
      'stand-star-platinum',
      'stand-hermit-purple',
      'stand-magicians-red',
      'stand-hierophant-green',
      'stand-silver-chariot',
      'stand-the-fool',
    ],
  },
  {
    id: 'milestone-set-egypt-villains',
    title: 'La Mansión de DIO y Egipto',
    description: 'Reúne a los asesinos de DIO: Hol Horse, N\'Doul, Mariah, Pet Shop, Vanilla Ice, DIO y The World.',
    category: 'CARD_SET',
    badge: 'PARTE 3',
    accentHex: '#e6194b',
    rewardCoins: 1050,
    requiredCardIds: [
      'char-hol-horse',
      'char-n-doul',
      'char-mariah',
      'char-pet-shop',
      'char-vanilla-ice',
      'char-dio',
      'stand-the-world',
    ],
  },
  {
    id: 'milestone-set-cairo-duel',
    title: 'El Mismo Tipo de Stand',
    description: 'Completa el duelo legendario de El Cairo: Jotaro, Star Platinum, SP: The World, DIO y The World.',
    category: 'CARD_SET',
    badge: 'PARTE 3 · ÉPICO',
    accentHex: '#eab308',
    rewardCoins: 900,
    requiredCardIds: [
      'char-jotaro-kujo',
      'stand-star-platinum',
      'evo-star-platinum-the-world',
      'char-dio',
      'stand-the-world',
    ],
  },
  {
    id: 'milestone-set-morioh-heroes',
    title: 'Defensores de Morioh-cho',
    description: 'Reúne a Josuke, Okuyasu, Koichi, Rohan, Yukako y Shigekiyo.',
    category: 'CARD_SET',
    badge: 'PARTE 4',
    accentHex: '#ec4899',
    rewardCoins: 800,
    requiredCardIds: [
      'char-josuke-higashikata',
      'char-okuyasu-nijimura',
      'char-koichi-hirose',
      'char-rohan-kishibe',
      'char-yukako-yamagishi',
      'char-shigekiyo-yangu',
    ],
  },
  {
    id: 'milestone-set-morioh-stands',
    title: 'Stands de Morioh',
    description: 'Consigue Crazy Diamond, The Hand, Echoes Act 1, Heaven\'s Door, Love Deluxe y Harvest.',
    category: 'CARD_SET',
    badge: 'PARTE 4',
    accentHex: '#a855f7',
    rewardCoins: 950,
    requiredCardIds: [
      'stand-crazy-diamond',
      'stand-the-hand',
      'stand-echoes-act-1',
      'stand-heavens-door',
      'stand-love-deluxe',
      'stand-harvest',
    ],
  },
  {
    id: 'milestone-set-kira-trilogy',
    title: 'Una Vida Tranquila',
    description: 'Reúne a Yoshikage Kira, Killer Queen, Kosaku Kawajiri, Stray Cat y Bites The Dust.',
    category: 'CARD_SET',
    badge: 'PARTE 4 · ÉPICO',
    accentHex: '#d946ef',
    rewardCoins: 1150,
    requiredCardIds: [
      'char-yoshikage-kira',
      'stand-killer-queen',
      'evo-kosaku-kawajiri',
      'stand-stray-cat',
      'evo-killer-queen-bites-the-dust',
    ],
  },
  {
    id: 'milestone-set-joestar-bloodline',
    title: 'El Linaje Joestar',
    description: 'Reúne a todos los protagonistas JoJo del juego (de Jonathan a Josuke).',
    category: 'CARD_SET',
    badge: 'LINAJE',
    accentHex: '#f2c12e',
    rewardCoins: 750,
    requiredCardIds: [
      'char-jonathan-joestar',
      'char-joseph-joestar',
      'char-joseph-joestar-viejo',
      'char-jotaro-kujo',
      'char-josuke-higashikata',
    ],
  },
  {
    id: 'milestone-set-arrows-requiem',
    title: 'Despertar Réquiem',
    description: 'Reúne las Flechas de Stand y Réquiem junto a Polnareff, Silver Chariot y Silver Chariot Requiem.',
    category: 'CARD_SET',
    badge: 'PARTE 5 · RÉQUIEM',
    accentHex: '#f59e0b',
    rewardCoins: 700,
    requiredCardIds: [
      'item-flecha-de-stand',
      'item-flecha-requiem',
      'char-jean-pierre-polnareff',
      'stand-silver-chariot',
      'evo-silver-chariot-requiem',
    ],
  },
  {
    id: 'milestone-set-full-catalog',
    title: 'Coleccionista Bizarro Definitivo',
    description: 'Desbloquea el 100% de las cartas coleccionables del catálogo completo.',
    category: 'CARD_SET',
    badge: 'LEYENDA',
    accentHex: '#00e599',
    rewardCoins: 3000,
    requiredCardIds: Object.keys(CARD_RARITY_MAP),
  },
];

export const ALL_MILESTONES: MilestoneDef[] = [
  ...CARD_SET_MILESTONES,
  ...PACK_COMPLETION_MILESTONES,
];

export function getMilestoneById(milestoneId: string): MilestoneDef | undefined {
  return ALL_MILESTONES.find((m) => m.id === milestoneId);
}
