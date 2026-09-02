import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Check, Save } from 'lucide-react';
import { collection, query, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { LectureTab, Lecture, Language, TRANSLATIONS } from '../types';
import { useStageContext } from '../contexts/StageContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  allLectures: Lecture[];
}

export default function ManageLectureTabsModal({ isOpen, onClose, lang, allLectures }: Props) {
  const { effectiveStageId } = useStageContext();
  const [tabs, setTabs] = useState<LectureTab[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLectures, setEditLectures] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const isRtl = lang === 'ar';
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    if (isOpen) {
      loadTabs();
    }
  }, [isOpen]);

  const loadTabs = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'app_settings', 'lectureTabs', 'tabs'));
      const snap = await getDocs(q);
      const loaded: LectureTab[] = [];
      snap.forEach(d => {
        const tab = { id: d.id, ...d.data() } as LectureTab;
        // Tabs are per stage. Filtered here rather than in the query because the
        // collection is a handful of docs and tabs created before this change
        // carry no stageId - those stay visible everywhere instead of vanishing.
        if (!tab.stageId || tab.stageId === effectiveStageId) loaded.push(tab);
      });
      setTabs(loaded);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = async () => {
    const newName = isRtl ? 'علامة تبويب جديدة' : 'New Tab';
    try {
      const docRef = await addDoc(collection(db, 'app_settings', 'lectureTabs', 'tabs'), {
        name: newName,
        lectureIds: [],
        stageId: effectiveStageId
      });
      setTabs([...tabs, { id: docRef.id, name: newName, lectureIds: [] }]);
      startEditing(docRef.id, newName, []);
    } catch (err) {
      console.error(err);
    }
  };

  const startEditing = (id: string, name: string, lectureIds: string[]) => {
    setEditingTabId(id);
    setEditName(name);
    setEditLectures([...lectureIds]);
  };

  const saveTab = async (id: string) => {
    try {
      await updateDoc(doc(db, 'app_settings', 'lectureTabs', 'tabs', id), {
        name: editName,
        lectureIds: editLectures
      });
      setTabs(tabs.map(t => t.id === id ? { ...t, name: editName, lectureIds: editLectures } : t));
      setEditingTabId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteTab = async (id: string) => {
    if (!window.confirm(isRtl ? 'هل أنت متأكد من حذف هذه العلامة المبوبة؟' : 'Are you sure you want to delete this tab?')) return;
    try {
      await deleteDoc(doc(db, 'app_settings', 'lectureTabs', 'tabs', id));
      setTabs(tabs.filter(t => t.id !== id));
      if (editingTabId === id) setEditingTabId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const toggleLecture = (lectureId: string) => {
    if (editLectures.includes(lectureId)) {
      setEditLectures(editLectures.filter(id => id !== lectureId));
    } else {
      setEditLectures([...editLectures, lectureId]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-[24px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-zinc-800">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isRtl ? 'إدارة علامات التبويب (التصنيفات)' : 'Manage Tabs (Categories)'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <button
            onClick={handleAddNew}
            className="w-full mb-6 py-3 px-4 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 font-bold rounded-xl border border-sky-200 dark:border-sky-800/50 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            {isRtl ? 'إضافة علامة تبويب جديدة' : 'Add New Tab'}
          </button>

          {loading ? (
            <div className="py-10 text-center text-slate-500">Loading...</div>
          ) : (
            <div className="space-y-4">
              {tabs.map(tab => (
                <div key={tab.id} className="border border-slate-200 dark:border-zinc-800 rounded-xl p-4">
                  {editingTabId === tab.id ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="flex-1 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                          placeholder={isRtl ? 'اسم علامة التبويب' : 'Tab Name'}
                        />
                        <button
                          onClick={() => saveTab(tab.id)}
                          className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <Save className="w-4 h-4" />
                          <span className="text-sm font-bold">{isRtl ? 'حفظ' : 'Save'}</span>
                        </button>
                        <button
                          onClick={() => setEditingTabId(null)}
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="border border-slate-200 dark:border-zinc-800 rounded-lg p-4 bg-slate-50 dark:bg-zinc-800/50">
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                            {isRtl ? 'تحديد المحاضرات التي تظهر في هذه العلامة:' : 'Select lectures to show in this tab:'}
                          </h4>
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={isRtl ? 'بحث...' : 'Search...'}
                            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-sky-500"
                          />
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                          {allLectures.filter(l => !searchQuery || l.title.toLowerCase().includes(searchQuery.toLowerCase()) || (t[l.category as keyof typeof t]?.toLowerCase() || '').includes(searchQuery.toLowerCase())).length === 0 ? (
                            <div className="text-sm text-slate-500 py-4 text-center">{isRtl ? 'لا توجد محاضرات متاحة تطابق البحث' : 'No lectures match search'}</div>
                          ) : (
                            allLectures.filter(l => !searchQuery || l.title.toLowerCase().includes(searchQuery.toLowerCase()) || (t[l.category as keyof typeof t]?.toLowerCase() || '').includes(searchQuery.toLowerCase())).map(lecture => {
                              const isSelected = editLectures.includes(lecture.id);
                              return (
                                <button
                                  key={lecture.id}
                                  onClick={() => toggleLecture(lecture.id)}
                                  className={`w-full flex items-center gap-3 p-3 text-start rounded-lg border transition-colors ${
                                    isSelected 
                                      ? 'bg-sky-50 border-sky-200 dark:bg-sky-900/30 dark:border-sky-800/50' 
                                      : 'bg-white border-slate-200 dark:bg-zinc-800 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-700'
                                  }`}
                                >
                                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                                    isSelected 
                                      ? 'bg-sky-500 border-sky-500 text-white' 
                                      : 'border-slate-300 dark:border-zinc-600'
                                  }`}>
                                    {isSelected && <Check className="w-3 h-3" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm text-slate-900 dark:text-white truncate">{lecture.title}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                      {t[lecture.category as any as keyof typeof t] || lecture.category} - {lecture.type === 'theoretical' ? t.theoretical : t.practical}
                                    </div>
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white">{tab.name}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {tab.lectureIds.length} {isRtl ? 'محاضرات' : 'lectures'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEditing(tab.id, tab.name, tab.lectureIds)}
                          className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-lg transition-colors"
                          title={isRtl ? 'تعديل' : 'Edit'}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteTab(tab.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                          title={isRtl ? 'حذف' : 'Delete'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {tabs.length === 0 && (
                <div className="py-10 text-center text-slate-500">
                  {isRtl ? 'لا توجد علامات تبويب مبنية خصيصاً' : 'No custom tabs yet'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
