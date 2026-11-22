import type { AiDifficulty } from '../engine/ai/tacticalAi';

export interface CampaignStageDef {
  id: string;
  part: 1 | 2 | 3 | 4 | 5;
  stageNumber: number;
  title: string;
  location: string;
  storyText: string;
  opponentName: string;
  featuredCardId: string;
  difficulty: AiDifficulty;
  isBoss: boolean;
  opponentDeckIds: string[];
  /** Mandatory themed loaner deck for first clear (replay unlocks any player deck) */
  storyDeckName: string;
  storyDeckDescription: string;
  storyDeckIds: string[];
  /** One-time pickup rewards */
  rewardCoins: number;
  rewardPackId?: string;
  rewardPackCount?: number;
}

export interface CampaignPartDef {
  part: 1 | 2 | 3 | 4 | 5;
  name: string;
  subtitle: string;
  mapHeader: string;
  badge: string;
  accentHex: string;
  patternUrl: string;
  packId: string;
  available: boolean;
  stages: CampaignStageDef[];
}

function rep(id: string, count: number): string[] {
  return Array.from({ length: count }, () => id);
}

/**
 * Helper to build a strictly legal 46-card themed Campaign deck
 * (max 1 copy per character, max 3 copies per item, unlimited basic energies).
 */
function buildPart1Deck(
  characters: string[],
  items: string[],
  energies: [string, number][],
): string[] {
  const energyList = energies.flatMap(([id, n]) => rep(id, n));
  const combined = [...characters, ...items, ...energyList];
  if (combined.length < 46) {
    combined.push(...rep('energy-colorless', 46 - combined.length));
  }
  return combined.slice(0, 46);
}

// Progressive Part 1 Story Loaner Decks (used mandatorily until each stage is cleared once)
const STORY_DECK_EARLY_NAME = 'Linaje Joestar · Inicio (Campaña P1)';
const STORY_DECK_EARLY_DESC =
  'Mazo temático de Phantom Blood: Jonathan Joestar, Erina Pendleton, Speedwagon y Zeppeli con Hamon básico y Suministros Speedwagon.';
const STORY_DECK_EARLY_IDS = buildPart1Deck(
  [
    'char-jonathan-joestar',
    'char-erina-pendleton',
    'char-robert-e-o-speedwagon',
    'char-will-a-zeppeli',
  ],
  [
    ...rep('item-suministros-speedwagon', 2),
    ...rep('item-pluck', 2),
    'item-mascara-de-piedra',
    'item-muerte-de-danny',
  ],
  [
    ['energy-electric', 22],
    ['energy-colorless', 14],
  ],
);

const STORY_DECK_MID_NAME = 'Discípulo del Hamon (Campaña P1)';
const STORY_DECK_MID_DESC =
  'Jonathan, Erina, Zeppeli, Tonpetty, Dire, Straizo y Speedwagon entrenados en Hamon con (P)luck, Muerte de Danny, Máscara de Piedra y Suministros Speedwagon.';
const STORY_DECK_MID_IDS = buildPart1Deck(
  [
    'char-jonathan-joestar',
    'char-erina-pendleton',
    'char-will-a-zeppeli',
    'char-tonpetty',
    'char-dire',
    'char-straizo',
    'char-robert-e-o-speedwagon',
  ],
  [
    ...rep('item-suministros-speedwagon', 3),
    ...rep('item-pluck', 3),
    ...rep('item-mascara-de-piedra', 2),
    ...rep('item-muerte-de-danny', 2),
  ],
  [
    ['energy-electric', 23],
    ['energy-colorless', 6],
  ],
);

const STORY_DECK_FINALE_NAME = 'Espada (P)luck · Luz del Hamon (Campaña P1)';
const STORY_DECK_FINALE_DESC =
  'Mazo definitivo de los héroes de Phantom Blood: Jonathan, Erina, Zeppeli, Tonpetty, Dire, Straizo y Speedwagon armados al máximo contra Dio.';
const STORY_DECK_FINALE_IDS = buildPart1Deck(
  [
    'char-jonathan-joestar',
    'char-erina-pendleton',
    'char-will-a-zeppeli',
    'char-tonpetty',
    'char-dire',
    'char-straizo',
    'char-robert-e-o-speedwagon',
  ],
  [
    ...rep('item-pluck', 3),
    ...rep('item-mascara-de-piedra', 3),
    ...rep('item-suministros-speedwagon', 3),
    'item-ataud-de-dio',
  ],
  [
    ['energy-electric', 23],
    ['energy-colorless', 6],
  ],
);

