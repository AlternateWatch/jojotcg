import { motion } from 'framer-motion';
import {
  BookOpen,
  CheckCircle2,
  Coins,
  Gift,
  GraduationCap,
  Play,
  Sparkles,
} from 'lucide-react';
import { getCardById } from '../../data/cardRegistry';
import { getBoosterPackById } from '../../data/progressionData';
import { TUTORIAL_LESSONS, type TutorialLessonDef } from '../../data/tutorialData';
import { useAppStore } from '../../store/useAppStore';
import { useBattleStore } from '../../store/useBattleStore';
import { CardView } from '../components/cards/CardView';

export function TutorialView() {
  const progression = useAppStore((s) => s.progression);
  const authUser = useAppStore((s) => s.authUser);
  const settings = useAppStore((s) => s.settings);
  const setScreen = useAppStore((s) => s.setScreen);
  const startBattle = useBattleStore((s) => s.startBattle);

  const completed = progression.completedTutorialLessons ?? [];
  const clearedCount = completed.length;
  const totalCount = TUTORIAL_LESSONS.length;
  const pct = Math.round((clearedCount / totalCount) * 100);

  const launchLesson = (lesson: TutorialLessonDef) => {
    startBattle(
      {
        mode: 'VS_AI',
        p1Name: authUser?.username ?? 'Aprendiz JoJo',
        p2Name: lesson.opponentName,
        p1DeckIds: lesson.playerDeckIds,
        p2DeckIds: lesson.opponentDeckIds,
        firstPlayerId: lesson.lessonNumber === 2 ? 'P2' : 'P1',
        aiDifficulty: lesson.difficulty,
        tutorialLessonId: lesson.id,
        p2GuaranteedOpeningCardId: undefined,
      },
      settings.hotseatPrivacyScreen,
    );
    setScreen('BATTLE');
  };

  return (
    <div
      className="relative min-h-[calc(100vh-56px)] py-8"
      style={{
        backgroundImage: 'url(/assets/patterns/pattern1.png)',
        backgroundSize: '340px',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[#0b090e]/92" />

      <div className="relative z-10 mx-auto max-w-6xl space-y-6 px-4">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-[#f2c12e]/30 pb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 font-jojo-heading text-xs tracking-[0.25em] text-[#00e599] uppercase">
              <GraduationCap size={14} /> ACADEMIA BIZARRE TCG · GUÍA INTERACTIVA
            </div>
            <h1 className="mt-1 font-jojo-display text-4xl text-[#f5efe0] uppercase">
              TUTORIAL POR NIVELES
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-zinc-300">
              Aprende paso a paso todas las mecánicas oficiales con un entrenador en vivo durante el
              combate. Completa cada lección para obtener monedas básicas y sobres de iniciación.
            </p>
          </div>

          <div className="jojo-panel min-w-[230px] space-y-2 p-3.5">
            <div className="flex items-center justify-between font-mono text-xs font-bold">
              <span className="text-zinc-400">PROGRESO</span>
              <span className="text-[#f2c12e]">
                {clearedCount}/{totalCount} ({pct}%)
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden border border-[#060508] bg-[#1a1426]">
              <div
                className="h-full bg-[#00e599] transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>Total: 570 🪙 + 2 sobres</span>
              <BookOpen size={13} className="text-[#00e599]" />
            </div>
          </div>
        </div>

        {/* Lesson Cards Grid */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {TUTORIAL_LESSONS.map((lesson, idx) => {
            const isCleared = completed.includes(lesson.id);
            const featuredCard = getCardById(lesson.featuredCardId);
            const rewardPack = lesson.rewardPackId
              ? getBoosterPackById(lesson.rewardPackId)
              : undefined;

            return (
              <motion.div
                key={lesson.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.24 }}
                className={`jojo-panel flex flex-col justify-between gap-4 p-5 ${
                  isCleared ? 'border-[#00b87c]' : ''
                }`}
              >
                <div className="space-y-3">
                  {/* Top Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className="-skew-x-10 border-2 border-[#060508] px-2.5 py-0.5 font-jojo-heading text-xs tracking-widest text-[#0b090e] uppercase shadow-[2px_2px_0_#060508]"
                      style={{ backgroundColor: lesson.accentHex }}
                    >
                      <span className="inline-block skew-x-10 font-black text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]">
                        {lesson.badge}
                      </span>
                    </span>

                    {isCleared ? (
                      <span className="inline-flex items-center gap-1 border border-[#060508] bg-[#00b87c] px-2 py-0.5 font-mono text-[10px] font-black text-[#0b090e] uppercase">
                        <CheckCircle2 size={12} /> COMPLETADA
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 border border-[#060508] bg-[#1e172a] px-2 py-0.5 font-mono text-[10px] font-bold text-[#f2c12e] uppercase">
                        <Sparkles size={11} /> RECOMPENSA DISPONIBLE
                      </span>
                    )}
                  </div>

                  {/* Main Body with Featured Card */}
                  <div className="flex items-start gap-4">
                    {featuredCard && (
                      <div className="shrink-0">
                        <CardView card={featuredCard} size="xs" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <h2 className="font-jojo-display text-2xl leading-tight text-[#f5efe0] uppercase">
                        {lesson.title}
                      </h2>
                      <p className="text-xs text-zinc-300">{lesson.subtitle}</p>
                      <div className="border-l-2 border-[#f2c12e] bg-[#130f1c] px-2.5 py-1.5 text-[11px] text-zinc-300 italic">
                        <strong className="not-italic text-[#f2c12e]">{lesson.mentorName}:</strong>{' '}
                        «{lesson.mentorQuote}»
                      </div>
                    </div>
                  </div>

                  {/* Concepts Checklist */}
                  <ul className="space-y-1 border border-white/10 bg-[#0e0b14] p-3 text-[11px] text-zinc-300">
                    {lesson.concepts.map((c, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="font-mono font-bold text-[#00e599]">▸</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Footer: Rewards + Launch Button */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 border border-[#060508] bg-[#1c1626] px-2 py-1 font-mono text-[11px] font-bold text-[#f2c12e]">
                      <Coins size={12} /> +{lesson.rewardCoins}
                    </span>
                    {rewardPack && (
                      <span className="inline-flex items-center gap-1 border border-[#060508] bg-[#e6194b]/25 px-2 py-1 font-mono text-[11px] font-bold text-rose-200">
                        <Gift size={12} /> ×{lesson.rewardPackCount ?? 1} {rewardPack.badge}
                      </span>
                    )}
                    {isCleared && (
                      <span className="font-mono text-[10px] text-zinc-500 uppercase">
                        (Ya recogida)
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => launchLesson(lesson)}
                    className={`${
                      isCleared ? 'jojo-btn-ink' : 'jojo-btn-primary'
                    } inline-flex items-center gap-1.5 px-4 py-2 font-jojo-heading text-sm tracking-widest uppercase`}
                  >
                    <Play size={14} /> {isCleared ? 'Repetir Lección' : 'Iniciar Lección'}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
