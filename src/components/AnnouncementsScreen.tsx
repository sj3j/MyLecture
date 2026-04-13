import React, { useState, useEffect } from 'react';
import { Language, TRANSLATIONS, UserProfile } from '../types';
import { Loader2, Megaphone, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface TelegramPost {
  id: number;
  date: number;
  type: string;
  text: string;
  caption: string;
  photo_url: string | null;
}

interface AnnouncementsScreenProps {
  user: UserProfile | null;
  lang: Language;
}

export default function AnnouncementsScreen({ user, lang }: AnnouncementsScreenProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  const [posts, setPosts] = useState<TelegramPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAnnouncements = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setIsRefreshing(true);
    try {
      const res = await fetch(`/announcements.json?t=${new Date().getTime()}`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Error fetching announcements:', error);
    } finally {
      setIsLoading(false);
      if (showRefreshIndicator) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      fetchAnnouncements();
    }, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const timeString = lastUpdated.toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-24" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-stone-100 flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-sky-600 dark:text-sky-400" />
          {t.navAnnouncements}
        </h1>
        
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 font-medium">
          <span className="hidden sm:inline">
            {isRtl ? 'آخر تحديث:' : 'Last updated:'} {timeString}
          </span>
          <button 
            onClick={() => fetchAnnouncements(true)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            title={isRtl ? 'تحديث' : 'Refresh'}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-sky-500' : ''}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-sky-600 dark:text-sky-400 animate-spin" />
        </div>
      ) : posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map(post => {
            const content = post.text || post.caption || '';
            const date = new Date(post.date * 1000);
            
            return (
              <motion.div
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                key={post.id}
                className="bg-white dark:bg-zinc-800 p-3 sm:p-5 rounded-2xl border border-slate-200 dark:border-zinc-700 shadow-sm relative group"
              >
                <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center text-sky-600 dark:text-sky-400 font-bold overflow-hidden">
                    <Megaphone className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-stone-100">
                      {isRtl ? 'إعلان جديد' : 'New Announcement'}
                    </h3>
                    <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                      {date.toLocaleDateString(isRtl ? 'ar-EG' : 'en-US', {
                        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2 sm:space-y-3">
                  {content && (
                    <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {content}
                    </p>
                  )}
                  
                  {post.photo_url && (
                    <div className="rounded-xl overflow-hidden border border-slate-100 dark:border-zinc-700 mt-2 sm:mt-3">
                      <img 
                        src={post.photo_url} 
                        alt="Announcement" 
                        className="w-full h-auto max-h-[300px] sm:max-h-[400px] object-contain bg-slate-50 dark:bg-zinc-900 mx-auto" 
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white dark:bg-zinc-800 rounded-2xl border border-slate-200 dark:border-zinc-700 border-dashed">
          <Megaphone className="w-12 h-12 text-slate-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            {isRtl ? 'لا توجد إعلانات' : 'No announcements'}
          </p>
        </div>
      )}
    </div>
  );
}
