import type { PlaymatThemeId } from '../services/storageService';

export type AssetCardFolder = 'official' | 'items' | 'energies';

export interface CardAssetInfo {
  imageId: string;
  folder: AssetCardFolder;
  extension: 'png' | 'jpg' | 'webp' | 'svg';
  /** True when the image is a complete pre-rendered card (e.g. CardConjurer PNG). */
  isFullCardRender: boolean;
  /** False for cards waiting on user-provided artwork (uses neutral placeholder). */
  hasArtworkFile: boolean;
}

/**
 * Manifest of all 69 official card PNGs provided by the user.
 * Adding new artwork only requires dropping the file into public/assets/cards/<folder>/
 * and registering its imageId (or setting a custom override in user settings).
 */
export const OFFICIAL_CARD_IMAGE_IDS = new Set<string>([
  'akira-otoishi',
  'bastet',
  'bruford',
  'bruno-bucciarati',
  'caesar-zeppeli',
  'capitan-tenille',
  'crazy-diamond',
  'cream',
  'dark-blue-moon',
  'devo-el-maldito',
  'dio-brando',
  'dio',
  'dire',
  'donovan',
  'ebony-devil',
  'echoes-act-1',
  'emperor',
  'erina-pendleton',
  'esidisi',
  'forever',
  'geb',
  'giorno-giovanna',
  'gold-experience',
  'gold-experience-requiem',
  'gray-fly',
  'guido-mista',
  'harvest',
  'heavens-door',
  'hermit-purple',
  'hierophant-green',
  'hol-horse',
  'horus',
  'iggy',
  'j-geil',
  'jean-pierre-polnareff',
  'jonathan-joestar',
  'joseph-joestar-viejo',
  'joseph-joestar',
  'josuke-higashikata',
  'jotaro-kujo',
  'kars-forma-de-vida-definitiva',
  'kars',
  'killer-queen',
  'killer-queen-bites-the-dust',
  'koichi-hirose',
  'kosaku-kawajiri',
  'lisa-lisa',
  'love-deluxe',
  'magicians-red',
  'mariah',
  'muhammad-avdol',
  'noriaki-kakyoin',
  'n-doul',
  'okuyasu-nijimura',
  'pet-shop',
  'red-hot-chilli-pepper',
  'robert-e-o-speedwagon',
  'rohan-kishibe',
  'rubber-soul',
  'rudol-von-stroheim',
  'santana',
  'sex-pistols',
  'shigekiyo-yangu',
  'silver-chariot-requiem',
  'silver-chariot',
  'star-platinum',
  'star-platinum-the-world',
  'sticky-fingers',
  'straizo',
  'straizo-vampiro',
  'stray-cat',
  'strength',
  'tarkus',
  'the-fool',
  'the-hand',
  'the-world',
  'tonpetty',
  'tower-of-gray',
  'vanilla-ice',
  'wamuu',
  'wang-chan',
  'will-a-zeppeli',
  'yellow-temperance',
  'yoshikage-kira',
  'yukako-yamagishi',
]);

export const OFFICIAL_ITEM_IMAGE_IDS = new Set<string>([
  'ataud-de-dio',
  'atraccion-usuarios-stand',
  'carterista-de-nueva-york',
  'cinta-de-caesar',
  'clackers',
  'comida-de-tonio',
  'entrenamiento-air-supplena',
  'estilo-de-combate-ogre-street',
  'flecha-de-stand',
  'flecha-requiem',
  'mascara-de-piedra',
  'mechero-de-polpo',
  'muerte-de-danny',
  'piedra-roja-de-aja',
  'pluck',
  'suministros-speedwagon',
]);

export const OFFICIAL_ENERGY_IMAGE_IDS = new Set<string>([
  'energy-colorless',
  'energy-electric',
  'energy-fire',
  'energy-water',
  'energy-psychic',
  'energy-light',
  'energy-nature',
  'energy-stand',
]);

export const OFFICIAL_CARD_EXTENSIONS: Record<string, 'webp'> = {
  'capitan-tenille': 'webp',
  'dark-blue-moon': 'webp',
  strength: 'webp',
};

