import React, { useState, useEffect } from 'react';
import { X, Trash2, FileText, HardDrive, Loader2, AlertCircle } from 'lucide-react';
import { Language, TRANSLATIONS, Lecture, CATEGORIES } from '../types';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface ManageDownloadsScreenProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

interface DownloadedItem {
  url: string;
  size: number;
  lecture?: Lecture;
}

const CACHE_NAME = 'offline-pdfs-v1';

export default function ManageDownloadsScreen({ isOpen, onClose, lang }: ManageDownloadsScreenProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  
  const [downloads, setDownloads] = useState<DownloadedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDownloads();
    }
  }, [isOpen]);

  const loadDownloads = async () => {
    setIsLoading(true);
    try {
      if (!('caches' in window)) {
        setIsLoading(false);
        return;
      }

      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      
      if (keys.length === 0) {
        setDownloads([]);
        setIsLoading(false);
        return;
      }

      // Fetch all lectures to match with URLs
      // Using getDocs will use offline cache if available due to enableIndexedDbPersistence
      const lecturesSnapshot = await getDocs(collection(db, 'lectures'));
      const lectures = lecturesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lecture));

      const items: DownloadedItem[] = [];
      
      for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          const size = blob.size;
          const url = request.url;
          
          const matchedLecture = lectures.find(l => l.pdfUrl === url);
          
          items.push({
            url,
            size,
            lecture: matchedLecture
          });
        }
      }
      
      setDownloads(items);
    } catch (error) {
      console.error('Error loading downloads:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (url: string) => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(url);
      setDownloads(prev => prev.filter(item => item.url !== url));
    } catch (error) {
      console.error('Error removing download:', error);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm(t.confirmClearAll)) {
      setIsClearing(true);
      try {
        await caches.delete(CACHE_NAME);
        setDownloads([]);
      } catch (error) {
        console.error('Error clearing downloads:', error);
      } finally {
        setIsClearing(false);
      }
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const totalSize = downloads.reduce((acc, item) => acc + item.size, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6" dir={isRtl ? 'rtl' : 'ltr'}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-zinc-800"
          >
            <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-center bg-slate-50 dark:bg-zinc-900">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-xl text-sky-600 dark:text-sky-400">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-stone-100">{t.manageDownloads}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {downloads.length} {t.navLectures} • {formatSize(totalSize)}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 text-sky-600 dark:text-sky-400 animate-spin" />
                </div>
              ) : downloads.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-stone-100 mb-1">{t.noDownloads}</h3>
                </div>
              ) : (
                <div className="space-y-3">
                  {downloads.map((item) => {
                    const lecture = item.lecture;
                    const categoryData = lecture ? CATEGORIES.find(c => c.value === lecture.category) : null;
                    const categoryLabel = categoryData ? t[categoryData.labelKey] : (lecture?.category || 'Unknown');

                    return (
                      <div key={item.url} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-zinc-800/50 rounded-2xl border border-slate-200 dark:border-zinc-700/50">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={`p-3 rounded-xl shrink-0 ${lecture?.type === 'theoretical' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400'}`}>
                            <FileText className="w-6 h-6" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-900 dark:text-stone-100 truncate">
                              {lecture?.title || 'Unknown Lecture'}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              {lecture && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-slate-300 uppercase">
                                  {categoryLabel}
                                </span>
                              )}
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                {formatSize(item.size)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemove(item.url)}
                          className="p-2.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors shrink-0 ml-2"
                          title={t.remove}
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {downloads.length > 0 && (
              <div className="p-4 border-t border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900">
                <button
                  onClick={handleClearAll}
                  disabled={isClearing}
                  className="w-full py-3.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl font-bold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isClearing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                  {t.clearAll}
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
