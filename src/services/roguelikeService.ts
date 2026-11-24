import { ALL_CARDS, getCardById } from '../data/cardRegistry';
import { getCardRarity, type CardRarity } from '../data/progressionData';
import {
  BASIC_ENERGY_IDS,
  getRoguelikeRelicById,
  ROGUELIKE_DIFFICULTY_META,
  ROGUELIKE_EVENTS,
  ROGUELIKE_MIN_DECK_SIZE,
  ROGUELIKE_RELICS,
  ROGUELIKE_STARTER_DECKS,
  ROGUELIKE_TOTAL_FLOORS,
  type RoguelikeDifficulty,
  type RoguelikeEventDef,
  type RoguelikeRelicDef,
  type RoguelikeRoomType,
} from '../data/roguelikeData';
import type { GameRulesConfig } from '../data/rulesConfig';
import type { AiDifficulty } from '../engine/ai/tacticalAi';
import { createSeededRng, type RngProvider } from '../engine/rng';

export interface RoguelikeMapNode {
  id: string;
  floor: number; // 1..30
  lane: number; // 0..2
  type: RoguelikeRoomType;
  label: string;
  nextNodeIds: string[];
  visited: boolean;
}

export interface RoguelikeShopOffer {
  id: string;
  kind: 'CARD' | 'RELIC';
  cardId?: string;
  relicId?: string;
  price: number;
  purchased: boolean;
}

export interface RoguelikeShopState {
  offers: RoguelikeShopOffer[];
  purgePrice: number;
  purgedThisVisit: boolean;
  energyPackPrice: number;
  energyPackBought: boolean;
}

export interface RoguelikeRewardState {
  sourceType: 'BATTLE' | 'ELITE' | 'BOSS' | 'TREASURE';
  goldAwarded: number;
  cardChoices: string[];
  relicChoices?: string[];
  energyPickCount?: number;
  /** Optional single bonus card (regular or Energy) randomly discovered inside a Treasure chest */
  treasureFoundCardId?: string;
  treasureCardClaimed?: boolean;
}

export interface RoguelikeEventState {
  eventId: string;
  resolvedMessage?: string;
  energyPickCount?: number;
  purgePickOpen?: boolean;
  purgePickBonusGold?: number;
}

export interface RoguelikeEnemySpec {
  name: string;
  subtitle: string;
  featuredCardId: string;
  difficulty: AiDifficulty;
  aiErrorRate: number;
  deckIds: string[];
  bonusMaxHp: number;
  bonusDamage: number;
}

export interface RoguelikeRunState {
  runId: string;
  seed: number;
  starterId: string;
  difficulty: RoguelikeDifficulty;
  status: 'MAP' | 'IN_BATTLE' | 'REWARD' | 'SHOP' | 'EVENT' | 'VICTORY' | 'DEFEAT';
  currentFloor: number; // 0 before picking Floor 1, then 1..30
  currentNodeId: string | null;
  activeNodeId: string | null;
  deckCardIds: string[];
  gold: number;
  relicIds: string[];
  map: RoguelikeMapNode[];
  pendingReward: RoguelikeRewardState | null;
  activeShop: RoguelikeShopState | null;
  activeEvent: RoguelikeEventState | null;
  seenEventIds?: string[];
  battlesWon: number;
  elitesWon: number;
  bossesWon: number;
  metaCoinsClaimed: number | null;
}

const RARITY_ORDER: Record<CardRarity, number> = {
  COMMON: 0,
  RARE: 1,
  SUPER_RARE: 2,
  BIZARRE_RARE: 3,
};

const COLLECTIBLE_POOL = ALL_CARDS.filter((c) => c.type !== 'ENERGY');

function pickRandom<T>(items: readonly T[], rng: RngProvider): T {
  return items[Math.floor(rng.nextFloat() * items.length) % items.length]!;
}

/**
 * Generates a connected 30-floor 3-lane branching roadmap.
 * Every non-boss floor has 3 lanes (0 = Left, 1 = Center, 2 = Right), and Boss floors (10, 20, 30)
 * sit in the Center lane (1). Each node connects strictly to adjacent lanes (|nextLane - lane| <= 1).
 */
export function generateRoguelikeMap(seed: number): RoguelikeMapNode[] {
  const rng = createSeededRng(seed ^ 0x5f3759df);
  const floors: RoguelikeMapNode[][] = [];

  const twoLanePatterns: number[][] = [
    [1, 2], // gap in Lane 1 (Left)
    [0, 2], // gap in Lane 2 (Center)
    [0, 1], // gap in Lane 3 (Right)
  ];

  for (let floor = 1; floor <= ROGUELIKE_TOTAL_FLOORS; floor++) {
    const isBossFloor = floor === 10 || floor === 20 || floor === 30;
    const isPreBossFloor = floor === 9 || floor === 19 || floor === 29;
    const isMiniEliteFloor = floor === 5 || floor === 15 || floor === 25;

    let lanes: number[];
    if (isBossFloor) {
      lanes = [1]; // Boss ALWAYS in Lane 2 (Center)
    } else if (floor === 1 || isPreBossFloor || isMiniEliteFloor) {
      lanes = [0, 1, 2];
    } else if (rng.nextFloat() < 0.52) {
      lanes = [0, 1, 2];
    } else {
      lanes = pickRandom(twoLanePatterns, rng);
    }
    const row: RoguelikeMapNode[] = [];

    for (const lane of lanes) {
      let type: RoguelikeRoomType = 'BATTLE';
      if (isBossFloor) {
        type = 'BOSS';
      } else if (floor === 1) {
        type = 'BATTLE';
      } else if (isPreBossFloor) {
        type = lane === 0 ? 'SHOP' : lane === 1 ? 'TREASURE' : 'EVENT';
      } else if (isMiniEliteFloor) {
        type = lane === 0 ? 'ELITE' : lane === 1 ? 'TREASURE' : 'BATTLE';
      } else {
        const roll = rng.nextFloat();
        if (roll < 0.48) type = 'BATTLE';
        else if (roll < 0.63 && floor >= 3) type = 'ELITE';
        else if (roll < 0.77 && floor >= 2) type = 'SHOP';
        else if (roll < 0.89 && floor >= 2) type = 'TREASURE';
        else type = 'EVENT';
      }

      const labelMap: Record<RoguelikeRoomType, string> = {
        BATTLE: 'Combate',
        ELITE: 'Élite',
        TREASURE: 'Tesoro',
        SHOP: 'Tienda',
        EVENT: 'Evento',
        BOSS:
          floor === 10
            ? 'JEFE · ACTO I'
            : floor === 20
              ? 'JEFE · ACTO II'
              : 'JEFE FINAL · PISO 30',
      };

      row.push({
        id: `rl-f${floor}-l${lane}`,
        floor,
        lane,
        type,
        label: labelMap[type],
        nextNodeIds: [],
        visited: false,
      });
    }
    floors.push(row);
  }

  // Strictly connect each node to adjacent lanes (|next.lane - curr.lane| <= 1)
  for (let f = 0; f < floors.length - 1; f++) {
    const curr = floors[f]!;
    const next = floors[f + 1]!;

    for (const node of curr) {
      if (next.length === 1) {
        // Converge all 3 lanes into the Boss node
        node.nextNodeIds.push(next[0]!.id);
      } else {
        for (const target of next) {
          if (Math.abs(target.lane - node.lane) <= 1) {
            node.nextNodeIds.push(target.id);
          }
        }
      }
    }
  }

  return floors.flat();
}

