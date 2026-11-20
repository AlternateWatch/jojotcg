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
];
