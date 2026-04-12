import React, { useState, useEffect } from 'react';
import { Language, TRANSLATIONS, Lecture, UserProfile } from '../types';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import SubjectBrowser from './SubjectBrowser';
import { Loader2 } from 'lucide-react';

interface DownloadsTabProps {
  lang: Language;
  user: UserProfile | null;
}

const CACHE_NAME = 'offline-pdfs-v1';

export default function DownloadsTab({ lang, user }: DownloadsTabProps) {
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';
  
  const [downloadedLectures, setDownloadedLectures] = useState<Lecture[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDownloads();
  }, []);

  const loadDownloads = async () => {
    setIsLoading(true);
    try {
      if (!('caches' in window)) {
        setIsLoading(false);
        return;
      }

      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      
      if (keys.length === 0) {
        setDownloadedLectures([]);
        setIsLoading(false);
        return;
      }

      // Fetch all lectures to match with URLs
      // Using getDocs will use offline cache if available due to enableIndexedDbPersistence
      const lecturesSnapshot = await getDocs(collection(db, 'lectures'));
      const lectures = lecturesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lecture));

      const items: Lecture[] = [];
      
      for (const request of keys) {
        const url = request.url;
        const matchedLecture = lectures.find(l => l.pdfUrl === url);
        
        if (matchedLecture) {
          items.push(matchedLecture);
        }
      }
      
      setDownloadedLectures(items);
    } catch (error) {
      console.error('Error loading downloads:', error);
    } finally {
      setIsLoading(false);
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
        lectures={downloadedLectures}
        lang={lang}
        user={user}
        isLoading={isLoading}
        onRemoveDownload={(lecture) => {
          setDownloadedLectures(prev => prev.filter(l => l.id !== lecture.id));
        }}
      />
    </main>
  );
}
