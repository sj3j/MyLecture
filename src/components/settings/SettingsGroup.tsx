import React from 'react';

/**
 * A titled card of SettingsRows: a small muted heading outside a rounded card
 * whose rows are separated by hairlines. Same shape Varmacy uses.
 */
export default function SettingsGroup({
  title,
  children,
}: {
  /** Omit when the screen's own heading already names the group. */
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      {title && (
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2 px-1">
          {title}
        </h2>
      )}
      <div className="bg-white dark:bg-zinc-900 border-2 border-slate-100 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm divide-y-2 divide-slate-100 dark:divide-zinc-800">
        {children}
      </div>
    </section>
  );
}