export function createRoguelikeRun(
  starterId: string,
  difficulty: RoguelikeDifficulty = 'NORMAL',
  seed = Date.now(),
): RoguelikeRunState {
  const starter =
    ROGUELIKE_STARTER_DECKS.find((s) => s.id === starterId) ?? ROGUELIKE_STARTER_DECKS[0]!;
  const diffMeta = ROGUELIKE_DIFFICULTY_META[difficulty];
  return {
    runId: `run-${seed}-${Math.floor(Math.random() * 9999)}`,
    seed,
    starterId: starter.id,
    difficulty,
    status: 'MAP',
    currentFloor: 0,
    currentNodeId: null,
    activeNodeId: null,
    deckCardIds: [...starter.cardIds],
    gold: diffMeta.startingGold,
    relicIds: [],
    map: generateRoguelikeMap(seed),
    pendingReward: null,
    activeShop: null,
    activeEvent: null,
    seenEventIds: [],
    battlesWon: 0,
    elitesWon: 0,
    bossesWon: 0,
    metaCoinsClaimed: null,
  };
}

export function getSelectableNodeIds(run: RoguelikeRunState): Set<string> {
  if (run.status !== 'MAP') return new Set();
  if (!run.currentNodeId) {
    return new Set(run.map.filter((n) => n.floor === 1).map((n) => n.id));
  }
  const current = run.map.find((n) => n.id === run.currentNodeId);
  if (!current) return new Set();
  return new Set(current.nextNodeIds);
}

export function computeRelicRulesOverrides(relicIds: readonly string[]): Partial<GameRulesConfig> {
  let bonusMaxHp = 0;
  let bonusDamage = 0;
  let extraInitialHand = 0;
  for (const rid of relicIds) {
    const relic = getRoguelikeRelicById(rid);
    if (!relic) continue;
    bonusMaxHp += relic.bonusMaxHp ?? 0;
    bonusDamage += relic.bonusDamage ?? 0;
    extraInitialHand += relic.extraInitialHand ?? 0;
  }
  return {
    minDeckSize: ROGUELIKE_MIN_DECK_SIZE,
    maxDeckSize: 60,
    initialHandSize: 5,
    disableDeckOutLoss: true,
    p1BonusMaxHp: bonusMaxHp,
    p1BonusDamage: bonusDamage,
    p1ExtraInitialHand: extraInitialHand,
  };
}

export function getGoldMultiplier(relicIds: readonly string[]): number {
  let pct = 0;
  for (const rid of relicIds) {
    pct += getRoguelikeRelicById(rid)?.goldBonusPercent ?? 0;
  }
  return 1 + pct / 100;
}

export function getShopDiscountMultiplier(relicIds: readonly string[]): number {
  let pct = 0;
  for (const rid of relicIds) {
    pct += getRoguelikeRelicById(rid)?.shopDiscountPercent ?? 0;
  }
  return Math.max(0.5, 1 - pct / 100);
}

export function getDraftChoiceCount(relicIds: readonly string[]): number {
  let extra = 0;
  for (const rid of relicIds) {
    extra += getRoguelikeRelicById(rid)?.extraDraftChoices ?? 0;
  }
  return 3 + extra;
}

export function getShopExtraOfferCount(relicIds: readonly string[]): number {
  let extra = 0;
  for (const rid of relicIds) {
    extra += getRoguelikeRelicById(rid)?.extraShopOffers ?? 0;
  }
  return extra;
}

export function getSkipCardGoldBonus(relicIds: readonly string[]): number {
  let extra = 0;
  for (const rid of relicIds) {
    extra += getRoguelikeRelicById(rid)?.skipCardGoldBonus ?? 0;
  }
  return 15 + extra;
}

export function getRelicChoiceCount(relicIds: readonly string[]): number {
  let extra = 0;
  for (const rid of relicIds) {
    extra += getRoguelikeRelicById(rid)?.extraRelicChoices ?? 0;
  }
  return 2 + extra;
}

/**
 * Builds a scaling enemy encounter for a given floor (1..30) and room type.
 * Early floors have weak 16-20 card decks; later floors scale up to 40-46 card Boss decks.
 */
