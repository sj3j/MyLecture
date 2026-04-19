import React from 'react';
import { Search, LogOut, BookOpen, Upload, Languages, Moon, Sun } from 'lucide-react';
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
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export default function Navbar({ user, searchQuery, setSearchQuery, onShowUpload, lang, setLang, currentTab, theme, toggleTheme }: NavbarProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  return (
    <nav className="sticky top-0 z-50 w-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-slate-200 dark:border-zinc-800 transition-colors duration-300" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 overflow-hidden rounded-xl bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center">
              <img src="https://i.imgur.com/uZ5tK40.png" alt="Logo" className="w-8 h-8 object-contain" onError={(e) => {
                // Fallback if image is not found
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-sky-600 dark:text-sky-400"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>';
              }} />
            </div>
            <span translate="no" className="text-xl font-black text-slate-900 dark:text-stone-100 hidden sm:block notranslate">{t.appName}</span>
          </div>

          {currentTab === 'home' && (
            <div className="flex-1 max-w-md mx-4">
              <div className="relative">
                <div className={`absolute inset-y-0 ${isRtl ? 'right-0 pr-3' : 'left-0 pl-3'} flex items-center pointer-events-none`}>
                  <Search className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                </div>
                <input
                  type="text"
                  className={`block w-full ${isRtl ? 'pr-10 pl-3' : 'pl-10 pr-3'} py-2 border border-slate-300 dark:border-zinc-700 rounded-full leading-5 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-stone-100 placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-500 focus:border-sky-500 dark:focus:border-sky-500 sm:text-sm transition-all`}
                  placeholder={t.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-all"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="flex items-center gap-2 px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-all text-sm font-bold"
              title={lang === 'ar' ? 'English' : 'العربية'}
            >
              <Languages className="w-5 h-5" />
              <span translate="no" className="hidden md:inline notranslate">{lang === 'ar' ? 'EN' : 'AR'}</span>
            </button>

            {user && ['admin', 'moderator'].includes(user.role) && user?.permissions?.manageLectures !== false && currentTab === 'home' && (
              <button
                onClick={onShowUpload}
                className="flex items-center gap-2 px-4 py-2 bg-sky-600 dark:bg-sky-500 text-white dark:text-zinc-900 rounded-full hover:bg-sky-700 dark:hover:bg-sky-600 transition-colors text-sm font-bold"
              >
                <Upload className="w-4 h-4" />
                <span translate="no" className="hidden md:inline notranslate">{t.upload}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
