import React, { useState, useEffect } from 'react';
import { UserProfile, Language, TRANSLATIONS, Lecture } from '../types';
import { Flame, GraduationCap, Users } from 'lucide-react';
import SubjectBrowser from './SubjectBrowser';
import WeeklyListScreen from './WeeklyListScreen';
import RecordsScreen from './RecordsScreen';
import LeaderboardTab from './LeaderboardTab';
import { motion, AnimatePresence } from 'motion/react';

type InnerTab = 'lectures' | 'weekly' | 'records' | 'leaderboard' | 'downloads';

interface HomeScreenProps {
  user: UserProfile | null;
  lang: Language;
  lectures: Lecture[];
  searchQuery: string;
  isLoading: boolean;
  onNavigateToChat: () => void;
  onEdit: (l: Lecture) => void;
  onOpenMCQ?: (l: Lecture) => void;
  setShowStudentManage: (val: boolean) => void;
  setShowAdminManage: (val: boolean) => void;
  initialTab?: InnerTab;
}

export default function HomeScreen({
  user,
  lang,
  lectures,
  searchQuery,
  isLoading,
  onNavigateToChat,
  onEdit,
  onOpenMCQ,
  setShowStudentManage,
  setShowAdminManage,
  initialTab = 'lectures'
}: HomeScreenProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  
  const [activeTab, setActiveTab] = useState<InnerTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return isRtl ? 'صباح الخير' : 'Good morning';
    if (hour < 18) return isRtl ? 'مساء الخير' : 'Good afternoon';
    return isRtl ? 'مساء الخير' : 'Good evening';
  };

  const tabs: { id: InnerTab; label: string }[] = [
    { id: 'weekly', label: isRtl ? 'واجبات الأسبوع' : 'Weekly Tasks' },
    { id: 'records', label: isRtl ? 'التسجيلات' : 'Records' },
    { id: 'lectures', label: isRtl ? 'المحاضرات' : 'Lectures' },
    { id: 'downloads', label: isRtl ? 'التنزيلات المحفوظة' : 'Saved Downloads' },
    { id: 'leaderboard', label: isRtl ? '🏆 لوحة الصدارة' : '🏆 Leaderboard' }
  ];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
      {/* Personalized Greeting Header */}
      <div className={`mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isRtl ? 'sm:text-right' : 'sm:text-left'}`}>
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-stone-100 tracking-tight mb-1">
            {getGreeting()}, {user?.name?.split(' ')[0] || (isRtl ? 'طالب' : 'Student')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-lg">
            {isRtl ? 'قسم الصيدلة - جامعة الصفوة' : 'Pharmacy Department - Al-Safwa University'}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Quick Stat Badges from the prompt */}
          <div className="flex gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-sm">
              <Users className="w-4 h-4 text-sky-500" />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">الطلاب</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-sm">
              <GraduationCap className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">أكاديمي</span>
            </div>
            {user && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl shadow-sm">
                <Flame className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{user.streakCount || 0} أيام</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Horizontal Scrollable Filter Chips */}
      <div className="flex overflow-x-auto hide-scrollbar gap-2 mb-8 pb-2" dir={isRtl ? 'rtl' : 'ltr'}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap px-6 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm ${
                isActive 
                  ? 'bg-[#2196F3] text-white' 
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="relative">
        <AnimatePresence mode="wait">
          {activeTab === 'lectures' && (
            <motion.div
              key="lectures"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <SubjectBrowser
                lectures={lectures}
                lang={lang}
                user={user}
                searchQuery={searchQuery}
                isLoading={isLoading}
                onNavigateToChat={onNavigateToChat}
                onEdit={onEdit}
                onOpenMCQ={onOpenMCQ}
              />
            </motion.div>
          )}
          {activeTab === 'downloads' && (
            <motion.div
              key="downloads"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <SubjectBrowser
                lectures={lectures.filter(l => Boolean(localStorage.getItem(`pdf_${l.id}`)))}
                lang={lang}
                user={user}
                searchQuery={searchQuery}
                isLoading={isLoading}
                onNavigateToChat={onNavigateToChat}
                onEdit={onEdit}
                onOpenMCQ={onOpenMCQ}
              />
            </motion.div>
          )}
          {activeTab === 'weekly' && (
            <motion.div
              key="weekly"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <WeeklyListScreen user={user} lang={lang} />
            </motion.div>
          )}
          {activeTab === 'records' && (
            <motion.div
              key="records"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <RecordsScreen user={user} lang={lang} searchQuery={searchQuery} onNavigateToChat={onNavigateToChat} />
            </motion.div>
          )}
          {activeTab === 'leaderboard' && (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <LeaderboardTab user={user} lang={lang} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
