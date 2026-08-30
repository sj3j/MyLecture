import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Trash2, X } from 'lucide-react';
import { HIGHLIGHT_COLORS, type PdfAnnotation } from '../../types/pdfAnnotation.types';

interface Props {
  annotation: PdfAnnotation;
  isRtl: boolean;
  onSave: (note: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Bottom sheet for writing the note attached to a highlight.
 *
 * Saves on close as well as on the explicit button - a student who taps away
 * after typing has still written the note, and losing it would be indefensible.
 */
export default function NoteEditorSheet({ annotation, isRtl, onSave, onDelete, onClose }: Props) {
  const [text, setText] = useState(annotation.note ?? '');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(text);
  latest.current = text;

  useEffect(() => {
    const id = setTimeout(() => areaRef.current?.focus(), 120);
    return () => {
      clearTimeout(id);
      // Persist whatever was typed, however the sheet went away.
      if (latest.current !== (annotation.note ?? '')) onSave(latest.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quote = annotation.anchor?.exact ?? '';

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[170] bg-black/50 backdrop-blur-sm"
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        dir={isRtl ? 'rtl' : 'ltr'}
        className="fixed inset-x-0 bottom-0 z-[171] rounded-t-3xl bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-700 shadow-2xl pb-[max(env(safe-area-inset-bottom),0.75rem)]"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-3.5 h-3.5 rounded-full shrink-0 ring-1 ring-black/10"
              style={{ background: HIGHLIGHT_COLORS[annotation.color] }}
            />
            <h3 className="font-bold text-slate-900 dark:text-stone-100 truncate">
              {isRtl ? 'ملاحظة' : 'Note'}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onDelete}
              aria-label={isRtl ? 'حذف' : 'Delete'}
              className="p-2 rounded-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              aria-label={isRtl ? 'إغلاق' : 'Close'}
              className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {quote && (
          <p
            dir="auto"
            className="mx-5 mb-3 text-sm text-slate-600 dark:text-slate-400 line-clamp-3 border-s-4 ps-3"
            style={{ borderColor: HIGHLIGHT_COLORS[annotation.color] }}
          >
            {quote}
          </p>
        )}

        <textarea
          ref={areaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          dir="auto"
          rows={4}
          placeholder={isRtl ? 'اكتب ملاحظتك هنا...' : 'Write your note...'}
          className="w-full px-5 py-2 bg-transparent text-slate-900 dark:text-stone-100 placeholder:text-slate-400 resize-none outline-none"
        />

        <div className="px-5 pt-2">
          <button
            onClick={() => { onSave(text); onClose(); }}
            className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-600 active:scale-[0.99] text-white font-bold transition"
          >
            {isRtl ? 'حفظ' : 'Save'}
          </button>
        </div>
      </motion.div>
    </>
  );
}
