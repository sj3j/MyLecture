import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, setDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Loader2, Plus, Trash2, ChevronUp, ChevronDown, AlertCircle, ArrowLeftRight, Check, X } from 'lucide-react';
import {
  Language, Subject, CourseId, COURSE_IDS, COURSE_LABELS,
} from '../types';
import { useStageContext } from '../contexts/StageContext';

interface SubjectsSettingsProps {
  lang: Language;
}

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Per-course subject management for a stage.
 *
 * Writes straight to the `subjects` collection; firestore.rules already scopes
 * create/update to `isRepresentativeFor(stageId)`, so a representative can only
 * ever touch their own stage.
 */
export default function SubjectsSettings({ lang }: SubjectsSettingsProps) {
  const isRtl = lang === 'ar';
  const { effectiveStageId } = useStageContext();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [addCourse, setAddCourse] = useState<CourseId>('course_1');
  const [newName, setNewName] = useState('');
  const [newNameAr, setNewNameAr] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNameEn, setEditNameEn] = useState('');
  const [editNameAr, setEditNameAr] = useState('');

  const load = async () => {
    if (!effectiveStageId) { setSubjects([]); setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'subjects'), where('stageId', '==', effectiveStageId))
      );
      setSubjects(
        snap.docs.map(d => d.data() as Subject).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      );
    } catch (err) {
      console.error('Error loading subjects:', err);
      setError(isRtl ? 'تعذر تحميل المواد' : 'Could not load subjects');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [effectiveStageId]);

  const fail = (err: any) => {
    console.error(err);
    setError(
      err?.code === 'permission-denied'
        ? (isRtl ? 'ليس لديك صلاحية تعديل مواد هذه المرحلة' : 'You cannot edit subjects for this stage')
        : (isRtl ? 'حدث خطأ' : 'Something went wrong')
    );
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameEn = newName.trim();
    if (!nameEn || !effectiveStageId) return;

    const id = slugify(nameEn);
    if (!id) {
      setError(isRtl ? 'اسم غير صالح' : 'Invalid name');
      return;
    }
    if (subjects.some(s => s.id === id)) {
      setError(isRtl ? 'هذه المادة موجودة بالفعل' : 'That subject already exists');
      return;
    }

    setIsAdding(true);
    setError(null);
    try {
      const order = subjects.filter(s => s.courseId === addCourse).length;
      await setDoc(doc(db, 'subjects', `${effectiveStageId}__${id}`), {
        id, stageId: effectiveStageId, courseId: addCourse,
        nameEn, nameAr: newNameAr.trim() || nameEn,
        types: ['theoretical', 'practical'],
        order, isActive: true,
      });
      setNewName('');
      setNewNameAr('');
      await load();
    } catch (err) { fail(err); } finally { setIsAdding(false); }
  };

  const patch = async (subject: Subject, changes: Partial<Subject>) => {
    if (!effectiveStageId) return;
    setBusyId(subject.id);
    setError(null);
    try {
      await updateDoc(doc(db, 'subjects', `${effectiveStageId}__${subject.id}`), changes as any);
      await load();
    } catch (err) { fail(err); } finally { setBusyId(null); }
  };

  /** Swaps `order` with the neighbour above/below inside the same course. */
  const move = async (subject: Subject, direction: -1 | 1) => {
    const siblings = subjects.filter(s => s.courseId === subject.courseId);
    const idx = siblings.findIndex(s => s.id === subject.id);
    const target = siblings[idx + direction];
    if (!target || !effectiveStageId) return;

    setBusyId(subject.id);
    try {
      await Promise.all([
        updateDoc(doc(db, 'subjects', `${effectiveStageId}__${subject.id}`), { order: target.order ?? 0 }),
        updateDoc(doc(db, 'subjects', `${effectiveStageId}__${target.id}`), { order: subject.order ?? 0 }),
      ]);
      await load();
    } catch (err) { fail(err); } finally { setBusyId(null); }
  };

  const startEdit = (s: Subject) => {
    setEditingId(s.id);
    setEditNameEn(s.nameEn);
    setEditNameAr(s.nameAr);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-7 h-7 text-sky-600 dark:text-sky-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {COURSE_IDS.map(courseId => {
        const list = subjects.filter(s => s.courseId === courseId);
        return (
          <div key={courseId} className="space-y-2">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              {isRtl ? COURSE_LABELS[courseId].ar : COURSE_LABELS[courseId].en}
              <span className="ms-2 opacity-60">({list.length})</span>
            </h3>

            {list.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 italic px-1">
                {isRtl ? 'لا توجد مواد' : 'No subjects'}
              </p>
            ) : list.map((s, i) => (
              <div
                key={s.id}
                className={`p-3 rounded-xl border flex items-center gap-2 ${
                  s.isActive === false
                    ? 'bg-slate-50 dark:bg-zinc-800/40 border-slate-200 dark:border-zinc-700 opacity-60'
                    : 'bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700'
                }`}
              >
                {editingId === s.id ? (
                  <div className="flex-1 space-y-2">
                    <input
                      value={editNameEn}
                      onChange={e => setEditNameEn(e.target.value)}
                      placeholder="English name"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm dark:text-stone-100 outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <input
                      value={editNameAr}
                      onChange={e => setEditNameAr(e.target.value)}
                      placeholder="الاسم بالعربية"
                      dir="rtl"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg text-sm dark:text-stone-100 outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await patch(s, { nameEn: editNameEn.trim() || s.nameEn, nameAr: editNameAr.trim() || s.nameAr });
                          setEditingId(null);
                        }}
                        className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> {isRtl ? 'حفظ' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex-1 py-1.5 bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" /> {isRtl ? 'إلغاء' : 'Cancel'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col shrink-0">
                      <button
                        disabled={i === 0 || busyId === s.id}
                        onClick={() => move(s, -1)}
                        className="p-0.5 text-slate-400 hover:text-sky-600 disabled:opacity-25 disabled:cursor-not-allowed"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        disabled={i === list.length - 1 || busyId === s.id}
                        onClick={() => move(s, 1)}
                        className="p-0.5 text-slate-400 hover:text-sky-600 disabled:opacity-25 disabled:cursor-not-allowed"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      onClick={() => startEdit(s)}
                      className="flex-1 text-start min-w-0"
                    >
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                        {isRtl ? s.nameAr : s.nameEn}
                      </div>
                      {s.nameAr !== s.nameEn && (
                        <div className="text-xs text-slate-400 dark:text-slate-500 truncate">
                          {isRtl ? s.nameEn : s.nameAr}
                        </div>
                      )}
                    </button>

                    {busyId === s.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          title={isRtl ? 'نقل إلى الكورس الآخر' : 'Move to other course'}
                          onClick={() => patch(s, {
                            courseId: courseId === 'course_1' ? 'course_2' : 'course_1',
                            order: subjects.filter(x => x.courseId !== courseId).length,
                          })}
                          className="p-1.5 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 rounded-lg transition-colors"
                        >
                          <ArrowLeftRight className="w-4 h-4" />
                        </button>
                        <button
                          title={s.isActive === false ? (isRtl ? 'تفعيل' : 'Activate') : (isRtl ? 'إخفاء' : 'Hide')}
                          onClick={() => patch(s, { isActive: s.isActive === false })}
                          className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        );
      })}

      <form onSubmit={handleAdd} className="pt-4 border-t border-slate-200 dark:border-zinc-700 space-y-2">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {isRtl ? 'إضافة مادة' : 'Add subject'}
        </h3>
        <select
          value={addCourse}
          onChange={e => setAddCourse(e.target.value as CourseId)}
          className="w-full px-3 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm dark:text-stone-100 outline-none focus:ring-2 focus:ring-sky-500"
        >
          {COURSE_IDS.map(id => (
            <option key={id} value={id}>{isRtl ? COURSE_LABELS[id].ar : COURSE_LABELS[id].en}</option>
          ))}
        </select>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder={isRtl ? 'اسم المادة (بالإنجليزية)' : 'Subject name (English)'}
          className="w-full px-3 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm dark:text-stone-100 outline-none focus:ring-2 focus:ring-sky-500"
        />
        <div className="flex gap-2">
          <input
            value={newNameAr}
            onChange={e => setNewNameAr(e.target.value)}
            placeholder={isRtl ? 'الاسم بالعربية' : 'Arabic name'}
            dir="rtl"
            className="flex-1 px-3 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm dark:text-stone-100 outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="submit"
            disabled={isAdding || !newName.trim()}
            className="px-4 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl font-bold transition-colors flex items-center gap-1"
          >
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
