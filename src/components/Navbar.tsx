import React from 'react';
import { Search, LogOut, BookOpen, Upload, Languages } from 'lucide-react';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { UserProfile, Language, TRANSLATIONS } from '../types';
import { Tab } from './BottomNav';

interface NavbarProps {
  user: UserProfile | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onShowUpload: () => void;
  lang: Language;
  setLang: (lang: Language) => void;
  currentTab: Tab;
}

export default function Navbar({ user, searchQuery, setSearchQuery, onShowUpload, lang, setLang, currentTab }: NavbarProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  return (
    <nav className="sticky top-0 z-50 w-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-slate-200 dark:border-zinc-800 transition-colors duration-300" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-600 dark:bg-teal-500 p-2 rounded-xl">
              <BookOpen className="w-6 h-6 text-white dark:text-zinc-900" />
            </div>
            <span className="text-xl font-black text-slate-900 dark:text-stone-100 hidden sm:block">{t.appName}</span>
          </div>

          {currentTab === 'lectures' && (
            <div className="flex-1 max-w-md mx-4">
              <div className="relative">
                <div className={`absolute inset-y-0 ${isRtl ? 'right-0 pr-3' : 'left-0 pl-3'} flex items-center pointer-events-none`}>
                  <Search className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                </div>
                <input
                  type="text"
                  className={`block w-full ${isRtl ? 'pr-10 pl-3' : 'pl-10 pr-3'} py-2 border border-slate-300 dark:border-zinc-700 rounded-full leading-5 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-stone-100 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-teal-500 focus:border-emerald-500 dark:focus:border-teal-500 sm:text-sm transition-all`}
                  placeholder={t.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="flex items-center gap-2 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-all text-sm font-bold"
              title={lang === 'ar' ? 'English' : 'العربية'}
            >
              <Languages className="w-5 h-5" />
              <span className="hidden md:inline">{lang === 'ar' ? 'EN' : 'AR'}</span>
            </button>

            {user?.role === 'admin' && currentTab === 'lectures' && (
              <button
                onClick={onShowUpload}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 dark:bg-teal-500 text-white dark:text-zinc-900 rounded-full hover:bg-emerald-700 dark:hover:bg-teal-600 transition-colors text-sm font-bold"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden md:inline">{t.upload}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