export function getOfficialCardFilename(imageId: string): string {
  const ext = OFFICIAL_CARD_EXTENSIONS[imageId] ?? 'png';
  return `${imageId}.${ext}`;
}

export function resolveCardAsset(
  imageId: string,
  folder: AssetCardFolder = 'official',
  _customOverrides?: Record<string, string>,
): { url: string | null; isFullCardRender: boolean; expectedPath: string } {
  const ext = folder === 'official' ? (OFFICIAL_CARD_EXTENSIONS[imageId] ?? 'png') : 'png';
  const expectedPath = `/assets/cards/${folder}/${imageId}.${ext}`;
  if (folder === 'official' && OFFICIAL_CARD_IMAGE_IDS.has(imageId)) {
    return {
      url: expectedPath,
      isFullCardRender: true,
      expectedPath,
    };
  }
  if (folder === 'items' && OFFICIAL_ITEM_IMAGE_IDS.has(imageId)) {
    return {
      url: expectedPath,
      isFullCardRender: true,
      expectedPath,
    };
  }
  if (folder === 'energies' && OFFICIAL_ENERGY_IMAGE_IDS.has(imageId)) {
    return {
      url: expectedPath,
      isFullCardRender: true,
      expectedPath,
    };
  }

  // Energies and future cards without provided files cleanly use placeholder UI
  return {
    url: null,
    isFullCardRender: false,
    expectedPath,
  };
}

export interface PlaymatThemeConfig {
  id: PlaymatThemeId;
  label: string;
  patternUrl: string;
  overlayGradient: string;
  isLight: boolean;
}

export const PLAYMAT_THEMES: Record<PlaymatThemeId, PlaymatThemeConfig> = {
  'killer-queen-purple': {
    id: 'killer-queen-purple',
    label: 'Killer Queen — Púrpura Real',
    patternUrl: '/assets/patterns/pattern2.png',
    overlayGradient:
      'radial-gradient(circle at 50% 45%, rgba(28, 12, 46, 0.58) 0%, rgba(11, 7, 19, 0.90) 100%)',
    isLight: false,
  },
  'killer-queen-dark': {
    id: 'killer-queen-dark',
    label: 'Killer Queen — Obsidiana',
    patternUrl: '/assets/patterns/pattern1.png',
    overlayGradient:
      'radial-gradient(circle at 50% 45%, rgba(18, 14, 28, 0.62) 0%, rgba(9, 7, 15, 0.92) 100%)',
    isLight: false,
  },
  'jojo-emblems-dark': {
    id: 'jojo-emblems-dark',
    label: 'Emblemas JoJo — Noche',
    patternUrl: '/assets/patterns/pattern5.png',
    overlayGradient:
      'radial-gradient(circle at 50% 45%, rgba(22, 12, 40, 0.68) 0%, rgba(8, 6, 14, 0.92) 100%)',
    isLight: false,
  },
  'bucciarati-dark': {
    id: 'bucciarati-dark',
    label: 'Bucciarati — Passione Oscuro',
    patternUrl: '/assets/patterns/pattern4.png',
    overlayGradient:
      'radial-gradient(circle at 50% 45%, rgba(15, 18, 36, 0.66) 0%, rgba(8, 7, 16, 0.92) 100%)',
    isLight: false,
  },
  'jojo-emblems-light': {
    id: 'jojo-emblems-light',
    label: 'Emblemas JoJo — Morioh',
    patternUrl: '/assets/patterns/pattern6.png',
    overlayGradient:
      'radial-gradient(circle at 50% 45%, rgba(30, 18, 52, 0.78) 0%, rgba(14, 9, 24, 0.92) 100%)',
    isLight: false,
  },
  'bucciarati-light': {
    id: 'bucciarati-light',
    label: 'Bucciarati — Blanco Nápoles',
    patternUrl: '/assets/patterns/pattern3.png',
    overlayGradient:
      'radial-gradient(circle at 50% 45%, rgba(26, 22, 44, 0.78) 0%, rgba(12, 9, 22, 0.92) 100%)',
    isLight: false,
  },
};

export const CARD_BACK_PATTERN_URL = '/assets/patterns/pattern2.png';
