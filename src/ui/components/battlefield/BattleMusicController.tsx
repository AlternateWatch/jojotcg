import { useEffect, useRef, useState } from 'react';
import { Music, Volume2, VolumeX } from 'lucide-react';
import { getBattleTrackById } from '../../../data/battleMusic';

interface BattleMusicControllerProps {
  trackId: string | null;
}

const MUSIC_PREFS_KEY = 'jojo_tcg_music_prefs_v1';

function readInitialVolumeAndMute(): { volume: number; muted: boolean } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { volume: 0.35, muted: false };
  }
  try {
    const raw = window.localStorage.getItem(MUSIC_PREFS_KEY);
    if (!raw) return { volume: 0.35, muted: false };
    const parsed = JSON.parse(raw) as { volume?: number; muted?: boolean };
    return {
      volume:
        typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 1
          ? parsed.volume
          : 0.35,
      muted: Boolean(parsed.muted),
    };
  } catch {
    return { volume: 0.35, muted: false };
  }
}

export function BattleMusicController({ trackId }: BattleMusicControllerProps) {
  const track = getBattleTrackById(trackId);
  const initial = useRef(readInitialVolumeAndMute()).current;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(initial.muted);
  const [volume] = useState(initial.volume);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
  }, [muted, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    audio.volume = muted ? 0 : volume;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Retry on first user pointer interaction if browser blocked autoplay
      const unlock = () => {
        void audio.play().catch(() => {});
        window.removeEventListener('pointerdown', unlock);
      };
      window.addEventListener('pointerdown', unlock, { once: true });
    });
    return () => {
      audio.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id]);

  if (!track) return null;

  return (
    <>
      <audio ref={audioRef} src={track.src} loop preload="auto" />
      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        title={`${muted ? 'Activar' : 'Silenciar'} música de batalla: ${track.title}`}
        className={`jojo-btn-ink flex max-w-[170px] items-center gap-1 px-2 py-1 text-[11px] font-bold uppercase ${
          muted ? 'text-zinc-500' : 'text-[#f2c12e]'
        }`}
      >
        {muted ? <VolumeX size={12} className="shrink-0" /> : <Volume2 size={12} className="shrink-0" />}
        <Music size={11} className="hidden shrink-0 sm:inline" />
        <span className="hidden truncate sm:inline">{track.jpTitle ?? track.title}</span>
      </button>
    </>
  );
}