export function buildRoguelikeEnemy(
  floor: number,
  roomType: 'BATTLE' | 'ELITE' | 'BOSS',
  seed: number,
  runDifficulty: RoguelikeDifficulty = 'NORMAL',
): RoguelikeEnemySpec {
  const rng = createSeededRng(seed + floor * 7919 + (roomType === 'BOSS' ? 999 : roomType === 'ELITE' ? 333 : 0));

  const applyDiffAdjust = (spec: RoguelikeEnemySpec): RoguelikeEnemySpec => {
    if (runDifficulty === 'EASY') {
      return {
        ...spec,
        difficulty: roomType === 'BOSS' && floor >= 20 ? 'NORMAL' : floor <= 12 ? 'EASY' : 'NORMAL',
        aiErrorRate: Math.min(0.45, spec.aiErrorRate + 0.14),
        bonusMaxHp: Math.max(0, spec.bonusMaxHp - 15),
        bonusDamage: roomType === 'BOSS' && floor === 30 ? spec.bonusDamage : 0,
      };
    }
    if (runDifficulty === 'HARD') {
      return {
        ...spec,
        difficulty: 'HARD',
        aiErrorRate: roomType === 'BOSS' && floor >= 20 ? 0 : Math.max(0.01, spec.aiErrorRate - 0.05),
        bonusMaxHp: spec.bonusMaxHp + 10,
        bonusDamage:
          spec.bonusDamage + (roomType === 'BOSS' && floor === 30 ? 10 : roomType === 'ELITE' && floor >= 15 ? 10 : 0),
      };
    }
    return spec;
  };

  if (roomType === 'BOSS' && floor === 10) {
    return applyDiffAdjust({
      name: 'Dio Brando & Kars · Jefes Acto I',
      subtitle: 'Piso 10 · Jefe del Acto I (+20 PV)',
      featuredCardId: 'char-dio-brando',
      difficulty: 'HARD',
      aiErrorRate: 0.12,
      bonusMaxHp: 20,
      bonusDamage: 0,
      deckIds: [
        'char-dio-brando',
        'char-kars',
        'char-bruford',
        'char-tarkus',
        'char-wang-chan',
        'char-wamuu',
        'item-mascara-de-piedra',
        'item-mascara-de-piedra',
        'item-piedra-roja-de-aja',
        'item-comida-de-tonio',
        'item-muerte-de-danny',
        'item-suministros-speedwagon',
        ...Array.from({ length: 8 }, () => 'energy-electric'),
        ...Array.from({ length: 8 }, () => 'energy-light'),
      ],
    });
  }

  if (roomType === 'BOSS' && floor === 20) {
    return applyDiffAdjust({
      name: 'DIO · The World · Jefe Acto II',
      subtitle: 'Piso 20 · Jefe del Acto II (+30 PV, +10 daño)',
      featuredCardId: 'char-dio',
      difficulty: 'HARD',
      aiErrorRate: 0.05,
      bonusMaxHp: 30,
      bonusDamage: 10,
      deckIds: [
        'char-dio',
        'char-vanilla-ice',
        'char-pet-shop',
        'char-n-doul',
        'char-hol-horse',
        'char-j-geil',
        'stand-the-world',
        'stand-cream',
        'stand-horus',
        'stand-geb',
        'stand-emperor',
        'stand-hanged-man',
        'item-atraccion-usuarios-stand',
        'item-atraccion-usuarios-stand',
        'item-suministros-speedwagon',
        'item-comida-de-tonio',
        'item-ataud-de-dio',
        'energy-stand',
        'energy-stand',
        'energy-stand',
        ...Array.from({ length: 9 }, () => 'energy-psychic'),
        ...Array.from({ length: 8 }, () => 'energy-water'),
      ],
    });
  }

  if (roomType === 'BOSS' && floor === 30) {
    return applyDiffAdjust({
      name: 'Réquiem Definitivo · Jefe Final',
      subtitle: 'Piso 30 · Jefe Final (+40 PV, +10 daño)',
      featuredCardId: 'evo-gold-experience-requiem',
      difficulty: 'HARD',
      aiErrorRate: 0.0,
      bonusMaxHp: 40,
      bonusDamage: 10,
      deckIds: [
        'char-giorno-giovanna',
        'char-jotaro-kujo',
        'char-dio',
        'char-yoshikage-kira',
        'char-bruno-bucciarati',
        'char-jean-pierre-polnareff',
        'stand-gold-experience',
        'stand-star-platinum',
        'stand-the-world',
        'stand-killer-queen',
        'stand-sticky-fingers',
        'stand-silver-chariot',
        'evo-gold-experience-requiem',
        'evo-star-platinum-the-world',
        'item-flecha-requiem',
        'item-flecha-de-stand',
        'item-atraccion-usuarios-stand',
        'item-atraccion-usuarios-stand',
        'item-suministros-speedwagon',
        'item-suministros-speedwagon',
        'item-comida-de-tonio',
        'item-comida-de-tonio',
        'energy-stand',
        'energy-stand',
        'energy-stand',
        'energy-stand',
        ...Array.from({ length: 10 }, () => 'energy-psychic'),
        ...Array.from({ length: 10 }, () => 'energy-light'),
      ],
    });
  }

  // Dynamic coherent 1-2 color scaling for Floors 1..29 BATTLE and ELITE
  const maxRarity: CardRarity =
    floor <= 4
      ? roomType === 'ELITE'
        ? 'RARE'
        : 'COMMON'
      : floor <= 12
        ? roomType === 'ELITE'
          ? 'SUPER_RARE'
          : 'RARE'
        : floor <= 20
          ? 'SUPER_RARE'
          : 'BIZARRE_RARE';

  const targetDeckSize = Math.min(
    46,
    18 + Math.floor(floor * 0.9) + (roomType === 'ELITE' ? 4 : 0),
  );
  const charTarget = Math.min(8, 4 + Math.floor(floor / 6) + (roomType === 'ELITE' ? 1 : 0));

  // Pick 2 cohesive elemental colors for this enemy so its attacks are always payable!
  const colorPairs: [string, string][] = [
    ['PSYCHIC', 'WATER'],
    ['ELECTRIC', 'LIGHT'],
    ['PSYCHIC', 'FIRE'],
    ['WATER', 'LIGHT'],
    ['PSYCHIC', 'NATURE'],
  ];
  const [primaryCol, secondaryCol] = pickRandom(colorPairs, rng);
  const allowedCols = new Set([primaryCol, secondaryCol, 'COLORLESS', 'STAND']);

  const cardFitsColors = (cardId: string): boolean => {
    const c = getCardById(cardId);
    if (!c || (c.type !== 'CHARACTER' && c.type !== 'STAND')) return true;
    return c.attacks.every((atk) => atk.energyCost.every((e) => allowedCols.has(e)));
  };

  const allEligibleChars = COLLECTIBLE_POOL.filter(
    (c) =>
      c.type === 'CHARACTER' &&
      RARITY_ORDER[getCardRarity(c.id)] <= RARITY_ORDER[maxRarity] &&
      (floor >= 6 || c.dg === null || c.dg <= 4),
  );
  const colorMatchedChars = allEligibleChars.filter((c) => cardFitsColors(c.id));
  const charPool = colorMatchedChars.length >= charTarget ? colorMatchedChars : allEligibleChars;
  const pickedChars = rng.shuffle(charPool).slice(0, charTarget);

  const deckIds: string[] = pickedChars.map((c) => c.id);
  const maxDg = pickedChars.reduce((m, c) => (c.type === 'CHARACTER' ? Math.max(m, c.dg ?? 0) : m), 0);
  const standUsersCount = pickedChars.filter(
    (c) => c.type === 'CHARACTER' && c.categories.includes('STAND_USER'),
  ).length;

  if (standUsersCount > 0 && maxDg >= 3) {
    const allEligibleStands = COLLECTIBLE_POOL.filter(
      (c) =>
        c.type === 'STAND' &&
        c.requiredDg <= maxDg &&
        RARITY_ORDER[getCardRarity(c.id)] <= RARITY_ORDER[maxRarity],
    );
    const colorMatchedStands = allEligibleStands.filter((s) => cardFitsColors(s.id));
    const standPool = colorMatchedStands.length >= 2 ? colorMatchedStands : allEligibleStands;
    const standsToAdd = rng.shuffle(standPool).slice(0, Math.min(standUsersCount + 1, 6));
    for (const s of standsToAdd) deckIds.push(s.id);
  }

  // Add impactful tactical items
  const itemPool = [
    'item-comida-de-tonio',
    'item-suministros-speedwagon',
    'item-atraccion-usuarios-stand',
    'item-muerte-de-danny',
    'item-ataud-de-dio',
  ];
  const itemCount = floor <= 4 ? 2 : floor <= 14 ? 4 : 6;
  for (let i = 0; i < itemCount && deckIds.length < targetDeckSize - 8; i++) {
    deckIds.push(pickRandom(itemPool, rng));
  }

  // Add Stand Energies for Stand-heavy enemies from Floor 6+
  if (standUsersCount >= 2 && floor >= 6) {
    const standEnergyCount = Math.min(floor >= 18 ? 3 : 2, Math.max(0, targetDeckSize - deckIds.length - 6));
    for (let i = 0; i < standEnergyCount; i++) deckIds.push('energy-stand');
  }

  // Fill remaining slots strictly with needed colors (max 2 colors)
  const colorWeights = new Map<string, number>();
  for (const id of deckIds) {
    const card = getCardById(id);
    if (card && (card.type === 'CHARACTER' || card.type === 'STAND')) {
      for (const atk of card.attacks) {
        for (const e of atk.energyCost) {
          if (e !== 'COLORLESS' && e !== 'STAND') {
            const eid = `energy-${e.toLowerCase()}`;
            colorWeights.set(eid, (colorWeights.get(eid) ?? 0) + 1);
          }
        }
      }
    }
  }
  const sortedEnergyIds = Array.from(colorWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([eid]) => eid);
  const colorList =
    sortedEnergyIds.length > 0
      ? sortedEnergyIds
      : [`energy-${primaryCol.toLowerCase()}`, `energy-${secondaryCol.toLowerCase()}`];

  let idx = 0;
  while (deckIds.length < targetDeckSize) {
    deckIds.push(colorList[idx % colorList.length]!);
    idx++;
  }

  const featured = pickedChars[0]?.id ?? 'char-hol-horse';
  const featuredName = getCardById(featured)?.name ?? 'Rival';
  const difficulty: AiDifficulty =
    floor <= 3 && roomType === 'BATTLE'
      ? 'NORMAL'
      : floor <= 10 && roomType === 'BATTLE'
        ? 'NORMAL'
        : 'HARD';
  const aiErrorRate = Math.max(
    0.03,
    0.26 - floor * 0.008 - (roomType === 'ELITE' ? 0.08 : 0),
  );

  // Enemy stat scaling across Acts
  const bonusMaxHp =
    roomType === 'ELITE'
      ? floor <= 10
        ? 10
        : floor <= 20
          ? 20
          : 30
      : floor <= 10
        ? 0
        : floor <= 20
          ? 10
          : 20;
  const bonusDamage =
    (roomType === 'ELITE' && floor >= 11) || floor >= 22 ? 10 : 0;

  return applyDiffAdjust({
    name: roomType === 'ELITE' ? `${featuredName} · Élite Piso ${floor}` : `${featuredName} · Piso ${floor}`,
    subtitle:
      roomType === 'ELITE'
        ? `Piso ${floor} · Combate Élite (${deckIds.length} cartas${bonusMaxHp ? ` · +${bonusMaxHp} PV` : ''}${bonusDamage ? ` · +${bonusDamage} daño` : ''})`
        : `Piso ${floor} · Combate (${deckIds.length} cartas${bonusMaxHp ? ` · +${bonusMaxHp} PV` : ''})`,
    featuredCardId: featured,
    difficulty,
    aiErrorRate,
    deckIds,
    bonusMaxHp,
    bonusDamage,
  });
}