const PART_1_STAGES: CampaignStageDef[] = [
  {
    id: 'p1-s1',
    part: 1,
    stageNumber: 1,
    title: 'El Invasor de la Mansión',
    location: 'Mansión Joestar · 1880',
    storyText:
      'Dio Brando llega a la finca de los Joestar decidido a arrebatarle todo a Jonathan. Supera tu primer enfrentamiento.',
    opponentName: 'Dio Brando (Juventud)',
    featuredCardId: 'char-dio-brando',
    difficulty: 'EASY',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-dio-brando', 'char-robert-e-o-speedwagon'],
      ['item-suministros-speedwagon'],
      [
        ['energy-water', 14],
        ['energy-electric', 12],
        ['energy-colorless', 11],
      ],
    ),
    storyDeckName: STORY_DECK_EARLY_NAME,
    storyDeckDescription: STORY_DECK_EARLY_DESC,
    storyDeckIds: STORY_DECK_EARLY_IDS,
    rewardCoins: 120,
  },
  {
    id: 'p1-s2',
    part: 1,
    stageNumber: 2,
    title: 'Emboscada en Calle Ogre',
    location: 'Calle Ogre · Londres',
    storyText:
      'En busca del antídoto para George Joestar, Jonathan se adentra en el barrio más peligroso de Londres y se topa con Speedwagon.',
    opponentName: 'Robert E.O. Speedwagon',
    featuredCardId: 'char-robert-e-o-speedwagon',
    difficulty: 'EASY',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-robert-e-o-speedwagon', 'char-jonathan-joestar'],
      [...rep('item-suministros-speedwagon', 2), 'item-pluck'],
      [
        ['energy-electric', 16],
        ['energy-colorless', 19],
      ],
    ),
    storyDeckName: STORY_DECK_EARLY_NAME,
    storyDeckDescription: STORY_DECK_EARLY_DESC,
    storyDeckIds: STORY_DECK_EARLY_IDS,
    rewardCoins: 140,
  },
  {
    id: 'p1-s3',
    part: 1,
    stageNumber: 3,
    title: 'El Secreto de la Máscara',
    location: 'Laboratorio de la Mansión',
    storyText:
      'La Máscara de Piedra despierta un poder antinatural al contacto con la sangre. Enfrenta su primer portador.',
    opponentName: 'Portador de la Máscara',
    featuredCardId: 'item-mascara-de-piedra',
    difficulty: 'EASY',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-dio-brando', 'char-robert-e-o-speedwagon'],
      [...rep('item-mascara-de-piedra', 2), ...rep('item-suministros-speedwagon', 2)],
      [
        ['energy-water', 15],
        ['energy-electric', 13],
        ['energy-colorless', 6],
      ],
    ),
    storyDeckName: STORY_DECK_EARLY_NAME,
    storyDeckDescription: STORY_DECK_EARLY_DESC,
    storyDeckIds: STORY_DECK_EARLY_IDS,
    rewardCoins: 160,
  },
  {
    id: 'p1-s4',
    part: 1,
    stageNumber: 4,
    title: 'La Respiración del Hamon',
    location: 'Ribera del Támesis',
    storyText:
      'El barón Will A. Zeppeli pone a prueba tu determinación con la energía solar del Hamon.',
    opponentName: 'Will A. Zeppeli',
    featuredCardId: 'char-will-a-zeppeli',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-will-a-zeppeli', 'char-tonpetty', 'char-jonathan-joestar', 'char-robert-e-o-speedwagon'],
      [...rep('item-suministros-speedwagon', 2), 'item-pluck'],
      [
        ['energy-electric', 24],
        ['energy-colorless', 15],
      ],
    ),
    storyDeckName: STORY_DECK_MID_NAME,
    storyDeckDescription: STORY_DECK_MID_DESC,
    storyDeckIds: STORY_DECK_MID_IDS,
    rewardCoins: 180,
  },
  {
    id: 'p1-s5',
    part: 1,
    stageNumber: 5,
    title: 'El Incendio de la Mansión Joestar',
    location: 'Mansión Joestar en Llamas',
    storyText:
      '¡JEFE INTERMEDIO! Dio rechaza su humanidad y se transforma en vampiro entre las llamas. Sobrevive a su furia congelante.',
    opponentName: 'Dio Brando · Vampiro',
    featuredCardId: 'char-dio-brando',
    difficulty: 'HARD',
    isBoss: true,
    opponentDeckIds: buildPart1Deck(
      ['char-dio-brando', 'char-robert-e-o-speedwagon', 'char-jonathan-joestar'],
      [
        ...rep('item-mascara-de-piedra', 3),
        ...rep('item-suministros-speedwagon', 3),
        ...rep('item-pluck', 2),
      ],
      [
        ['energy-electric', 16],
        ['energy-water', 13],
      ],
    ),
    storyDeckName: STORY_DECK_MID_NAME,
    storyDeckDescription: STORY_DECK_MID_DESC,
    storyDeckIds: STORY_DECK_MID_IDS,
    rewardCoins: 250,
    rewardPackId: 'pack-part-1',
    rewardPackCount: 1,
  },
  {
    id: 'p1-s6',
    part: 1,
    stageNumber: 6,
    title: 'Prueba del Vino y las Ondas',
    location: 'Colinas de Inglaterra',
    storyText:
      'Sin derramar una sola gota de vino, Jonathan demuestra su dominio del Sendō Hamon Overdrive.',
    opponentName: 'Jonathan Joestar (Hamon)',
    featuredCardId: 'char-jonathan-joestar',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-jonathan-joestar',
        'char-will-a-zeppeli',
        'char-tonpetty',
        'char-dire',
        'char-straizo',
        'char-erina-pendleton',
      ],
      [...rep('item-pluck', 2), ...rep('item-suministros-speedwagon', 2)],
      [
        ['energy-electric', 24],
        ['energy-colorless', 12],
      ],
    ),
    storyDeckName: STORY_DECK_MID_NAME,
    storyDeckDescription: STORY_DECK_MID_DESC,
    storyDeckIds: STORY_DECK_MID_IDS,
    rewardCoins: 200,
  },
  {
    id: 'p1-s7',
    part: 1,
    stageNumber: 7,
    title: 'El Túnel de Windknight’s Lot',
    location: 'Túnel hacia Windknight’s Lot',
    storyText:
      'La niebla envuelve el túnel donde acechan los sirvientes de Dio. Zeppeli y Speedwagon cubren la vanguardia.',
    opponentName: 'Vanguardia de Windknight’s Lot',
    featuredCardId: 'char-will-a-zeppeli',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-will-a-zeppeli', 'char-robert-e-o-speedwagon', 'char-dio-brando'],
      [...rep('item-mascara-de-piedra', 2), ...rep('item-suministros-speedwagon', 3)],
      [
        ['energy-electric', 17],
        ['energy-water', 11],
        ['energy-colorless', 4],
      ],
    ),
    storyDeckName: STORY_DECK_MID_NAME,
    storyDeckDescription: STORY_DECK_MID_DESC,
    storyDeckIds: STORY_DECK_MID_IDS,
    rewardCoins: 220,
  },
  {
    id: 'p1-s8',
    part: 1,
    stageNumber: 8,
    title: 'La Espada de la Suerte y el Valor',
    location: 'Ruinas de los Caballeros',
    storyText:
      'En las ruinas de Windknight’s Lot te aguarda Bruford, el noble caballero resucitado por Dio armado con la espada (P)luck y su Danse Macab-Hair.',
    opponentName: 'Bruford · Caballero Oscuro',
    featuredCardId: 'char-bruford',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-bruford',
        'char-tarkus',
        'char-dio-brando',
        'char-robert-e-o-speedwagon',
      ],
      [
        ...rep('item-pluck', 3),
        ...rep('item-mascara-de-piedra', 2),
        ...rep('item-suministros-speedwagon', 3),
      ],
      [
        ['energy-metal', 18],
        ['energy-electric', 9],
        ['energy-water', 7],
      ],
    ),
    storyDeckName: STORY_DECK_FINALE_NAME,
    storyDeckDescription: STORY_DECK_FINALE_DESC,
    storyDeckIds: STORY_DECK_FINALE_IDS,
    rewardCoins: 250,
  },
  {
    id: 'p1-s9',
    part: 1,
    stageNumber: 9,
    title: 'La Cadena de Tarkus en el Castillo',
    location: 'Castillo de Windknight’s Lot',
    storyText:
      'En la cámara de entrenamiento del castillo, Tarkus desata su Fuerza Sobrehumana junto a Bruford y la guardia oscura de Dio.',
    opponentName: 'Tarkus · Caballero Gigante',
    featuredCardId: 'char-tarkus',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-tarkus', 'char-bruford', 'char-dio-brando', 'char-robert-e-o-speedwagon'],
      [
        ...rep('item-mascara-de-piedra', 3),
        ...rep('item-pluck', 2),
        ...rep('item-suministros-speedwagon', 2),
        'item-ataud-de-dio',
      ],
      [
        ['energy-metal', 14],
        ['energy-electric', 11],
        ['energy-water', 9],
      ],
    ),
    storyDeckName: STORY_DECK_FINALE_NAME,
    storyDeckDescription: STORY_DECK_FINALE_DESC,
    storyDeckIds: STORY_DECK_FINALE_IDS,
    rewardCoins: 280,
  },
  {
    id: 'p1-s10',
    part: 1,
    stageNumber: 10,
    title: 'Destino en Alta Mar: Phantom Blood',
    location: 'Transatlántico rumbo a América',
    storyText:
      '¡JEFE FINAL DE LA PARTE 1! Lord Dio Brando desata todo el poder de Phantom Blood con su baraja completa de élite. ¡Derrótalo para llevarte 2 sobres de la Parte 1!',
    opponentName: 'Lord Dio Brando (Jefe Final)',
    featuredCardId: 'char-dio-brando',
    difficulty: 'HARD',
    isBoss: true,
    opponentDeckIds: buildPart1Deck(
      [
        'char-dio-brando',
        'char-bruford',
        'char-tarkus',
        'char-robert-e-o-speedwagon',
      ],
      [
        ...rep('item-mascara-de-piedra', 3),
        ...rep('item-pluck', 3),
        ...rep('item-suministros-speedwagon', 3),
        ...rep('item-ataud-de-dio', 2),
      ],
      [
        ['energy-electric', 13],
        ['energy-water', 10],
        ['energy-metal', 8],
      ],
    ),
    storyDeckName: STORY_DECK_FINALE_NAME,
    storyDeckDescription: STORY_DECK_FINALE_DESC,
    storyDeckIds: STORY_DECK_FINALE_IDS,
    rewardCoins: 450,
    rewardPackId: 'pack-part-1',
    rewardPackCount: 2,
  },
];

