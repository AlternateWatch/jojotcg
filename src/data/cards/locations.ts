import type { LocationCard } from '../schemas/cardTypes';

/**
 * Official Location (Lugar) cards.
 * Only 1 copy of each Location card is allowed per deck.
 * When played, a Location sits horizontally between both players, affects BOTH players,
 * and remains active until replaced by another Location or removed by an ability.
 */
export const LOCATION_CARDS: LocationCard[] = [
  {
    id: 'loc-mansion-de-los-joestar',
    name: 'Mansión De Los Joestar',
    type: 'LOCATION',
    part: 1,
    imageId: 'mansion-de-los-joestar',
    assetFolder: 'locations',
    description:
      'La residencia de la familia Joestar, dónde todo empezó. Una vez esbelta y majestuosa, ahora reducida a cenizas. Al estar en activo: Potencia en 10 puntos la vida y el daño de todos los Joestar y sus stands.',
    effects: [{ kind: 'JOESTAR_HP_AND_DAMAGE_BONUS', bonusHp: 10, bonusDamage: 10 }],
    tags: ['official', 'location', 'joestar'],
  },
];
