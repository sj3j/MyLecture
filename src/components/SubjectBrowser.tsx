import React, { useState, useEffect } from 'react';
import { Lecture, Category, CATEGORIES, Language, TRANSLATIONS, LectureType, UserProfile } from '../types';
import LectureCard from './LectureCard';
import SpotlightTooltip from './SpotlightTooltip';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, ChevronRight, ChevronLeft, ArrowLeft, ArrowRight, Loader2, SearchX, List, LayoutGrid, Grid } from 'lucide-react';

interface SubjectBrowserProps {
  lectures: Lecture[];
  lang: Language;
  user: UserProfile | null;
  onEdit?: (lecture: Lecture) => void;
  onOpenMCQ?: (lecture: Lecture) => void;
  searchQuery?: string;
  isLoading?: boolean;
  onRemoveDownload?: (lecture: Lecture) => void;
  onNavigateToChat?: () => void;
}

export default function SubjectBrowser({ lectures, lang, user, onEdit, onOpenMCQ, searchQuery = '', isLoading = false, onRemoveDownload, onNavigateToChat }: SubjectBrowserProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  
  const [selectedCategory, setSelectedCategory] = useState<Category | 'all'>('all');
  const [selectedType, setSelectedType] = useState<LectureType>('theoretical');
  const [gridColumns, setGridColumns] = useState<1 | 2 | 3>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gridColumns');
      if (saved === '1' || saved === '2' || saved === '3') {
        return parseInt(saved) as 1 | 2 | 3;
      }
    }
    return 1;
  });

  useEffect(() => {
    localStorage.setItem('gridColumns', gridColumns.toString());
  }, [gridColumns]);

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
      <div className="pb-24">
        <div className="flex items-center justify-between mb-4 px-4 sm:px-0">
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {lectures.length} {t.navLectures}
          </div>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800/50 p-1 rounded-xl">
            <button
              onClick={() => setGridColumns(1)}
              className={`p-1.5 rounded-lg transition-colors ${gridColumns === 1 ? 'bg-white dark:bg-zinc-700 shadow-sm text-sky-600 dark:text-sky-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              title="1 Column"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setGridColumns(2)}
              className={`p-1.5 rounded-lg transition-colors ${gridColumns === 2 ? 'bg-white dark:bg-zinc-700 shadow-sm text-sky-600 dark:text-sky-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              title="2 Columns"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setGridColumns(3)}
              className={`p-1.5 rounded-lg transition-colors ${gridColumns === 3 ? 'bg-white dark:bg-zinc-700 shadow-sm text-sky-600 dark:text-sky-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
              title="3 Columns"
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className={`grid gap-2 sm:gap-4 md:gap-6 px-2 sm:px-0 ${
          gridColumns === 1 ? 'grid-cols-1' : 
          gridColumns === 2 ? 'grid-cols-2' : 
          'grid-cols-3'
        }`}>
          {lectures.map(lecture => (
            <LectureCard key={lecture.id} lecture={lecture} lang={lang} user={user} onEdit={onEdit} onOpenMCQ={onOpenMCQ} onRemoveDownload={onRemoveDownload} onNavigateToChat={onNavigateToChat} />
          ))}
        </div>
      </div>
    );
  }

  if (selectedCategory === 'all') {
    const categoryColors: Record<string, { bg: string, text: string, progress: string }> = {
      'pharmacology': { bg: 'bg-indigo-50 dark:bg-indigo-900/30', text: 'text-indigo-600 dark:text-indigo-400', progress: 'bg-indigo-500' },
      'pharmacognosy': { bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', progress: 'bg-emerald-500' },
      'organic_chemistry': { bg: 'bg-rose-50 dark:bg-rose-900/30', text: 'text-rose-600 dark:text-rose-400', progress: 'bg-rose-500' },
      'biochemistry': { bg: 'bg-amber-50 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400', progress: 'bg-amber-500' },
      'cosmetics': { bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/30', text: 'text-fuchsia-600 dark:text-fuchsia-400', progress: 'bg-fuchsia-500' }
    };
    
    return (
      <div className="flex flex-col gap-4 pb-24">
        {CATEGORIES.map((cat, index) => {
          const categoryLectures = lectures.filter(l => l.category === cat.value);
          const count = categoryLectures.length;
          const studiedCount = categoryLectures.filter(l => user?.studied?.includes(l.id)).length;
          const progress = count > 0 ? Math.round((studiedCount / count) * 100) : 0;
          const colors = categoryColors[cat.value] || { bg: 'bg-[#2196F3]/10', text: 'text-[#2196F3]', progress: 'bg-[#2196F3]', border: 'border-[#2196F3]' };
          
          return (
            <button
              key={cat.value}
              onClick={() => {
                setSelectedCategory(cat.value);
                setSelectedType('theoretical');
              }}
              className={`flex flex-col p-5 bg-white dark:bg-zinc-800 rounded-[16px] shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-md transition-all group overflow-hidden relative ${isRtl ? 'border-r-4' : 'border-l-4'} ${categoryColors[cat.value] ? 'border-' + categoryColors[cat.value].progress.replace('bg-', '') : 'border-[#2196F3]'}`}
            >
              <div className="flex items-center justify-between w-full mb-6">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${colors.bg} ${colors.text} group-hover:scale-110 transition-transform`}>
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div className="text-start">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-stone-100 mb-1">{t[cat.labelKey]}</h3>
                    <div className="inline-flex items-center justify-center bg-sky-100 dark:bg-sky-900/40 text-[#2196F3] dark:text-sky-400 text-xs font-bold px-3 py-1 rounded-full">
                      {count} {t.navLectures}
                    </div>
                  </div>
                </div>
                <div className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors bg-slate-50 dark:bg-zinc-900 p-2 rounded-full">
                  {isRtl ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </div>
              </div>
              
              <div className="w-full flex items-center justify-between gap-3 text-sm mb-1 text-slate-500 dark:text-slate-400">
                <span className="font-bold text-slate-700 dark:text-slate-300">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-zinc-700 rounded-full overflow-hidden" id={index === 0 ? "subject-progress-0" : undefined}>
                <div 
                  className={`h-full ${colors.progress} rounded-full transition-all duration-500 ease-out`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </button>
          );
        })}
        <SpotlightTooltip targetSelector="#subject-progress-0" text="يتتبع تقدمك في كل مادة" tooltipKey="lectures" />
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
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {filteredLectures.length} {t.navLectures}
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-zinc-800/50 p-1 rounded-xl">
              <button
                onClick={() => setGridColumns(1)}
                className={`p-1.5 rounded-lg transition-colors ${gridColumns === 1 ? 'bg-white dark:bg-zinc-700 shadow-sm text-sky-600 dark:text-sky-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                title="1 Column"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setGridColumns(2)}
                className={`p-1.5 rounded-lg transition-colors ${gridColumns === 2 ? 'bg-white dark:bg-zinc-700 shadow-sm text-sky-600 dark:text-sky-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                title="2 Columns"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setGridColumns(3)}
                className={`p-1.5 rounded-lg transition-colors ${gridColumns === 3 ? 'bg-white dark:bg-zinc-700 shadow-sm text-sky-600 dark:text-sky-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                title="3 Columns"
              >
                <Grid className="w-4 h-4" />
              </button>
            </div>
          </div>
          <motion.div layout className={`grid gap-2 sm:gap-4 md:gap-6 px-2 sm:px-0 ${
            gridColumns === 1 ? 'grid-cols-1' : 
            gridColumns === 2 ? 'grid-cols-2' : 
            'grid-cols-3'
          }`}>
            <AnimatePresence mode="popLayout">
              {filteredLectures.map((lecture, index) => (
                <motion.div
                  layout
                  key={lecture.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, delay: index * 0.05, ease: [0.25, 0.1, 0.25, 1] }} 
                >
                  <LectureCard lecture={lecture} lang={lang} user={user} onEdit={onEdit} onOpenMCQ={onOpenMCQ} onRemoveDownload={onRemoveDownload} onNavigateToChat={onNavigateToChat} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </div>
  );
}