// ===================== PART 2: BATTLE TENDENCY STORY DECKS & STAGES =====================
const P2_STORY_EARLY_NAME = 'Trucos de Joseph (Campaña P2)';
const P2_STORY_EARLY_DESC =
  'Joseph Joestar, Stroheim y Lisa Lisa con Clackers, Cinta de Caesar y Suministros Speedwagon.';
const P2_STORY_EARLY_IDS = buildPart1Deck(
  ['char-joseph-joestar', 'char-rudol-von-stroheim', 'char-lisa-lisa'],
  [
    ...rep('item-clackers', 2),
    ...rep('item-cinta-de-caesar', 2),
    ...rep('item-suministros-speedwagon', 2),
  ],
  [
    ['energy-electric', 19],
    ['energy-light', 12],
  ],
);

const P2_STORY_MID_NAME = 'Entrenamiento de Venecia (Campaña P2)';
const P2_STORY_MID_DESC =
  'Dúo Hamon de Venecia: Joseph, Caesar y Lisa Lisa potenciados con Clackers y Cinta de Caesar.';
const P2_STORY_MID_IDS = buildPart1Deck(
  ['char-joseph-joestar', 'char-caesar-zeppeli', 'char-lisa-lisa'],
  [
    ...rep('item-clackers', 3),
    ...rep('item-cinta-de-caesar', 3),
    ...rep('item-suministros-speedwagon', 2),
  ],
  [
    ['energy-electric', 16],
    ['energy-water', 13],
  ],
);

const P2_STORY_FINALE_NAME = 'Alianza Final de Suiza (Campaña P2)';
const P2_STORY_FINALE_DESC =
  'Joseph, Caesar, Lisa Lisa y Stroheim armados con Clackers, Cinta de Caesar y la Piedra Roja de Aja contra los Hombres del Pilar.';
const P2_STORY_FINALE_IDS = buildPart1Deck(
  [
    'char-joseph-joestar',
    'char-caesar-zeppeli',
    'char-lisa-lisa',
    'char-rudol-von-stroheim',
  ],
  [
    ...rep('item-clackers', 3),
    ...rep('item-cinta-de-caesar', 3),
    ...rep('item-suministros-speedwagon', 3),
    ...rep('item-piedra-roja-de-aja', 2),
  ],
  [
    ['energy-electric', 14],
    ['energy-light', 11],
  ],
);

