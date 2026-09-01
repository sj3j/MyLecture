import React from 'react';
import { Language, CourseId, COURSE_IDS, COURSE_LABELS } from '../types';
import { useStageContext } from '../contexts/StageContext';

interface CourseTabsProps {
  lang: Language;
  /** Optional per-course counts rendered under each label. */
  counts?: Partial<Record<CourseId, number>>;
  className?: string;
}

/**
 * Segmented switch between the stage's two courses.
 *
 * Backed by StageContext rather than local state, so Subject Browser and Records
 * always agree - a control in only one of them would strand the other course's
 * content with no way to reach it.
 */
export default function CourseTabs({ lang, counts, className = '' }: CourseTabsProps) {
  const isRtl = lang === 'ar';
  const { activeCourseId, setActiveCourseId } = useStageContext();

  return (
    <div
      role="tablist"
      aria-label={isRtl ? 'الكورس' : 'Course'}
      className={`flex gap-1 p-1 bg-slate-100 dark:bg-zinc-800/80 rounded-2xl ${className}`}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {COURSE_IDS.map(id => {
        const isActive = activeCourseId === id;
        const count = counts?.[id];
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveCourseId(id)}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
              isActive
                ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {isRtl ? COURSE_LABELS[id].ar : COURSE_LABELS[id].en}
            {typeof count === 'number' && (
              // Its own pill, and pinned LTR: a bare number sitting against an
              // Arabic label reads as part of the label rather than as a count.
              <span
                dir="ltr"
                className={`ms-2 inline-block min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-[11px] font-black tabular-nums ${
                  isActive
                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300'
                    : 'bg-slate-200 text-slate-600 dark:bg-zinc-700 dark:text-slate-300'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
