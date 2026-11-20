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
  /** One-time pickup rewards */
  rewardCoins: number;
  rewardPackId?: string;
  rewardPackCount?: number;
}

export interface CampaignPartDef {
  part: 1 | 2 | 3 | 4 | 5;
  name: string;
  subtitle: string;
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
 * Helper to build a strictly legal 40-card Part 1 deck
 * (max 1 copy per character, max 3 copies per item, unlimited basic energies).
 */
function buildPart1Deck(
  characters: string[],
  items: string[],
  energies: [string, number][],
): string[] {
  const energyList = energies.flatMap(([id, n]) => rep(id, n));
  const combined = [...characters, ...items, ...energyList];
  if (combined.length < 40) {
    combined.push(...rep('energy-colorless', 40 - combined.length));
  }
  return combined.slice(0, 40);
}

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
      ['char-will-a-zeppeli', 'char-jonathan-joestar', 'char-robert-e-o-speedwagon'],
      [...rep('item-suministros-speedwagon', 2), 'item-pluck'],
      [
        ['energy-electric', 22],
        ['energy-colorless', 12],
      ],
    ),
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
      ['char-jonathan-joestar', 'char-will-a-zeppeli'],
      [...rep('item-pluck', 2), ...rep('item-suministros-speedwagon', 2)],
      [
        ['energy-electric', 22],
        ['energy-colorless', 12],
      ],
    ),
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
    rewardCoins: 220,
  },
  {
    id: 'p1-s8',
    part: 1,
    stageNumber: 8,
    title: 'La Espada de la Suerte y el Valor',
    location: 'Ruinas de los Caballeros',
    storyText:
      'Con la espada (P)luck en mano, la fuerza del Hamon alcanza un filo capaz de cortar la oscuridad.',
    opponentName: 'Jonathan · Filo (P)luck',
    featuredCardId: 'item-pluck',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-jonathan-joestar', 'char-will-a-zeppeli', 'char-robert-e-o-speedwagon'],
      [...rep('item-pluck', 3), ...rep('item-suministros-speedwagon', 3)],
      [
        ['energy-electric', 21],
        ['energy-colorless', 10],
      ],
    ),
    rewardCoins: 250,
  },
  {
    id: 'p1-s9',
    part: 1,
    stageNumber: 9,
    title: 'Asalto al Castillo de Dio',
    location: 'Castillo de Windknight’s Lot',
    storyText:
      'A las puertas de la cámara del trono, la guardia de Dio desata la energía congelante y la Máscara de Piedra.',
    opponentName: 'Guardia Oscura del Castillo',
    featuredCardId: 'char-dio-brando',
    difficulty: 'NORMAL',
    isBoss: false,
    opponentDeckIds: buildPart1Deck(
      ['char-dio-brando', 'char-will-a-zeppeli', 'char-robert-e-o-speedwagon'],
      [
        ...rep('item-mascara-de-piedra', 3),
        ...rep('item-pluck', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-electric', 18],
        ['energy-water', 12],
      ],
    ),
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
        'char-jonathan-joestar',
        'char-will-a-zeppeli',
        'char-robert-e-o-speedwagon',
      ],
      [
        ...rep('item-mascara-de-piedra', 3),
        ...rep('item-pluck', 3),
        ...rep('item-suministros-speedwagon', 3),
      ],
      [
        ['energy-electric', 16],
        ['energy-water', 11],
      ],
    ),
    rewardCoins: 450,
    rewardPackId: 'pack-part-1',
    rewardPackCount: 2,
  },
];

export const CAMPAIGN_PARTS: CampaignPartDef[] = [
  {
    part: 1,
    name: 'Parte 1: Phantom Blood',
    subtitle: 'El linaje Joestar frente a Dio Brando y la Máscara de Piedra (10 niveles)',
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
    subtitle: 'Joseph Joestar contra los Hombres del Pilar (Próximamente)',
    badge: 'PARTE 2',
    accentHex: '#9333ea',
    patternUrl: '/assets/patterns/pattern5.png',
    packId: 'pack-part-2',
    available: false,
    stages: [],
  },
  {
    part: 3,
    name: 'Parte 3: Stardust Crusaders',
    subtitle: 'El viaje a Egipto contra DIO y los 9 Dioses (Próximamente)',
    badge: 'PARTE 3',
    accentHex: '#e6194b',
    patternUrl: '/assets/patterns/pattern2.png',
    packId: 'pack-part-3',
    available: false,
    stages: [],
  },
  {
    part: 4,
    name: 'Parte 4: Diamond is Unbreakable',
    subtitle: 'Morioh frente a Yoshikage Kira (Próximamente)',
    badge: 'PARTE 4',
    accentHex: '#00b87c',
    patternUrl: '/assets/patterns/pattern6.png',
    packId: 'pack-part-4',
    available: false,
    stages: [],
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