const PART_2_STAGES: CampaignStageDef[] = [
  {
    id: 'p2-s1',
    part: 2,
    stageNumber: 1,
    title: 'Infiltración en la Base de México',
    location: 'Desierto de México · 1938',
    storyText:
      'Para rescatar a Speedwagon, Joseph se infiltra en las instalaciones de Rudol Von Stroheim y prueba la ciencia alemana.',
    opponentName: 'Rudol Von Stroheim',
    featuredCardId: 'char-rudol-von-stroheim',
    difficulty: 'EASY',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-rudol-von-stroheim', 'char-santana'],
      [...rep('item-suministros-speedwagon', 2), 'item-mascara-de-piedra'],
      [
        ['energy-light', 20],
        ['energy-colorless', 15],
      ],
    ),
    storyDeckName: P2_STORY_EARLY_NAME,
    storyDeckDescription: P2_STORY_EARLY_DESC,
    storyDeckIds: P2_STORY_EARLY_IDS,
    rewardCoins: 140,
  },
  {
    id: 'p2-s2',
    part: 2,
    stageNumber: 2,
    title: 'El Despertar de Santana',
    location: 'Cámara Subterránea · México',
    storyText:
      'El primer Hombre del Pilar despierta y absorbe todo a su paso. Domina tu estrategia para frenar su regeneración.',
    opponentName: 'Santana',
    featuredCardId: 'char-santana',
    difficulty: 'EASY',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-santana', 'char-rudol-von-stroheim'],
      [...rep('item-mascara-de-piedra', 2), ...rep('item-suministros-speedwagon', 2)],
      [
        ['energy-light', 18],
        ['energy-colorless', 16],
      ],
    ),
    storyDeckName: P2_STORY_EARLY_NAME,
    storyDeckDescription: P2_STORY_EARLY_DESC,
    storyDeckIds: P2_STORY_EARLY_IDS,
    rewardCoins: 160,
  },
  {
    id: 'p2-s3',
    part: 2,
    stageNumber: 3,
    title: 'Choque de Linajes en Roma',
    location: 'Plaza de Roma · Italia',
    storyText:
      'Antes de unir fuerzas, Joseph y Caesar Zeppeli miden su orgullo y sus técnicas de Hamon en pleno corazón de Roma.',
    opponentName: 'Caesar Zeppeli',
    featuredCardId: 'char-caesar-zeppeli',
    difficulty: 'EASY',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-caesar-zeppeli', 'char-joseph-joestar'],
      [...rep('item-cinta-de-caesar', 2), ...rep('item-clackers', 2)],
      [
        ['energy-water', 17],
        ['energy-electric', 17],
      ],
    ),
    storyDeckName: P2_STORY_EARLY_NAME,
    storyDeckDescription: P2_STORY_EARLY_DESC,
    storyDeckIds: P2_STORY_EARLY_IDS,
    rewardCoins: 180,
  },
  {
    id: 'p2-s4',
    part: 2,
    stageNumber: 4,
    title: 'Las Catacumbas del Muro',
    location: 'Subsuelo de Roma',
    storyText:
      'Tres siluetas milenarias emergen de la piedra. Wamuu bloquea el paso con su dominio absoluto del viento.',
    opponentName: 'Wamuu (Despertar)',
    featuredCardId: 'char-wamuu',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-wamuu', 'char-santana'],
      [...rep('item-mascara-de-piedra', 2), ...rep('item-suministros-speedwagon', 2)],
      [
        ['energy-light', 16],
        ['energy-colorless', 18],
      ],
    ),
    storyDeckName: P2_STORY_MID_NAME,
    storyDeckDescription: P2_STORY_MID_DESC,
    storyDeckIds: P2_STORY_MID_IDS,
    rewardCoins: 200,
  },
  {
    id: 'p2-s5',
    part: 2,
    stageNumber: 5,
    title: 'El Coliseo: Los 3 Hombres del Pilar',
    location: 'Coliseo de Roma',
    storyText:
      '¡JEFE INTERMEDIO! Wamuu desata la Tormenta de Arena Divina junto a Esidisi y Santana. Resiste su embestida para ganar 1 Sobre de Parte 2.',
    opponentName: 'Wamuu · Guerrero del Viento',
    featuredCardId: 'char-wamuu',
    difficulty: 'HARD',
    isBoss: true,
    opponentDeckIds: buildPart1Deck(
      ['char-wamuu', 'char-esidisi', 'char-santana'],
      [
        ...rep('item-mascara-de-piedra', 3),
        ...rep('item-piedra-roja-de-aja', 2),
        ...rep('item-suministros-speedwagon', 3),
      ],
      [
        ['energy-fire', 15],
        ['energy-colorless', 14],
      ],
    ),
    storyDeckName: P2_STORY_MID_NAME,
    storyDeckDescription: P2_STORY_MID_DESC,
    storyDeckIds: P2_STORY_MID_IDS,
    rewardCoins: 280,
    rewardPackId: 'pack-part-2',
    rewardPackCount: 1,
  },
  {
    id: 'p2-s6',
    part: 2,
    stageNumber: 6,
    title: 'La Torre del Infierno',
    location: 'Isla Air Supplena · Venecia',
    storyText:
      'La maestra Lisa Lisa somete a Joseph y Caesar a la prueba definitiva del pilar aceitado para perfeccionar el Hamon.',
    opponentName: 'Lisa Lisa · Maestra Hamon',
    featuredCardId: 'char-lisa-lisa',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-lisa-lisa', 'char-caesar-zeppeli', 'char-joseph-joestar'],
      [
        ...rep('item-clackers', 2),
        ...rep('item-cinta-de-caesar', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-electric', 18],
        ['energy-water', 13],
      ],
    ),
    storyDeckName: P2_STORY_MID_NAME,
    storyDeckDescription: P2_STORY_MID_DESC,
    storyDeckIds: P2_STORY_MID_IDS,
    rewardCoins: 220,
  },
  {
    id: 'p2-s7',
    part: 2,
    stageNumber: 7,
    title: 'Sangre Hirviendo en la Isla',
    location: 'Air Supplena · Noche',
    storyText:
      'Esidisi se infiltra en busca de la Piedra Roja de Aja y hace hervir el campo de batalla con su Modo Llama.',
    opponentName: 'Esidisi · Rey de la Llama',
    featuredCardId: 'char-esidisi',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-esidisi', 'char-santana', 'char-wamuu'],
      [
        ...rep('item-piedra-roja-de-aja', 2),
        ...rep('item-mascara-de-piedra', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-fire', 19],
        ['energy-colorless', 12],
      ],
    ),
    storyDeckName: P2_STORY_MID_NAME,
    storyDeckDescription: P2_STORY_MID_DESC,
    storyDeckIds: P2_STORY_MID_IDS,
    rewardCoins: 240,
  },
  {
    id: 'p2-s8',
    part: 2,
    stageNumber: 8,
    title: 'Emboscada en St. Moritz',
    location: 'Hotel Abandonado · Suiza',
    storyText:
      'Entre la nieve alpina, Kars revela sus Cuchillas de Luz y un intelecto implacable por la Piedra Roja de Aja.',
    opponentName: 'Kars · Modo Luz',
    featuredCardId: 'char-kars',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-kars', 'char-santana', 'char-rudol-von-stroheim'],
      [
        ...rep('item-mascara-de-piedra', 2),
        ...rep('item-piedra-roja-de-aja', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-light', 21],
        ['energy-colorless', 10],
      ],
    ),
    storyDeckName: P2_STORY_FINALE_NAME,
    storyDeckDescription: P2_STORY_FINALE_DESC,
    storyDeckIds: P2_STORY_FINALE_IDS,
    rewardCoins: 260,
  },
  {
    id: 'p2-s9',
    part: 2,
    stageNumber: 9,
    title: 'Duelo de Carros en el Coliseo de Esqueletos',
    location: 'Arena Alpina · Suiza',
    storyText:
      'En honor a Caesar, Joseph acepta el duelo de carros contra Wamuu en un choque decisivo a toda velocidad.',
    opponentName: 'Wamuu · Modo Final',
    featuredCardId: 'char-wamuu',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-wamuu', 'char-esidisi', 'char-kars'],
      [
        ...rep('item-mascara-de-piedra', 3),
        ...rep('item-piedra-roja-de-aja', 2),
        ...rep('item-suministros-speedwagon', 3),
      ],
      [
        ['energy-light', 16],
        ['energy-fire', 13],
      ],
    ),
    storyDeckName: P2_STORY_FINALE_NAME,
    storyDeckDescription: P2_STORY_FINALE_DESC,
    storyDeckIds: P2_STORY_FINALE_IDS,
    rewardCoins: 300,
  },
  {
    id: 'p2-s10',
    part: 2,
    stageNumber: 10,
    title: 'El Ser Definitivo en el Volcán',
    location: 'Isla de Vulcano · Italia',
    storyText:
      '¡JEFE FINAL DE LA PARTE 2! Kars combina la Máscara de Piedra y la Piedra Roja de Aja para evolucionar a la Forma de Vida Definitiva. ¡Derrótalo y llévate 2 Sobres de Parte 2!',
    opponentName: 'Kars · Forma de Vida Definitiva',
    featuredCardId: 'evo-kars-ultimate',
    difficulty: 'HARD',
    isBoss: true,
    opponentDeckIds: buildPart1Deck(
      ['char-kars', 'char-wamuu', 'char-esidisi', 'char-santana', 'evo-kars-ultimate'],
      [
        ...rep('item-mascara-de-piedra', 3),
        ...rep('item-piedra-roja-de-aja', 3),
        ...rep('item-suministros-speedwagon', 3),
      ],
      [
        ['energy-light', 16],
        ['energy-fire', 10],
      ],
    ),
    storyDeckName: P2_STORY_FINALE_NAME,
    storyDeckDescription: P2_STORY_FINALE_DESC,
    storyDeckIds: P2_STORY_FINALE_IDS,
    rewardCoins: 500,
    rewardPackId: 'pack-part-2',
    rewardPackCount: 2,
  },
];

// ===================== PART 3: STARDUST CRUSADERS STORY DECKS & STAGES =====================
const P3_STORY_EARLY_NAME = 'Despertar en Tokio (Campaña P3)';
const P3_STORY_EARLY_DESC =
  'Jotaro, Joseph Viejo, Avdol, Kakyoin e Iggy con sus Stands iniciales en el comienzo del viaje a Egipto.';
const P3_STORY_EARLY_IDS = buildPart1Deck(
  [
    'char-iggy',
    'char-muhammad-avdol',
    'char-noriaki-kakyoin',
    'char-joseph-joestar-viejo',
    'char-jotaro-kujo',
    'stand-the-fool',
    'stand-hermit-purple',
    'stand-magicians-red',
    'stand-hierophant-green',
    'stand-star-platinum',
  ],
  [
    ...rep('item-atraccion-usuarios-stand', 3),
    ...rep('item-flecha-de-stand', 2),
    ...rep('item-suministros-speedwagon', 3),
  ],
  [
    ['energy-psychic', 11],
    ['energy-fire', 7],
    ['energy-light', 4],
  ],
);

const P3_STORY_MID_NAME = 'Ruta a Egipto (Campaña P3)';
const P3_STORY_MID_DESC =
  'Los 6 Stardust Crusaders al completo: Jotaro, Polnareff, Kakyoin, Avdol, Joseph e Iggy listos para cruzar el desierto.';
const P3_STORY_MID_IDS = buildPart1Deck(
  [
    'char-iggy',
    'char-jean-pierre-polnareff',
    'char-noriaki-kakyoin',
    'char-muhammad-avdol',
    'char-joseph-joestar-viejo',
    'char-jotaro-kujo',
    'stand-the-fool',
    'stand-hermit-purple',
    'stand-silver-chariot',
    'stand-hierophant-green',
    'stand-magicians-red',
    'stand-star-platinum',
  ],
  [
    ...rep('item-atraccion-usuarios-stand', 3),
    ...rep('item-flecha-de-stand', 2),
    ...rep('item-suministros-speedwagon', 3),
  ],
  [
    ['energy-psychic', 10],
    ['energy-fire', 6],
    ['energy-light', 4],
  ],
);

