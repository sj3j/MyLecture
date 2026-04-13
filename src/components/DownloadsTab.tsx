import React, { useState, useEffect } from 'react';
import { Language, TRANSLATIONS, Lecture, UserProfile } from '../types';
import { collection, getDocs, doc, updateDoc, arrayRemove } from 'firebase/firestore';
import { db } from '../lib/firebase';
import SubjectBrowser from './SubjectBrowser';
import { Loader2 } from 'lucide-react';

interface DownloadsTabProps {
  lang: Language;
  user: UserProfile | null;
}

export default function DownloadsTab({ lang, user }: DownloadsTabProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  
  const [favoriteLectures, setFavoriteLectures] = useState<Lecture[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadFavorites();
  }, [user?.favorites]);

  const loadFavorites = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const favorites = user.favorites || [];
      
      if (favorites.length === 0) {
        setFavoriteLectures([]);
        setIsLoading(false);
        return;
      }

      const lecturesSnapshot = await getDocs(collection(db, 'lectures'));
      const allLectures = lecturesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lecture));

      const items = allLectures.filter(l => favorites.includes(l.id));
      setFavoriteLectures(items);
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveFavorite = async (lecture: Lecture) => {
    if (!user) return;
    
    try {
      // Optimistic UI update
      setFavoriteLectures(prev => prev.filter(l => l.id !== lecture.id));
      
      // Update Firestore
      await updateDoc(doc(db, 'users', user.uid), {
        favorites: arrayRemove(lecture.id)
      });
    } catch (error) {
      console.error('Error removing favorite:', error);
      // Revert on error
      loadFavorites();
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
      <div className={`mb-10 ${isRtl ? 'text-right' : 'text-left'}`}>
        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-stone-100 tracking-tight mb-1">
          {t.offlineDownloads}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 font-medium text-lg">
          {t.manageDownloads}
        </p>
      </div>

      <SubjectBrowser
        lectures={favoriteLectures}
        lang={lang}
        user={user}
        isLoading={isLoading}
        onRemoveDownload={handleRemoveFavorite}
      />
    </main>
  );
}
