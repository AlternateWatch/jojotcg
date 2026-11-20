import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  Disc3,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MENU_PLAYLIST } from '../../../data/menuMusic';

interface MenuMusicPlayerProps {
  /** Active in menus; pauses automatically during battles */
  active: boolean;
}

const MUSIC_PREFS_KEY = 'jojo_tcg_music_prefs_v1';

interface SavedMusicPrefs {
  volume: number;
  muted: boolean;
  repeatOne: boolean;
}

function loadMusicPrefs(): SavedMusicPrefs {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { volume: 0.35, muted: false, repeatOne: true };
  }
  try {
    const raw = window.localStorage.getItem(MUSIC_PREFS_KEY);
    if (!raw) return { volume: 0.35, muted: false, repeatOne: true };
    const parsed = JSON.parse(raw) as Partial<SavedMusicPrefs>;
    return {
      volume:
        typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 1
          ? parsed.volume
          : 0.35,
      muted: Boolean(parsed.muted),
      repeatOne: parsed.repeatOne !== undefined ? Boolean(parsed.repeatOne) : true,
    };
  } catch {
    return { volume: 0.35, muted: false, repeatOne: true };
  }
}

function saveMusicPrefs(prefs: SavedMusicPrefs): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(MUSIC_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota errors
  }
}