const P3_STORY_FINALE_NAME = 'Stardust Crusaders · El Cairo Final (Campaña P3)';
const P3_STORY_FINALE_DESC =
  'El equipo definitivo de los Crusaders con Star Platinum: The World para enfrentarse a los asesinos finales y a DIO.';
const P3_STORY_FINALE_IDS = buildPart1Deck(
  [
    'char-iggy',
    'char-jean-pierre-polnareff',
    'char-noriaki-kakyoin',
    'char-muhammad-avdol',
    'char-joseph-joestar-viejo',
    'char-jotaro-kujo',
    'stand-the-fool',
    'stand-hermit-purple',
    'stand-silver-chariot',
    'stand-hierophant-green',
    'stand-magicians-red',
    'stand-star-platinum',
    'evo-star-platinum-the-world',
  ],
  [
    ...rep('item-atraccion-usuarios-stand', 3),
    ...rep('item-flecha-de-stand', 2),
    ...rep('item-suministros-speedwagon', 3),
  ],
  [
    ['energy-psychic', 11],
    ['energy-fire', 5],
    ['energy-light', 3],
  ],
);

const PART_3_STAGES: CampaignStageDef[] = [
  {
    id: 'p3-s1',
    part: 3,
    stageNumber: 1,
    title: 'La Celda de Tokio',
    location: 'Comisaría de Tokio · 1988',
    storyText:
      'Jotaro cree estar poseído por un espíritu maligno. Muhammad Avdol invoca a Magician’s Red para demostrarle qué es un Stand.',
    opponentName: 'Muhammad Avdol',
    featuredCardId: 'stand-magicians-red',
    difficulty: 'EASY',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-iggy',
        'char-muhammad-avdol',
        'char-joseph-joestar-viejo',
        'stand-the-fool',
        'stand-hermit-purple',
        'stand-magicians-red',
      ],
      [...rep('item-atraccion-usuarios-stand', 2), ...rep('item-suministros-speedwagon', 2)],
      [
        ['energy-fire', 14],
        ['energy-psychic', 10],
        ['energy-light', 6],
      ],
    ),
    storyDeckName: P3_STORY_EARLY_NAME,
    storyDeckDescription: P3_STORY_EARLY_DESC,
    storyDeckIds: P3_STORY_EARLY_IDS,
    rewardCoins: 160,
  },
  {
    id: 'p3-s2',
    part: 3,
    stageNumber: 2,
    title: 'Emboscada en el Instituto',
    location: 'Instituto de Tokio',
    storyText:
      'Bajo el brote de carne de DIO, Noriaki Kakyoin despliega a Hierophant Green y bloquea la banca rival a larga distancia.',
    opponentName: 'Noriaki Kakyoin',
    featuredCardId: 'char-noriaki-kakyoin',
    difficulty: 'EASY',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-hol-horse',
        'char-noriaki-kakyoin',
        'char-mariah',
        'stand-emperor',
        'stand-bastet',
        'stand-hierophant-green',
      ],
      [...rep('item-atraccion-usuarios-stand', 2), ...rep('item-suministros-speedwagon', 2)],
      [
        ['energy-psychic', 18],
        ['energy-colorless', 12],
      ],
    ),
    storyDeckName: P3_STORY_EARLY_NAME,
    storyDeckDescription: P3_STORY_EARLY_DESC,
    storyDeckIds: P3_STORY_EARLY_IDS,
    rewardCoins: 180,
  },
  {
    id: 'p3-s3',
    part: 3,
    stageNumber: 3,
    title: 'Duelo de Caballeros en Hong Kong',
    location: 'Parque de Hong Kong',
    storyText:
      'Jean Pierre Polnareff reta a los Crusaders con el estoque relámpago de Silver Chariot.',
    opponentName: 'Jean Pierre Polnareff',
    featuredCardId: 'char-jean-pierre-polnareff',
    difficulty: 'EASY',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-iggy',
        'char-jean-pierre-polnareff',
        'char-hol-horse',
        'stand-the-fool',
        'stand-emperor',
        'stand-silver-chariot',
      ],
      [...rep('item-atraccion-usuarios-stand', 2), ...rep('item-flecha-de-stand', 2), ...rep('item-suministros-speedwagon', 2)],
      [
        ['energy-psychic', 16],
        ['energy-light', 12],
      ],
    ),
    storyDeckName: P3_STORY_EARLY_NAME,
    storyDeckDescription: P3_STORY_EARLY_DESC,
    storyDeckIds: P3_STORY_EARLY_IDS,
    rewardCoins: 200,
  },
  {
    id: 'p3-s4',
    part: 3,
    stageNumber: 4,
    title: 'Pistolero en Calcuta',
    location: 'Calles de Calcuta · India',
    storyText:
      'Hol Horse dispara las balas dirigidas de Emperor buscando golpear primero con Lucky Shot.',
    opponentName: 'Hol Horse · Emperor',
    featuredCardId: 'char-hol-horse',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-hol-horse',
        'char-mariah',
        'char-n-doul',
        'stand-emperor',
        'stand-bastet',
        'stand-geb',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 3),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-psychic', 14],
        ['energy-water', 13],
      ],
    ),
    storyDeckName: P3_STORY_MID_NAME,
    storyDeckDescription: P3_STORY_MID_DESC,
    storyDeckIds: P3_STORY_MID_IDS,
    rewardCoins: 220,
  },
  {
    id: 'p3-s5',
    part: 3,
    stageNumber: 5,
    title: 'El Desierto de Asuán: Geb',
    location: 'Desierto de Egipto',
    storyText:
      '¡JEFE INTERMEDIO! El asesino ciego N’Doul controla el agua letal de Geb a kilómetros de distancia. Derrótalo para ganar 1 Sobre de Parte 3.',
    opponentName: 'N’Doul · Geb (Jefe)',
    featuredCardId: 'char-n-doul',
    difficulty: 'HARD',
    isBoss: true,
    opponentDeckIds: buildPart1Deck(
      [
        'char-n-doul',
        'char-pet-shop',
        'char-hol-horse',
        'char-mariah',
        'stand-geb',
        'stand-horus',
        'stand-emperor',
        'stand-bastet',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 3),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-suministros-speedwagon', 3),
      ],
      [
        ['energy-water', 16],
        ['energy-psychic', 8],
      ],
    ),
    storyDeckName: P3_STORY_MID_NAME,
    storyDeckDescription: P3_STORY_MID_DESC,
    storyDeckIds: P3_STORY_MID_IDS,
    rewardCoins: 320,
    rewardPackId: 'pack-part-3',
    rewardPackCount: 1,
  },
  {
    id: 'p3-s6',
    part: 3,
    stageNumber: 6,
    title: 'Trampa Magnética en Luxor',
    location: 'Estación de Luxor · Egipto',
    storyText:
      'Mariah activa el enchufe de Bastet convirtiendo todo metal cercano en proyectiles que provocan sangrado.',
    opponentName: 'Mariah · Bastet',
    featuredCardId: 'char-mariah',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-mariah',
        'char-hol-horse',
        'char-n-doul',
        'stand-bastet',
        'stand-emperor',
        'stand-geb',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 3),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-psychic', 16],
        ['energy-water', 11],
      ],
    ),
    storyDeckName: P3_STORY_MID_NAME,
    storyDeckDescription: P3_STORY_MID_DESC,
    storyDeckIds: P3_STORY_MID_IDS,
    rewardCoins: 240,
  },
  {
    id: 'p3-s7',
    part: 3,
    stageNumber: 7,
    title: 'Cacería en las Calles de El Cairo',
    location: 'Mercado de El Cairo',
    storyText:
      'Los mercenarios de DIO estrechan el cerco en la capital egipcia combinando fuego cruzado y trampas de Stand.',
    opponentName: 'Escuadrón de los 9 Dioses',
    featuredCardId: 'stand-emperor',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-hol-horse',
        'char-mariah',
        'char-n-doul',
        'char-pet-shop',
        'stand-emperor',
        'stand-bastet',
        'stand-geb',
        'stand-horus',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 3),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-water', 14],
        ['energy-psychic', 11],
      ],
    ),
    storyDeckName: P3_STORY_MID_NAME,
    storyDeckDescription: P3_STORY_MID_DESC,
    storyDeckIds: P3_STORY_MID_IDS,
    rewardCoins: 260,
  },
  {
    id: 'p3-s8',
    part: 3,
    stageNumber: 8,
    title: 'El Guardián Alado de la Mansión',
    location: 'Muros de la Mansión de DIO',
    storyText:
      'Pet Shop congela el aire con Horus y vigila el cielo con Reconocimiento Aéreo. Supera su lluvia de estalactitas.',
    opponentName: 'Pet Shop · Horus',
    featuredCardId: 'char-pet-shop',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-pet-shop',
        'char-n-doul',
        'char-mariah',
        'char-hol-horse',
        'stand-horus',
        'stand-geb',
        'stand-bastet',
        'stand-emperor',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 3),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-suministros-speedwagon', 3),
      ],
      [
        ['energy-water', 17],
        ['energy-psychic', 7],
      ],
    ),
    storyDeckName: P3_STORY_FINALE_NAME,
    storyDeckDescription: P3_STORY_FINALE_DESC,
    storyDeckIds: P3_STORY_FINALE_IDS,
    rewardCoins: 290,
  },
  {
    id: 'p3-s9',
    part: 3,
    stageNumber: 9,
    title: 'El Vacío Devorador: Cream',
    location: 'Salón de la Mansión de DIO',
    storyText:
      'El fiel devoto Vanilla Ice borra todo rastro de materia con la Esfera del Vacío de Cream.',
    opponentName: 'Vanilla Ice · Cream',
    featuredCardId: 'char-vanilla-ice',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-vanilla-ice',
        'char-mariah',
        'char-hol-horse',
        'char-pet-shop',
        'stand-cream',
        'stand-bastet',
        'stand-emperor',
        'stand-horus',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 3),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-suministros-speedwagon', 3),
      ],
      [
        ['energy-psychic', 16],
        ['energy-water', 8],
      ],
    ),
    storyDeckName: P3_STORY_FINALE_NAME,
    storyDeckDescription: P3_STORY_FINALE_DESC,
    storyDeckIds: P3_STORY_FINALE_IDS,
    rewardCoins: 330,
  },
  {
    id: 'p3-s10',
    part: 3,
    stageNumber: 10,
    title: 'El Mundo de DIO: Za Warudo',
    location: 'Puente de El Cairo · Medianoche',
    storyText:
      '¡JEFE FINAL DE LA PARTE 3! DIO detiene el tiempo con The World respaldado por Vanilla Ice y los asesinos de Egipto. ¡Véncelo para ganar 2 Sobres de Parte 3!',
    opponentName: 'DIO · The World (Jefe Final)',
    featuredCardId: 'char-dio',
    difficulty: 'HARD',
    isBoss: true,
    opponentDeckIds: buildPart1Deck(
      [
        'char-dio',
        'char-vanilla-ice',
        'char-pet-shop',
        'char-hol-horse',
        'char-mariah',
        'stand-the-world',
        'stand-cream',
        'stand-horus',
        'stand-emperor',
        'stand-bastet',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 3),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-suministros-speedwagon', 3),
      ],
      [
        ['energy-psychic', 15],
        ['energy-water', 7],
      ],
    ),
    storyDeckName: P3_STORY_FINALE_NAME,
    storyDeckDescription: P3_STORY_FINALE_DESC,
    storyDeckIds: P3_STORY_FINALE_IDS,
    rewardCoins: 550,
    rewardPackId: 'pack-part-3',
    rewardPackCount: 2,
  },
];

