import React, { useRef } from 'react';
import { Plus, X, BarChart3, CheckSquare, Circle } from 'lucide-react';
import { MAX_POLL_OPTIONS, MIN_POLL_OPTIONS } from '../../types/announcement.types';
import type { DraftPoll } from '../../lib/announcementDraft';

/**
 * The poll half of the composer.
 *
 * A poll rides along on a post rather than being its own post type, so this
 * renders as one more block inside the composer next to the staged attachments -
 * "the lecture is cancelled, which day suits you?" is one announcement, not two.
 */

interface Props {
  poll: DraftPoll;
  onChange: (poll: DraftPoll) => void;
  onRemove: () => void;
  isRtl: boolean;
}

export const newPollOption = (): { id: string; text: string } => ({
  id: Math.random().toString(36).slice(2, 10),
  text: '',
});

export const emptyPoll = (): DraftPoll => ({
  question: '',
  options: [newPollOption(), newPollOption()],
  allowsMultiple: false,
});

export default function PollBuilder({ poll, onChange, onRemove, isRtl }: Props) {
  const optionRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const setOption = (id: string, text: string) =>
    onChange({ ...poll, options: poll.options.map(o => (o.id === id ? { ...o, text } : o)) });

  const addOption = () => {
    if (poll.options.length >= MAX_POLL_OPTIONS) return;
    const created = newPollOption();
    onChange({ ...poll, options: [...poll.options, created] });
    // Focus lands on the new row rather than staying on the button, so adding
    // five options is five taps and five bursts of typing, not ten taps.
    requestAnimationFrame(() => optionRefs.current[created.id]?.focus());
  };

  const removeOption = (id: string) => {
    if (poll.options.length <= MIN_POLL_OPTIONS) return;
    onChange({ ...poll, options: poll.options.filter(o => o.id !== id) });
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <BarChart3 className="w-4 h-4 text-sky-600 dark:text-sky-400" strokeWidth={2.5} />
          <span className="text-xs font-black">{isRtl ? 'استطلاع' : 'Poll'}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={isRtl ? 'حذف الاستطلاع' : 'Remove poll'}
          className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <input
        value={poll.question}
        onChange={e => onChange({ ...poll, question: e.target.value })}
        dir="auto"
        maxLength={300}
        placeholder={isRtl ? 'اطرح سؤالاً...' : 'Ask a question...'}
        className="w-full px-3 py-2 mb-2 text-sm font-bold bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl outline-none focus:border-sky-500 text-slate-900 dark:text-stone-100"
      />

      <div className="space-y-1.5">
        {poll.options.map((option, i) => (
          <div key={option.id} className="flex items-center gap-1.5">
            <span className="w-6 h-6 shrink-0 rounded-md bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-[10px] font-black text-slate-400 flex items-center justify-center">
              {i + 1}
            </span>
            <input
              ref={el => { optionRefs.current[option.id] = el; }}
              value={option.text}
              onChange={e => setOption(option.id, e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); addOption(); }
              }}
              dir="auto"
              maxLength={120}
              placeholder={`${isRtl ? 'خيار' : 'Option'} ${i + 1}`}
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl outline-none focus:border-sky-500 text-slate-900 dark:text-stone-100"
            />
            <button
              type="button"
              onClick={() => removeOption(option.id)}
              disabled={poll.options.length <= MIN_POLL_OPTIONS}
              aria-label={isRtl ? 'حذف الخيار' : 'Remove option'}
              className="w-7 h-7 shrink-0 rounded-lg text-slate-300 dark:text-zinc-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-0 disabled:pointer-events-none flex items-center justify-center transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 mt-2.5">
        <button
          type="button"
          onClick={addOption}
          disabled={poll.options.length >= MAX_POLL_OPTIONS}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={3} />
          {isRtl ? 'إضافة خيار' : 'Add option'}
        </button>

        <button
          type="button"
          onClick={() => onChange({ ...poll, allowsMultiple: !poll.allowsMultiple })}
          aria-pressed={poll.allowsMultiple}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            poll.allowsMultiple
              ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
          }`}
        >
          {poll.allowsMultiple ? <CheckSquare className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
          {isRtl ? 'اختيار متعدد' : 'Multiple choice'}
        </button>
      </div>
    </div>
  );
}
