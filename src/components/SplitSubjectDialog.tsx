import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  collection, doc, getDocs, query, where, writeBatch, type DocumentReference,
} from 'firebase/firestore';
import { motion } from 'motion/react';
import {
  X, Loader2, AlertCircle, Split, BookOpen, Mic, ArrowLeft, ArrowRight, Check,
} from 'lucide-react';
import { db } from '../lib/firebase';
import { Language, Subject } from '../types';
import {
  SubjectSplitPart, planSubjectSplit, plannedSubjectsFor, slugifySubject,
  subjectDocId, validateSplit,
} from '../lib/subjectSplit';

/** Firestore's own ceiling on a batched write. */
const BATCH_LIMIT = 450;

/** One lecture or record living under the subject being split. */
interface ContentItem {
  ref: DocumentReference;
  id: string;
  title: string;
  kind: 'lecture' | 'record';
  /** Index into `parts` - which half of the split this item is moving to. */
  assignedTo: number;
}

interface SplitSubjectDialogProps {
  subject: Subject;
  /** Every other subject id in this stage. A part may not collide with one. */
  siblingIds: string[];
  lang: Language;
  onClose: () => void;
  /** Called after a successful write so the caller can reload. */
  onSplit: () => void;
}

/**
 * Turns one subject document into the two (or more) subjects it actually holds,
 * carrying its lectures and records across.
 *
 * Runs entirely on the client under the caller's own credentials:
 * `firestore.rules` already scopes `subjects`, `lectures` and `records` writes
 * to `isMasterAdmin() || isRepresentativeFor(stageId)`, so this needs no server
 * route and cannot reach a stage the signed-in admin does not own. That also
 * keeps it off the `server.ts` / `api/index.ts` dual surface entirely.
 *
 * The original document is deactivated, never deleted. Deleting it would strand
 * any content this dialog could not see (another stage's, or a document added
 * between the read and the write) with a `subjectId` pointing at nothing;
 * `isActive: false` hides it from SubjectBrowser while leaving it recoverable
 * from the same المواد screen.
 */