// ===================== PART 4: DIAMOND IS UNBREAKABLE STORY DECKS & STAGES =====================
const P4_STORY_EARLY_NAME = 'Amigos de Morioh (Campaña P4)';
const P4_STORY_EARLY_DESC =
  'Josuke, Okuyasu, Koichi y Shigechi con Crazy Diamond, The Hand, Echoes Act 1, Harvest y Comida de Tonio.';
const P4_STORY_EARLY_IDS = buildPart1Deck(
  [
    'char-shigekiyo-yangu',
    'char-okuyasu-nijimura',
    'char-koichi-hirose',
    'char-josuke-higashikata',
    'stand-harvest',
    'stand-the-hand',
    'stand-echoes-act-1',
    'stand-crazy-diamond',
  ],
  [
    ...rep('item-atraccion-usuarios-stand', 3),
    ...rep('item-flecha-de-stand', 2),
    ...rep('item-comida-de-tonio', 3),
    ...rep('item-suministros-speedwagon', 2),
  ],
  [
    ['energy-psychic', 15],
    ['energy-nature', 7],
  ],
);

const P4_STORY_MID_NAME = 'Defensores de Morioh (Campaña P4)';
const P4_STORY_MID_DESC =
  'Los aliados de Morioh al completo: Josuke, Okuyasu, Koichi, Rohan, Yukako y Shigechi investigando la ciudad.';
const P4_STORY_MID_IDS = buildPart1Deck(
  [
    'char-shigekiyo-yangu',
    'char-okuyasu-nijimura',
    'char-koichi-hirose',
    'char-rohan-kishibe',
    'char-yukako-yamagishi',
    'char-josuke-higashikata',
    'stand-harvest',
    'stand-the-hand',
    'stand-echoes-act-1',
    'stand-heavens-door',
    'stand-love-deluxe',
    'stand-crazy-diamond',
  ],
  [
    ...rep('item-atraccion-usuarios-stand', 3),
    ...rep('item-flecha-de-stand', 2),
    ...rep('item-comida-de-tonio', 2),
    ...rep('item-suministros-speedwagon', 2),
  ],
  [
    ['energy-psychic', 13],
    ['energy-nature', 6],
  ],
);

const P4_STORY_FINALE_NAME = 'Corazón Dorado de Morioh (Campaña P4)';
const P4_STORY_FINALE_DESC =
  'Equipo definitivo de Morioh-cho equipado con curación de Tonio, buscadores de Stand y toda la fuerza de Crazy Diamond.';
