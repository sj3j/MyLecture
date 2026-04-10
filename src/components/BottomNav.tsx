import React from 'react';
import { Bell, BookOpen, ClipboardCheck, User } from 'lucide-react';
import { Language, TRANSLATIONS } from '../types';

export type Tab = 'announcements' | 'lectures' | 'weekly' | 'profile';

interface BottomNavProps {
  currentTab: Tab;
  setCurrentTab: (tab: Tab) => void;
  lang: Language;
}

export default function BottomNav({ currentTab, setCurrentTab, lang }: BottomNavProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  const tabs = [
    { id: 'announcements' as Tab, icon: Bell, label: t.navAnnouncements },
    { id: 'lectures' as Tab, icon: BookOpen, label: t.navLectures },
    { id: 'weekly' as Tab, icon: ClipboardCheck, label: t.navWeekly },
    { id: 'profile' as Tab, icon: User, label: t.navProfile },
  ];

  // In RTL, the array is rendered right-to-left automatically by flex-row if dir="rtl" is on the parent.
  // But we want the visual order to match the request:
  // "from Right to Left in Arabic: Announcements, Lectures, Weekly List, Profile"
  // If we use flex-row and dir="rtl", the first item in the array will be on the right.
  // So the array order should be Announcements, Lectures, Weekly List, Profile.

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe z-50">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto px-2" dir={isRtl ? 'rtl' : 'ltr'}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${
                isActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon className={`w-6 h-6 ${isActive ? 'stroke-[2.5px]' : 'stroke-2'}`} />
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
