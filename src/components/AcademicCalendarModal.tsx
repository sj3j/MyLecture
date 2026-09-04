import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Loader2, AlertCircle, Check, CalendarDays, Plus, Trash2,
  BookOpen, GraduationCap, Palmtree, RefreshCw, Download, Archive, FolderDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from '../lib/firebase';
import { Language, UserProfile } from '../types';
import { useAcademicPhase } from '../hooks/useAcademicPhase';
import { useStageContext } from '../contexts/StageContext';
import { logAdminAction } from '../services/adminLogService';
import {
  AcademicCalendar, AcademicTerm, PhaseInfo,
  closableTerm, resolvePhase, validateCalendar, termLiveEnd,
} from '../../shared/academicCalendar';
import { apiUrl } from '../lib/apiBase';
import ContentExportPanel from './ContentExportPanel';

interface AcademicCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  user: UserProfile | null;
}

/** '2027-01-31' -> '2027/1/31'. Empty string for a blank date. */
function pretty(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${y}/${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

const PHASE_LABEL: Record<PhaseInfo['phase'], { ar: string; en: string; icon: any; tone: string }> = {
  study:     { ar: 'فترة الدراسة',    en: 'Study term',  icon: BookOpen,      tone: 'emerald' },
  exams:     { ar: 'فترة الامتحانات', en: 'Exams',       icon: GraduationCap, tone: 'amber'   },
  break:     { ar: 'عطلة',            en: 'Break',       icon: Palmtree,      tone: 'sky'     },
  preseason: { ar: 'قبل بدء العام',   en: 'Before term', icon: CalendarDays,  tone: 'slate'   },
};

const TONE: Record<string, string> = {
  emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900/50',
  amber:   'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-900/50',
  sky:     'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border-sky-100 dark:border-sky-900/50',
  slate:   'bg-slate-50 dark:bg-zinc-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-zinc-700',
};

/** Human-readable form of the codes validateCalendar returns. */
function explain(code: string, isRtl: boolean): string {
  const n = code.match(/^TERM_(\d+)_/)?.[1] || '';
  if (code === 'EMPTY') return isRtl ? 'أضف فصلاً دراسياً واحداً على الأقل' : 'Add at least one term';
  if (code.endsWith('DATES_REQUIRED')) return isRtl ? `الفصل ${n}: تاريخا البداية والنهاية مطلوبان` : `Term ${n}: start and end dates are required`;
  if (code.endsWith('END_BEFORE_START')) return isRtl ? `الفصل ${n}: تاريخ النهاية قبل البداية` : `Term ${n}: end date is before the start date`;
  if (code.endsWith('EXAMS_BEFORE_END')) return isRtl ? `الفصل ${n}: الامتحانات تبدأ قبل انتهاء الدراسة` : `Term ${n}: exams start before study ends`;
  if (code.endsWith('EXAMS_END_BEFORE_START')) return isRtl ? `الفصل ${n}: نهاية الامتحانات قبل بدايتها` : `Term ${n}: exams end before they start`;
  if (code.endsWith('OVERLAPS_PREVIOUS')) return isRtl ? `الفصل ${n}: يتداخل مع الفصل السابق` : `Term ${n}: overlaps the previous term`;
  if (code === 'RESIT_WITHOUT_RESULTS') return isRtl ? 'حدّد موعد النتائج أولاً' : 'Set the results date first';
  if (code === 'RESIT_NOT_AFTER_RESULTS') return isRtl ? 'نتائج الدور الثاني يجب أن تكون بعد النتائج الأولى' : 'Resit results must come after the first results';
  return code;
}

/**
 * The academic calendar, which is what now decides whether the competition is
 * running. Editing it is master-admin only, both here and in firestore.rules.
 */
export default function AcademicCalendarModal({ isOpen, onClose, lang }: AcademicCalendarModalProps) {
  const isRtl = lang === 'ar';
  const { calendar, phase, today, saveCalendar } = useAcademicPhase();
  const { stages } = useStageContext();

  const [draft, setDraft] = useState<AcademicCalendar>(calendar);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Reset the draft from the saved calendar every time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setDraft(calendar);
    setError(null);
    setNote(null);
    setSuccess(false);
  }, [isOpen, calendar]);

  const problems = useMemo(() => validateCalendar(draft), [draft]);

  // The phase the draft WOULD produce, so the effect is visible before saving.
  const draftPhase = useMemo(
    () => (problems.length === 0 ? resolvePhase(draft, today) : phase),
    [draft, problems, today, phase],
  );

  const overdue = useMemo(() => closableTerm(calendar, today, null), [calendar, today]);

  // Year-end wipe. Two gates before anything is sent: a dry run the admin has to
  // read, and typing the year label back. The button is unreachable otherwise.
  const [wipePlan, setWipePlan] = useState<any>(null);
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [isWiping, setIsWiping] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showContentExport, setShowContentExport] = useState(false);

  const patchTerm = (index: number, patch: Partial<AcademicTerm>) => {
    setDraft(prev => ({
      ...prev,
      terms: prev.terms.map((t, i) => (i === index ? { ...t, ...patch } : t)),
    }));
  };

  const addTerm = () => {
    setDraft(prev => ({
      ...prev,
      terms: [...prev.terms, {
        id: `term_${Date.now()}`,
        nameAr: 'فصل دراسي جديد',
        nameEn: 'New term',
        startDate: '', endDate: '', examsStart: null, examsEnd: null,
      }],
    }));
  };

  const removeTerm = (index: number) => {
    setDraft(prev => ({ ...prev, terms: prev.terms.filter((_, i) => i !== index) }));
  };

  const handleSave = async () => {
    if (problems.length > 0) return;
    setIsSaving(true);
    setError(null);
    try {
      await saveCalendar(draft);
      await logAdminAction('UPDATE_ACADEMIC_CALENDAR', `Saved calendar ${draft.yearLabel}`);
      setSuccess(true);
      setTimeout(onClose, 900);
    } catch (err: any) {
      console.error('Failed to save academic calendar:', err);
      setError(
        err?.code === 'permission-denied'
          ? (isRtl ? 'التقويم الدراسي للمشرف العام فقط' : 'The academic calendar is master-admin only')
          : (isRtl ? 'حدث خطأ أثناء الحفظ' : 'Error saving the calendar'),
      );
    } finally {
      setIsSaving(false);
    }
  };

  /** Manual fallback when the nightly job has not archived a finished season. */
  const handleRunRollover = async () => {
    setIsRunning(true);
    setError(null);
    setNote(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('No auth token');
      const res = await fetch(apiUrl('/api/admin/run-season-rollover'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'API error');

      setNote(data.archived
        ? (isRtl
            ? `تمت أرشفة الموسم: ${data.streakArchived} ستريك و ${data.mcqArchived} نتيجة MCQ.`
            : `Season archived: ${data.streakArchived} streaks and ${data.mcqArchived} MCQ results.`)
        : (isRtl ? 'لا يوجد موسم منتهٍ للأرشفة. تمت مزامنة الحالة.' : 'No finished season to archive. Phase synced.'));

      if (data.archived) await logAdminAction('SEASON_ROLLOVER', `Archived term ${data.archived}`);
    } catch (err: any) {
      setError(err.message || (isRtl ? 'فشل التشغيل' : 'Failed'));
    } finally {
      setIsRunning(false);
    }
  };

  /** Read-only. Produces the numbers the confirmation is built from. */
  /**
   * Snapshot the year without deleting anything.
   *
   * Separate from the wipe on purpose: the wipe archives as step 3 of a
   * sequence that ends in deletion, and there was no way to take the archive on
   * its own. This calls the exportOnly branch, which returns before the wipe
   * path is entered.
   */
  const handleExportOnly = async () => {
    setIsExporting(true);
    setError(null);
    setNote(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('No auth token');
      const res = await fetch(apiUrl('/api/admin/wipe-year'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ yearLabel: calendar.yearLabel, exportOnly: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'API error');

      setNote(isRtl
        ? `تم حفظ نسخة من ${data.yearLabel}: ${data.documentsExported} مستند. لم يُحذف شيء.`
        : `${data.yearLabel} exported: ${data.documentsExported} documents. Nothing was deleted.`);
      await logAdminAction('YEAR_EXPORT', `Exported ${data.yearLabel}: ${data.documentsExported} docs`);
    } catch (err: any) {
      setError(err.message || (isRtl ? 'فشل التصدير' : 'Export failed'));
    } finally {
      setIsExporting(false);
    }
  };

  const handlePreviewWipe = async () => {
    setIsWiping(true);
    setError(null);
    setNote(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('No auth token');
      const res = await fetch(apiUrl('/api/admin/wipe-year'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ yearLabel: calendar.yearLabel, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'API error');
      setWipePlan(data.plan);
    } catch (err: any) {
      setError(err.message || (isRtl ? 'فشل الفحص' : 'Preview failed'));
    } finally {
      setIsWiping(false);
    }
  };

  const handleWipeYear = async () => {
    setIsWiping(true);
    setError(null);
    setNote(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('No auth token');
      const res = await fetch(apiUrl('/api/admin/wipe-year'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ yearLabel: calendar.yearLabel }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'API error');

      setNote(isRtl
        ? `تم مسح ${calendar.yearLabel}: ${data.documentsDeleted} مستند و ${data.files?.deleted ?? 0} ملف. حُفظت نسخة و ${data.summarised} بطاقة سنة.`
        : `${calendar.yearLabel} wiped: ${data.documentsDeleted} documents, ${data.files?.deleted ?? 0} files. Exported, ${data.summarised} year cards kept.`);
      setWipePlan(null);
      setWipeConfirm('');
      await logAdminAction('YEAR_WIPE', `Wiped ${calendar.yearLabel}: ${data.documentsDeleted} docs`);
    } catch (err: any) {
      setError(err.message || (isRtl ? 'فشل المسح' : 'Wipe failed'));
    } finally {
      setIsWiping(false);
    }
  };

  const meta = PHASE_LABEL[draftPhase.phase];
  const PhaseIcon = meta.icon;

  const dateField = (label: string, value: string | null, onChange: (v: string | null) => void) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{label}</span>
      <input
        type="date"
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        dir="ltr"
        className="px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
    </label>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          dir={isRtl ? 'rtl' : 'ltr'}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-lg shadow-2xl relative max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900 p-6 pb-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
                  <CalendarDays className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-black text-slate-900 dark:text-white truncate">
                    {isRtl ? 'التقويم الدراسي' : 'Academic Calendar'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {isRtl ? 'يتحكم بالستريك والمواسم تلقائياً' : 'Drives streaks and seasons automatically'}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full transition-colors shrink-0">
                <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* ---- what the app is doing right now ---- */}
              <div className={`rounded-2xl p-4 border ${TONE[meta.tone]}`}>
                <div className="flex items-center gap-2 font-black">
                  <PhaseIcon className="w-5 h-5 shrink-0" />
                  {isRtl ? meta.ar : meta.en}
                  {draftPhase.term && (
                    <span className="font-bold opacity-80 text-sm truncate">
                      — {isRtl ? draftPhase.term.nameAr : draftPhase.term.nameEn}
                    </span>
                  )}
                </div>
                <p className="text-sm mt-2 font-medium opacity-90">
                  {draftPhase.isPaused
                    ? (draftPhase.nextStart
                        ? (isRtl
                            ? `المنافسة متوقفة. يبدأ الموسم الجديد في ${pretty(draftPhase.nextStart)}.`
                            : `Competition paused. The new season opens on ${pretty(draftPhase.nextStart)}.`)
                        : (isRtl
                            ? 'المنافسة متوقفة. أضف فصول العام القادم لاستئنافها.'
                            : 'Competition paused. Add next year&apos;s terms to resume it.'))
                    : (draftPhase.liveUntil
                        ? (isRtl
                            ? `المنافسة فعّالة حتى ${pretty(draftPhase.liveUntil)}.`
                            : `Competition is live until ${pretty(draftPhase.liveUntil)}.`)
                        : (isRtl
                            ? `المنافسة فعّالة. يبدأ العام الدراسي في ${pretty(draftPhase.nextStart)}.`
                            : `Competition is live. The academic year starts on ${pretty(draftPhase.nextStart)}.`))}
                </p>
                <p className="text-[11px] mt-1 opacity-70 font-medium" dir="ltr">{today}</p>
              </div>

              {/* ---- year label ---- */}
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {isRtl ? 'العام الدراسي' : 'Academic year'}
                </span>
                <input
                  value={draft.yearLabel}
                  onChange={e => setDraft(prev => ({ ...prev, yearLabel: e.target.value }))}
                  placeholder="2026-2027"
                  dir="ltr"
                  className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </label>

              {/* ---- terms ---- */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {isRtl ? 'الفصول الدراسية' : 'Terms'}
                </h3>

                {draft.terms.map((term, i) => (
                  <div key={term.id} className="bg-slate-50 dark:bg-zinc-800/60 rounded-2xl p-4 border border-slate-200 dark:border-zinc-700 space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        value={term.nameAr}
                        onChange={e => patchTerm(i, { nameAr: e.target.value })}
                        placeholder={isRtl ? 'اسم الفصل' : 'Term name (Arabic)'}
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-sm font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() => removeTerm(i)}
                        disabled={draft.terms.length <= 1}
                        title={isRtl ? 'حذف الفصل' : 'Remove term'}
                        className="p-2 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <input
                      value={term.nameEn}
                      onChange={e => patchTerm(i, { nameEn: e.target.value })}
                      placeholder="Term name (English)"
                      dir="ltr"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />

                    <div className="grid grid-cols-2 gap-3">
                      {dateField(isRtl ? 'بداية الدراسة' : 'Study starts', term.startDate,
                        v => patchTerm(i, { startDate: v || '' }))}
                      {dateField(isRtl ? 'نهاية الدراسة' : 'Study ends', term.endDate,
                        v => patchTerm(i, { endDate: v || '' }))}
                      {dateField(isRtl ? 'بداية الامتحانات' : 'Exams start', term.examsStart,
                        v => patchTerm(i, { examsStart: v }))}
                      {dateField(isRtl ? 'نهاية الامتحانات' : 'Exams end', term.examsEnd,
                        v => patchTerm(i, { examsEnd: v }))}
                    </div>

                    {term.startDate && term.endDate && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        {isRtl
                          ? `المنافسة فعّالة من ${pretty(term.startDate)} إلى ${pretty(termLiveEnd(term))}، ثم تبدأ العطلة.`
                          : `Live from ${pretty(term.startDate)} to ${pretty(termLiveEnd(term))}, then the break begins.`}
                      </p>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addTerm}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-zinc-700 text-slate-500 dark:text-slate-400 font-bold text-sm hover:border-sky-400 hover:text-sky-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {isRtl ? 'إضافة فصل دراسي' : 'Add a term'}
                </button>
              </div>

              {/* ---- results, which drive the end-of-year question ---- */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {isRtl ? 'نتائج الامتحانات' : 'Exam results'}
                </h3>
                <div className="bg-slate-50 dark:bg-zinc-800/60 rounded-2xl p-4 border border-slate-200 dark:border-zinc-700 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {dateField(isRtl ? 'صدور النتائج' : 'Results published', draft.resultsDate ?? null,
                      v => setDraft(prev => ({ ...prev, resultsDate: v })))}
                    {dateField(isRtl ? 'نتائج الدور الثاني' : 'Resit results', draft.resitResultsDate ?? null,
                      v => setDraft(prev => ({ ...prev, resitResultsDate: v })))}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    {isRtl
                      ? 'من تاريخ صدور النتائج يُسأل الطالب «نجحت أو دور ثاني؟» عند فتحه التطبيق، ولا يكمل قبل الإجابة. ومن تاريخ نتائج الدور الثاني يُسأل من اختار الدور الثاني «نجحت أو تحميل أو رسبت؟». اتركهما فارغين ولن يُسأل أحد.'
                      : 'From the results date a student is asked "passed or resit?" when they open the app, and cannot continue until they answer. From the resit date, those who chose resit are asked "passed, carrying subjects, or failed?". Leave both empty and nobody is asked.'}
                  </p>

                  <div className="pt-3 border-t border-slate-200 dark:border-zinc-700">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">
                      {isRtl ? 'اسأل هذه المراحل فقط' : 'Ask only these stages'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {stages.map(st => {
                        const picked = (draft.progressionStages || []).includes(st.id);
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setDraft(prev => {
                              const cur = prev.progressionStages || [];
                              return {
                                ...prev,
                                progressionStages: cur.includes(st.id)
                                  ? cur.filter(x => x !== st.id)
                                  : [...cur, st.id],
                              };
                            })}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                              picked
                                ? 'bg-sky-600 text-white'
                                : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-zinc-700'
                            }`}
                          >
                            {isRtl ? st.nameAr : st.nameEn}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                      {isRtl
                        ? 'اترك الكل بدون تحديد ليُسأل جميع الطلاب. الطلاب المضافون عبر رفع القوائم لا يُسألون أصلاً، لأن مرحلتهم جاءت من القائمة لا من نتيجة.'
                        : 'Select none to ask every stage. Students added by a roster import are never asked regardless, because their stage came from the sheet rather than from a result they reported.'}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-zinc-800/60 rounded-xl p-3 border border-slate-200 dark:border-zinc-700">
                {isRtl
                  ? 'الستريك يستمر خلال الامتحانات ويتوقف في العطل فقط. عند انتهاء كل فصل تُؤرشف النتائج في ملف كل طالب وتُصفَّر اللوحات، ثم يبدأ الموسم الجديد تلقائياً مع بداية الفصل التالي.'
                  : 'Streaks keep counting through exams and pause only during breaks. When a term ends, results are archived to each student profile and the boards are zeroed; the next season opens automatically on the first day of the next term.'}
              </p>

              {/* ---- rollover status ---- */}
              {overdue && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl">
                  <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="text-sm min-w-0">
                      <p className="font-bold mb-1">{isRtl ? 'موسم منتهٍ لم يُؤرشف' : 'A finished season is not archived'}</p>
                      <p className="opacity-90 mb-3">
                        {isRtl
                          ? `انتهى «${overdue.nameAr}» في ${pretty(termLiveEnd(overdue))} ولم تُؤرشف نتائجه بعد.`
                          : `"${overdue.nameEn}" ended on ${pretty(termLiveEnd(overdue))} and has not been archived.`}
                      </p>
                      <button
                        onClick={handleRunRollover}
                        disabled={isRunning}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-colors"
                      >
                        {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        {isRtl ? 'تشغيل الآن' : 'Run now'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ---- year-end wipe ---- */}
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-2xl">
                <div className="flex items-start gap-2 text-red-700 dark:text-red-400">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="text-sm min-w-0 w-full">
                    <p className="font-bold mb-1">{isRtl ? 'مسح بيانات السنة' : 'Year-end wipe'}</p>
                    <p className="opacity-90 mb-3">
                      {isRtl
                        ? `يحذف محاضرات وتسجيلات وتبليغات وواجبات ${calendar.yearLabel} لكل المراحل، مع ملفاتها. يبقى بنك الأسئلة والدرجات والحسابات.`
                        : `Deletes ${calendar.yearLabel} lectures, records, announcements and homework for every stage, and their files. The question bank, grades and accounts are kept.`}
                    </p>

                    {showContentExport && (
                      <div className="mb-3">
                        <ContentExportPanel
                          lang={lang}
                          stageId={null}
                          onClose={() => setShowContentExport(false)}
                        />
                      </div>
                    )}

                    {!wipePlan ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setShowContentExport(true)}
                          disabled={isExporting || isWiping}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-colors"
                        >
                          <FolderDown className="w-4 h-4" />
                          {isRtl ? 'تنزيل الملفات (ZIP)' : 'Download files (ZIP)'}
                        </button>
                        {/* The document snapshot, kept as its own action. It is
                            NOT a prerequisite for the wipe - runYearWipe calls
                            exportYear itself - but it is the cheap way to keep
                            the metadata without downloading gigabytes. */}
                        <button
                          onClick={handleExportOnly}
                          disabled={isExporting || isWiping}
                          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-xl font-bold text-sm transition-colors"
                        >
                          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                          {isRtl ? 'أرشفة المستندات فقط' : 'Archive documents only'}
                        </button>
                        <button
                          onClick={handlePreviewWipe}
                          disabled={isWiping || isExporting}
                          className="flex items-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl font-bold text-sm transition-colors"
                        >
                          {isWiping ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                          {isRtl ? 'فحص ما سيُحذف' : 'Preview what would be deleted'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 bg-white/70 dark:bg-zinc-800/70 rounded-xl text-xs space-y-1">
                          {Object.entries(wipePlan.counts || {}).map(([k, v]) => (
                            <div key={k} className="flex justify-between">
                              <span className="opacity-70">{k}</span>
                              <span className="font-black tabular-nums" dir="ltr">{String(v)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between border-t border-slate-200 dark:border-zinc-700 pt-1 mt-1">
                            <span className="opacity-70">{isRtl ? 'محاضرات ستبقى كعناوين فقط' : 'lectures kept as titles only'}</span>
                            <span className="font-black tabular-nums" dir="ltr">{wipePlan.lectureStubs}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="opacity-70">{isRtl ? 'ملفات ستُحذف نهائياً' : 'files deleted permanently'}</span>
                            <span className="font-black tabular-nums" dir="ltr">{(wipePlan.files || []).length}</span>
                          </div>
                        </div>
                        <p className="font-bold">
                          {isRtl
                            ? `الملفات لا يمكن استرجاعها. اكتب «${calendar.yearLabel}» للتأكيد.`
                            : `Files cannot be recovered. Type "${calendar.yearLabel}" to confirm.`}
                        </p>
                        <input
                          value={wipeConfirm}
                          onChange={e => setWipeConfirm(e.target.value)}
                          dir="ltr"
                          placeholder={calendar.yearLabel}
                          className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-red-200 dark:border-red-900/50 rounded-xl text-slate-900 dark:text-stone-100 outline-none focus:ring-2 focus:ring-red-500"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleWipeYear}
                            disabled={isWiping || wipeConfirm.trim() !== calendar.yearLabel}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl font-bold text-sm transition-colors"
                          >
                            {isWiping ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                            {isRtl ? 'مسح السنة نهائياً' : 'Wipe the year'}
                          </button>
                          <button
                            onClick={() => { setWipePlan(null); setWipeConfirm(''); }}
                            className="px-4 py-2 bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-sm"
                          >
                            {isRtl ? 'إلغاء' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {note && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 rounded-xl flex items-center gap-2 text-sm font-medium">
                  <Check className="w-4 h-4 shrink-0" />
                  {note}
                </div>
              )}

              {problems.length > 0 && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl">
                  <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <ul className="text-sm space-y-1 font-bold min-w-0">
                      {problems.map(code => <li key={code}>{explain(code, isRtl)}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-2 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={isSaving || problems.length > 0 || success}
                className="w-full py-3.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : success ? <Check className="w-5 h-5" /> : null}
                {success ? (isRtl ? 'تم الحفظ' : 'Saved') : (isRtl ? 'حفظ التقويم' : 'Save calendar')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