const P4_STORY_FINALE_IDS = buildPart1Deck(
  [
    'char-shigekiyo-yangu',
    'char-okuyasu-nijimura',
    'char-koichi-hirose',
    'char-rohan-kishibe',
    'char-yukako-yamagishi',
    'char-josuke-higashikata',
    'stand-harvest',
    'stand-stray-cat',
    'stand-the-hand',
    'stand-echoes-act-1',
    'stand-heavens-door',
    'stand-love-deluxe',
    'stand-crazy-diamond',
  ],
  [
    ...rep('item-atraccion-usuarios-stand', 3),
    ...rep('item-flecha-de-stand', 2),
    ...rep('item-comida-de-tonio', 3),
    ...rep('item-suministros-speedwagon', 2),
  ],
  [
    ['energy-psychic', 12],
    ['energy-nature', 5],
  ],
);

const PART_4_STAGES: CampaignStageDef[] = [
  {
    id: 'p4-s1',
    part: 4,
    stageNumber: 1,
    title: 'La Casa de los Nijimura',
    location: 'Barrio de los Nijimura · Morioh 1999',
    storyText:
      'Okuyasu defiende la entrada de la casa familiar borrando el espacio mismo con el poder de The Hand.',
    opponentName: 'Okuyasu Nijimura · The Hand',
    featuredCardId: 'char-okuyasu-nijimura',
    difficulty: 'EASY',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-shigekiyo-yangu',
        'char-okuyasu-nijimura',
        'stand-harvest',
        'stand-the-hand',
        'stand-stray-cat',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 2),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-comida-de-tonio', 2),
      ],
      [
        ['energy-psychic', 20],
        ['energy-colorless', 9],
      ],
    ),
    storyDeckName: P4_STORY_EARLY_NAME,
    storyDeckDescription: P4_STORY_EARLY_DESC,
    storyDeckIds: P4_STORY_EARLY_IDS,
    rewardCoins: 170,
  },
  {
    id: 'p4-s2',
    part: 4,
    stageNumber: 2,
    title: 'El Despertar de Echoes',
    location: 'Instituto Budogaoka · Morioh',
    storyText:
      'Atravesado por la Flecha, Koichi despierta a Echoes Act 1 e inunda el combate de onomatopeyas.',
    opponentName: 'Koichi Hirose · Echoes',
    featuredCardId: 'char-koichi-hirose',
    difficulty: 'EASY',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-shigekiyo-yangu',
        'char-koichi-hirose',
        'char-okuyasu-nijimura',
        'stand-harvest',
        'stand-echoes-act-1',
        'stand-the-hand',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 2),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-comida-de-tonio', 2),
      ],
      [
        ['energy-psychic', 18],
        ['energy-colorless', 10],
      ],
    ),
    storyDeckName: P4_STORY_EARLY_NAME,
    storyDeckDescription: P4_STORY_EARLY_DESC,
    storyDeckIds: P4_STORY_EARLY_IDS,
    rewardCoins: 190,
  },
  {
    id: 'p4-s3',
    part: 4,
    stageNumber: 3,
    title: 'Obsesión en el Cabo Boing-Boing',
    location: 'Villa Costera · Morioh',
    storyText:
      'Yukako Yamagishi no dejará escapar a Koichi y atrapa a sus rivales con los cabellos de Love Deluxe.',
    opponentName: 'Yukako Yamagishi · Love Deluxe',
    featuredCardId: 'char-yukako-yamagishi',
    difficulty: 'EASY',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-shigekiyo-yangu',
        'char-yukako-yamagishi',
        'char-koichi-hirose',
        'stand-harvest',
        'stand-love-deluxe',
        'stand-echoes-act-1',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 2),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-comida-de-tonio', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-psychic', 16],
        ['energy-colorless', 10],
      ],
    ),
    storyDeckName: P4_STORY_EARLY_NAME,
    storyDeckDescription: P4_STORY_EARLY_DESC,
    storyDeckIds: P4_STORY_EARLY_IDS,
    rewardCoins: 210,
  },
  {
    id: 'p4-s4',
    part: 4,
    stageNumber: 4,
    title: 'El Estudio del Mangaka',
    location: 'Casa de Rohan Kishibe',
    storyText:
      'Rohan lee tu mano al instante al entrar al campo y convierte a sus rivales en páginas con Heaven’s Door.',
    opponentName: 'Rohan Kishibe · Heaven’s Door',
    featuredCardId: 'char-rohan-kishibe',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-shigekiyo-yangu',
        'char-rohan-kishibe',
        'char-koichi-hirose',
        'stand-harvest',
        'stand-heavens-door',
        'stand-echoes-act-1',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 3),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-comida-de-tonio', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-psychic', 20],
        ['energy-colorless', 5],
      ],
    ),
    storyDeckName: P4_STORY_MID_NAME,
    storyDeckDescription: P4_STORY_MID_DESC,
    storyDeckIds: P4_STORY_MID_IDS,
    rewardCoins: 230,
  },
  {
    id: 'p4-s5',
    part: 4,
    stageNumber: 5,
    title: 'El Puerto de Morioh: Red Hot Chili Pepper',
    location: 'Muelle Eléctrico de Morioh',
    storyText:
      '¡JEFE INTERMEDIO! Akira Otoishi absorbe toda la red eléctrica de Morioh para desatar el voltaje de Red Hot Chili Pepper. ¡Derrótalo para ganar 1 Sobre de Parte 4!',
    opponentName: 'Akira Otoishi · Chili Pepper (Jefe)',
    featuredCardId: 'char-akira-otoishi',
    difficulty: 'HARD',
    isBoss: true,
    opponentDeckIds: buildPart1Deck(
      [
        'char-akira-otoishi',
        'char-shigekiyo-yangu',
        'char-okuyasu-nijimura',
        'char-rohan-kishibe',
        'stand-red-hot-chilli-pepper',
        'stand-harvest',
        'stand-stray-cat',
        'stand-the-hand',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 3),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-comida-de-tonio', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-electric', 14],
        ['energy-psychic', 9],
      ],
    ),
    storyDeckName: P4_STORY_MID_NAME,
    storyDeckDescription: P4_STORY_MID_DESC,
    storyDeckIds: P4_STORY_MID_IDS,
    rewardCoins: 340,
    rewardPackId: 'pack-part-4',
    rewardPackCount: 1,
  },
  {
    id: 'p4-s6',
    part: 4,
    stageNumber: 6,
    title: 'La Horda de la Estación',
    location: 'Estación de Morioh',
    storyText:
      'Shigechi despliega a sus cientos de Harvest en busca de fortuna y recursos por toda la ciudad.',
    opponentName: 'Shigekiyo Yangu · Harvest',
    featuredCardId: 'char-shigekiyo-yangu',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-shigekiyo-yangu',
        'char-okuyasu-nijimura',
        'char-yukako-yamagishi',
        'stand-harvest',
        'stand-stray-cat',
        'stand-the-hand',
        'stand-love-deluxe',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 3),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-comida-de-tonio', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-psychic', 19],
        ['energy-colorless', 5],
      ],
    ),
    storyDeckName: P4_STORY_MID_NAME,
    storyDeckDescription: P4_STORY_MID_DESC,
    storyDeckIds: P4_STORY_MID_IDS,
    rewardCoins: 250,
  },
  {
    id: 'p4-s7',
    part: 4,
    stageNumber: 7,
    title: 'El Secreto de la Bolsa de Pan',
    location: 'Panadería St. Gentleman · Morioh',
    storyText:
      'Alguien que solo desea vivir una vida tranquila oculta un secreto mortal. Yoshikage Kira entra en escena.',
    opponentName: 'Yoshikage Kira',
    featuredCardId: 'char-yoshikage-kira',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-yoshikage-kira',
        'char-shigekiyo-yangu',
        'char-akira-otoishi',
        'stand-killer-queen',
        'stand-harvest',
        'stand-stray-cat',
        'stand-red-hot-chilli-pepper',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 3),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-comida-de-tonio', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-fire', 13],
        ['energy-electric', 11],
      ],
    ),
    storyDeckName: P4_STORY_MID_NAME,
    storyDeckDescription: P4_STORY_MID_DESC,
    storyDeckIds: P4_STORY_MID_IDS,
    rewardCoins: 280,
  },
  {
    id: 'p4-s8',
    part: 4,
    stageNumber: 8,
    title: 'La Sastrería Centipede: Sheer Heart Attack',
    location: 'Tienda de Zapatos Centipede',
    storyText:
      'La segunda bomba de Killer Queen no tiene debilidades: Sheer Heart Attack persigue el calor sin descanso.',
    opponentName: 'Yoshikage Kira · Killer Queen',
    featuredCardId: 'stand-killer-queen',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-yoshikage-kira',
        'char-shigekiyo-yangu',
        'char-rohan-kishibe',
        'char-akira-otoishi',
        'stand-killer-queen',
        'stand-stray-cat',
        'stand-harvest',
        'stand-heavens-door',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 3),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-comida-de-tonio', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-fire', 14],
        ['energy-psychic', 9],
      ],
    ),
    storyDeckName: P4_STORY_FINALE_NAME,
    storyDeckDescription: P4_STORY_FINALE_DESC,
    storyDeckIds: P4_STORY_FINALE_IDS,
    rewardCoins: 310,
  },
  {
    id: 'p4-s9',
    part: 4,
    stageNumber: 9,
    title: 'Identidad Robada: Kosaku Kawajiri',
    location: 'Residencia Kawajiri · Morioh',
    storyText:
      'Oculto bajo el rostro de Kosaku Kawajiri y aliado con las burbujas de aire de Stray Cat, el asesino acecha en casa.',
    opponentName: 'Kosaku Kawajiri & Stray Cat',
    featuredCardId: 'evo-kosaku-kawajiri',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      [
        'char-yoshikage-kira',
        'evo-kosaku-kawajiri',
        'char-shigekiyo-yangu',
        'char-akira-otoishi',
        'char-rohan-kishibe',
        'stand-killer-queen',
        'stand-stray-cat',
        'stand-harvest',
        'stand-heavens-door',
      ],
      [
        ...rep('item-atraccion-usuarios-stand', 3),
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-comida-de-tonio', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-fire', 13],
        ['energy-psychic', 9],
      ],
    ),
    storyDeckName: P4_STORY_FINALE_NAME,
    storyDeckDescription: P4_STORY_FINALE_DESC,
    storyDeckIds: P4_STORY_FINALE_IDS,
    rewardCoins: 350,
  },
  {
    id: 'p4-s10',
    part: 4,
    stageNumber: 10,
    title: 'Mañana Eterna: Bites The Dust',
    location: 'Calles de Morioh · Amanecer',
    storyText:
      '¡JEFE FINAL DE LA PARTE 4! Yoshikage Kira despierta la tercera bomba Killer Queen: Bites The Dust junto a Kosaku Kawajiri y Stray Cat. ¡Salva Morioh y gana 2 Sobres de Parte 4!',
    opponentName: 'Kira · Bites The Dust (Jefe Final)',
    featuredCardId: 'evo-killer-queen-bites-the-dust',
    difficulty: 'HARD',
    isBoss: true,
    opponentDeckIds: buildPart1Deck(
      [
        'char-yoshikage-kira',
        'evo-kosaku-kawajiri',
        'char-shigekiyo-yangu',
        'char-rohan-kishibe',
        'char-akira-otoishi',
        'stand-killer-queen',
        'evo-killer-queen-bites-the-dust',
        'stand-stray-cat',
        'stand-harvest',
        'stand-heavens-door',
      ],
      [
        ...rep('item-flecha-de-stand', 3),
        ...rep('item-atraccion-usuarios-stand', 3),
        ...rep('item-comida-de-tonio', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-fire', 11],
        ['energy-psychic', 9],
      ],
    ),
    storyDeckName: P4_STORY_FINALE_NAME,
    storyDeckDescription: P4_STORY_FINALE_DESC,
    storyDeckIds: P4_STORY_FINALE_IDS,
    rewardCoins: 600,
    rewardPackId: 'pack-part-4',
    rewardPackCount: 2,
  },
];

