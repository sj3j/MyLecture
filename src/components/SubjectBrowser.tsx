import React, { useState } from 'react';
import { Lecture, Category, CATEGORIES, Language, TRANSLATIONS, LectureType, UserProfile } from '../types';
import LectureCard from './LectureCard';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, ChevronRight, ChevronLeft, ArrowLeft, ArrowRight, Loader2, SearchX } from 'lucide-react';

interface SubjectBrowserProps {
  lectures: Lecture[];
  lang: Language;
  user: UserProfile | null;
  onEdit?: (lecture: Lecture) => void;
  searchQuery?: string;
  isLoading?: boolean;
  onRemoveDownload?: (lecture: Lecture) => void;
}

export default function SubjectBrowser({ lectures, lang, user, onEdit, searchQuery = '', isLoading = false, onRemoveDownload }: SubjectBrowserProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  
  const [selectedCategory, setSelectedCategory] = useState<Category | 'all'>('all');
  const [selectedType, setSelectedType] = useState<LectureType>('theoretical');

  // If searching, show all matching lectures regardless of category
  if (searchQuery.trim()) {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-8 h-8 text-sky-600 dark:text-sky-400 animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">{t.loading}</p>
        </div>
      );
    }

    if (lectures.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="w-20 h-20 bg-slate-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-6">
            <SearchX className="w-10 h-10 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-stone-100 mb-2">{t.noLectures}</h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-md">{t.noLecturesDesc}</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-24">
        {lectures.map(lecture => (
          <LectureCard key={lecture.id} lecture={lecture} lang={lang} user={user} onEdit={onEdit} onRemoveDownload={onRemoveDownload} />
        ))}
      </div>
    );
  }

  if (selectedCategory === 'all') {
    return (
      <div className="flex flex-col gap-4 pb-24">
        {CATEGORIES.map(cat => {
          const count = lectures.filter(l => l.category === cat.value).length;
          return (
            <button
              key={cat.value}
              onClick={() => {
                setSelectedCategory(cat.value);
                setSelectedType('theoretical'); // Default to theoretical when opening a subject
              }}
              className="flex items-center justify-between p-5 bg-white dark:bg-zinc-800 rounded-2xl border border-slate-200 dark:border-zinc-700 hover:border-sky-300 dark:hover:border-sky-600 hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-sky-50 dark:bg-sky-900/30 rounded-xl text-sky-600 dark:text-sky-400 group-hover:scale-110 transition-transform">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div className="text-start">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-stone-100">{t[cat.labelKey]}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                    {count} {t.navLectures}
                  </p>
                </div>
              </div>
              <div className="text-slate-400 group-hover:text-sky-500 transition-colors">
                {isRtl ? <ChevronLeft className="w-6 h-6" /> : <ChevronRight className="w-6 h-6" />}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  const currentCategoryData = CATEGORIES.find(c => c.value === selectedCategory);
  const categoryLectures = lectures.filter(l => l.category === selectedCategory);
  const filteredLectures = categoryLectures.filter(l => l.type === selectedType);

  // Sort by lecture number
  filteredLectures.sort((a, b) => (a.number || 0) - (b.number || 0));

  return (
    <div className="flex flex-col pb-24">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => setSelectedCategory('all')}
          className="p-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors"
        >
          {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
        </button>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-stone-100">
          {currentCategoryData ? t[currentCategoryData.labelKey] : ''}
        </h2>
      </div>

      <div className="flex gap-2 mb-6 bg-slate-100 dark:bg-zinc-800/50 p-1.5 rounded-2xl">
        <button
          onClick={() => setSelectedType('theoretical')}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all ${
            selectedType === 'theoretical'
              ? 'bg-white dark:bg-zinc-700 text-sky-600 dark:text-sky-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          {t.theoretical}
        </button>
        <button
          onClick={() => setSelectedType('practical')}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all ${
            selectedType === 'practical'
              ? 'bg-white dark:bg-zinc-700 text-sky-600 dark:text-sky-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          {t.practical}
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-8 h-8 text-sky-600 dark:text-sky-400 animate-spin" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">{t.loading}</p>
        </div>
      ) : filteredLectures.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4 bg-white dark:bg-zinc-800 rounded-3xl border border-slate-200 dark:border-zinc-700 border-dashed">
          <div className="w-16 h-16 bg-slate-50 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-4">
            <BookOpen className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-stone-100 mb-1">{t.noLectures}</h3>
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredLectures.map(lecture => (
              <LectureCard key={lecture.id} lecture={lecture} lang={lang} user={user} onEdit={onEdit} onRemoveDownload={onRemoveDownload} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
