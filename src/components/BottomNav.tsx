import React from 'react';
import { Bell, BookOpen, ClipboardCheck, User, HardDrive } from 'lucide-react';
import { Language, TRANSLATIONS } from '../types';

export type Tab = 'announcements' | 'lectures' | 'weekly' | 'downloads' | 'profile';

interface BottomNavProps {
  currentTab: Tab;
  setCurrentTab: (tab: Tab) => void;
  lang: Language;
  hasUnreadAnnouncements?: boolean;
}

export default function BottomNav({ currentTab, setCurrentTab, lang, hasUnreadAnnouncements }: BottomNavProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  const tabs = [
    { id: 'announcements' as Tab, icon: Bell, label: t.navAnnouncements },
    { id: 'lectures' as Tab, icon: BookOpen, label: t.navLectures },
    { id: 'weekly' as Tab, icon: ClipboardCheck, label: t.navWeekly },
    { id: 'downloads' as Tab, icon: HardDrive, label: t.navDownloads },
    { id: 'profile' as Tab, icon: User, label: t.navProfile },
  ];

  // In RTL, the array is rendered right-to-left automatically by flex-row if dir="rtl" is on the parent.
  // But we want the visual order to match the request:
  // "from Right to Left in Arabic: Announcements, Lectures, Weekly List, Profile"
  // If we use flex-row and dir="rtl", the first item in the array will be on the right.
  // So the array order should be Announcements, Lectures, Weekly List, Profile.

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 pb-safe z-50 transition-colors duration-300">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto px-2" dir={isRtl ? 'rtl' : 'ltr'}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors relative ${
                isActive ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <div className="relative">
                <Icon className={`w-6 h-6 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
                {tab.id === 'announcements' && hasUnreadAnnouncements && (
                  <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 border-2 border-white dark:border-zinc-900 rounded-full"></span>
                )}
              </div>
              <span className={`text-[10px] font-medium ${isActive ? 'font-bold' : ''}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
