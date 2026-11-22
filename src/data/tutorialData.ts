import type { AiDifficulty } from '../engine/ai/tacticalAi';

export interface TutorialLessonDef {
  id: string;
  lessonNumber: number;
  title: string;
  subtitle: string;
  badge: string;
  accentHex: string;
  mentorName: string;
  mentorQuote: string;
  featuredCardId: string;
  opponentName: string;
  difficulty: AiDifficulty;
  playerDeckName: string;
  playerDeckIds: string[];
  opponentDeckIds: string[];
  /** Key concepts taught in this lesson (shown in TutorialView and in-battle coach) */
  concepts: string[];
  /** Short focus tip shown persistently in the in-battle tutorial coach */
  focusTip: string;
  /** Basic one-time completion rewards */
  rewardCoins: number;
  rewardPackId?: string;
  rewardPackCount?: number;
}

function rep(id: string, count: number): string[] {
  return Array.from({ length: count }, () => id);
}

function buildTutorialDeck(
  cards: string[],
  energies: [string, number][],
): string[] {
  const energyList = energies.flatMap(([id, n]) => rep(id, n));
  const combined = [...cards, ...energyList];
  if (combined.length < 46) {
    combined.push(...rep('energy-colorless', 46 - combined.length));
  }
  return combined.slice(0, 46);
}