/**
 * Generates 3 (or 4 with Relic) card choices for post-battle or treasure drafting.
 * Avoids offering duplicate 1-copy Characters/Stands/Evolutions already in the player's run deck.
 */
export function generateCardDraftChoices(
  run: RoguelikeRunState,
  sourceType: 'BATTLE' | 'ELITE' | 'BOSS' | 'TREASURE',
  rng: RngProvider,
): string[] {
  const count = getDraftChoiceCount(run.relicIds);
  const deckCounts = new Map<string, number>();
  for (const id of run.deckCardIds) {
    deckCounts.set(id, (deckCounts.get(id) ?? 0) + 1);
  }

  const floor = Math.max(1, run.currentFloor);
  const eligible = COLLECTIBLE_POOL.filter((c) => {
    const ownedInRun = deckCounts.get(c.id) ?? 0;
    if (c.type === 'ITEM') return ownedInRun < 3;
    return ownedInRun < 1;
  });

  const minRarityRank =
    sourceType === 'BOSS'
      ? 2
      : sourceType === 'ELITE'
        ? floor >= 15
          ? 2
          : 1
        : sourceType === 'TREASURE'
          ? 1
          : 0;

  const choices: string[] = [];
  const used = new Set<string>();

  for (let i = 0; i < count; i++) {
    const roll = rng.nextFloat();
    let desiredRank = minRarityRank;
    if (sourceType === 'BOSS') {
      desiredRank = roll < 0.45 ? 3 : 2;
    } else if (sourceType === 'ELITE') {
      desiredRank = roll < 0.18 + floor * 0.005 ? 3 : roll < 0.65 ? 2 : 1;
    } else {
      const urChance = floor >= 15 ? 0.08 : 0.02;
      const srChance = floor >= 8 ? 0.25 : 0.08;
      const rChance = 0.55;
      if (roll < urChance) desiredRank = 3;
      else if (roll < urChance + srChance) desiredRank = 2;
      else if (roll < urChance + srChance + rChance) desiredRank = 1;
      else desiredRank = 0;
    }

    let pool = eligible.filter(
      (c) => !used.has(c.id) && RARITY_ORDER[getCardRarity(c.id)] === desiredRank,
    );
    if (pool.length === 0) {
      pool = eligible.filter((c) => !used.has(c.id));
    }
    if (pool.length === 0) break;
    const picked = pickRandom(pool, rng);
    choices.push(picked.id);
    used.add(picked.id);
  }

  return choices;
}

