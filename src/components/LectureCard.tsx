import React, { useState } from 'react';
import { FileText, Download, ExternalLink, Clock, Tag, X, Maximize2, Trash2, Loader2, Edit2 } from 'lucide-react';
import { Lecture, CATEGORIES, Language, TRANSLATIONS, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { doc, deleteDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';

interface LectureCardProps {
  lecture: Lecture;
  lang: Language;
  user: UserProfile | null;
  onEdit?: (lecture: Lecture) => void;
  key?: string;
}

export default function LectureCard({ lecture, lang, user, onEdit }: LectureCardProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  const [showPreview, setShowPreview] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const categoryData = CATEGORIES.find(c => c.value === lecture.category);
  const categoryLabel = categoryData ? t[categoryData.labelKey] : lecture.category;
  const date = lecture.createdAt?.toDate ? lecture.createdAt.toDate().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : t.recently;

  const handleDelete = async () => {
    if (!user || user.role !== 'admin') return;
    
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
        className="group bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-xl hover:border-indigo-200 transition-all duration-300 flex flex-col h-full"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <div className="flex justify-between items-start mb-4">
          <div className={ `p-3 rounded-xl ${lecture.type === 'theoretical' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}` }>
            <FileText className="w-6 h-6" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={ `text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${lecture.type === 'theoretical' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}` }>
              {lecture.type === 'theoretical' ? t.theoretical : t.practical}
            </span>
            {lecture.number && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider bg-purple-100 text-purple-700">
                {t.lecturePrefix} {lecture.number}
              </span>
            )}
          </div>
        </div>

        <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors line-clamp-2">
          {lecture.title}
        </h3>
        
        <p className="text-sm text-gray-500 mb-4 line-clamp-3 flex-grow">
          {lecture.description || ''}
        </p>

        <div className="space-y-3 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Tag className="w-3.5 h-3.5" />
            <span>{categoryLabel}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Clock className="w-3.5 h-3.5" />
            <span>{date}</span>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => setShowPreview(true)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors text-sm font-semibold"
          >
            <Maximize2 className="w-4 h-4" />
            {t.view}
          </button>
          <a
            href={lecture.pdfUrl}
            download
            className="inline-flex items-center justify-center p-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors"
            title={t.download}
          >
            <Download className="w-5 h-5" />
          </a>
          {user?.role === 'admin' && (
            <>
              <button
                onClick={() => onEdit?.(lecture)}
                className="inline-flex items-center justify-center p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
                title={t.editLecture}
              >
                <Edit2 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center justify-center p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                title={t.deleteLecture}
              >
                <Trash2 className="w-5 h-5" />
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
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden p-6"
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              <h3 className="text-xl font-bold text-gray-900 mb-2">{t.deleteLecture}</h3>
              <p className="text-gray-500 mb-6">{t.confirmDeleteLecture}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
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
              className="relative w-full max-w-6xl h-full bg-white rounded-3xl overflow-hidden flex flex-col shadow-2xl"
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <FileText className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 truncate max-w-[200px] sm:max-w-md">
                    {lecture.title}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={lecture.pdfUrl}
                    download
                    className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-full transition-all"
                    title={t.download}
                  >
                    <Download className="w-5 h-5" />
                  </a>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 bg-gray-100 relative">
                <iframe
                  src={`${lecture.pdfUrl}#toolbar=0`}
                  className="w-full h-full border-none"
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
