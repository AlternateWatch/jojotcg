import type { ItemCard } from '../schemas/cardTypes';

/**
 * Official Item cards rendered with their exact artwork and effects from public/assets/cards/items/.
 * Frame color -> Part mapping:
 *  - Blue: Part 1
 *  - Purple: Part 2
 *  - Gray: Part 3
 *  - White: Part 4
 *  - Orange: Part 5
 */
export const ITEM_CARDS: ItemCard[] = [
  {
    id: 'item-pluck',
    name: '(P)luck',
    type: 'ITEM',
    part: 1,
    imageId: 'pluck',
    assetFolder: 'items',
    itemKind: 'EQUIPPABLE',
    targetScope: 'ANY_ALLY',
    description:
      'Espada del legendario caballero Bruford, otorgada a Jonathan Joestar antes de la muerte de Bruford. Al jugarla junto a un personaje: Aumenta en 10 puntos el daño de ataque del personaje o stand asociado al personaje.',
    effects: [{ kind: 'EQUIP_PASSIVE_DAMAGE_BONUS', bonusDamage: 10 }],
    tags: ['official', 'equippable', 'damage'],
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
    id: 'item-ataud-de-dio',
    name: 'Ataúd de DIO',
    type: 'ITEM',
    part: 1,
    imageId: 'ataud-de-dio',
    assetFolder: 'items',
    itemKind: 'CONSUMABLE',
    targetScope: 'PLAYER',
    description:
      'Ataúd utilizado para encerrar a un horror centenario. Al jugar por su cuenta: Aturde al personaje activo rival y le deshabilita la posibilidad de bajar al personaje a la banca.',
    effects: [{ kind: 'STUN_AND_LOCK_RETREAT_ENEMY_ACTIVE' }],
    tags: ['official', 'control', 'stun'],
  },
  {
    id: 'item-muerte-de-danny',
    name: 'Muerte de Danny',
    type: 'ITEM',
    part: 1,
    imageId: 'muerte-de-danny',
    assetFolder: 'items',
    itemKind: 'CONSUMABLE',
    targetScope: 'PLAYER',
    description:
      'La muerte de un amigo es lo peor que le puede pasar a un ser humano. Al jugar por su cuenta: El siguiente ataque de tu personaje u stand activo inflige 20 puntos de daño extra.',
    effects: [{ kind: 'NEXT_ATTACK_DAMAGE_BONUS', bonusDamage: 20 }],
    tags: ['official', 'damage', 'burst'],
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
    id: 'item-cinta-de-caesar',
    name: 'Cinta de Caesar',
    type: 'ITEM',
    part: 2,
    imageId: 'cinta-de-caesar',
    assetFolder: 'items',
    itemKind: 'EQUIPPABLE',
    targetScope: 'ANY_ALLY',
    description:
      'La cinta de pelo de Caesar. Otorgada por Caesar a Joseph Joestar momentos antes de su muerte. Al jugarla junto a un personaje: Aumenta en 20 puntos la vida máxima del personaje, y cura 20 puntos a su vida actual.',
    effects: [{ kind: 'EQUIP_PASSIVE_MAX_HP', bonusHp: 20 }],
    tags: ['official', 'equippable', 'healing'],
  },
  {
    id: 'item-clackers',
    name: 'Clackers',
    type: 'ITEM',
    part: 2,
    imageId: 'clackers',
    assetFolder: 'items',
    itemKind: 'EQUIPPABLE',
    targetScope: 'ANY_ALLY',
    description:
      'Arma estrella de Joseph Joestar. Al jugarla junto a un personaje: Aumenta en 20 puntos el daño de ataque del personaje o stand asociado al personaje si es usuario de hamon.',
    effects: [
      { kind: 'EQUIP_PASSIVE_CATEGORY_DAMAGE_BONUS', category: 'HAMON_USER', bonusDamage: 20 },
    ],
    tags: ['official', 'equippable', 'hamon'],
  },
  {
    id: 'item-suministros-speedwagon',
    name: 'Suministros de la fundación Speedwagon',
    type: 'ITEM',
    part: 2,
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
  {
    id: 'item-flecha-de-stand',
    name: 'Flecha de Stand',
    type: 'ITEM',
    part: 5,
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
    id: 'item-mechero-de-polpo',
    name: 'Mechero de Polpo',
    type: 'ITEM',
    part: 5,
    imageId: 'mechero-de-polpo',
    assetFolder: 'items',
    itemKind: 'EQUIPPABLE',
    targetScope: 'ANY_ALLY',
    description:
      'Mechero otorgado por un capo de la mafia a un joven con un sueño. Al jugarla junto a un personaje: Si el personaje no recibe daño este turno, roba una carta extra al final del turno.',
    effects: [{ kind: 'EQUIP_END_TURN_DRAW_IF_UNDAMAGED', count: 1 }],
    tags: ['official', 'equip', 'draw'],
  },
];