export function generateRoguelikeShop(run: RoguelikeRunState, seed: number): RoguelikeShopState {
  const rng = createSeededRng(seed + run.currentFloor * 3571 + 17);
  const discount = getShopDiscountMultiplier(run.relicIds);
  const cardIds = generateCardDraftChoices(run, run.currentFloor >= 12 ? 'ELITE' : 'TREASURE', rng);
  // Add extra shop cards (+ any extra offers from relics like Guía de Morioh)
  const extraIds = generateCardDraftChoices(run, 'BATTLE', rng);
  const extraIds2 =
    getShopExtraOfferCount(run.relicIds) > 0 ? generateCardDraftChoices(run, 'TREASURE', rng) : [];
  const maxCardOffers = 5 + getShopExtraOfferCount(run.relicIds);
  const uniqueCardIds = Array.from(new Set([...cardIds, ...extraIds, ...extraIds2])).slice(
    0,
    maxCardOffers,
  );

  const rarityBasePrice: Record<CardRarity, number> = {
    COMMON: 35,
    RARE: 60,
    SUPER_RARE: 95,
    BIZARRE_RARE: 140,
  };

  const offers: RoguelikeShopOffer[] = uniqueCardIds.map((cid, idx) => ({
    id: `shop-c-${idx}-${cid}`,
    kind: 'CARD',
    cardId: cid,
    price: Math.max(20, Math.round(rarityBasePrice[getCardRarity(cid)] * discount)),
    purchased: false,
  }));

  const unownedRelics = ROGUELIKE_RELICS.filter((r) => !run.relicIds.includes(r.id));
  if (unownedRelics.length > 0) {
    const pickedRelics = rng.shuffle(unownedRelics).slice(0, Math.min(2, unownedRelics.length));
    pickedRelics.forEach((rel, idx) => {
      offers.push({
        id: `shop-r-${idx}-${rel.id}`,
        kind: 'RELIC',
        relicId: rel.id,
        price: Math.max(50, Math.round(rel.price * discount)),
        purchased: false,
      });
    });
  }

  return {
    offers,
    purgePrice: Math.max(25, Math.round(50 * discount)),
    purgedThisVisit: false,
    energyPackPrice: Math.max(20, Math.round(35 * discount)),
    energyPackBought: false,
  };
}

