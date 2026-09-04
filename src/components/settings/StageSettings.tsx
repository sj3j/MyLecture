import React from 'react';
import { Check, Layers, Loader2 } from 'lucide-react';
import { Language } from '../../types';
import { useStageContext } from '../../contexts/StageContext';

/**
 * Which stage a master admin is looking at.
 *
 * This used to be a bare <select> wedged into the app header, visible on every
 * screen to the one person who needs it. It is a preference, so it lives with
 * the other preferences now - and as a list of real options rather than a
 * dropdown, matching AppearanceSettings.
 *
 * Master admin only: `effectiveStageId` ignores this value for everyone else
 * (StageContext resolves it from the user's own stage instead), so offering the
 * control to a representative would be a switch that does nothing.
 */
export default function StageSettings({ lang }: { lang: Language }) {
  const isRtl = lang === 'ar';
  const { stages, currentAppStage, setCurrentAppStage, isLoadingStages } = useStageContext();

  if (isLoadingStages) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-7 h-7 text-sky-600 dark:text-sky-400 animate-spin" />
      </div>
    );
  }

  const active = currentAppStage || stages[0]?.id || '';

  return (
    <div className="space-y-2">
      {stages.map(stage => {
        const isActive = active === stage.id;
        return (
          <button
            key={stage.id}
            onClick={() => setCurrentAppStage(stage.id)}
            className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-start ${
              isActive
                ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
                : 'border-slate-200 dark:border-zinc-800 hover:border-sky-300'
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isActive ? 'bg-sky-100 dark:bg-sky-900/40' : 'bg-slate-100 dark:bg-zinc-800'
            }`}>
              <Layers className={`w-5 h-5 ${isActive ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'}`} strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[15px] text-slate-800 dark:text-slate-100 truncate">
                {isRtl ? stage.nameAr : stage.nameEn}
              </div>
              <div className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-0.5 truncate" dir="ltr">
                {stage.id}
              </div>
            </div>
            {isActive && <Check className="w-5 h-5 text-sky-500 shrink-0" strokeWidth={3} />}
          </button>
        );
      })}

      <p className="pt-2 px-1 text-xs font-bold text-slate-400 dark:text-slate-500 leading-relaxed">
        {isRtl
          ? 'يغيّر هذا كل ما يعرضه التطبيق: المحاضرات، الطلاب، التبليغات والمواد.'
          : 'This changes everything the app shows you: lectures, students, announcements and subjects.'}
      </p>
    </div>
  );
}
