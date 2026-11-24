import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { BookOpen, Coins, GraduationCap, Layers, Map, Trophy, User, UserCheck, Wrench } from 'lucide-react';
import { CAMPAIGN_PARTS } from '../data/campaignData';
import { ALL_MILESTONES } from '../data/milestonesData';
import { TUTORIAL_LESSONS } from '../data/tutorialData';
import { getClaimableMilestonesCount, getCollectionProgress } from '../services/progressionService';
import { useAppStore, type AppScreen } from '../store/useAppStore';
import { CardInspectorModal } from './components/cards/CardInspectorModal';
import { AuthModal } from './components/common/AuthModal';
import { MenuMusicPlayer } from './components/common/MenuMusicPlayer';
import { MenuTransitionWipe } from './components/common/MenuTransitionWipe';
import { RulesModal } from './components/common/RulesModal';
import { BattleSetupView } from './views/BattleSetupView';
import { BattleView } from './views/BattleView';
import { CampaignView } from './views/CampaignView';
import { CollectionView } from './views/CollectionView';
import { DeckBuilderView } from './views/DeckBuilderView';
import { HomeView } from './views/HomeView';
import { MilestonesView } from './views/MilestonesView';
import { RoguelikeView } from './views/RoguelikeView';
import { ShopView } from './views/ShopView';
import { TutorialView } from './views/TutorialView';

interface NavGroupItem {
  id: AppScreen;
  num: string;
  label: string;
  matchScreens: AppScreen[];
}

const NAV_ITEMS: NavGroupItem[] = [
  { id: 'HOME', num: '01', label: 'Portada', matchScreens: ['HOME'] },
  { id: 'CAMPAIGN', num: '02', label: 'Historia', matchScreens: ['CAMPAIGN', 'TUTORIAL'] },
  { id: 'ROGUELIKE', num: '03', label: 'Roguelike', matchScreens: ['ROGUELIKE'] },
  { id: 'BATTLE_SETUP', num: '04', label: 'Combate', matchScreens: ['BATTLE_SETUP'] },
  {
    id: 'COLLECTION',
    num: '05',
    label: 'Cartas',
    matchScreens: ['COLLECTION', 'DECK_BUILDER', 'MILESTONES'],
  },
  { id: 'SHOP', num: '06', label: 'Tienda', matchScreens: ['SHOP'] },
];

const SCREEN_ORDER: Record<AppScreen, number> = {
  HOME: 0,
  TUTORIAL: 1,
  CAMPAIGN: 2,
  ROGUELIKE: 3,
  BATTLE_SETUP: 4,
  COLLECTION: 5,
  DECK_BUILDER: 6,
  SHOP: 7,
  MILESTONES: 8,
  BATTLE: 9,
};

const pageVariants = {
  initial: (dir: 1 | -1) => ({
    opacity: 0,
    x: dir * 28,
    scale: 0.99,
  }),
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      duration: 0.24,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
  exit: (dir: 1 | -1) => ({
    opacity: 0,
    x: dir * -22,
    scale: 0.99,
    transition: {
      duration: 0.16,
      ease: [0.4, 0, 1, 1] as const,
    },
  }),
};