export function enterRoguelikeNode(
  run: RoguelikeRunState,
  nodeId: string,
): { nextRun: RoguelikeRunState; enemy?: RoguelikeEnemySpec } {
  const node = run.map.find((n) => n.id === nodeId);
  if (!node) return { nextRun: run };

  const rng = createSeededRng(run.seed + node.floor * 1337 + node.lane * 97);
  const nextMap = run.map.map((n) => (n.id === nodeId ? { ...n, visited: true } : n));
  const baseRun: RoguelikeRunState = {
    ...run,
    currentFloor: node.floor,
    currentNodeId: node.id,
    activeNodeId: node.id,
    map: nextMap,
    pendingReward: null,
    activeShop: null,
    activeEvent: null,
  };

  if (node.type === 'BATTLE' || node.type === 'ELITE' || node.type === 'BOSS') {
    const enemy = buildRoguelikeEnemy(node.floor, node.type, run.seed, run.difficulty ?? 'NORMAL');
    return {
      nextRun: { ...baseRun, status: 'IN_BATTLE' },
      enemy,
    };
  }

  if (node.type === 'SHOP') {
    return {
      nextRun: {
        ...baseRun,
        status: 'SHOP',
        activeShop: generateRoguelikeShop(baseRun, run.seed),
      },
    };
  }

  if (node.type === 'TREASURE') {
    const mult = getGoldMultiplier(run.relicIds);
    const unownedRelics = ROGUELIKE_RELICS.filter((r) => !run.relicIds.includes(r.id));
    const bonusIfNoRelics = unownedRelics.length === 0 ? 50 : 0;
    const goldAwarded = Math.round((40 + Math.floor(node.floor * 1.5) + bonusIfNoRelics) * mult);
    const relicChoices =
      unownedRelics.length > 0
        ? rng
            .shuffle(unownedRelics)
            .slice(0, Math.min(getRelicChoiceCount(run.relicIds), unownedRelics.length))
            .map((r) => r.id)
        : undefined;

    // 60% chance to also discover 1 bonus card (either a regular card or an Energy card) in the chest
    let treasureFoundCardId: string | undefined;
    if (rng.nextFloat() < 0.6) {
      if (rng.nextFloat() < 0.45) {
        // Energy card: prefer an energy type already in the deck, or random basic energy
        const deckEnergies = baseRun.deckCardIds.filter((cid) =>
          BASIC_ENERGY_IDS.includes(cid as (typeof BASIC_ENERGY_IDS)[number]),
        );
        const energyPool = deckEnergies.length > 0 ? deckEnergies : [...BASIC_ENERGY_IDS];
        treasureFoundCardId = pickRandom(energyPool, rng);
      } else {
        const normalDraft = generateCardDraftChoices(baseRun, 'TREASURE', rng);
        treasureFoundCardId = normalDraft[0];
      }
    }

    return {
      nextRun: {
        ...baseRun,
        status: 'REWARD',
        gold: baseRun.gold + goldAwarded,
        pendingReward: {
          sourceType: 'TREASURE',
          goldAwarded,
          cardChoices: [],
          relicChoices,
          treasureFoundCardId,
          treasureCardClaimed: false,
        },
      },
    };
  }

  // EVENT room: prefer events not yet seen during this run
  const seen = new Set(run.seenEventIds ?? []);
  const unseenEvents = ROGUELIKE_EVENTS.filter((e) => !seen.has(e.id));
  const eventPool = unseenEvents.length > 0 ? unseenEvents : ROGUELIKE_EVENTS;
  const evt = pickRandom(eventPool, rng);
  return {
    nextRun: {
      ...baseRun,
      status: 'EVENT',
      seenEventIds: [...(run.seenEventIds ?? []), evt.id],
      activeEvent: { eventId: evt.id },
    },
  };
}

export function resolveRoguelikeBattleOutcome(
  run: RoguelikeRunState,
  didWin: boolean,
): RoguelikeRunState {
  const node = run.map.find((n) => n.id === run.activeNodeId);
  const floor = node?.floor ?? run.currentFloor;
  const roomType = node?.type === 'BOSS' ? 'BOSS' : node?.type === 'ELITE' ? 'ELITE' : 'BATTLE';

  if (!didWin) {
    return {
      ...run,
      status: 'DEFEAT',
      activeNodeId: null,
      pendingReward: null,
    };
  }

  const nextBattles = run.battlesWon + 1;
  const nextElites = run.elitesWon + (roomType === 'ELITE' ? 1 : 0);
  const nextBosses = run.bossesWon + (roomType === 'BOSS' ? 1 : 0);

  // Victory after clearing Floor 30 Final Boss!
  if (floor >= ROGUELIKE_TOTAL_FLOORS) {
    return {
      ...run,
      status: 'VICTORY',
      activeNodeId: null,
      battlesWon: nextBattles,
      elitesWon: nextElites,
      bossesWon: nextBosses,
      pendingReward: null,
    };
  }

  const rng = createSeededRng(run.seed + floor * 4099 + nextBattles * 31);
  const mult = getGoldMultiplier(run.relicIds);
  const baseGold =
    roomType === 'BOSS'
      ? 85
      : roomType === 'ELITE'
        ? 45 + Math.floor(floor * 0.8)
        : 20 + Math.floor(floor * 0.7);
  const goldAwarded = Math.round(baseGold * mult);
  const cardChoices = generateCardDraftChoices(run, roomType, rng);
  const unownedRelics = ROGUELIKE_RELICS.filter((r) => !run.relicIds.includes(r.id));
  const relicChoices =
    (roomType === 'ELITE' || roomType === 'BOSS') && unownedRelics.length > 0
      ? rng
          .shuffle(unownedRelics)
          .slice(0, Math.min(getRelicChoiceCount(run.relicIds), unownedRelics.length))
          .map((r) => r.id)
      : undefined;

  return {
    ...run,
    status: 'REWARD',
    activeNodeId: null,
    gold: run.gold + goldAwarded,
    battlesWon: nextBattles,
    elitesWon: nextElites,
    bossesWon: nextBosses,
    pendingReward: {
      sourceType: roomType,
      goldAwarded,
      cardChoices,
      relicChoices,
    },
  };
}

export function grantRelicToRun(run: RoguelikeRunState, relicId: string): RoguelikeRunState {
  if (run.relicIds.includes(relicId)) return run;
  const relic = getRoguelikeRelicById(relicId);
  const extraCards = relic?.grantCardIdsOnPickup ?? [];
  const bonusGold = relic?.bonusGoldOnPickup ?? 0;
  return {
    ...run,
    gold: run.gold + bonusGold,
    relicIds: [...run.relicIds, relicId],
    deckCardIds: [...run.deckCardIds, ...extraCards],
  };
}

export function pickRoguelikeRewardCard(
  run: RoguelikeRunState,
  cardId: string | null,
  skipBonusGold?: number,
): RoguelikeRunState {
  const effectiveSkipGold = skipBonusGold ?? getSkipCardGoldBonus(run.relicIds);
  const nextDeck = cardId ? [...run.deckCardIds, cardId] : run.deckCardIds;
  const nextGold = cardId ? run.gold : run.gold + effectiveSkipGold;
  return {
    ...run,
    status: 'MAP',
    deckCardIds: nextDeck,
    gold: nextGold,
    pendingReward: null,
  };
}

export function pickRoguelikeRewardRelic(
  run: RoguelikeRunState,
  relicId: string,
): RoguelikeRunState {
  const withRelic = grantRelicToRun(run, relicId);
  return {
    ...withRelic,
    pendingReward: withRelic.pendingReward
      ? { ...withRelic.pendingReward, relicChoices: undefined }
      : null,
  };
}