export default function SplitSubjectDialog({
  subject, siblingIds, lang, onClose, onSplit,
}: SplitSubjectDialogProps) {
  const isRtl = lang === 'ar';
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  const [parts, setParts] = useState<SubjectSplitPart[]>(() => planSubjectSplit(subject));
  const [content, setContent] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Both collections are queried on two equality clauses, which Firestore serves
  // by merging single-field indexes - no composite index needed. stageId is not
  // optional here: `id` is a bare slug, so the same subject exists under several
  // stages, and an unscoped query would pull documents the read rule denies,
  // which fails the whole query rather than just those rows.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const fetch = async (name: 'lectures' | 'records', kind: ContentItem['kind']) => {
          const snap = await getDocs(query(
            collection(db, name),
            where('stageId', '==', subject.stageId),
            where('subjectId', '==', subject.id),
          ));
          return snap.docs.map<ContentItem>(d => ({
            ref: d.ref,
            id: d.id,
            title: (d.data() as any).title || d.id,
            kind,
            assignedTo: 0,
          }));
        };

        const [lectures, records] = await Promise.all([
          fetch('lectures', 'lecture'),
          fetch('records', 'record'),
        ]);
        if (!cancelled) setContent([...lectures, ...records]);
      } catch (err) {
        console.error('Error loading subject content:', err);
        if (!cancelled) {
          setError(isRtl
            ? 'تعذر تحميل محتوى المادة. لا يمكن التقسيم قبل معرفة ما سيُنقل.'
            : 'Could not load this subject’s content. Splitting is unsafe until we know what would move.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [subject.stageId, subject.id, isRtl]);

  const problems = useMemo(
    () => validateSplit(parts, siblingIds),
    [parts, siblingIds],
  );

  const problemText = useMemo(() => {
    const first = problems[0];
    if (!first) return null;
    switch (first.kind) {
      case 'too-few':
        return isRtl ? 'التقسيم يحتاج جزأين على الأقل.' : 'A split needs at least two parts.';
      case 'blank-name':
        return isRtl ? 'الاسم الإنجليزي مطلوب لكل جزء.' : 'Every part needs an English name.';
      case 'bad-slug':
        return isRtl
          ? 'الاسم الإنجليزي يجب أن يحتوي على أحرف لاتينية أو أرقام.'
          : 'The English name must contain Latin letters or digits.';
      case 'duplicate-slug':
        return isRtl ? `الجزءان يولّدان نفس المعرّف (${first.id}).` : `Two parts produce the same id (${first.id}).`;
      case 'collides':
        return isRtl
          ? `توجد مادة بهذا المعرّف بالفعل (${first.id}).`
          : `A subject with the id "${first.id}" already exists in this stage.`;
    }
  }, [problems, isRtl]);

  const editPart = (index: number, changes: Partial<SubjectSplitPart>) => {
    setParts(prev => prev.map((part, i) => {
      if (i !== index) return part;
      const next = { ...part, ...changes };
      // The id follows the English name, so a corrected name corrects the slug
      // rather than leaving content filed under the typo.
      if (changes.nameEn !== undefined) next.id = slugifySubject(changes.nameEn);
      return next;
    }));
  };

  const handleSplit = async () => {
    if (problems.length > 0 || isLoading) return;
    setIsSaving(true);
    setError(null);

    try {
      // Ordered create -> move -> hide, and committed in that order even when it
      // spans several batches (Firestore caps one at 500 writes). Every prefix of
      // that order is a state a student can safely land on: the new subjects
      // exist before anything points at them, and the combined subject stays
      // visible until the last item has left it. Hiding first, or moving first,
      // would each leave content filed under a subject nobody can open.
      const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];

      plannedSubjectsFor(subject, parts).forEach(planned => {
        ops.push(b => b.set(doc(db, 'subjects', subjectDocId(planned.stageId, planned.id)), planned));
      });

      content.forEach(item => {
        const target = parts[item.assignedTo];
        // subjectName is denormalised onto content so LectureCard can label its
        // badge without a lookup - it has to move with subjectId or the card
        // keeps advertising the subject that no longer exists.
        ops.push(b => b.update(item.ref, { subjectId: target.id, subjectName: target.nameEn }));
      });

      ops.push(b => b.update(doc(db, 'subjects', subjectDocId(subject.stageId, subject.id)), {
        isActive: false,
      }));

      for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        ops.slice(i, i + BATCH_LIMIT).forEach(apply => apply(batch));
        await batch.commit();
      }
      onSplit();
    } catch (err: any) {
      console.error('Error splitting subject:', err);
      setError(err?.code === 'permission-denied'
        ? (isRtl ? 'ليس لديك صلاحية تعديل مواد هذه المرحلة' : 'You cannot edit subjects for this stage')
        : (isRtl ? 'تعذر تقسيم المادة' : 'Could not split this subject'));
    } finally {
      setIsSaving(false);
    }
  };

  const busy = isSaving || isLoading;

  // Portalled: this opens from inside StageSettingsModal, itself a fixed overlay
  // with its own stacking context, so a nested fixed element would be clipped by
  // it instead of covering the screen.
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="bg-white dark:bg-zinc-900 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden"
      >
        <header className="flex items-start gap-3 p-5 border-b border-slate-100 dark:border-zinc-800 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center shrink-0">
            <Split className="w-5 h-5 text-teal-600 dark:text-teal-400" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black text-slate-900 dark:text-stone-100 leading-tight">
              {isRtl ? 'تقسيم المادة' : 'Split subject'}
            </h2>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 truncate mt-0.5">
              {isRtl ? subject.nameAr : subject.nameEn}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving}
            aria-label={isRtl ? 'إغلاق' : 'Close'}
            className="p-2 -m-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl flex items-start gap-2 text-sm font-bold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <p className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 font-bold">
            {isRtl
              ? 'ستصبح كل مادة بطاقة مستقلة، بمحاضراتها وتقدّمها الخاص. المادة الأصلية تُخفى ولا تُحذف.'
              : 'Each part becomes its own card with its own lectures and its own progress. The original is hidden, not deleted.'}
          </p>

          <section className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {isRtl ? `المواد الناتجة (${parts.length})` : `Resulting subjects (${parts.length})`}
            </h3>
            {parts.map((part, i) => (
              <div
                key={i}
                className="p-3 rounded-2xl border-2 border-slate-100 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-800/40 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-xs font-black flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <input
                    value={part.nameEn}
                    onChange={e => editPart(i, { nameEn: e.target.value })}
                    placeholder="English name"
                    dir="ltr"
                    className="flex-1 min-w-0 px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm font-bold dark:text-stone-100 outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <input
                  value={part.nameAr}
                  onChange={e => editPart(i, { nameAr: e.target.value })}
                  placeholder="الاسم بالعربية"
                  dir="rtl"
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm font-bold dark:text-stone-100 outline-none focus:ring-2 focus:ring-sky-500"
                />
                <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 ps-1" dir="ltr">
                  id: {part.id || '—'}
                </p>
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {isRtl ? 'المحتوى المنقول' : 'Content to move'}
            </h3>

            {isLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm font-bold text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                {isRtl ? 'جاري فحص المحاضرات...' : 'Checking lectures…'}
              </div>
            ) : content.length === 0 ? (
              <p className="text-sm font-bold text-slate-400 dark:text-slate-500 py-2">
                {isRtl
                  ? 'لا توجد محاضرات أو تسجيلات تحت هذه المادة — التقسيم آمن تماماً.'
                  : 'No lectures or records are filed under this subject — nothing to reassign.'}
              </p>
            ) : (
              <div className="space-y-2">
                {content.map(item => (
                  <div
                    key={`${item.kind}:${item.id}`}
                    className="p-3 rounded-2xl border-2 border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-800/40"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {item.kind === 'lecture'
                        ? <BookOpen className="w-4 h-4 text-sky-500 shrink-0" strokeWidth={2.5} />
                        : <Mic className="w-4 h-4 text-emerald-500 shrink-0" strokeWidth={2.5} />}
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">
                        {item.title}
                      </span>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {parts.map((part, i) => (
                        <button
                          key={i}
                          onClick={() => setContent(prev => prev.map(c =>
                            c.id === item.id && c.kind === item.kind ? { ...c, assignedTo: i } : c))}
                          className={`px-3 py-1.5 rounded-full text-xs font-black transition-colors border-2 ${
                            item.assignedTo === i
                              ? 'bg-sky-500 border-sky-500 text-white'
                              : 'bg-transparent border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-slate-400 hover:border-sky-300'
                          }`}
                        >
                          {(isRtl ? part.nameAr : part.nameEn) || `#${i + 1}`}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="p-5 border-t border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/60 shrink-0 space-y-2">
          {problemText && (
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {problemText}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-3 rounded-xl text-sm font-black text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 transition-colors disabled:opacity-40"
            >
              {isRtl ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              onClick={handleSplit}
              disabled={busy || problems.length > 0 || !!error}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-black text-white bg-sky-600 hover:bg-sky-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" strokeWidth={3} />}
              {isRtl ? `تقسيم إلى ${parts.length} مواد` : `Split into ${parts.length}`}
              {!isSaving && <Arrow className="w-4 h-4" strokeWidth={3} />}
            </button>
          </div>
        </footer>
      </motion.div>
    </div>,
    document.body,
  );
}
