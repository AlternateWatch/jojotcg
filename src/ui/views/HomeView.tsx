import { motion } from 'framer-motion';
import { ArrowRight, ShieldAlert, UserCheck } from 'lucide-react';
import { CAMPAIGN_PARTS } from '../../data/campaignData';
import { getCardById } from '../../data/cardRegistry';
import { ALL_MILESTONES } from '../../data/milestonesData';
import { TUTORIAL_LESSONS } from '../../data/tutorialData';
import { PLAYMAT_THEMES } from '../../services/assetResolver';
import {
  getClaimableMilestonesCount,
  getCollectionProgress,
} from '../../services/progressionService';
import type { PlaymatThemeId } from '../../services/storageService';
import { useAppStore } from '../../store/useAppStore';
import { CardView } from '../components/cards/CardView';

const SHOWCASE_IDS = [
  'char-jotaro-kujo',
  'stand-star-platinum',
  'evo-kars-ultimate',
  'stand-the-world',
  'char-dio',
];

export function HomeView() {
  const setScreen = useAppStore((s) => s.setScreen);
  const openBattleSetup = useAppStore((s) => s.openBattleSetup);
  const playmatTheme = useAppStore((s) => s.settings.playmatTheme);
  const setPlaymatTheme = useAppStore((s) => s.setPlaymatTheme);
  const openInspector = useAppStore((s) => s.openInspector);
  const progression = useAppStore((s) => s.progression);
  const authUser = useAppStore((s) => s.authUser);
  const setShowAuthModal = useAppStore((s) => s.setShowAuthModal);
  const roguelikeRun = useAppStore((s) => s.roguelikeRun);
  const bestRoguelikeFloor = useAppStore((s) => s.bestRoguelikeFloor);
  const draftRun = useAppStore((s) => s.draftRun);

  const coll = getCollectionProgress(progression);
  const campaignTotal = CAMPAIGN_PARTS.reduce((sum, p) => sum + (p.available ? p.stages.length : 0), 0);
  const campaignCleared = (progression.completedCampaignStages ?? []).length;
  const tutorialCleared = (progression.completedTutorialLessons ?? []).length;
  const milestonesClaimed = (progression.claimedMilestones ?? []).length;
  const milestonesReady = getClaimableMilestonesCount(progression);

  const showcaseCards = SHOWCASE_IDS.map(getCardById).filter(
    (c): c is NonNullable<typeof c> => Boolean(c),
  );

  const menuEntries = [
    {
      index: '01',
      title: `CAMPAÑA & TUTORIAL (${campaignCleared}/${campaignTotal})`,
      sub: `Mapas por Partes contra la IA · Tutorial guiado (${tutorialCleared}/${TUTORIAL_LESSONS.length}) con recompensas`,
      accent: 'bg-[#2952d9] text-white',
      onClick: () => setScreen('CAMPAIGN'),
    },
    {
      index: '02',
      title: roguelikeRun
        ? `ARCADE · ROGUELIKE PISO ${roguelikeRun.currentFloor}/30 & DRAFT`
        : draftRun
          ? `ARCADE · DRAFT (${draftRun.wins}V-${draftRun.losses}D) & ROGUELIKE`
          : `MODO ARCADE (ROGUELIKE & DRAFT${bestRoguelikeFloor > 0 ? ` · PISO ${bestRoguelikeFloor}` : ''})`,
      sub: 'Expedición Roguelike de 30 pisos (con Ascensión 1–5) y Arena Draft de 5 victorias',
      accent: 'bg-[#9333ea] text-white',
      onClick: () => setScreen('ROGUELIKE'),
    },
    {
      index: '03',
      title: 'LIGA COMPETITIVA (1V1 & VS IA)',
      sub: 'Dos rankings semanales con entrada en monedas y recompensas al cierre de cada semana',
      accent: 'bg-[#e6194b] text-white',
      onClick: () => setScreen('COMPETITIVE'),
    },
    {
      index: '04',
      title: 'MULTIJUGADOR ONLINE 1V1',
      sub: 'Busca partida automática o crea/únete a una sala privada con código',
      accent: 'bg-[#00b87c] text-[#0b090e]',
      onClick: () => openBattleSetup('ONLINE'),
    },
    {
      index: '05',
      title: 'COMBATE VS IA & LOCAL',
      sub: 'Duelos contra la IA (Fácil / Normal / Difícil) o 1v1 en el mismo equipo',
      accent: 'bg-[#f2c12e] text-[#0b090e]',
      onClick: () => openBattleSetup('VS_AI'),
    },
    {
      index: '06',
      title: 'TIENDA DE SOBRES',
      sub: `Abre sobres por Parte o Correlación · ${progression.coins.toLocaleString()} monedas`,
      accent: 'bg-[#b91c1c] text-white',
      onClick: () => setScreen('SHOP'),
    },
    {
      index: '07',
      title:
        milestonesReady > 0
          ? `CARTAS, MAZOS & HITOS (${milestonesReady} ¡LISTO!)`
          : `CARTAS, MAZOS & HITOS (${coll.unlocked}/${coll.total})`,
      sub:
        milestonesReady > 0
          ? `Colección, Forja, Constructor de Mazos y ${milestonesReady} hito(s) listo(s) para reclamar`
          : `Colección, Forja de repetidas, Constructor de Mazos e Hitos (${milestonesClaimed}/${ALL_MILESTONES.length})`,
      accent:
        milestonesReady > 0
          ? 'bg-[#1d1727] text-[#f2c12e] border-[#f2c12e]'
          : 'bg-[#1d1727] text-[#f5efe0]',
      onClick: () => setScreen('COLLECTION'),
    },
  ];

  return (
    <div
      className="relative flex min-h-[calc(100vh-56px)] flex-col justify-between overflow-hidden bg-[#0b090e]"
      style={{
        backgroundImage: 'url(/assets/patterns/pattern2.png)',
        backgroundSize: '380px',
      }}
    >
      {/* Dramatic diagonal obsidian ink slash covering the left editorial zone */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(108deg, rgba(11,9,14,0.97) 0%, rgba(11,9,14,0.94) 52%, rgba(28,11,42,0.72) 52.2%, rgba(11,9,14,0.88) 100%)',
        }}
      />

      {/* Subtle manga halftone band */}
      <div className="manga-halftone pointer-events-none absolute inset-0 opacity-60" />

      {/* Katakana SFX graphic watermark — pure Araki typography */}
      <motion.div
        aria-hidden="true"
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4.8, repeat: Infinity, ease: 'easeInOut' }}
        className="pointer-events-none absolute -right-4 top-8 select-none font-jojo-display text-[130px] leading-none text-[#e6194b]/15 lg:text-[210px]"
        style={{ writingMode: 'vertical-rl' }}
      >
        ゴゴゴゴ
      </motion.div>

      {/* MAIN POSTER GRID */}
      <div className="relative z-10 mx-auto grid w-full max-w-[1440px] flex-1 grid-cols-1 items-center gap-12 px-5 py-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Left: Title Lockup + Arcade Main Menu */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-8"
        >
          {/* Editorial Issue Masthead */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 border-l-4 border-[#e6194b] pl-3 text-xs font-bold tracking-[0.26em] text-[#f2c12e] uppercase">
              <span>PHANTOM BLOOD — GOLDEN WIND</span>
              <span className="text-zinc-500">/</span>
              <span className="text-[#f5efe0]/80">REGLAMENTO OFICIAL</span>
            </div>

            <h1 className="font-jojo-display text-5xl leading-[0.94] uppercase sm:text-6xl lg:text-7xl">
              <span className="block text-[#f2c12e] drop-shadow-[4px_4px_0_#060508]">
                JOJO&apos;S BIZARRE
              </span>
              <span className="block text-[#f5efe0] drop-shadow-[4px_4px_0_#060508]">
                ADVENTURE <span className="text-[#e6194b]">TCG</span>
              </span>
            </h1>

            {/* Guest / Account Persistence Banner */}
            <div className="pt-2">
              {authUser ? (
                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className="inline-flex items-center gap-2 border-2 border-[#060508] bg-[#00b87c] px-3.5 py-1.5 text-left text-xs font-bold text-[#0b090e] shadow-[3px_3px_0_#060508] transition hover:bg-[#00e599]"
                >
                  <UserCheck size={15} />
                  <span>
                    Conectado como <strong>{authUser.username}</strong> · Progreso guardado en el
                    servidor
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAuthModal(true)}
                  className="inline-flex max-w-lg items-center gap-2.5 border-2 border-[#060508] border-l-4 border-l-[#f2c12e] bg-[#1b1426] px-3.5 py-2 text-left text-xs text-zinc-200 shadow-[4px_4px_0_#060508] transition hover:border-[#f2c12e]"
                >
                  <ShieldAlert size={18} className="shrink-0 text-[#f2c12e]" />
                  <span>
                    Jugando como <strong>Invitado</strong> (tus datos se borrarán al cerrar la
                    ventana).{' '}
                    <strong className="text-[#f2c12e] underline">
                      Haz clic aquí para Crear Cuenta o Iniciar Sesión
                    </strong>
                    .
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Vertical Skewed Arcade Menu */}
          <div className="max-w-lg space-y-3">
            {menuEntries.map((item, idx) => (
              <motion.button
                key={item.index}
                type="button"
                initial={{ opacity: 0, x: -32 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  delay: 0.06 + idx * 0.055,
                  type: 'spring',
                  stiffness: 380,
                  damping: 26,
                }}
                whileTap={{ scale: 0.97 }}
                onClick={item.onClick}
                className={`group flex w-full -skew-x-6 items-center justify-between border-2 border-[#060508] px-5 py-3.5 text-left shadow-[5px_5px_0_#060508] transition-all duration-150 hover:-translate-x-1 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_#060508] active:translate-x-1 active:translate-y-1 active:shadow-[1px_1px_0_#060508] ${item.accent}`}
              >
                <div className="flex skew-x-6 items-baseline gap-4">
                  <span className="font-mono text-xs font-bold opacity-65">{item.index}</span>
                  <div>
                    <div className="font-jojo-heading text-2xl leading-none tracking-[0.09em]">
                      {item.title}
                    </div>
                    <div className="mt-1 text-xs font-medium opacity-80">{item.sub}</div>
                  </div>
                </div>
                <ArrowRight
                  size={20}
                  className="shrink-0 skew-x-6 transition-transform group-hover:translate-x-1.5"
                />
              </motion.button>
            ))}
          </div>

          {/* Compact Playmat Swatch Selector */}
          <div className="max-w-lg pt-2">
            <div className="mb-2 flex items-center justify-between text-[11px] font-bold tracking-[0.18em] text-zinc-400 uppercase">
              <span>Tapete de Arena activo</span>
              <span className="text-[#f2c12e]">{PLAYMAT_THEMES[playmatTheme].label}</span>
            </div>
            <div className="flex items-center gap-2">
              {(Object.keys(PLAYMAT_THEMES) as PlaymatThemeId[]).map((tid) => {
                const theme = PLAYMAT_THEMES[tid];
                const isSelected = playmatTheme === tid;
                return (
                  <button
                    key={tid}
                    type="button"
                    title={theme.label}
                    onClick={() => setPlaymatTheme(tid)}
                    className={`h-10 w-14 border-2 bg-cover bg-center transition ${
                      isSelected
                        ? 'scale-105 border-[#f2c12e] shadow-[3px_3px_0_#060508]'
                        : 'border-[#060508] opacity-65 hover:opacity-100'
                    }`}
                    style={{ backgroundImage: `url(${theme.patternUrl})` }}
                  />
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Right: Dramatic Physical Card Spread */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="relative flex min-h-[380px] flex-col items-center justify-center"
        >
          {/* Diagonal gold accent plate behind cards */}
          <div className="pointer-events-none absolute h-64 w-80 -rotate-6 border-2 border-[#060508] bg-[#e6194b]/25 shadow-[8px_8px_0_#060508] sm:h-72 sm:w-[440px]" />

          <div className="relative flex items-center justify-center py-6">
            {showcaseCards.map((card, i) => {
              const offset = i - 2;
              return (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, rotate: 0, y: 36, scale: 0.88 }}
                  animate={{
                    opacity: 1,
                    rotate: offset * 7,
                    y: Math.abs(offset) * 14,
                    scale: 1,
                  }}
                  transition={{
                    delay: 0.1 + i * 0.055,
                    type: 'spring',
                    stiffness: 300,
                    damping: 22,
                  }}
                  whileHover={{ y: -26, scale: 1.09, rotate: 0, zIndex: 45 }}
                  style={{
                    marginLeft: i === 0 ? 0 : -68,
                    zIndex: 10 + (3 - Math.abs(offset)),
                  }}
                  className="transition-shadow"
                >
                  <CardView
                    card={card}
                    size="md"
                    onClick={() => openInspector(card.id)}
                  />
                </motion.div>
              );
            })}
          </div>

          <div className="relative z-20 mt-4 -skew-x-10 border-2 border-[#060508] bg-[#f5efe0] px-4 py-1 text-[11px] font-bold tracking-widest text-[#0b090e] uppercase shadow-[3px_3px_0_#060508]">
            <span className="inline-block skew-x-10">
              Haz clic en cualquier carta para abrir su ficha
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
