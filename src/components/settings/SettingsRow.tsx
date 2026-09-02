import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SettingsIcon } from '../../lib/settingsIcons';

/**
 * One row of a settings list: leading icon plate, label (+ optional sub-label),
 * then a trailing control, a "soon" chip, or a chevron.
 *
 * Mirroring comes from the ancestor's `dir` alone - no flex-row-reverse, no
 * text-right. The chevron is the one thing direction cannot flip, so it swaps
 * by language.
 */
export default function SettingsRow({
  icon,
  label,
  sublabel,
  soon = false,
  trailing,
  onClick,
  destructive = false,
  isRtl,
}: {
  icon: SettingsIcon;
  label: string;
  sublabel?: string;
  /** Renders muted and inert, with a قريباً / Soon chip instead of a chevron. */
  soon?: boolean;
  /** A control living in the row itself, e.g. a toggle. */
  trailing?: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  isRtl: boolean;
  /** React consumes `key` and never forwards it, so this is type-only: this repo
   *  has no @types/react installed (see CLAUDE.md), so JSX's special props are
   *  unknown to the checker and a keyed <SettingsRow> in a .map() is otherwise
   *  reported as an unknown prop. */
  key?: React.Key;
}) {
  const interactive = !!onClick && !soon;
  const Chevron = isRtl ? ChevronLeft : ChevronRight;

  const body = (
    <>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
        soon ? 'bg-slate-100 dark:bg-zinc-800' : icon.tile
      }`}>
        <icon.Icon
          className={`w-5 h-5 ${
            soon ? 'text-slate-400' : destructive ? 'text-rose-500' : icon.className
          }`}
          strokeWidth={2.5}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className={`font-bold text-[15px] leading-snug truncate ${
          soon ? 'text-slate-400'
            : destructive ? 'text-rose-600 dark:text-rose-400'
            : 'text-slate-800 dark:text-slate-100'
        }`}>
          {label}
        </div>
        {sublabel && (
          <div className="text-xs font-bold text-slate-400 dark:text-slate-500 leading-snug mt-0.5 truncate">
            {sublabel}
          </div>
        )}
      </div>

      {soon ? (
        <span className="shrink-0 px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-500 dark:text-slate-400 text-[11px] font-black whitespace-nowrap">
          {isRtl ? 'قريباً' : 'Soon'}
        </span>
      ) : trailing ? (
        <div className="shrink-0">{trailing}</div>
      ) : interactive ? (
        <Chevron className="w-5 h-5 text-slate-300 dark:text-zinc-600 shrink-0" strokeWidth={2.5} />
      ) : null}
    </>
  );

  // A ~68px row (py-4 plus a 36px plate) clears the touch-target minimum with
  // room to spare, which is what matters on a phone-first screen.
  const shared = 'w-full flex items-center gap-3 px-4 py-4 text-start transition-colors';

  if (!interactive) {
    return <div className={shared}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${shared} hover:bg-slate-50 dark:hover:bg-zinc-800/60 active:bg-slate-100 dark:active:bg-zinc-800 cursor-pointer`}
    >
      {body}
    </button>
  );
}
