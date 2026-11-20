import type { ItemCard } from '../schemas/cardTypes';

/**
 * Official Item cards rendered with their exact artwork and effects from public/assets/cards/items/.
 */
export const ITEM_CARDS: ItemCard[] = [
  {
    id: 'item-flecha-requiem',
    name: 'Flecha Réquiem',
    type: 'ITEM',
    part: 5,
    imageId: 'flecha-requiem',
    assetFolder: 'items',
    itemKind: 'CONSUMABLE',
    targetScope: 'PLAYER',
    catalystTag: 'requiem-arrow',
    description:
      'Flecha que despierta el verdadero potencial de un stand. Al jugar por su cuenta: Busca una evolución de un Stand en tu mazo, y añádela a tu mano. Al jugarla junto a un stand: Actua como objeto de evolución.',
    effects: [
      { kind: 'SEARCH_DECK', filter: 'STAND_EVOLUTION', maxCount: 1 },
      { kind: 'EVOLUTION_CATALYST', catalystTag: 'requiem-arrow' },
    ],
    tags: ['official', 'catalyst', 'search'],
  },
  {
    id: 'item-flecha-de-stand',
    name: 'Flecha de Stand',
    type: 'ITEM',
    part: 4,
    imageId: 'flecha-de-stand',
    assetFolder: 'items',
    itemKind: 'CONSUMABLE',
    targetScope: 'PLAYER',
    catalystTag: 'stand-arrow',
    description:
      'Flecha que despierta tu potencial interior. Al jugar por su cuenta: Busca un Stand en tu mazo, y añádelo a tu mano. Al jugarla junto a un stand: Actua como objeto de evolución.',
    effects: [
      { kind: 'SEARCH_DECK', filter: 'STAND', maxCount: 1 },
      { kind: 'EVOLUTION_CATALYST', catalystTag: 'stand-arrow' },
    ],
    tags: ['official', 'catalyst', 'search', 'stand'],
  },
  {
    id: 'item-mascara-de-piedra',
    name: 'Máscara de Piedra',
    type: 'ITEM',
    part: 1,
    imageId: 'mascara-de-piedra',
    assetFolder: 'items',
    itemKind: 'EQUIPPABLE',
    targetScope: 'ANY_ALLY',
    catalystTag: 'stone-mask',
    description:
      'Máscara que te libera de las restricciones de la naturaleza. Al jugarla junto a un personaje: Actúa como objeto de evolución o otorga 10 puntos de daño extra permanentes.',
    effects: [
      { kind: 'EQUIP_PASSIVE_DAMAGE_BONUS', bonusDamage: 10 },
      { kind: 'EVOLUTION_CATALYST', catalystTag: 'stone-mask' },
    ],
    tags: ['official', 'equippable', 'catalyst'],
  },
  {
    id: 'item-piedra-roja-de-aja',
    name: 'Piedra Roja de Aja',
    type: 'ITEM',
    part: 2,
    imageId: 'piedra-roja-de-aja',
    assetFolder: 'items',
    itemKind: 'EQUIPPABLE',
    targetScope: 'ANY_ALLY',
    catalystTag: 'red-stone-of-aja',
    description:
      'Una piedra capaz de absorber la luz solar y reflejarla. Al jugarla por su cuenta: Quema a un oponente. Al jugarla junto a un personaje: Actúa como objeto de evolución.',
    effects: [
      { kind: 'BURN_ENEMY_ACTIVE' },
      { kind: 'EVOLUTION_CATALYST', catalystTag: 'red-stone-of-aja' },
    ],
    tags: ['official', 'equippable', 'catalyst', 'burn'],
  },
  {
    id: 'item-comida-de-tonio',
    name: 'Comida de Tonio',
    type: 'ITEM',
    part: 4,
    imageId: 'comida-de-tonio',
    assetFolder: 'items',
    itemKind: 'CONSUMABLE',
    targetScope: 'ANY_ALLY',
    description:
      'Comida capaz de curar heridas y regenerar el alma. Al jugarla por su cuenta: Cura 40 puntos de salud a un personaje.',
    effects: [{ kind: 'HEAL_TARGET', amount: 40, curesBurn: true }],
    tags: ['official', 'healing'],
  },
  {
    id: 'item-suministros-speedwagon',
    name: 'Suministros de la fundación Speedwagon',
    type: 'ITEM',
    part: 3,
    imageId: 'suministros-speedwagon',
    assetFolder: 'items',
    itemKind: 'CONSUMABLE',
    targetScope: 'PLAYER',
    description:
      'Ayuda proveída por la fundación Speedwagon. Al jugarla por su cuenta: Roba dos cartas de tu mazo.',
    effects: [{ kind: 'DRAW_CARDS', count: 2 }],
    tags: ['official', 'draw'],
  },
  {
    id: 'item-atraccion-usuarios-stand',
    name: '¡Atracción entre usuarios de Stand!',
    type: 'ITEM',
    part: 4,
    imageId: 'atraccion-usuarios-stand',
    assetFolder: 'items',
    itemKind: 'CONSUMABLE',
    targetScope: 'PLAYER',
    description:
      'Propiedad de los usuarios de stand que hace que se atraigan entre sí. Al jugar por su cuenta: Busca hasta 2 cartas de Energía Básica en tu mazo, añádelas a tu mano y baraja el mazo.',
    effects: [{ kind: 'SEARCH_DECK', filter: 'ENERGY', maxCount: 2 }],
    tags: ['official', 'search', 'energy'],
  },
];