export function App() {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const progression = useAppStore((s) => s.progression);
  const coins = progression.coins;
  const claimableMilestones = getClaimableMilestonesCount(progression);
  const coll = getCollectionProgress(progression);
  const campaignTotal = CAMPAIGN_PARTS.reduce((sum, p) => sum + (p.available ? p.stages.length : 0), 0);
  const campaignCleared = (progression.completedCampaignStages ?? []).length;
  const tutorialCleared = (progression.completedTutorialLessons ?? []).length;
  const milestonesClaimed = (progression.claimedMilestones ?? []).length;
  const authUser = useAppStore((s) => s.authUser);
  const setShowAuthModal = useAppStore((s) => s.setShowAuthModal);
  const hydrateAuthSession = useAppStore((s) => s.hydrateAuthSession);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    void hydrateAuthSession();
  }, [hydrateAuthSession]);

  const prevScreenRef = useRef<AppScreen>(screen);
  const [transitionMeta, setTransitionMeta] = useState<{
    wipeKey: number;
    direction: 1 | -1;
    isBattleLaunch: boolean;
  }>({
    wipeKey: 0,
    direction: 1,
    isBattleLaunch: false,
  });

  useEffect(() => {
    const prev = prevScreenRef.current;
    if (prev !== screen) {
      const direction: 1 | -1 = SCREEN_ORDER[screen] >= SCREEN_ORDER[prev] ? 1 : -1;
      prevScreenRef.current = screen;
      setTransitionMeta((m) => ({
        wipeKey: m.wipeKey + 1,
        direction,
        isBattleLaunch: screen === 'BATTLE',
      }));
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [screen]);

  // Auto-clear wipe state after animation completes
  useEffect(() => {
    if (transitionMeta.wipeKey === 0) return;
    const ms = transitionMeta.isBattleLaunch ? 620 : 440;
    const timer = window.setTimeout(() => {
      setTransitionMeta((m) => (m.wipeKey > 0 ? { ...m, wipeKey: 0 } : m));
    }, ms);
    return () => window.clearTimeout(timer);
  }, [transitionMeta.wipeKey, transitionMeta.isBattleLaunch]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen overflow-x-hidden bg-[#0b090e] text-[#f5efe0]">
        <AnimatePresence initial={false}>
          {screen !== 'BATTLE' && (
            <motion.nav
              key="top-nav"
              initial={{ y: -56, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -56, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="sticky top-0 z-30 border-b-2 border-[#060508] bg-[#110d17] shadow-[0_4px_0_#060508]"
            >
              <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 sm:px-6">
                {/* Editorial JoJo Lockup */}
                <motion.button
                  type="button"
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setScreen('HOME')}
                  className="group flex items-baseline gap-2.5 text-left"
                >
                  <span className="inline-block -skew-x-10 border-2 border-[#060508] bg-[#f2c12e] px-2 py-0.5 font-jojo-display text-sm tracking-wider text-[#0b090e] shadow-[2px_2px_0_#060508] transition group-hover:bg-[#ffd554]">
                    JOJO
                  </span>
                  <span className="font-jojo-heading text-xl tracking-[0.14em] text-[#f5efe0]">
                    BIZARRE TCG
                  </span>
                  <span className="hidden text-[10px] font-bold tracking-[0.22em] text-[#f2c12e]/70 uppercase md:inline">
                    CUSTOM EDITION
                  </span>
                </motion.button>

                {/* Skewed Arcade Tabs with sliding shared-layout active pill */}
                <div className="flex items-center gap-1.5">
                  {NAV_ITEMS.map((item) => {
                    const active = item.matchScreens.includes(screen);
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        whileTap={{ scale: 0.94 }}
                        onClick={() => setScreen(item.id)}
                        className={`relative -skew-x-10 px-3 py-1 font-jojo-heading text-sm tracking-widest uppercase transition-colors ${
                          active
                            ? 'text-white'
                            : 'text-zinc-400 hover:bg-[#1e1729] hover:text-[#f5efe0]'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="jojo-nav-active-pill"
                            transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                            className="pointer-events-none absolute inset-0 border-2 border-[#060508] bg-[#e6194b] shadow-[3px_3px_0_#060508]"
                          />
                        )}
                        <span className="relative z-10 inline-flex skew-x-10 items-center gap-1">
                          <span className="font-mono text-[10px] opacity-65">
                            {item.num}
                          </span>
                          <span>{item.label}</span>
                          {item.id === 'COLLECTION' && claimableMilestones > 0 && (
                            <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center border border-[#060508] bg-[#f2c12e] px-1 font-mono text-[10px] font-black text-[#0b090e]">
                              {claimableMilestones}
                            </span>
                          )}
                        </span>
                      </motion.button>
                    );
                  })}

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setScreen('SHOP')}
                    title="Monedas Speedwagon — Clic para abrir la Tienda"
                    className="ml-1 inline-flex items-center gap-1 border-2 border-[#060508] bg-[#f2c12e] px-2.5 py-1 font-mono text-xs font-black text-[#0b090e] shadow-[2px_2px_0_#060508] transition hover:bg-[#ffd554]"
                  >
                    <Coins size={13} />
                    <span>{coins.toLocaleString()}</span>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setShowRules(true)}
                    title="Consultar reglamento"
                    className="jojo-btn-ink ml-1 inline-flex items-center gap-1 px-2.5 py-1 font-jojo-heading text-xs tracking-wider text-[#f2c12e] uppercase"
                  >
                    <BookOpen size={13} />
                    <span className="hidden sm:inline">Reglas</span>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => setShowAuthModal(true)}
                    title={
                      authUser
                        ? `Cuenta conectada: ${authUser.username} (datos guardados en servidor)`
                        : 'Modo invitado (datos no se guardan al cerrar ventana) — Clic para Iniciar Sesión o Crear Cuenta'
                    }
                    className={`ml-1 inline-flex items-center gap-1.5 border-2 border-[#060508] px-2.5 py-1 font-jojo-heading text-xs tracking-wider uppercase shadow-[2px_2px_0_#060508] transition ${
                      authUser
                        ? 'bg-[#00b87c] text-[#0b090e] hover:bg-[#00e599]'
                        : 'bg-[#e6194b] text-white hover:bg-[#ff2a5f]'
                    }`}
                  >
                    {authUser ? <UserCheck size={13} /> : <User size={13} />}
                    <span>{authUser ? authUser.username : 'Invitado · Guardar'}</span>
                  </motion.button>
                </div>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>

        <main className="relative">
          {/* Sub-navigation bar for grouped hubs (Historia: Campaña/Tutorial · Cartas: Colección/Mazos/Hitos) */}
          {(screen === 'CAMPAIGN' || screen === 'TUTORIAL') && (
            <div className="border-b-2 border-[#060508] bg-[#16111f]">
              <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
                <button
                  type="button"
                  onClick={() => setScreen('CAMPAIGN')}
                  className={`inline-flex items-center gap-1.5 border-2 border-[#060508] px-3.5 py-1.5 font-jojo-heading text-xs tracking-wider uppercase shadow-[2px_2px_0_#060508] transition ${
                    screen === 'CAMPAIGN'
                      ? 'bg-[#2952d9] text-white'
                      : 'bg-[#1d1727] text-zinc-300 hover:bg-[#272035] hover:text-white'
                  }`}
                >
                  <Map size={14} />
                  <span>Modo Campaña ({campaignCleared}/{campaignTotal})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('TUTORIAL')}
                  className={`inline-flex items-center gap-1.5 border-2 border-[#060508] px-3.5 py-1.5 font-jojo-heading text-xs tracking-wider uppercase shadow-[2px_2px_0_#060508] transition ${
                    screen === 'TUTORIAL'
                      ? 'bg-[#00b87c] text-[#0b090e]'
                      : 'bg-[#1d1727] text-zinc-300 hover:bg-[#272035] hover:text-white'
                  }`}
                >
                  <GraduationCap size={14} />
                  <span>Tutorial Guiado ({tutorialCleared}/{TUTORIAL_LESSONS.length})</span>
                </button>
              </div>
            </div>
          )}

          {(screen === 'COLLECTION' || screen === 'DECK_BUILDER' || screen === 'MILESTONES') && (
            <div className="border-b-2 border-[#060508] bg-[#16111f]">
              <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
                <button
                  type="button"
                  onClick={() => setScreen('COLLECTION')}
                  className={`inline-flex items-center gap-1.5 border-2 border-[#060508] px-3.5 py-1.5 font-jojo-heading text-xs tracking-wider uppercase shadow-[2px_2px_0_#060508] transition ${
                    screen === 'COLLECTION'
                      ? 'bg-[#e6194b] text-white'
                      : 'bg-[#1d1727] text-zinc-300 hover:bg-[#272035] hover:text-white'
                  }`}
                >
                  <Layers size={14} />
                  <span>Colección &amp; Forja ({coll.unlocked}/{coll.total})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('DECK_BUILDER')}
                  className={`inline-flex items-center gap-1.5 border-2 border-[#060508] px-3.5 py-1.5 font-jojo-heading text-xs tracking-wider uppercase shadow-[2px_2px_0_#060508] transition ${
                    screen === 'DECK_BUILDER'
                      ? 'bg-[#2952d9] text-white'
                      : 'bg-[#1d1727] text-zinc-300 hover:bg-[#272035] hover:text-white'
                  }`}
                >
                  <Wrench size={14} />
                  <span>Constructor de Mazos</span>
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('MILESTONES')}
                  className={`inline-flex items-center gap-1.5 border-2 border-[#060508] px-3.5 py-1.5 font-jojo-heading text-xs tracking-wider uppercase shadow-[2px_2px_0_#060508] transition ${
                    screen === 'MILESTONES'
                      ? 'bg-[#f2c12e] text-[#0b090e]'
                      : claimableMilestones > 0
                        ? 'bg-[#f2c12e]/20 text-[#f2c12e] hover:bg-[#f2c12e]/30'
                        : 'bg-[#1d1727] text-zinc-300 hover:bg-[#272035] hover:text-white'
                  }`}
                >
                  <Trophy size={14} />
                  <span>Hitos &amp; Premios ({milestonesClaimed}/{ALL_MILESTONES.length})</span>
                  {claimableMilestones > 0 && (
                    <span className="ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center border border-[#060508] bg-[#f2c12e] px-1 font-mono text-[10px] font-black text-[#0b090e]">
                      {claimableMilestones}
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait" initial={false} custom={transitionMeta.direction}>
            <motion.div
              key={screen}
              custom={transitionMeta.direction}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {screen === 'HOME' && <HomeView />}
              {screen === 'TUTORIAL' && <TutorialView />}
              {screen === 'CAMPAIGN' && <CampaignView />}
              {screen === 'ROGUELIKE' && <RoguelikeView />}
              {screen === 'BATTLE_SETUP' && <BattleSetupView />}
              {screen === 'BATTLE' && <BattleView />}
              {screen === 'COLLECTION' && <CollectionView />}
              {screen === 'DECK_BUILDER' && <DeckBuilderView />}
              {screen === 'SHOP' && <ShopView />}
              {screen === 'MILESTONES' && <MilestonesView />}
            </motion.div>
          </AnimatePresence>
        </main>

        <MenuTransitionWipe
          wipeKey={transitionMeta.wipeKey}
          direction={transitionMeta.direction}
          isBattleLaunch={transitionMeta.isBattleLaunch}
        />

        <CardInspectorModal />
        <RulesModal open={showRules} onClose={() => setShowRules(false)} />
        <AuthModal />
        <MenuMusicPlayer active={screen !== 'BATTLE'} />
      </div>
    </MotionConfig>
  );
}
