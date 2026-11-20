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
  const toggleBtnRef = useRef<HTMLButtonElement | null>(null);

  const [trackIndex, setTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [awaitingGesture, setAwaitingGesture] = useState(false);
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
      setAwaitingGesture(false);
      return true;
    } catch {
      setIsPlaying(false);
      return false;
    }
  }, []);

  // Enabled by default in menus; if browser blocks autoplay, starts immediately on first gesture
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;

    if (!active || userPaused) {
      audio.pause();
      setIsPlaying(false);
      setAwaitingGesture(false);
      return;
    }

    let cleanedUp = false;
    let listening = false;

    const detachUnlock = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener('pointerdown', handleUnlock, true);
      window.removeEventListener('keydown', handleUnlock, true);
      window.removeEventListener('touchstart', handleUnlock, true);
    };

    const handleUnlock = (e: Event) => {
      if (cleanedUp) return;
      // Don't fight an explicit click on the play/pause toggle button
      if (toggleBtnRef.current && e.target instanceof Node && toggleBtnRef.current.contains(e.target)) {
        return;
      }
      detachUnlock();
      void tryPlay().then((started) => {
        if (!started && !cleanedUp) {
          setAwaitingGesture(true);
          attachUnlock();
        }
      });
    };

    const attachUnlock = () => {
      if (listening || cleanedUp) return;
      listening = true;
      window.addEventListener('pointerdown', handleUnlock, true);
      window.addEventListener('keydown', handleUnlock, true);
      window.addEventListener('touchstart', handleUnlock, true);
    };

    const handleCanPlay = () => {
      if (cleanedUp || !audio.paused) return;
      void tryPlay().then((started) => {
        if (!started && !cleanedUp) {
          setAwaitingGesture(true);
          attachUnlock();
        }
      });
    };

    audio.addEventListener('canplay', handleCanPlay);
    void tryPlay().then((started) => {
      if (!started && !cleanedUp) {
        setAwaitingGesture(true);
        attachUnlock();
      }
    });

    return () => {
      cleanedUp = true;
      audio.removeEventListener('canplay', handleCanPlay);
      detachUnlock();
    };
  }, [active, userPaused, trackIndex, track, tryPlay]);

  const handleTogglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      setUserPaused(true);
      setAwaitingGesture(false);
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
        setProgress(0);
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

  const effectiveVolume = muted ? 0 : volume;
  const volumePercent = Math.round(effectiveVolume * 100);
  const VolumeIcon = effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;

  return (
    <>
      <audio
        ref={audioRef}
        src={track.src}
        autoPlay
        preload="auto"
        onEnded={handleEnded}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => {
          setIsPlaying(true);
          setAwaitingGesture(false);
        }}
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
                <Disc3
                  size={20}
                  className={isPlaying ? 'animate-spin' : ''}
                  style={{ animationDuration: '4s' }}
                />
              </motion.button>
            ) : (
              <div className="relative w-[292px] overflow-hidden border-2 border-[#060508] bg-[#14101c] shadow-[5px_5px_0_#060508]">
                {/* Slim top playback progress bar */}
                <div className="h-[3px] w-full bg-[#060508]">
                  <div
                    className="h-full bg-[#f2c12e] transition-[width] duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="px-3 py-2.5">
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
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-jojo-heading text-sm leading-tight tracking-wider text-[#f2c12e] uppercase">
                            {track.title}
                          </span>
                          {awaitingGesture && !userPaused && (
                            <span className="shrink-0 border border-[#060508] bg-[#f2c12e] px-1 font-mono text-[8px] font-black text-[#0b090e] uppercase">
                              ON
                            </span>
                          )}
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

                  {/* Playback & Custom JoJo Volume Bar */}
                  <div className="mt-2.5 flex items-center justify-between gap-2.5 border-t border-white/10 pt-2">
                    <div className="flex items-center gap-1">
                      <button
                        ref={toggleBtnRef}
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

                    {/* Custom JoJo Manga Volume Slider */}
                    <div className="flex flex-1 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMuted((m) => !m)}
                        title={muted ? 'Activar sonido' : 'Silenciar'}
                        aria-label={muted ? 'Activar sonido' : 'Silenciar'}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center border border-[#060508] transition ${
                          effectiveVolume === 0
                            ? 'bg-[#2a0c16] text-[#e6194b]'
                            : 'bg-[#1c1626] text-[#f2c12e] hover:bg-[#292038]'
                        }`}
                      >
                        <VolumeIcon size={13} />
                      </button>

                      <div className="group relative flex h-5 flex-1 items-center">
                        {/* Styled Track */}
                        <div className="relative h-2.5 w-full overflow-hidden border-2 border-[#060508] bg-[#0b090e] shadow-[inset_0_1px_2px_rgba(0,0,0,0.85)]">
                          <div
                            className="h-full bg-gradient-to-r from-[#e6194b] via-[#f2c12e] to-[#ffe066] transition-[width] duration-75"
                            style={{ width: `${volumePercent}%` }}
                          />
                        </div>

                        {/* Sharp Arcade Thumb */}
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute top-1/2 h-4 w-2.5 -translate-x-1/2 -translate-y-1/2 border-2 border-[#060508] bg-[#f5efe0] shadow-[2px_2px_0_#060508] transition-transform group-hover:scale-110 group-hover:bg-[#f2c12e]"
                          style={{ left: `${volumePercent}%` }}
                        />

                        {/* Native Accessible Input Overlay */}
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.02}
                          value={effectiveVolume}
                          onChange={(e) => handleVolumeChange(Number.parseFloat(e.target.value))}
                          aria-label="Volumen de la música"
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                      </div>

                      <span className="w-7 shrink-0 text-right font-mono text-[10px] font-bold text-zinc-300">
                        {volumePercent}%
                      </span>
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
