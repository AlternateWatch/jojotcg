import { useState } from 'react';
import { ChevronDown, ChevronUp, GraduationCap, Lock, Sparkles } from 'lucide-react';
import type { TutorialLessonDef } from '../../../data/tutorialData';
import { computeTutorialStep, isStrictTutorialLesson } from '../../../engine/tutorial/tutorialCoach';
import type { GameState, PlayerId } from '../../../engine/types/state';

interface TutorialCoachBannerProps {
  lesson: TutorialLessonDef;
  gameState: GameState;
  myId: PlayerId;
}

export function TutorialCoachBanner({ lesson, gameState, myId }: TutorialCoachBannerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const guidance = computeTutorialStep(lesson, gameState, myId);
  const isStrictStep = Boolean(guidance.blockReason);

  return (
    <div className="relative z-20 mx-auto w-full max-w-[1380px] px-3 pt-2">
      <div
        className={`border-2 border-[#060508] bg-[#141022]/95 shadow-[4px_4px_0_#060508] ${
          isStrictStep ? 'ring-2 ring-[#f2c12e]/70' : ''
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex shrink-0 items-center gap-1 border border-[#060508] bg-[#00b87c] px-2 py-0.5 font-mono text-[10px] font-black text-[#0b090e] uppercase">
              <GraduationCap size={12} /> {lesson.badge}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 border border-[#060508] bg-[#f2c12e] px-2 py-0.5 font-mono text-[10px] font-black text-[#0b090e] uppercase">
              {isStrictStep ? <Lock size={10} /> : <Sparkles size={11} />} {guidance.stepLabel}
            </span>
            <p className="truncate text-xs font-semibold text-[#f5efe0]">{guidance.text}</p>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="shrink-0 border border-white/15 bg-[#1f1830] px-2 py-0.5 font-mono text-[10px] font-bold text-zinc-300 hover:text-white"
          >
            {collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        </div>

        {!collapsed && (
          <div className="border-t border-white/10 bg-[#0e0b16] px-3 py-1.5 text-[11px] text-zinc-300">
            <strong className="text-[#f2c12e]">{lesson.mentorName}:</strong> {guidance.text}{' '}
            {isStrictStep ? (
              <span className="ml-1 font-mono text-[10px] font-bold text-[#00e599] uppercase">
                [Paso obligatorio]
              </span>
            ) : !isStrictTutorialLesson(lesson) ? (
              <span className="ml-1 font-mono text-[10px] font-bold text-[#f2c12e] uppercase">
                [Examen Final · Control libre]
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