export function MenuMusicPlayer({ active }: MenuMusicPlayerProps) {
  const initialPrefs = useRef<SavedMusicPrefs>(loadMusicPrefs()).current;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [repeatOne, setRepeatOne] = useState(initialPrefs.repeatOne);
  const [volume, setVolume] = useState(initialPrefs.volume);
  const [muted, setMuted] = useState(initialPrefs.muted);
  const [collapsed, setCollapsed] = useState(false);
  const [progress, setProgress] = useState(0);

  const track = MENU_PLAYLIST[trackIndex] ?? MENU_PLAYLIST[0];

  // Persist volume / mute / repeat preferences
  useEffect(() => {
    saveMusicPrefs({ volume, muted, repeatOne });
  }, [volume, muted, repeatOne]);

  // Sync audio element volume & mute
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
    audio.muted = muted;
  }, [volume, muted]);

  const tryPlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return false;
    try {
      await audio.play();
      setIsPlaying(true);
      return true;
    } catch {
      setIsPlaying(false);
      return false;
    }
  }, []);

  // Play/pause based on active (in-menu) and userPaused state, with autoplay unlock on first click/key
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;

    if (!active || userPaused) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    let cleanedUp = false;
    let listeningForUnlock = false;

    const handleUnlock = () => {
      if (cleanedUp) return;
      listeningForUnlock = false;
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
      void tryPlay();
    };

    void tryPlay().then((started) => {
      if (!started && !cleanedUp) {
        listeningForUnlock = true;
        window.addEventListener('pointerdown', handleUnlock, { once: true });
        window.addEventListener('keydown', handleUnlock, { once: true });
      }
    });

    return () => {
      cleanedUp = true;
      if (listeningForUnlock) {
        window.removeEventListener('pointerdown', handleUnlock);
        window.removeEventListener('keydown', handleUnlock);
      }
    };
  }, [active, userPaused, trackIndex, track, tryPlay]);

  const handleTogglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      setUserPaused(true);
    } else {
      setUserPaused(false);
      void tryPlay();
    }
  };

  const handleSkip = () => {
    const audio = audioRef.current;
    if (MENU_PLAYLIST.length <= 1) {
      if (audio) {
        audio.currentTime = 0;
        if (!userPaused && active) void tryPlay();
      }
      return;
    }
    setTrackIndex((prev) => (prev + 1) % MENU_PLAYLIST.length);
    setProgress(0);
  };

  const handleEnded = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (repeatOne || MENU_PLAYLIST.length <= 1) {
      audio.currentTime = 0;
      void tryPlay();
      return;
    }
    setTrackIndex((prev) => (prev + 1) % MENU_PLAYLIST.length);
    setProgress(0);
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || !Number.isFinite(audio.duration)) return;
    setProgress(Math.min(100, (audio.currentTime / audio.duration) * 100));
  };

  const handleVolumeChange = (nextVol: number) => {
    setVolume(nextVol);
    if (nextVol > 0 && muted) setMuted(false);
  };

  if (!track) return null;

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <>
      <audio
        ref={audioRef}
        src={track.src}
        preload="auto"
        onEnded={handleEnded}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <AnimatePresence>
        {active && (
          <motion.div
            key="menu-music-player"
            initial={{ opacity: 0, y: 18, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.94 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed right-4 bottom-4 z-35"
          >
            {collapsed ? (
              <motion.button
                type="button"
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => setCollapsed(false)}
                title={`Reproductor: ${track.title} — ${track.artist}`}
                aria-label="Abrir reproductor de música"
                className="flex h-11 w-11 items-center justify-center border-2 border-[#060508] bg-[#14101c] text-[#f2c12e] shadow-[4px_4px_0_#060508] transition hover:bg-[#1e1729]"
              >
                <Disc3 size={20} className={isPlaying ? 'animate-spin' : ''} style={{ animationDuration: '4s' }} />
              </motion.button>
            ) : (
              <div className="relative w-[272px] overflow-hidden border-2 border-[#060508] bg-[#14101c] shadow-[5px_5px_0_#060508]">
                {/* Slim top progress bar */}
                <div className="h-[3px] w-full bg-[#060508]">
                  <div
                    className="h-full bg-[#f2c12e] transition-[width] duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="px-3 py-2">
                  {/* Track info row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#060508] bg-[#e6194b] text-white shadow-[2px_2px_0_#060508]">
                        <Disc3
                          size={15}
                          className={isPlaying ? 'animate-spin' : ''}
                          style={{ animationDuration: '4s' }}
                        />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-jojo-heading text-sm leading-tight tracking-wider text-[#f2c12e] uppercase">
                          {track.title}
                        </div>
                        <div className="truncate text-[10px] font-medium text-zinc-400">
                          {track.artist}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setCollapsed(true)}
                      title="Minimizar reproductor"
                      aria-label="Minimizar reproductor"
                      className="flex h-6 w-6 shrink-0 items-center justify-center border border-[#060508] bg-[#1c1626] text-zinc-400 transition hover:text-[#f5efe0]"
                    >
                      <ChevronDown size={13} />
                    </button>
                  </div>

                  {/* Playback & Volume Controls */}
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleTogglePlay}
                        title={isPlaying ? 'Pausar música' : 'Reproducir música'}
                        aria-label={isPlaying ? 'Pausar música' : 'Reproducir música'}
                        className="flex h-7 w-7 items-center justify-center border border-[#060508] bg-[#f2c12e] text-[#0b090e] shadow-[2px_2px_0_#060508] transition hover:bg-[#ffd554]"
                      >
                        {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                      </button>

                      <button
                        type="button"
                        onClick={handleSkip}
                        title={
                          MENU_PLAYLIST.length > 1
                            ? 'Siguiente canción'
                            : 'Reiniciar canción'
                        }
                        aria-label="Saltar canción"
                        className="flex h-7 w-7 items-center justify-center border border-[#060508] bg-[#1c1626] text-[#f5efe0] shadow-[2px_2px_0_#060508] transition hover:bg-[#292038]"
                      >
                        <SkipForward size={13} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setRepeatOne((v) => !v)}
                        title={repeatOne ? 'Repetir canción: Activado' : 'Repetir lista'}
                        aria-label="Alternar repetición"
                        className={`flex h-7 w-7 items-center justify-center border border-[#060508] shadow-[2px_2px_0_#060508] transition ${
                          repeatOne
                            ? 'bg-[#e6194b] text-white'
                            : 'bg-[#1c1626] text-zinc-400 hover:text-[#f5efe0]'
                        }`}
                      >
                        {repeatOne ? <Repeat1 size={13} /> : <Repeat size={13} />}
                      </button>
                    </div>

                    {/* Volume Slider */}
                    <div className="flex flex-1 items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMuted((m) => !m)}
                        title={muted ? 'Activar sonido' : 'Silenciar'}
                        aria-label={muted ? 'Activar sonido' : 'Silenciar'}
                        className="text-zinc-300 transition hover:text-[#f2c12e]"
                      >
                        <VolumeIcon size={14} />
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={muted ? 0 : volume}
                        onChange={(e) => handleVolumeChange(Number.parseFloat(e.target.value))}
                        aria-label="Volumen de la música"
                        className="h-1.5 w-20 cursor-pointer accent-[#f2c12e]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
