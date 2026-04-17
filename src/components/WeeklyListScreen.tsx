import React, { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, orderBy, addDoc, serverTimestamp, getDocs, doc, setDoc, updateDoc, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { Lecture, Language, TRANSLATIONS, UserProfile, CATEGORIES, Homework } from '../types';
import { Loader2, ClipboardCheck, Plus, X, BookOpen, AlertCircle, Calendar, Camera, Image as ImageIcon, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface WeeklyListScreenProps {
  lang: Language;
  user: UserProfile | null;
}

export default function WeeklyListScreen({ lang, user }: WeeklyListScreenProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  const [homeworks, setHomeworks] = useState<Homework[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Schedule photo state
  const [schedulePhotoUrl, setSchedulePhotoUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Admin form state
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [subject, setSubject] = useState(CATEGORIES[0].value);
  const [type, setType] = useState<'theoretical' | 'practical'>('theoretical');
  const [note, setNote] = useState('');
  const [selectedLectures, setSelectedLectures] = useState<{ label: string; lectureId: string }[]>([]);
  
  // Lecture search state
  const [allLectures, setAllLectures] = useState<Lecture[]>([]);
  const [lectureSearch, setLectureSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [homeworkToDelete, setHomeworkToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Image viewer state
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    // Load homeworks
    const q = query(collection(db, 'homeworks'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) } as Homework));
      setHomeworks(docs);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'homeworks');
    });

    // Load schedule photo
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'weekly_schedule'), (docSnap) => {
      if (docSnap.exists()) {
        setSchedulePhotoUrl(docSnap.data().photoUrl);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/weekly_schedule');
    });

    // Load all lectures for everyone (needed for links and admin dropdown)
    const fetchLectures = async () => {
      try {
        const lecturesSnapshot = await getDocs(collection(db, 'lectures'));
        const lecturesData = lecturesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lecture));
        setAllLectures(lecturesData);
      } catch (error) {
        console.error('Error fetching lectures:', error);
      }
    };
    fetchLectures();

    return () => {
      unsubscribe();
      unsubscribeSettings();
    };
  }, [user]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `schedules/weekly_${Date.now()}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        null,
        (error) => {
          console.error("Upload error:", error);
          setIsUploadingPhoto(false);
          alert(t.errorUnknown);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          await setDoc(doc(db, 'settings', 'weekly_schedule'), {
            photoUrl: downloadURL,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid
          });
          setIsUploadingPhoto(false);
        }
      );
    } catch (error) {
      console.error("Error uploading photo:", error);
      setIsUploadingPhoto(false);
      alert(t.errorUnknown);
    }
  };

  const handleAddLecture = (lecture: Lecture) => {
    if (!selectedLectures.find(l => l.lectureId === lecture.id)) {
      setSelectedLectures([...selectedLectures, { 
        label: `Lec ${lecture.number || ''} ${lecture.title}`, 
        lectureId: lecture.id 
      }]);
    }
    setLectureSearch('');
  };

  const handleRemoveLecture = (id: string) => {
    setSelectedLectures(selectedLectures.filter(l => l.lectureId !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedLectures.length === 0) {
      alert(isRtl ? 'يرجى إضافة محاضرة واحدة على الأقل' : 'Please add at least one lecture');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'homeworks'), {
        subject,
        type,
        note,
        lectures: selectedLectures,
        createdAt: serverTimestamp()
      });

      // Reset form
      setSubject(CATEGORIES[0].value);
      setType('theoretical');
      setNote('');
      setSelectedLectures([]);
      setShowAdminForm(false);
      
      // Note: Cloud function will handle the push notification
    } catch (error) {
      console.error('Error posting homework:', error);
      alert(t.errorUnknown);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleComplete = async (homeworkId: string) => {
    if (!user) return;
    const isCompleted = user.completedWeeklyTasks?.includes(homeworkId);
    try {
      const userRef = doc(db, 'users', user.uid);
      if (isCompleted) {
        await setDoc(userRef, { completedWeeklyTasks: arrayRemove(homeworkId) }, { merge: true });
      } else {
        await setDoc(userRef, { completedWeeklyTasks: arrayUnion(homeworkId) }, { merge: true });
      }
    } catch (error) {
      console.error('Error toggling complete:', error);
    }
  };

  const handleDeleteHomework = async () => {
    if (!homeworkToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'homeworks', homeworkToDelete));
      setHomeworkToDelete(null);
    } catch (error) {
      console.error('Error deleting homework:', error);
      alert(t.errorUnknown);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredLectures = allLectures.filter(l => {
    if (!lectureSearch) return false;
    const searchLower = lectureSearch.toLowerCase();
    return (
      l.title.toLowerCase().includes(searchLower) || 
      (l.number && l.number.toString().includes(searchLower))
    ) && l.category === subject && l.type === type;
  });

  return (
    <div className="max-w-3xl mx-auto px-4 pt-6 pb-24" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-sky-100 dark:bg-sky-900/30 rounded-2xl text-sky-600 dark:text-sky-400">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-stone-100">{t.weeklyTasks}</h1>
        </div>
        
        {user && ['admin', 'moderator'].includes(user.role) && user?.permissions?.manageHomeworks !== false && (
          <button
            onClick={() => setShowAdminForm(!showAdminForm)}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition-colors"
          >
            {showAdminForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            <span className="hidden sm:inline">{showAdminForm ? t.close : t.postHomework}</span>
          </button>
        )}
      </div>

      {/* Schedule Photo Section */}
      <div className="mb-8 bg-white dark:bg-zinc-800 rounded-3xl p-4 border border-slate-200 dark:border-zinc-700 shadow-sm">
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-stone-100 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            {isRtl ? 'جدول المحاضرات' : 'Lectures Schedule'}
          </h2>
          {user && ['admin', 'moderator'].includes(user.role) && user?.permissions?.manageHomeworks !== false && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingPhoto}
              className="flex items-center gap-2 px-3 py-1.5 bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 rounded-lg text-sm font-bold hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors disabled:opacity-50"
            >
              {isUploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              {isRtl ? 'تحديث الجدول' : 'Update Schedule'}
            </button>
          )}
        </div>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handlePhotoUpload} 
          accept="image/*" 
          className="hidden" 
        />

        <div className="w-full bg-slate-50 dark:bg-zinc-900 rounded-2xl overflow-hidden border border-slate-100 dark:border-zinc-800 min-h-[200px] flex items-center justify-center">
          {schedulePhotoUrl ? (
            <img 
              src={schedulePhotoUrl} 
              alt="Schedule" 
              className="w-full h-auto object-contain max-h-[500px] cursor-pointer hover:opacity-90 transition-opacity" 
              referrerPolicy="no-referrer" 
              onClick={() => setSelectedImage(schedulePhotoUrl)}
            />
          ) : (
            <div className="text-center p-8 text-slate-400 dark:text-slate-500">
              <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{isRtl ? 'لم يتم رفع جدول بعد' : 'No schedule uploaded yet'}</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 sm:p-8 cursor-zoom-out"
            onClick={() => {
              setSelectedImage(null);
              setZoomLevel(1);
            }}
          >
            <button 
              className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-10"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImage(null);
                setZoomLevel(1);
              }}
            >
              <X className="w-6 h-6" />
            </button>
            <div className="w-full h-full flex items-center justify-center overflow-auto">
              <motion.img
                src={selectedImage}
                alt="Schedule Fullscreen"
                className={`max-w-full max-h-full object-contain transition-transform duration-300 ${zoomLevel > 1 ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
                style={{ scale: zoomLevel, transformOrigin: 'center center' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setZoomLevel(prev => prev === 1 ? 2.5 : 1);
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {homeworkToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-xl border border-slate-200 dark:border-zinc-700"
            >
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 mx-auto">
                <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-center text-slate-900 dark:text-stone-100 mb-2">
                {isRtl ? 'حذف الواجب' : 'Delete Homework'}
              </h3>
              <p className="text-center text-slate-500 dark:text-slate-400 mb-6">
                {t.confirmDeleteHomework || (isRtl ? 'هل أنت متأكد من حذف هذا الواجب؟' : 'Are you sure you want to delete this homework?')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setHomeworkToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-zinc-700 hover:bg-slate-200 dark:hover:bg-zinc-600 transition-colors"
                >
                  {t.close || (isRtl ? 'إلغاء' : 'Cancel')}
                </button>
                <button
                  onClick={handleDeleteHomework}
                  disabled={isDeleting}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                  {t.delete || (isRtl ? 'حذف' : 'Delete')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAdminForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-8"
          >
            <form onSubmit={handleSubmit} className="bg-white dark:bg-zinc-800 p-6 rounded-3xl border border-slate-200 dark:border-zinc-700 shadow-sm space-y-6">
              <h2 className="text-lg font-bold text-slate-900 dark:text-stone-100">{t.postHomework}</h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.category}</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value as any)}
                    className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-3 outline-none focus:border-sky-500 dark:text-stone-100"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{t[cat.labelKey]}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.type}</label>
                  <div className="flex gap-2 bg-slate-50 dark:bg-zinc-900 p-1 rounded-xl border border-slate-200 dark:border-zinc-700">
                    <button
                      type="button"
                      onClick={() => setType('theoretical')}
                      className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${
                        type === 'theoretical'
                          ? 'bg-white dark:bg-zinc-700 text-sky-600 dark:text-sky-400 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {t.theoretical}
                    </button>
                    <button
                      type="button"
                      onClick={() => setType('practical')}
                      className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-all ${
                        type === 'practical'
                          ? 'bg-white dark:bg-zinc-700 text-sky-600 dark:text-sky-400 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {t.practical}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.examLectures}</label>
                
                {/* Selected Lectures */}
                {selectedLectures.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedLectures.map(lec => (
                      <div key={lec.lectureId} className="flex items-center gap-2 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 px-3 py-1.5 rounded-lg text-sm font-medium border border-sky-100 dark:border-sky-800">
                        <span>{lec.label}</span>
                        <button type="button" onClick={() => handleRemoveLecture(lec.lectureId)} className="hover:text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <input
                    type="text"
                    value={lectureSearch}
                    onChange={(e) => setLectureSearch(e.target.value)}
                    placeholder={isRtl ? 'ابحث برقم المحاضرة أو العنوان...' : 'Search by lecture number or title...'}
                    className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-3 outline-none focus:border-sky-500 dark:text-stone-100"
                  />
                  
                  {lectureSearch && (
                    <div className="absolute z-10 w-full mt-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {filteredLectures.length > 0 ? (
                        filteredLectures.map(lec => (
                          <button
                            key={lec.id}
                            type="button"
                            onClick={() => handleAddLecture(lec)}
                            className="w-full text-start px-4 py-3 hover:bg-slate-50 dark:hover:bg-zinc-700 border-b border-slate-100 dark:border-zinc-700 last:border-0 dark:text-stone-100"
                          >
                            <div className="font-bold">Lec {lec.number}</div>
                            <div className="text-sm text-slate-500 truncate">{lec.title}</div>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-slate-500 text-sm text-center">
                          {isRtl ? 'لا توجد نتائج' : 'No results found'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">{t.additionalNote}</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl px-4 py-3 outline-none focus:border-sky-500 dark:text-stone-100 min-h-[100px] resize-y"
                  placeholder={isRtl ? 'مثال: ادرس فقط الأجزاء المظللة...' : 'Example: Study only highlighted parts...'}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || selectedLectures.length === 0}
                className="w-full py-3 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ClipboardCheck className="w-5 h-5" />}
                {t.publishPost}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-sky-600 dark:text-sky-400 animate-spin" />
        </div>
      ) : homeworks.length > 0 ? (
        <div className="space-y-4">
          {homeworks.map(hw => {
            const isCompleted = user?.completedWeeklyTasks?.includes(hw.id) || false;
            return (
            <motion.div
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={hw.id}
              className={`bg-white dark:bg-zinc-800 p-3 sm:p-6 rounded-3xl border shadow-sm transition-all ${
                isCompleted 
                  ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-900/10' 
                  : 'border-slate-200 dark:border-zinc-700'
              }`}
            >
              <div className="flex items-start justify-between mb-2 sm:mb-4">
                <div>
                  <div className="flex items-center gap-1 sm:gap-2 mb-1 flex-wrap">
                    <h3 className="text-base sm:text-xl font-black text-slate-900 dark:text-stone-100">
                      {t[CATEGORIES.find(c => c.value === hw.subject)?.labelKey || 'pharmacology']}
                    </h3>
                    <span className={`px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold uppercase ${
                      hw.type === 'theoretical' 
                        ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                        : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                    }`}>
                      {hw.type === 'theoretical' ? t.theoretical : t.practical}
                    </span>
                    {isCompleted && (
                      <span className="px-1.5 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-bold uppercase bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                        <ClipboardCheck className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        {t.completed || (isRtl ? 'مكتمل' : 'Completed')}
                      </span>
                    )}
                  </div>
                  {hw.createdAt?.toDate && (
                    <div className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">
                      <Calendar className="w-3 h-3" />
                      {hw.createdAt.toDate().toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-1 sm:gap-2">
                  {user && ['admin', 'moderator'].includes(user.role) && user?.permissions?.manageHomeworks !== false && (
                    <button
                      onClick={() => setHomeworkToDelete(hw.id)}
                      className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-colors bg-slate-100 dark:bg-zinc-700 text-slate-400 dark:text-slate-500 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 dark:hover:text-red-400"
                      title={t.delete || (isRtl ? 'حذف' : 'Delete')}
                    >
                      <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  )}
                  {user && (
                    <button
                      onClick={() => handleToggleComplete(hw.id)}
                      className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-colors ${
                        isCompleted
                          ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/70'
                          : 'bg-slate-100 dark:bg-zinc-700 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-zinc-600 hover:text-emerald-500'
                      }`}
                      title={isCompleted ? (isRtl ? 'إلغاء الاكتمال' : 'Mark as incomplete') : (t.markCompleted || (isRtl ? 'تحديد كمكتمل' : 'Mark as completed'))}
                    >
                      <ClipboardCheck className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-zinc-900/50 rounded-2xl p-3 sm:p-4 mb-3 sm:mb-4 border border-slate-100 dark:border-zinc-800">
                <p className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 sm:mb-3 flex items-center gap-2">
                  <BookOpen className="w-3 h-3 sm:w-4 sm:h-4 text-sky-500" />
                  {t.examIncludes}
                </p>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {hw.lectures.map(lec => {
                    // Find the lecture to get its PDF URL
                    const actualLecture = allLectures.find(l => l.id === lec.lectureId);
                    return (
                      <a
                        key={lec.lectureId}
                        href={actualLecture?.pdfUrl || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg sm:rounded-xl text-[11px] sm:text-sm font-bold text-sky-600 dark:text-sky-400 hover:border-sky-300 dark:hover:border-sky-600 hover:shadow-sm transition-all"
                      >
                        {lec.label}
                      </a>
                    );
                  })}
                </div>
              </div>

              {hw.note && (
                <div className="flex gap-2 sm:gap-3 p-3 sm:p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-900/50">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 dark:text-amber-500 flex-shrink-0" />
                  <p className="text-[11px] sm:text-sm text-amber-800 dark:text-amber-200 font-medium leading-relaxed">
                    {hw.note}
                  </p>
                </div>
              )}
            </motion.div>
          )})}
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-zinc-800 rounded-3xl border border-slate-200 dark:border-zinc-700 border-dashed">
          <ClipboardCheck className="w-12 h-12 text-slate-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">{t.noWeeklyTasks}</p>
        </div>
      )}
    </div>
  );
}
