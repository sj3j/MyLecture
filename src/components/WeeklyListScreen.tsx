import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Lecture, Language, TRANSLATIONS } from '../types';
import { Loader2, ClipboardCheck, CheckCircle2, Circle } from 'lucide-react';
import { motion } from 'motion/react';

interface WeeklyListScreenProps {
  lang: Language;
}

export default function WeeklyListScreen({ lang }: WeeklyListScreenProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  const [weeklyLectures, setWeeklyLectures] = useState<Lecture[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load completed tasks from local storage
    const saved = localStorage.getItem('completedWeeklyTasks');
    if (saved) {
      setCompletedTasks(new Set(JSON.parse(saved)));
    }

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
    return () => unsubscribe();
  }, []);

  const toggleTask = (id: string) => {
    const newSet = new Set(completedTasks);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setCompletedTasks(newSet);
    localStorage.setItem('completedWeeklyTasks', JSON.stringify(Array.from(newSet)));
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-24" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-blue-100 rounded-2xl text-blue-600">
          <ClipboardCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.weeklyTasks}</h1>
          <p className="text-sm text-gray-500">
            {completedTasks.size} / {weeklyLectures.length} {t.completed}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
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
                    ? 'bg-gray-50 border-gray-200 opacity-60' 
                    : 'bg-white border-gray-200 shadow-sm hover:border-blue-300'
                }`}
              >
                <button className={`flex-shrink-0 transition-colors ${isCompleted ? 'text-green-500' : 'text-gray-300'}`}>
                  {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                </button>
                <div className="flex-grow min-w-0">
                  <h3 className={`font-bold truncate ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                    {lecture.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase">
                      {t[CATEGORIES.find(c => c.value === lecture.category)?.labelKey || 'pharmacology']}
                    </span>
                    {lecture.version === 'translated' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase">
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
                  className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap"
                >
                  {t.view}
                </a>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-200 border-dashed">
          <ClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">{t.noWeeklyTasks}</p>
        </div>
      )}
    </div>
  );
}

// Need to import CATEGORIES
import { CATEGORIES } from '../types';