export const TUTORIAL_LESSONS: TutorialLessonDef[] = [
  {
    id: 'tut-1',
    lessonNumber: 1,
    title: 'Fundamentos: Energía y Combate',
    subtitle: 'Aprende las 4 fases del turno, cómo unir Energías y lanzar tu primer ataque.',
    badge: 'LECCIÓN 01',
    accentHex: '#2952d9',
    mentorName: 'Will A. Zeppeli',
    mentorQuote:
      '¡Respira hondo! Primero coloca a tu Personaje Activo, une 1 Energía en Preparación y pasa a Combate para golpear.',
    featuredCardId: 'char-jonathan-joestar',
    opponentName: 'Muñeco de Práctica (Speedwagon)',
    difficulty: 'EASY',
    playerDeckName: 'Mazo Tutorial 1 — Fundamentos',
    playerDeckIds: buildTutorialDeck(
      [
        'char-jonathan-joestar',
        'char-will-a-zeppeli',
        'char-robert-e-o-speedwagon',
        'char-dire',
        'char-straizo',
        ...rep('item-suministros-speedwagon', 3),
        ...rep('item-comida-de-tonio', 2),
      ],
      [['energy-electric', 36]],
    ),
    opponentDeckIds: buildTutorialDeck(
      ['char-robert-e-o-speedwagon', 'char-erina-pendleton'],
      [['energy-colorless', 44]],
    ),
    concepts: [
      'Mano inicial de 7 cartas y colocación de Activo + Banca inicial gratis',
      '1 Energía adjuntada por turno en Fase de Preparación',
      'En Turno 1 no atacan ni el 1.º jugador ni los personajes sin Stand',
    ],
    focusTip:
      'Haz clic en una Energía de tu mano y luego en tu Activo para cargarlo. En Turno 2+, pulsa «Fase de Combate» para atacar.',
    rewardCoins: 60,
  },
  {
    id: 'tut-2',
    lessonNumber: 2,
    title: 'Stands, Llamada de Stand y Energía de Stand',
    subtitle: 'Domina el vínculo Usuario + Stand, la Resonancia (+1 energía) y la Energía de Stand.',
    badge: 'LECCIÓN 02',
    accentHex: '#00b87c',
    mentorName: 'Jean Pierre Polnareff',
    mentorQuote:
      '¡Sin su Stand un usuario no puede atacar! Equipa uno desde tu mano gratis o usa ⚡ Llamar Stand para invocar uno desde tu mazo.',
    featuredCardId: 'stand-silver-chariot',
    opponentName: 'Hol Horse (Entrenamiento)',
    difficulty: 'EASY',
    playerDeckName: 'Mazo Tutorial 2 — Despertar de Stand',
    playerDeckIds: buildTutorialDeck(
      [
        'char-jean-pierre-polnareff',
        'char-muhammad-avdol',
        'char-iggy',
        'char-hol-horse',
        'char-noriaki-kakyoin',
        'stand-silver-chariot',
        'stand-magicians-red',
        'stand-the-fool',
        'stand-emperor',
        'stand-hierophant-green',
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-stand', 4],
        ['energy-psychic', 18],
        ['energy-fire', 10],
      ],
    ),
    opponentDeckIds: buildTutorialDeck(
      ['char-hol-horse', 'char-mariah', 'stand-emperor', 'stand-bastet'],
      [
        ['energy-psychic', 22],
        ['energy-metal', 20],
      ],
    ),
    concepts: [
      'Equipar un Stand desde la mano es gratis y otorga Resonancia (+1 energía ese turno)',
      '⚡ Llamar Stand invoca un Stand compatible aleatorio del mazo (y termina el turno)',
      'Energía de Stand (máx. 4) paga cualquier coste elemental en ataques de Stand',
    ],
    focusTip:
      'Equipa tu Stand haciendo clic en él y luego en tu Usuario, o pulsa «⚡ Llamar Stand» si no tienes ninguno en mano. Usa Energía de Stand para pagar cualquier color.',
    rewardCoins: 80,
  },
  {
    id: 'tut-3',
    lessonNumber: 3,
    title: 'Banca, Sinergias y Retirada',
    subtitle: 'Aprende a proteger tu tablero, activar bonificaciones desde banca y usar Nigerundayo.',
    badge: 'LECCIÓN 03',
    accentHex: '#f2c12e',
    mentorName: 'Joseph Joestar',
    mentorQuote:
      '¡Nunca te quedes sin banca o perderás al caer tu Activo! Además, con mi Nigerundayo puedo retirarme a la banca sin perder el turno.',
    featuredCardId: 'char-joseph-joestar',
    opponentName: 'Dio Brando (Práctica)',
    difficulty: 'EASY',
    playerDeckName: 'Mazo Tutorial 3 — Táctica de Banca',
    playerDeckIds: buildTutorialDeck(
      [
        'char-joseph-joestar',
        'char-will-a-zeppeli',
        'char-lisa-lisa',
        'char-jonathan-joestar',
        'char-erina-pendleton',
        ...rep('item-clackers', 2),
        ...rep('item-suministros-speedwagon', 3),
        ...rep('item-comida-de-tonio', 2),
      ],
      [['energy-electric', 34]],
    ),
    opponentDeckIds: buildTutorialDeck(
      ['char-dio-brando', 'char-robert-e-o-speedwagon', 'char-bruford'],
      [
        ['energy-water', 15],
        ['energy-electric', 14],
        ['energy-metal', 14],
      ],
    ),
    concepts: [
      'Bajar o cambiar personajes en banca durante la partida finaliza el turno (salvo Nigerundayo)',
      'Will A. Zeppeli y Lisa Lisa potencian +20 a tus Usuarios de Hamon desde la banca',
      'Si tu Activo cae y no tienes banca, pierdes inmediatamente',
    ],
    focusTip:
      'Coloca a Zeppeli o Lisa Lisa en la banca para potenciar tus ataques Hamon. Si Joseph está herido, pulsa «Nigerundayo!» en un aliado de banca sin perder el turno.',
    rewardCoins: 80,
  },
  {
    id: 'tut-4',
    lessonNumber: 4,
    title: 'Objetos Tácticos y Curación',
    subtitle: 'Equipa armas, cura a tus aliados en Activo o Banca y acelera tus energías.',
    badge: 'LECCIÓN 04 · SOBRE',
    accentHex: '#e6194b',
    mentorName: 'Robert E.O. Speedwagon',
    mentorQuote:
      '¡Puedes usar 1 Objeto por turno! Equipa (P)luck para pegar más fuerte o usa Comida de Tonio para curar tanto al Activo como a tu Banca.',
    featuredCardId: 'item-comida-de-tonio',
    opponentName: 'Bruford (Práctica)',
    difficulty: 'EASY',
    playerDeckName: 'Mazo Tutorial 4 — Arsenal Táctico',
    playerDeckIds: buildTutorialDeck(
      [
        'char-jonathan-joestar',
        'char-bruford',
        'char-erina-pendleton',
        'char-robert-e-o-speedwagon',
        'char-will-a-zeppeli',
        ...rep('item-pluck', 3),
        ...rep('item-comida-de-tonio', 3),
        ...rep('item-atraccion-usuarios-stand', 3),
        ...rep('item-suministros-speedwagon', 3),
      ],
      [
        ['energy-electric', 16],
        ['energy-metal', 13],
      ],
    ),
    opponentDeckIds: buildTutorialDeck(
      ['char-bruford', 'char-robert-e-o-speedwagon', 'char-straizo'],
      [
        ['energy-metal', 22],
        ['energy-electric', 21],
      ],
    ),
    concepts: [
      'Puedes usar 1 Objeto por turno en Preparación (máx. 1 copia de cada equipable por personaje)',
      'Comida de Tonio cura +40 HP a cualquier aliado (Activo o Banca) y limpia Quemado',
      '¡Atracción entre usuarios de Stand! busca hasta 2 Energías de tu mazo',
    ],
    focusTip:
      'Haz clic en (P)luck o Comida de Tonio en tu mano y selecciona a un personaje aliado para equiparlo o curarlo. Usa Atracción si te faltan Energías.',
    rewardCoins: 100,
    rewardPackId: 'pack-part-1',
    rewardPackCount: 1,
  },
  {
    id: 'tut-5',
    lessonNumber: 5,
    title: 'Estados Elementales',
    subtitle: 'Aprende a infligir y contrarrestar Quemado, Sangrado y Aturdido.',
    badge: 'LECCIÓN 05',
    accentHex: '#f97316',
    mentorName: 'Muhammad Avdol',
    mentorQuote:
      '¡Las llamas de Magician’s Red y el filo de Danse Macab-Hair desgastan al rival turno tras turno! Recuerda que curar o retirar limpia Quemado.',
    featuredCardId: 'stand-magicians-red',
    opponentName: 'Esidisi (Práctica)',
    difficulty: 'NORMAL',
    playerDeckName: 'Mazo Tutorial 5 — Estados Elementales',
    playerDeckIds: buildTutorialDeck(
      [
        'char-muhammad-avdol',
        'char-noriaki-kakyoin',
        'char-bruford',
        'char-joseph-joestar',
        'char-iggy',
        'stand-magicians-red',
        'stand-hierophant-green',
        'stand-the-fool',
        ...rep('item-piedra-roja-de-aja', 2),
        ...rep('item-comida-de-tonio', 3),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-stand', 4],
        ['energy-fire', 14],
        ['energy-metal', 7],
        ['energy-light', 6],
      ],
    ),
    opponentDeckIds: buildTutorialDeck(
      ['char-esidisi', 'char-santana', 'char-wamuu'],
      [
        ['energy-fire', 22],
        ['energy-light', 21],
      ],
    ),
    concepts: [
      'Quemado: 10 daño fijo al final de turno; se limpia al curar o retirar a la banca',
      'Sangrado: acumulable (cada stack hace 10 de daño durante 3 turnos)',
      'Aturdido: impide atacar el siguiente turno, pero sí permite retirarse a la banca',
    ],
    focusTip:
      'Aplica Quemado con Piedra Roja de Aja o Magician’s Red, o Aturdido con Cuerpo Flexible/Clacker Voley. Si te queman, cúrate o retírate para limpiarlo.',
    rewardCoins: 100,
  },
  {
    id: 'tut-6',
    lessonNumber: 6,
    title: 'Evoluciones y Cartas de Premio (Examen Final)',
    subtitle: 'Desata una Evolución de Stand y reclama tus Cartas de Premio para ganar el duelo.',
    badge: 'EXAMEN FINAL · SOBRE',
    accentHex: '#9333ea',
    mentorName: 'Jotaro Kujo',
    mentorQuote:
      'Yare yare daze... Con Jotaro en el Activo puedes evolucionar a Star Platinum: The World. Cada KO te permite elegir una de tus 6 Cartas de Premio boca abajo.',
    featuredCardId: 'evo-star-platinum-the-world',
    opponentName: 'DIO (Examen Final)',
    difficulty: 'NORMAL',
    playerDeckName: 'Mazo Tutorial 6 — Poder Definitivo',
    playerDeckIds: buildTutorialDeck(
      [
        'char-jotaro-kujo',
        'char-jean-pierre-polnareff',
        'char-noriaki-kakyoin',
        'char-iggy',
        'char-hol-horse',
        'stand-star-platinum',
        'stand-silver-chariot',
        'stand-hierophant-green',
        'stand-the-fool',
        'stand-emperor',
        'evo-star-platinum-the-world',
        'evo-silver-chariot-requiem',
        'item-flecha-requiem',
        ...rep('item-flecha-de-stand', 2),
        ...rep('item-atraccion-usuarios-stand', 2),
        ...rep('item-comida-de-tonio', 2),
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-stand', 4],
        ['energy-psychic', 21],
      ],
    ),
    opponentDeckIds: buildTutorialDeck(
      [
        'char-dio',
        'char-hol-horse',
        'char-mariah',
        'char-vanilla-ice',
        'stand-the-world',
        'stand-emperor',
        'stand-bastet',
        'stand-cream',
        ...rep('item-suministros-speedwagon', 2),
      ],
      [
        ['energy-stand', 4],
        ['energy-psychic', 22],
        ['energy-metal', 10],
      ],
    ),
    concepts: [
      'Evoluciones (1/turno): haz clic en la carta de Evolución en tu mano cuando cumplas sus requisitos',
      'Cada personaje rival eliminado te deja elegir y girar 1 de tus 6 Cartas de Premio',
      'Ganas al robar tus 6 Cartas de Premio, dejar al rival sin tablero o sin cartas en mazo',
    ],
    focusTip:
      'Coloca a Jotaro en banca desde T1 y súbelo al Activo para jugar Star Platinum: The World. ¡Consigue KOs, gira tus Cartas de Premio y derrota a DIO!',
    rewardCoins: 150,
    rewardPackId: 'pack-part-3',
    rewardPackCount: 1,
  },
];

export function getTutorialLessonById(lessonId: string): TutorialLessonDef | undefined {
  return TUTORIAL_LESSONS.find((l) => l.id === lessonId);
}