export const CAMPAIGN_PARTS: CampaignPartDef[] = [
  {
    part: 1,
    name: 'Parte 1: Phantom Blood',
    subtitle: 'El linaje Joestar frente a Dio Brando y la Máscara de Piedra (10 niveles)',
    mapHeader: 'MAPA DE RUTA · INGLATERRA 1880–1889',
    badge: 'PARTE 1',
    accentHex: '#2952d9',
    patternUrl: '/assets/patterns/pattern1.png',
    packId: 'pack-part-1',
    available: true,
    stages: PART_1_STAGES,
  },
  {
    part: 2,
    name: 'Parte 2: Battle Tendency',
    subtitle: 'Joseph Joestar y los maestros del Hamon contra los Hombres del Pilar (10 niveles)',
    mapHeader: 'MAPA DE RUTA · MÉXICO · ITALIA · SUIZA 1938',
    badge: 'PARTE 2',
    accentHex: '#9333ea',
    patternUrl: '/assets/patterns/pattern5.png',
    packId: 'pack-part-2',
    available: true,
    stages: PART_2_STAGES,
  },
  {
    part: 3,
    name: 'Parte 3: Stardust Crusaders',
    subtitle: 'El viaje de Tokio a El Cairo contra los 9 Dioses de Egipto y DIO (10 niveles)',
    mapHeader: 'MAPA DE RUTA · TOKIO → HONG KONG → CALCUTA → EL CAIRO 1988',
    badge: 'PARTE 3',
    accentHex: '#e6194b',
    patternUrl: '/assets/patterns/pattern2.png',
    packId: 'pack-part-3',
    available: true,
    stages: PART_3_STAGES,
  },
  {
    part: 4,
    name: 'Parte 4: Diamond is Unbreakable',
    subtitle: 'Josuke y los aliados de Morioh-cho frente a Red Hot Chili Pepper y Yoshikage Kira (10 niveles)',
    mapHeader: 'MAPA DE RUTA · CIUDAD DE MORIOH 1999',
    badge: 'PARTE 4',
    accentHex: '#00b87c',
    patternUrl: '/assets/patterns/pattern6.png',
    packId: 'pack-part-4',
    available: true,
    stages: PART_4_STAGES,
  },
];

export function getCampaignStageById(stageId: string): CampaignStageDef | undefined {
  for (const part of CAMPAIGN_PARTS) {
    const found = part.stages.find((s) => s.id === stageId);
    if (found) return found;
  }
  return undefined;
}

export function isCampaignStageUnlocked(
  stage: CampaignStageDef,
  completedStageIds: readonly string[],
): boolean {
  if (stage.stageNumber <= 1) return true;
  const partDef = CAMPAIGN_PARTS.find((p) => p.part === stage.part);
  if (!partDef) return false;
  const prevStage = partDef.stages.find((s) => s.stageNumber === stage.stageNumber - 1);
  if (!prevStage) return true;
  return completedStageIds.includes(prevStage.id);
}
