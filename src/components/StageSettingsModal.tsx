import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, AlertCircle, Layers, Minus, Plus, Check, Users, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Language, Student, StageGroupConfig, GroupId,
  GROUP_IDS, MAX_GROUPS, MAX_SUBGROUPS_PER_GROUP,
} from '../types';
import { useStageContext } from '../contexts/StageContext';
import SubjectsSettings from './SubjectsSettings';
import { parseSubgroup } from '../../shared/groups';

interface StageSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  /** Already-loaded roster for the current stage, reused so we don't re-query. */
  students: Student[];
}

export default function StageSettingsModal({ isOpen, onClose, lang, students }: StageSettingsModalProps) {
  const isRtl = lang === 'ar';
  const { groupConfig, saveGroupConfig } = useStageContext();

  const [groupCount, setGroupCount] = useState(groupConfig.groups.length);
  const [subgroupCounts, setSubgroupCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<'groups' | 'subjects'>('groups');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset the draft from the saved config every time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setGroupCount(groupConfig.groups.length);
    const counts: Record<string, number> = {};
    groupConfig.groups.forEach(g => { counts[g.id] = g.subgroupCount; });
    setSubgroupCounts(counts);
    setError(null);
    setSuccess(false);
  }, [isOpen, groupConfig]);

  const draft = useMemo<StageGroupConfig>(() => ({
    groups: GROUP_IDS.slice(0, groupCount).map(id => ({
      id: id as GroupId,
      subgroupCount: subgroupCounts[id] ?? MAX_SUBGROUPS_PER_GROUP,
    })),
  }), [groupCount, subgroupCounts]);

  /**
   * Students whose subgroup would no longer exist under `draft`, tallied per
   * group letter. Shrinking is refused while this is non-empty so nobody
   * silently drops off every group filter.
   */
  const orphans = useMemo(() => {
    const allowed = new Map<string, number>(draft.groups.map(g => [g.id as string, g.subgroupCount]));
    const tally: Record<string, number> = {};
    students.forEach(student => {
      const parsed = parseSubgroup(student.subgroup);
      if (!parsed) return; // unassigned students are unaffected
      const limit = allowed.get(parsed.group);
      if (limit === undefined || parsed.index > limit) {
        tally[parsed.group] = (tally[parsed.group] || 0) + 1;
      }
    });
    return tally;
  }, [draft, students]);

  const orphanEntries = Object.entries(orphans).sort(([a], [b]) => a.localeCompare(b));
  const hasOrphans = orphanEntries.length > 0;

  const handleSave = async () => {
    if (hasOrphans) return;
    setIsSaving(true);
    setError(null);
    try {
      await saveGroupConfig(draft);
      setSuccess(true);
      setTimeout(onClose, 900);
    } catch (err: any) {
      console.error('Failed to save group config:', err);
      setError(
        err?.code === 'permission-denied'
          ? (isRtl ? 'ليس لديك صلاحية تعديل مجموعات هذه المرحلة' : 'You do not have permission to edit this stage')
          : (isRtl ? 'حدث خطأ أثناء الحفظ' : 'Error saving configuration')
      );
    } finally {
      setIsSaving(false);
    }
  };

  const Stepper = ({ value, min, max, onChange, label }: {
    value: number; min: number; max: number; onChange: (v: number) => void; label: string;
  }) => (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="w-6 text-center font-black text-lg text-slate-900 dark:text-white tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
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
            className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-white dark:bg-zinc-900 p-6 pb-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                </div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">
                  {isRtl ? 'إعدادات المرحلة' : 'Stage Settings'}
                </h2>
              </div>
              <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
              </button>
            </div>

            <div className="px-6 pt-4">
              <div className="flex gap-1 p-1 bg-slate-100 dark:bg-zinc-800/80 rounded-2xl">
                {([
                  { id: 'groups' as const,   icon: Users,    ar: 'المجموعات', en: 'Groups' },
                  { id: 'subjects' as const, icon: BookOpen, ar: 'المواد',     en: 'Subjects' },
                ]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                      activeTab === tab.id
                        ? 'bg-white dark:bg-zinc-900 text-sky-600 dark:text-sky-400 shadow-sm'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {isRtl ? tab.ar : tab.en}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === 'subjects' ? (
              <div className="p-6">
                <SubjectsSettings lang={lang} />
              </div>
            ) : (
            <div className="p-6 space-y-5">
              <div className="bg-slate-50 dark:bg-zinc-800/60 rounded-2xl p-4 border border-slate-200 dark:border-zinc-700">
                <Stepper
                  label={isRtl ? 'عدد المجموعات' : 'Number of groups'}
                  value={groupCount} min={1} max={MAX_GROUPS}
                  onChange={setGroupCount}
                />
                <div className="flex gap-2 mt-3 flex-wrap">
                  {GROUP_IDS.slice(0, groupCount).map(id => (
                    <span key={id} className="px-3 py-1 rounded-lg bg-sky-600 text-white text-sm font-bold">{id}</span>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {isRtl ? 'عدد الشعب في كل مجموعة' : 'Subgroups per group'}
                </h3>
                {GROUP_IDS.slice(0, groupCount).map(id => (
                  <div key={id} className="bg-slate-50 dark:bg-zinc-800/60 rounded-2xl p-4 border border-slate-200 dark:border-zinc-700">
                    <Stepper
                      label={isRtl ? `المجموعة ${id}` : `Group ${id}`}
                      value={subgroupCounts[id] ?? MAX_SUBGROUPS_PER_GROUP}
                      min={1} max={MAX_SUBGROUPS_PER_GROUP}
                      onChange={(v) => setSubgroupCounts(prev => ({ ...prev, [id]: v }))}
                    />
                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      {Array.from({ length: subgroupCounts[id] ?? MAX_SUBGROUPS_PER_GROUP }, (_, i) => (
                        <span key={i} className="px-2.5 py-1 rounded-md bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-slate-200 text-xs font-bold">
                          {id}{i + 1}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {hasOrphans && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-2xl">
                  <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-bold mb-1">
                        {isRtl ? 'لا يمكن تقليل المجموعات' : 'Cannot reduce groups'}
                      </p>
                      <p className="mb-2 opacity-90">
                        {isRtl
                          ? 'يوجد طلاب مسجلون في شعب سيتم حذفها. انقلهم أولاً ثم أعد المحاولة.'
                          : 'Students are still assigned to subgroups this would remove. Reassign them first.'}
                      </p>
                      <ul className="space-y-0.5 font-bold">
                        {orphanEntries.map(([group, count]) => (
                          <li key={group}>
                            {isRtl ? `المجموعة ${group}: ${count} طالب` : `Group ${group}: ${count} student(s)`}
                          </li>
                        ))}
                      </ul>
                    </div>
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
                disabled={isSaving || hasOrphans || success}
                className="w-full py-3.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : success ? <Check className="w-5 h-5" /> : null}
                {success ? (isRtl ? 'تم الحفظ' : 'Saved') : (isRtl ? 'حفظ' : 'Save')}
              </button>
            </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
