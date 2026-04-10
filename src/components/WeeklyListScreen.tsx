import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { Lecture, Language, TRANSLATIONS, UserProfile, CATEGORIES } from '../types';
import { Loader2, ClipboardCheck, CheckCircle2, Circle, Camera, Image as ImageIcon } from 'lucide-react';
import { motion } from 'motion/react';

interface WeeklyListScreenProps {
  lang: Language;
  user: UserProfile | null;
}

export default function WeeklyListScreen({ lang, user }: WeeklyListScreenProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  const [weeklyLectures, setWeeklyLectures] = useState<Lecture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  
  const [schedulePhotoUrl, setSchedulePhotoUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load completed tasks
    if (user) {
      const loadUserProgress = async () => {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists() && userDoc.data().completedWeeklyTasks) {
          setCompletedTasks(new Set(userDoc.data().completedWeeklyTasks));
        } else {
          // Migrate local storage if exists
          const saved = localStorage.getItem('completedWeeklyTasks');
          if (saved) {
            const parsed = JSON.parse(saved);
            setCompletedTasks(new Set(parsed));
            await updateDoc(doc(db, 'users', user.uid), {
              completedWeeklyTasks: parsed
            });
            localStorage.removeItem('completedWeeklyTasks');
          }
        }
      };
      loadUserProgress();
    } else {
      const saved = localStorage.getItem('completedWeeklyTasks');
      if (saved) {
        setCompletedTasks(new Set(JSON.parse(saved)));
      }
    }

    // Load schedule photo
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'weekly_schedule'), (doc) => {
      if (doc.exists()) {
        setSchedulePhotoUrl(doc.data().photoUrl);
      }
    });

    const q = query(
      collection(db, 'lectures'), 
      where('isWeekly', '==', true),
      // Note: Ordering by createdAt might require a composite index if combined with where('isWeekly', '==', true)
      // For simplicity in this demo, we can sort client-side if needed, or assume the index exists.
      // Let's just fetch and sort client-side to avoid index errors.
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lecture));
      // Sort descending by createdAt
      docs.sort((a, b) => {
        const dateA = a.createdAt?.toMillis?.() || 0;
        const dateB = b.createdAt?.toMillis?.() || 0;
        return dateB - dateA;
      });
      setWeeklyLectures(docs);
      setIsLoading(false);
    });
    return () => {
      unsubscribe();
      unsubscribeSettings();
    };
  }, [user]);

  const toggleTask = async (id: string) => {
    const newSet = new Set(completedTasks);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setCompletedTasks(newSet);
    
    const tasksArray = Array.from(newSet);
    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          completedWeeklyTasks: tasksArray
        });
      } catch (error) {
        console.error('Error saving progress:', error);
      }
    } else {
      localStorage.setItem('completedWeeklyTasks', JSON.stringify(tasksArray));
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || user?.role !== 'admin') return;
    
    const file = e.target.files[0];
    if (file.size > 5 * 1024 * 1024) {
      alert(isRtl ? 'حجم الصورة يجب أن يكون أقل من 5 ميجابايت' : 'Image size must be less than 5MB');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const safeFileName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const storagePath = `settings/schedule_${Date.now()}_${safeFileName}`;
      const storageRef = ref(storage, storagePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      const photoUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on('state_changed', 
          null, 
          (err) => reject(err), 
          async () => {
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(url);
            } catch (err) {
              reject(err);
            }
          }
        );
      });

      await setDoc(doc(db, 'settings', 'weekly_schedule'), { photoUrl });
    } catch (error) {
      console.error('Error uploading schedule photo:', error);
      alert(isRtl ? 'حدث خطأ أثناء رفع الصورة' : 'Error uploading photo');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-24" dir={isRtl ? 'rtl' : 'ltr'}>
      {!user && (
        <div className="mb-6 p-4 bg-emerald-50 dark:bg-teal-900/30 border border-emerald-100 dark:border-teal-900/50 rounded-2xl flex items-center justify-between">
          <p className="text-sm text-emerald-800 dark:text-teal-300 font-medium">
            {isRtl ? 'قم بتسجيل الدخول لحفظ تقدمك عبر الأجهزة المختلفة.' : 'Sign in to save your progress across devices.'}
          </p>
        </div>
      )}
      
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-emerald-100 dark:bg-teal-900/30 rounded-2xl text-emerald-600 dark:text-teal-400">
          <ClipboardCheck className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-stone-100">{t.weeklyTasks}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {completedTasks.size} / {weeklyLectures.length} {t.completed}
          </p>
        </div>
      </div>

      {/* Schedule Photo Section */}
      <div className="mb-8 bg-white dark:bg-zinc-800 rounded-3xl p-4 border border-slate-200 dark:border-zinc-700 shadow-sm">
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-lg font-bold text-slate-900 dark:text-stone-100 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-emerald-600 dark:text-teal-400" />
            {isRtl ? 'جدول المحاضرات' : 'Lectures Schedule'}
          </h2>
          {user?.role === 'admin' && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingPhoto}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-teal-900/30 text-emerald-600 dark:text-teal-400 rounded-lg text-sm font-bold hover:bg-emerald-100 dark:hover:bg-teal-900/50 transition-colors disabled:opacity-50"
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
            <img src={schedulePhotoUrl} alt="Schedule" className="w-full h-auto object-contain max-h-[500px]" referrerPolicy="no-referrer" />
          ) : (
            <div className="text-center p-8 text-slate-400 dark:text-slate-500">
              <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>{isRtl ? 'لم يتم رفع جدول بعد' : 'No schedule uploaded yet'}</p>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-emerald-600 dark:text-teal-400 animate-spin" />
        </div>
      ) : weeklyLectures.length > 0 ? (
        <div className="space-y-3">
          {weeklyLectures.map(lecture => {
            const isCompleted = completedTasks.has(lecture.id);
            return (
              <motion.div
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={lecture.id}
                onClick={() => toggleTask(lecture.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${
                  isCompleted 
                    ? 'bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 opacity-60' 
                    : 'bg-white dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 shadow-sm hover:border-emerald-300 dark:hover:border-teal-500/50'
                }`}
              >
                <button className={`flex-shrink-0 transition-colors ${isCompleted ? 'text-emerald-500 dark:text-teal-400' : 'text-slate-300 dark:text-zinc-600'}`}>
                  {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                </button>
                <div className="flex-grow min-w-0">
                  <h3 className={`font-bold truncate ${isCompleted ? 'text-slate-500 dark:text-slate-400 line-through' : 'text-slate-900 dark:text-stone-100'}`}>
                    {lecture.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-slate-300 uppercase">
                      {t[CATEGORIES.find(c => c.value === lecture.category)?.labelKey || 'pharmacology']}
                    </span>
                    {lecture.version === 'translated' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 uppercase">
                        {t.translated}
                      </span>
                    )}
                  </div>
                </div>
                <a 
                  href={lecture.pdfUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="px-3 py-1.5 bg-emerald-50 dark:bg-teal-900/30 text-emerald-600 dark:text-teal-400 text-xs font-bold rounded-lg hover:bg-emerald-100 dark:hover:bg-teal-900/50 transition-colors whitespace-nowrap"
                >
                  {t.view}
                </a>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-zinc-800 rounded-2xl border border-slate-200 dark:border-zinc-700 border-dashed">
          <ClipboardCheck className="w-12 h-12 text-slate-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">{t.noWeeklyTasks}</p>
        </div>
      )}
    </div>
  );
}
