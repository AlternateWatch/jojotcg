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
    name: 'Mansión de los Joestar',
    type: 'LOCATION',
    part: 1,
    imageId: 'mansion-de-los-joestar',
    assetFolder: 'locations',
    description:
      'La residencia de la familia Joestar, dónde todo empezó. Una vez esbelta y majestuosa, ahora reducida a cenizas. Al estar en activo: Potencia en 10 puntos la vida y el daño de todos los Joestar y sus stands.',
    effects: [{ kind: 'JOESTAR_HP_AND_DAMAGE_BONUS', bonusHp: 10, bonusDamage: 10 }],
    tags: ['official', 'location', 'joestar'],
  },
  {
    id: 'loc-ogre-street',
    name: 'Ogre Street',
    type: 'LOCATION',
    part: 1,
    imageId: 'ogre-street',
    assetFolder: 'locations',
    description:
      'Una de las calles más peligrosas de Lóndres. Aquí encontrarás a la peor calaña que existe. Al estar en activo: Al final del turno, ambos jugadores lanzan una moneda. Si a alguno le sale cara, el personaje activo de ese jugador pasa a tener sangrado.',
    effects: [{ kind: 'END_TURN_BOTH_PLAYERS_COIN_BLEED' }],
    tags: ['official', 'location', 'ogre-street'],
  },
];
