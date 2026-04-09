import React from 'react';
import { Search, LogOut, BookOpen, Upload, Languages } from 'lucide-react';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { UserProfile, Language, TRANSLATIONS } from '../types';

interface NavbarProps {
  user: UserProfile | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onShowUpload: () => void;
  lang: Language;
  setLang: (lang: Language) => void;
}

export default function Navbar({ user, searchQuery, setSearchQuery, onShowUpload, lang, setLang }: NavbarProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  return (
    <nav className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-gray-200" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-black text-indigo-600 hidden sm:block">{t.appName}</span>
          </div>

          <div className="flex-1 max-w-md mx-4">
            <div className="relative">
              <div className={`absolute inset-y-0 ${isRtl ? 'right-0 pr-3' : 'left-0 pl-3'} flex items-center pointer-events-none`}>
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                className={`block w-full ${isRtl ? 'pr-10 pl-3' : 'pl-10 pr-3'} py-2 border border-gray-300 rounded-full leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-all`}
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-full transition-all text-sm font-bold"
              title={lang === 'ar' ? 'English' : 'العربية'}
            >
              <Languages className="w-5 h-5" />
              <span className="hidden md:inline">{lang === 'ar' ? 'EN' : 'AR'}</span>
            </button>

            {user?.role === 'admin' && (
              <button
                onClick={onShowUpload}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden md:inline">{t.upload}</span>
              </button>
            )}
            
            {user && (
              <div className={`flex items-center gap-3 ${isRtl ? 'pr-4 border-r' : 'pl-4 border-l'} border-gray-200`}>
                <button
                  onClick={() => signOut(auth)}
                  className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-full transition-all"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
