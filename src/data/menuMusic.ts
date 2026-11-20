export interface MenuTrack {
  id: string;
  title: string;
  artist: string;
  src: string;
}

export const MENU_PLAYLIST: MenuTrack[] = [
  {
    id: 'lease',
    title: 'LEASE',
    artist: '阿保 剛 (Takeshi Abo)',
    src: '/assets/music/lease.flac',
  },
  {
    id: 'funky-beat',
    title: "AIN'T NOTHIN' LIKE A FUNKY BEAT",
    artist: 'Hideki Naganuma',
    src: '/assets/music/funky-beat.flac',
  },
  {
    id: 'studiopolis-zone-act-1',
    title: 'Lights, Camera, Action! - Studiopolis Zone Act 1',
    artist: 'Tee Lopes',
    src: '/assets/music/studiopolis-zone-act-1.flac',
  },
  {
    id: 'jump-up',
    title: 'Jump Up (Goddess of Victory: NIKKE)',
    artist: 'Cosmograph',
    src: '/assets/music/jump-up.flac',
  },
  {
    id: 'spinozza',
    title: 'SPINOZZA',
    artist: 'Bonesaw',
    src: '/assets/music/spinozza.flac',
  },
  {
    id: 'cross-the-tracks',
    title: 'Cross the Tracks (From Denshattack!)',
    artist: 'Richard Jacques',
    src: '/assets/music/cross-the-tracks.flac',
  },
  {
    id: 'windmill-isle-day',
    title: 'Windmill Isle - Day',
    artist: 'Tomoya Ohtani',
    src: '/assets/music/windmill-isle-day.flac',
  },
];