export function claimTreasureBonusCard(run: RoguelikeRunState): RoguelikeRunState {
  if (
    !run.pendingReward ||
    !run.pendingReward.treasureFoundCardId ||
    run.pendingReward.treasureCardClaimed
  ) {
    return run;
  }
  return {
    ...run,
    deckCardIds: [...run.deckCardIds, run.pendingReward.treasureFoundCardId],
    pendingReward: {
      ...run.pendingReward,
      treasureCardClaimed: true,
    },
  };
}

export function buyShopOffer(run: RoguelikeRunState, offerId: string): RoguelikeRunState {
  if (!run.activeShop) return run;
  const offer = run.activeShop.offers.find((o) => o.id === offerId);
  if (!offer || offer.purchased || run.gold < offer.price) return run;

  let nextRun: RoguelikeRunState = {
    ...run,
    gold: run.gold - offer.price,
    activeShop: {
      ...run.activeShop,
      offers: run.activeShop.offers.map((o) => (o.id === offerId ? { ...o, purchased: true } : o)),
    },
  };

  if (offer.kind === 'CARD' && offer.cardId) {
    nextRun = { ...nextRun, deckCardIds: [...nextRun.deckCardIds, offer.cardId] };
  } else if (offer.kind === 'RELIC' && offer.relicId) {
    nextRun = grantRelicToRun(nextRun, offer.relicId);
  }

  return nextRun;
}

export function buyShopEnergyPack(run: RoguelikeRunState, energyCardId: string): RoguelikeRunState {
  if (!run.activeShop || run.activeShop.energyPackBought) return run;
  if (run.gold < run.activeShop.energyPackPrice) return run;
  if (!BASIC_ENERGY_IDS.includes(energyCardId as (typeof BASIC_ENERGY_IDS)[number])) return run;
  return {
    ...run,
    gold: run.gold - run.activeShop.energyPackPrice,
    deckCardIds: [...run.deckCardIds, energyCardId, energyCardId],
    activeShop: {
      ...run.activeShop,
      energyPackBought: true,
    },
  };
}

export function purgeCardFromRunDeck(run: RoguelikeRunState, deckIndex: number): RoguelikeRunState {
  if (!run.activeShop || run.activeShop.purgedThisVisit) return run;
  if (run.gold < run.activeShop.purgePrice) return run;
  if (run.deckCardIds.length <= ROGUELIKE_MIN_DECK_SIZE) return run;
  if (deckIndex < 0 || deckIndex >= run.deckCardIds.length) return run;

  const nextDeck = [...run.deckCardIds];
  nextDeck.splice(deckIndex, 1);
  return {
    ...run,
    gold: run.gold - run.activeShop.purgePrice,
    deckCardIds: nextDeck,
    activeShop: {
      ...run.activeShop,
      purgedThisVisit: true,
    },
  };
}

export function resolveRoguelikeEventChoice(
  run: RoguelikeRunState,
  eventDef: RoguelikeEventDef,
  choiceId: string,
): RoguelikeRunState {
  const choice = eventDef.choices.find((c) => c.id === choiceId);
  if (!choice) return run;
  if (choice.goldCost && run.gold < choice.goldCost) return run;

  const rng = createSeededRng(run.seed + run.currentFloor * 911 + choiceId.length * 37);
  let nextRun: RoguelikeRunState = {
    ...run,
    gold: run.gold - (choice.goldCost ?? 0),
  };

  let msg = '';
  const eff = choice.effect;
  if (eff.kind === 'ADD_GOLD') {
    nextRun.gold += eff.amount;
    msg = `Has recibido +${eff.amount} Oro de Expedición.`;
  } else if (eff.kind === 'ADD_SPECIFIC_CARDS') {
    nextRun.deckCardIds = [...nextRun.deckCardIds, ...eff.cardIds];
    const names = eff.cardIds.map((id) => getCardById(id)?.name ?? id).join(', ');
    msg = `Añadido a tu mazo: ${names}.`;
  } else if (eff.kind === 'ADD_RANDOM_CARDS') {
    const minRank = RARITY_ORDER[eff.minRarity];
    const pool = COLLECTIBLE_POOL.filter(
      (c) => RARITY_ORDER[getCardRarity(c.id)] >= minRank && !nextRun.deckCardIds.includes(c.id),
    );
    const picked = rng.shuffle(pool).slice(0, eff.count);
    nextRun.deckCardIds = [...nextRun.deckCardIds, ...picked.map((c) => c.id)];
    msg =
      picked.length > 0
        ? `¡Obtenido: ${picked.map((c) => c.name).join(', ')}!`
        : 'No quedaban cartas nuevas de esa rareza.';
  } else if (eff.kind === 'ADD_RANDOM_RELIC') {
    const unowned = ROGUELIKE_RELICS.filter((r) => !nextRun.relicIds.includes(r.id));
    if (unowned.length > 0) {
      const relic: RoguelikeRelicDef = pickRandom(unowned, rng);
      nextRun = grantRelicToRun(nextRun, relic.id);
      msg = `¡Reliquia obtenida: ${relic.icon} ${relic.name} (${relic.description})!`;
    } else {
      nextRun.gold += 45;
      msg = 'Ya posees todas las Reliquias: recibes +45 Oro de Expedición.';
    }
  } else if (eff.kind === 'OPEN_ENERGY_PICK') {
    return {
      ...nextRun,
      activeEvent: {
        eventId: eventDef.id,
        energyPickCount: eff.count,
      },
    };
  } else if (eff.kind === 'GAMBLE_GOLD') {
    if (rng.nextFloat() < 0.55) {
      nextRun.gold += eff.winGold;
      msg = `¡Victoria en la apuesta! Ganas +${eff.winGold} Oro de Expedición.`;
    } else {
      msg = `Mala suerte... pierdes los ${eff.stake} Oro apostados.`;
    }
  } else if (eff.kind === 'OPEN_PURGE_PICK') {
    if (nextRun.deckCardIds.length <= ROGUELIKE_MIN_DECK_SIZE) {
      const fallbackGold = eff.bonusGold ?? 15;
      nextRun.gold += fallbackGold;
      msg = `Tu mazo ya está en el mínimo de ${ROGUELIKE_MIN_DECK_SIZE} cartas: recibes +${fallbackGold} Oro en compensación.`;
    } else {
      return {
        ...nextRun,
        activeEvent: {
          eventId: eventDef.id,
          purgePickOpen: true,
          purgePickBonusGold: eff.bonusGold ?? 0,
        },
      };
    }
  } else if (eff.kind === 'ADD_RANDOM_BY_TYPE') {
    const minRank = RARITY_ORDER[eff.minRarity ?? 'COMMON'];
    let pool = COLLECTIBLE_POOL.filter(
      (c) =>
        c.type === eff.cardType &&
        RARITY_ORDER[getCardRarity(c.id)] >= minRank &&
        (c.type === 'ITEM'
          ? nextRun.deckCardIds.filter((id) => id === c.id).length < 3
          : !nextRun.deckCardIds.includes(c.id)),
    );
    if (pool.length === 0) {
      pool = COLLECTIBLE_POOL.filter(
        (c) => c.type === eff.cardType && !nextRun.deckCardIds.includes(c.id),
      );
    }
    const picked = rng.shuffle(pool).slice(0, eff.count);
    nextRun.deckCardIds = [...nextRun.deckCardIds, ...picked.map((c) => c.id)];
    msg =
      picked.length > 0
        ? `¡Obtenido: ${picked.map((c) => c.name).join(', ')}!`
        : 'No quedaban cartas nuevas de ese tipo para tu mazo.';
  } else if (eff.kind === 'GAMBLE_RELIC') {
    const unowned = ROGUELIKE_RELICS.filter((r) => !nextRun.relicIds.includes(r.id));
    if (rng.nextFloat() < eff.winChance && unowned.length > 0) {
      const relic: RoguelikeRelicDef = pickRandom(unowned, rng);
      nextRun = grantRelicToRun(nextRun, relic.id);
      msg = `¡Suerte bizarra! Reliquia obtenida: ${relic.icon} ${relic.name} (${relic.description}).`;
    } else {
      nextRun.gold += eff.fallbackGold;
      msg =
        eff.fallbackGold > 0
          ? `No encontraste reliquia, pero recuperas +${eff.fallbackGold} Oro de Expedición.`
          : 'No hubo suerte esta vez...';
    }
  } else if (eff.kind === 'ADD_GOLD_AND_RANDOM_CARD') {
    nextRun.gold += eff.gold;
    const minRank = RARITY_ORDER[eff.minRarity];
    const pool = COLLECTIBLE_POOL.filter(
      (c) => RARITY_ORDER[getCardRarity(c.id)] >= minRank && !nextRun.deckCardIds.includes(c.id),
    );
    const picked = pool.length > 0 ? pickRandom(pool, rng) : null;
    if (picked) {
      nextRun.deckCardIds = [...nextRun.deckCardIds, picked.id];
      msg = `Has ganado +${eff.gold} Oro y la carta ${picked.name}.`;
    } else {
      msg = `Has ganado +${eff.gold} Oro de Expedición.`;
    }
  }

  return {
    ...nextRun,
    activeEvent: {
      eventId: eventDef.id,
      resolvedMessage: msg,
    },
  };
}

