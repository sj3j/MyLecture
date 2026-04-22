import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { RecordItem, Language, TRANSLATIONS, UserProfile, Category, CATEGORIES, LectureType } from '../types';
import { Loader2, Mic, SearchX, Play, Pause, Plus, HardDrive, Clock, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Fuse from 'fuse.js';
import AdminRecordUpload from './AdminRecordUpload';
import AudioPlayer from './AudioPlayer';

interface RecordsScreenProps {
  user: UserProfile | null;
  lang: Language;
  searchQuery: string;
  onNavigateToChat?: () => void;
}

export default function RecordsScreen({ user, lang, searchQuery, onNavigateToChat }: RecordsScreenProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  const [records, setRecords] = useState<RecordItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<Category | 'all'>('all');
  const [selectedType, setSelectedType] = useState<LectureType | 'all'>('all');
  const [showUpload, setShowUpload] = useState(false);
  const [recordToEdit, setRecordToEdit] = useState<RecordItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'records'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) } as RecordItem));
      setRecords(docs);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'records');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  let baseRecords = records.filter(record => {
    const matchesCategory = selectedCategory === 'all' || record.category === selectedCategory;
    const matchesType = selectedType === 'all' || record.type === selectedType;
    return matchesCategory && matchesType;
  });

  if (searchQuery.trim()) {
    const fuse = new Fuse(baseRecords, {
      keys: ['title', 'description'],
      threshold: 0.4,
      ignoreLocation: true,
    });
    baseRecords = fuse.search(searchQuery).map(result => result.item);
  }

  const filteredRecords = baseRecords.sort((a, b) => {
    const numA = a.number || 0;
    const numB = b.number || 0;
    return numA - numB;
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-sky-600 dark:text-sky-400 animate-spin" />
      </div>
    );
  }

  const isAdmin = (user?.role === 'admin' || user?.role === 'moderator') && user?.permissions?.manageRecords !== false;

  const handleDeleteRecord = async (id: string) => {
    try {
      const { deleteDoc, doc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'records', id));
      setDeletingId(null);
    } catch (err) {
      console.error('Error deleting record:', err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-24" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-sky-100 dark:bg-sky-900/30 rounded-2xl text-sky-600 dark:text-sky-400">
            <Mic className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-stone-100">{t.navRecords}</h1>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">{isRtl ? 'رفع تسجيل' : 'Upload Record'}</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <div className="flex-1">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as Category | 'all')}
            className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-3 outline-none focus:border-sky-500 dark:text-stone-100 font-bold"
          >
            <option value="all">{t.allSubjects}</option>
            {CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{t[cat.labelKey]}</option>
            ))}
          </select>
        </div>
        <div className="flex bg-white dark:bg-zinc-800 p-1 rounded-xl border border-slate-200 dark:border-zinc-700">
          <button
            onClick={() => setSelectedType('all')}
            className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all ${
              selectedType === 'all'
                ? 'bg-slate-100 dark:bg-zinc-700 text-slate-900 dark:text-stone-100 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {isRtl ? 'الكل' : 'All'}
          </button>
          <button
            onClick={() => setSelectedType('theoretical')}
            className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all ${
              selectedType === 'theoretical'
                ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.theoretical}
          </button>
          <button
            onClick={() => setSelectedType('practical')}
            className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-all ${
              selectedType === 'practical'
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.practical}
          </button>
        </div>
      </div>

      {filteredRecords.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredRecords.map(record => (
            <motion.div
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={record.id}
              className="bg-white dark:bg-zinc-800 rounded-3xl p-5 border border-slate-200 dark:border-zinc-700 shadow-sm flex flex-col relative"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-slate-300">
                      {t[CATEGORIES.find(c => c.value === record.category)?.labelKey || 'pharmacology']}
                    </span>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                      record.type === 'theoretical' 
                        ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                        : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                    }`}>
                      {record.type === 'theoretical' ? t.theoretical : t.practical}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-stone-100 line-clamp-2 leading-tight">
                    {record.number ? `Lec ${record.number}: ` : ''}{record.title}
                  </h3>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setRecordToEdit(record);
                        setShowUpload(true);
                      }}
                      className="p-2 text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-full transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    {deletingId === record.id ? (
                      <div className="flex items-center gap-2 bg-white dark:bg-zinc-800 p-1 rounded-lg shadow-sm border border-slate-200 dark:border-zinc-700">
                        <button
                          onClick={() => handleDeleteRecord(record.id)}
                          className="px-2 py-1 text-xs font-bold bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 rounded-md transition-colors"
                        >
                          {isRtl ? 'تأكيد' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="px-2 py-1 text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-700 dark:text-slate-300 rounded-md transition-colors"
                        >
                          {isRtl ? 'إلغاء' : 'Cancel'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(record.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {record.description && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 line-clamp-2 flex-grow">
                  {record.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 mb-4 text-[10px] sm:text-xs text-slate-400 dark:text-slate-500">
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800/50 px-2 py-1 rounded-md">
                   <Clock className="w-3.5 h-3.5" />
                   <span>{record.createdAt?.toDate ? record.createdAt.toDate().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : t.recently}</span>
                </div>
                {record.uploaderName && (
                  <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/10 px-2 py-1 rounded-md text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-100 dark:border-emerald-900/30">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span>{isRtl ? ` ${record.uploaderName}` : ` ${record.uploaderName}`}</span>
                  </div>
                )}
              </div>

              {record.size && (
                <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 mb-4 font-medium">
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>{record.size} MB</span>
                </div>
              )}

              <div className="mt-auto pt-4 border-t border-slate-100 dark:border-zinc-700">
                <div className="flex flex-col gap-3">
                  <AudioPlayer id={record.id} src={record.audioUrl} title={record.title} />
                  {user && (
                    <button
                      onClick={async () => {
                        try {
                          const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
                          await addDoc(collection(db, 'chat_messages'), {
                            text: '',
                            senderName: user.name,
                            senderEmail: user.email,
                            senderId: user.uid,
                            senderAvatar: user.photoUrl || user.name.charAt(0).toUpperCase(),
                            timestamp: serverTimestamp(),
                            createdAt: Date.now(),
                            reactions: { like: [], heart: [], thanks: [] },
                            isAnonymous: false,
                            originalSenderName: user.name,
                            embeddedItem: {
                              type: 'record',
                              id: record.id,
                              title: record.title,
                              subtitle: record.description,
                              link: record.audioUrl
                            }
                          });
                          if (onNavigateToChat) {
                             onNavigateToChat();
                          } else {
                             alert(isRtl ? 'تمت المشاركة في المحادثة!' : 'Shared to chat!');
                          }
                        } catch (err) {
                          console.error(err);
                          alert('Error sharing to chat');
                        }
                      }}
                      className="inline-flex items-center justify-center p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors w-full gap-2 text-sm font-bold"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
                      {isRtl ? 'مشاركة في المحادثة' : 'Share to Chat'}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 px-4">
          <div className="w-20 h-20 bg-slate-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-6">
            <SearchX className="w-10 h-10 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-stone-100 mb-2">
            {isRtl ? 'لا توجد تسجيلات' : 'No records found'}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {isRtl ? 'لم نتمكن من العثور على أي تسجيلات تطابق الفلاتر الحالية.' : 'We couldn\'t find any records matching your current filters.'}
          </p>
        </div>
      )}

      <AdminRecordUpload
        isOpen={showUpload}
        onClose={() => {
          setShowUpload(false);
          setRecordToEdit(null);
        }}
        lang={lang}
        recordToEdit={recordToEdit}
        user={user}
      />
    </div>
  );
}
