import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProfileIcon } from '../../lib/profileIcons';

/**
 * The profile screen's building blocks, ported from Varmacy's ProfileTab
 * StatCard and its settings/SettingsRow + SettingsGroup pair.
 *
 * The RTL rules baked in here were learned the hard way over there and apply
 * identically to this app, which is Arabic-first:
 *
 *   - Mirroring comes from the ancestor's `dir` alone. No `flex-row-reverse`:
 *     inside an already-RTL container it cancels itself back out.
 *   - No `items-end` on a column flex to "right-align" Arabic. On a column the
 *     cross axis is the INLINE axis, so under RTL `items-end` resolves to the
 *     LEFT and pushes content to the wrong side.
 *   - No `tracking-wider` on Arabic text: letter-spacing pulls apart the joined
 *     letterforms of the script.
 *   - Latin runs inside an RTL block (emails, codes, "3/3") need their own
 *     `dir="ltr"`, or bidi reorders them.
 *   - The chevron is the one thing `dir` cannot flip, so it is chosen by
 *     language.
 *
 * Unlike Varmacy, which is light-only, every surface here carries an explicit
 * `dark:` variant.
 */

/**
 * One statistic.
 *
 * The label leads, small and muted, and the value follows in the heavy weight -
 * the reverse of the obvious ordering, and deliberate: for a named value like a
 * stage or a group the value is a long word, and putting it first truncated it
 * while the short label below wrapped to two lines.
 *
 * The icon sits ABOVE the text, not beside it. In a two-column grid on a 360px
 * phone an inline icon leaves the label about 54px, which puts a three-word
 * Arabic label on three lines; stacking gives the text the tile's full width.
 *
 * `h-full` so a two-line value cannot make one tile taller than its neighbour.
 */
export function StatCard({
  icon,
  label,
  value,
  text = false,
  onClick,
  className = '',
}: {
  icon: ProfileIcon;
  label: string;
  value: React.ReactNode;
  /** A name rather than a number: two clamped lines instead of one big line. */
  text?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-zinc-800 border-2 border-slate-100 dark:border-zinc-700 rounded-2xl p-4 h-full flex flex-col gap-2.5 shadow-sm transition-colors ${
        onClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-700/60 active:translate-y-px' : ''
      } ${className}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${icon.tile}`}>
        <icon.Icon className={`w-5 h-5 ${icon.className}`} strokeWidth={2.5} />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-bold text-slate-400 dark:text-slate-500 leading-tight mb-1">{label}</div>
        <div
          className={`font-black text-slate-800 dark:text-stone-100 leading-tight ${
            text ? 'text-base line-clamp-2' : 'text-2xl'
          }`}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

/** A titled card of rows: a small muted heading outside a rounded card whose
 *  rows are separated by hairlines. */
export function ProfileGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      {title && (
        <h2 className="text-xs font-black text-slate-400 dark:text-slate-500 mb-2 px-1">{title}</h2>
      )}
      <div className="bg-white dark:bg-zinc-800 border-2 border-slate-100 dark:border-zinc-700 rounded-2xl overflow-hidden shadow-sm divide-y-2 divide-slate-100 dark:divide-zinc-700">
        {children}
      </div>
    </section>
  );
}

/**
 * One row: leading icon plate, label (+ optional sub-label), then either a
 * trailing control or a chevron.
 *
 * A ~68px row (py-4 plus a 36px plate) clears the touch-target minimum with
 * room to spare, which is the point on a phone-first screen.
 */
export function ProfileRow({
  icon,
  label,
  sublabel,
  trailing,
  onClick,
  destructive = false,
  isRtl,
}: {
  icon: ProfileIcon;
  label: string;
  sublabel?: string;
  /** A control that lives in the row itself, e.g. a toggle. */
  trailing?: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  isRtl: boolean;
  /** React consumes `key` and never forwards it, so this is type-only: this
   *  repo has no @types/react installed (see CLAUDE.md), so JSX's special props
   *  are not known to the checker and a keyed <ProfileRow> in a .map() is
   *  otherwise reported as an unknown prop. */
  key?: React.Key;
}) {
  const interactive = !!onClick;
  const Chevron = isRtl ? ChevronLeft : ChevronRight;

  const body = (
    <>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${icon.tile}`}>
        <icon.Icon
          className={`w-5 h-5 ${destructive ? 'text-rose-600 dark:text-rose-400' : icon.className}`}
          strokeWidth={2.5}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div
          className={`font-bold text-[15px] leading-snug ${
            destructive ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-stone-100'
          }`}
        >
          {label}
        </div>
        {sublabel && (
          <div className="text-xs font-bold text-slate-400 dark:text-slate-500 leading-snug mt-0.5">
            {sublabel}
          </div>
        )}
      </div>

      {trailing ? (
        <div className="shrink-0">{trailing}</div>
      ) : interactive ? (
        <Chevron className="w-5 h-5 text-slate-300 dark:text-zinc-600 shrink-0" strokeWidth={2.5} />
      ) : null}
    </>
  );

  const shared = 'w-full flex items-center gap-3 px-4 py-4 text-start transition-colors';

  if (!interactive) return <div className={shared}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${shared} hover:bg-slate-50 dark:hover:bg-zinc-700/60 active:bg-slate-100 dark:active:bg-zinc-700 cursor-pointer`}
    >
      {body}
    </button>
  );
}

/** The pill toggle already used across this screen, extracted so every row
 *  gets the same one. Its knob is positioned by language, not by a `rtl:`
 *  variant, because the direction comes from a `dir` attribute on an ancestor. */
export function ProfileToggle({
  on,
  onChange,
  isRtl,
  label,
}: {
  on: boolean;
  onChange: () => void;
  isRtl: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
        on ? 'bg-sky-500' : 'bg-slate-300 dark:bg-zinc-600'
      }`}
    >
      <div
        className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${
          on ? (isRtl ? 'left-1' : 'right-1') : isRtl ? 'right-1' : 'left-1'
        }`}
      />
    </button>
  );
}