export function resolveEventPurgeCard(
  run: RoguelikeRunState,
  deckIndex: number,
): RoguelikeRunState {
  if (!run.activeEvent || !run.activeEvent.purgePickOpen) return run;
  if (run.deckCardIds.length <= ROGUELIKE_MIN_DECK_SIZE) return run;
  if (deckIndex < 0 || deckIndex >= run.deckCardIds.length) return run;

  const removedId = run.deckCardIds[deckIndex]!;
  const removedName = getCardById(removedId)?.name ?? removedId;
  const nextDeck = [...run.deckCardIds];
  nextDeck.splice(deckIndex, 1);
  const bonusGold = run.activeEvent.purgePickBonusGold ?? 0;

  return {
    ...run,
    gold: run.gold + bonusGold,
    deckCardIds: nextDeck,
    activeEvent: {
      eventId: run.activeEvent.eventId,
      resolvedMessage:
        bonusGold > 0
          ? `Has purgado ${removedName} de tu mazo y ganado +${bonusGold} Oro.`
          : `Has purgado ${removedName} de tu mazo.`,
    },
  };
}

/**
 * Computes real Speedwagon Coins meta-reward when a Roguelike run finishes (Defeat, Abandon, or Victory).
 */
export function computeRoguelikeMetaReward(run: RoguelikeRunState): {
  coins: number;
  packCount: number;
  floorsCleared: number;
  breakdown: string;
} {
  const diffMeta = ROGUELIKE_DIFFICULTY_META[run.difficulty ?? 'NORMAL'];
  const floorsCleared =
    run.status === 'VICTORY'
      ? ROGUELIKE_TOTAL_FLOORS
      : Math.max(0, run.currentFloor - (run.status === 'DEFEAT' ? 1 : 0));
  const floorCoins = floorsCleared * 18;
  const eliteCoins = run.elitesWon * 35;
  const bossCoins = run.bossesWon * 90;
  const victoryBonus = run.status === 'VICTORY' ? 400 : 0;
  const rawCoins = Math.max(25, floorCoins + eliteCoins + bossCoins + victoryBonus);
  const coins = Math.max(25, Math.round(rawCoins * diffMeta.metaCoinMultiplier));
  const packCount = run.status === 'VICTORY' ? diffMeta.victoryPackCount : 0;

  const parts = [`Dificultad ${diffMeta.label}`, `Pisos (${floorsCleared}): +${floorCoins}`];
  if (run.elitesWon > 0) parts.push(`Élites (${run.elitesWon}): +${eliteCoins}`);
  if (run.bossesWon > 0) parts.push(`Jefes (${run.bossesWon}): +${bossCoins}`);
  if (victoryBonus > 0) parts.push(`¡Victoria Piso 30!: +${victoryBonus}`);
  if (packCount > 0) parts.push(`+${packCount} Sobre(s) General(es)`);

  return {
    coins,
    packCount,
    floorsCleared,
    breakdown: parts.join(' · '),
  };
}
