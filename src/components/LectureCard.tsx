import React, { useState } from 'react';
import { FileText, Download, ExternalLink, Clock, Tag, X, Maximize2, Trash2, Loader2, Edit2, CloudDownload, CheckCircle2, CloudOff, Heart, CheckCircle, Youtube } from 'lucide-react';
import { Lecture, CATEGORIES, Language, TRANSLATIONS, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { doc, deleteDoc, setDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useOfflinePDF } from '../hooks/useOfflinePDF';

interface LectureCardProps {
  lecture: Lecture;
  lang: Language;
  user: UserProfile | null;
  onEdit?: (lecture: Lecture) => void;
  onRemoveDownload?: (lecture: Lecture) => void;
  key?: string;
}

export default function LectureCard({ lecture, lang, user, onEdit, onRemoveDownload }: LectureCardProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  const [showPreview, setShowPreview] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const categoryData = CATEGORIES.find(c => c.value === lecture.category);
  const categoryLabel = categoryData ? t[categoryData.labelKey] : lecture.category;
  const date = lecture.createdAt?.toDate ? lecture.createdAt.toDate().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : t.recently;

  const { isDownloaded, isDownloading, downloadProgress, offlineUrl, downloadPDF, removePDF } = useOfflinePDF(lecture.pdfUrl);

  const isStudied = user?.studied?.includes(lecture.id) || false;

  const handleToggleStudied = async () => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      if (isStudied) {
        await setDoc(userRef, { studied: arrayRemove(lecture.id) }, { merge: true });
      } else {
        await setDoc(userRef, { studied: arrayUnion(lecture.id) }, { merge: true });
      }
    } catch (error) {
      console.error('Error toggling studied:', error);
    }
  };

  const handleDelete = async () => {
    if (!user || (!['admin', 'moderator'].includes(user.role) || user?.permissions?.manageLectures === false)) return;
    
    setIsDeleting(true);
    try {
      // 1. Delete from Firestore
      await deleteDoc(doc(db, 'lectures', lecture.id));
      
      // 2. Try to delete from Storage (don't fail if it doesn't exist)
      try {
        const fileRef = ref(storage, lecture.pdfUrl);
        await deleteObject(fileRef);
      } catch (storageError) {
        console.warn('Could not delete file from storage:', storageError);
      }
    } catch (error) {
      console.error('Error deleting lecture:', error);
      alert(t.errorUnknown);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="group bg-white dark:bg-zinc-800 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-zinc-700 p-2.5 sm:p-5 hover:shadow-xl hover:shadow-slate-200 dark:hover:shadow-none hover:border-sky-200 dark:hover:border-sky-500/50 transition-all duration-300 flex flex-col h-full"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="flex justify-between items-start mb-2 sm:mb-4">
          <div className={ `p-1.5 sm:p-3 rounded-lg sm:rounded-xl ${lecture.type === 'theoretical' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400'}` }>
            <FileText className="w-4 h-4 sm:w-6 sm:h-6" />
          </div>
          <div className="flex flex-col sm:flex-row items-end gap-1 sm:gap-2 flex-wrap justify-end">
            <span className={ `text-[9px] sm:text-xs font-bold px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full uppercase tracking-wider ${lecture.type === 'theoretical' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300'}` }>
              {lecture.type === 'theoretical' ? t.theoretical : t.practical}
            </span>
            {lecture.number && (
              <span className="text-[9px] sm:text-xs font-bold px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full uppercase tracking-wider bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                {isRtl ? 'محاضرة' : 'Lecture'} {lecture.number}
              </span>
            )}
            {lecture.version === 'translated' && (
              <span className="text-[9px] sm:text-xs font-bold px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full uppercase tracking-wider bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                {t.translated}
              </span>
            )}
            {lecture.youtubeUrl && (
              <span className="text-[9px] sm:text-xs font-bold px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full uppercase tracking-wider bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 flex items-center gap-1">
                <Youtube className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                {t.youtubeTag}
              </span>
            )}
            {isStudied && (
              <span className="text-[9px] sm:text-xs font-bold px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-full uppercase tracking-wider bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 flex items-center gap-1">
                <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                {t.studied}
              </span>
            )}
          </div>
        </div>

        <h3 className="text-[13px] sm:text-lg font-bold text-slate-900 dark:text-stone-100 mb-1 sm:mb-2 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors line-clamp-2 leading-tight sm:leading-normal">
          {lecture.title}
        </h3>
        
        <p className="text-[11px] sm:text-sm text-slate-500 dark:text-slate-400 mb-2 sm:mb-4 line-clamp-2 sm:line-clamp-3 flex-grow">
          {lecture.description || ''}
        </p>

        <div className="space-y-1 sm:space-y-3 pt-2 sm:pt-4 border-t border-slate-100 dark:border-zinc-700">
          <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-slate-400 dark:text-slate-500">
            <Tag className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="truncate">{categoryLabel}</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-slate-400 dark:text-slate-500">
            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span className="truncate">{date}</span>
          </div>
        </div>

        <div className="mt-3 sm:mt-6 flex flex-wrap gap-1 sm:gap-2">
          <button
            onClick={() => setShowPreview(true)}
            className="flex-1 inline-flex items-center justify-center gap-1 sm:gap-2 px-2 py-1.5 sm:px-4 sm:py-2.5 bg-slate-900 dark:bg-stone-100 text-white dark:text-zinc-900 rounded-lg sm:rounded-xl hover:bg-slate-800 dark:hover:bg-white transition-colors text-[11px] sm:text-sm font-semibold min-w-0 sm:min-w-[100px]"
          >
            <Maximize2 className="w-3 h-3 sm:w-4 sm:h-4" />
            {t.view}
          </button>
          
          {user && (
            <>
              <button
                onClick={handleToggleStudied}
                className={`inline-flex items-center justify-center p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl transition-colors ${isStudied ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50' : 'bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-zinc-700 hover:text-green-500'}`}
                title={isStudied ? t.unmarkStudied : t.markStudied}
              >
                <CheckCircle2 className={`w-3.5 h-3.5 sm:w-5 sm:h-5 ${isStudied ? 'fill-current' : ''}`} />
              </button>
            </>
          )}

          {isDownloaded ? (
            <button
              onClick={async () => {
                await removePDF();
                if (onRemoveDownload) onRemoveDownload(lecture);
              }}
              className="inline-flex items-center justify-center p-1.5 sm:p-2.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg sm:rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors group"
              title={isRtl ? 'حذف من التنزيلات' : 'Remove offline download'}
            >
              <CheckCircle2 className="w-3.5 h-3.5 sm:w-5 sm:h-5 group-hover:hidden" />
              <CloudOff className="w-3.5 h-3.5 sm:w-5 sm:h-5 hidden group-hover:block" />
            </button>
          ) : (
            <button
              onClick={downloadPDF}
              disabled={isDownloading}
              className="inline-flex items-center justify-center p-1.5 sm:p-2.5 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-lg sm:rounded-xl hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors disabled:opacity-100 relative overflow-hidden"
              title={isRtl ? 'تنزيل للمشاهدة بدون إنترنت' : 'Download for offline viewing'}
            >
              {isDownloading ? (
                <div className="relative w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-sky-200 dark:text-sky-800/50"
                      strokeWidth="4"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className="text-sky-600 dark:text-sky-400 transition-all duration-300"
                      strokeDasharray={`${downloadProgress}, 100`}
                      strokeWidth="4"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <span className="absolute text-[6px] sm:text-[8px] font-bold leading-none">{downloadProgress}</span>
                </div>
              ) : (
                <CloudDownload className="w-3.5 h-3.5 sm:w-5 sm:h-5 relative z-10" />
              )}
            </button>
          )}

          <a
            href={lecture.pdfUrl}
            download
            className="inline-flex items-center justify-center p-1.5 sm:p-2.5 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 rounded-lg sm:rounded-xl hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
            title={t.download}
          >
            <Download className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
          </a>
          {user && ['admin', 'moderator'].includes(user.role) && user?.permissions?.manageLectures !== false && (
            <>
              <button
                onClick={() => onEdit?.(lecture)}
                className="inline-flex items-center justify-center p-1.5 sm:p-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg sm:rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                title={t.editLecture}
              >
                <Edit2 className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center justify-center p-1.5 sm:p-2.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg sm:rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                title={t.deleteLecture}
              >
                <Trash2 className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </button>
            </>
          )}
        </div>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-800 rounded-3xl shadow-2xl overflow-hidden p-6 border border-slate-200 dark:border-zinc-700"
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              <h3 className="text-xl font-bold text-slate-900 dark:text-stone-100 mb-2">{t.deleteLecture}</h3>
              <p className="text-slate-500 dark:text-slate-400 mb-6">{t.confirmDeleteLecture}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 bg-slate-100 dark:bg-zinc-700 text-slate-700 dark:text-stone-100 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-zinc-600 transition-colors"
                >
                  {t.close}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                  {t.delete}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PDF Preview Modal */}
      <AnimatePresence>
        {showPreview && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPreview(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-6xl h-full bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden flex flex-col shadow-2xl border border-slate-200 dark:border-zinc-800"
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-900">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-sky-50 dark:bg-sky-900/30 rounded-lg">
                    <FileText className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-stone-100 truncate max-w-[200px] sm:max-w-md">
                    {lecture.title}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={lecture.pdfUrl}
                    download
                    className="p-2 text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-all"
                    title={t.download}
                  >
                    <Download className="w-5 h-5" />
                  </a>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="p-2 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-all"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 bg-slate-100 dark:bg-zinc-950 relative overflow-y-auto flex flex-col">
                {lecture.youtubeUrl && (
                  <div className="w-full aspect-video bg-black shrink-0">
                    <iframe
                      src={lecture.youtubeUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                      className="w-full h-full border-none"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title={lecture.title}
                    />
                  </div>
                )}
                <iframe
                  src={`${offlineUrl || lecture.pdfUrl}#toolbar=0`}
                  className="w-full flex-1 min-h-[50vh] border-none"
                  title={lecture.title}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
