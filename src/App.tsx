import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, getDocs, where, doc, setDoc, serverTimestamp, getDoc, limit, updateDoc } from 'firebase/firestore';
import { Lecture, UserProfile, Category, CATEGORIES, Language, TRANSLATIONS, LectureType } from './types';
import Navbar from './components/Navbar';
import LectureCard from './components/LectureCard';
import AdminUpload from './components/AdminUpload';
import AdminManagement from './components/AdminManagement';
import BottomNav, { Tab } from './components/BottomNav';
import AnnouncementsScreen from './components/AnnouncementsScreen';
import WeeklyListScreen from './components/WeeklyListScreen';
import ProfileScreen from './components/ProfileScreen';
import RecordsScreen from './components/RecordsScreen';
import SubjectBrowser from './components/SubjectBrowser';
import LoginScreen from './components/LoginScreen';
import OnboardingScreen from './components/OnboardingScreen';
import { Loader2, BookOpen, SearchX, Lock, Shield, Users, UserCircle, AlertCircle, ArrowUp, ArrowDown, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Fuse from 'fuse.js';
import { usePushNotifications } from './hooks/usePushNotifications';

type SortField = 'title' | 'date' | 'number';
type SortOrder = 'asc' | 'desc';

export default function App() {
  const [lang, setLang] = useState<Language>('ar');
  const t = TRANSLATIONS[lang];
  const isRtl = lang === 'ar';

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | 'all'>('all');
  const [selectedType, setSelectedType] = useState<LectureType | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortField>('number');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [currentTab, setCurrentTab] = useState<Tab>('announcements');
  const [showUpload, setShowUpload] = useState(false);
  const [lectureToEdit, setLectureToEdit] = useState<Lecture | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdminManage, setShowAdminManage] = useState(false);
  const [hasUnreadAnnouncements, setHasUnreadAnnouncements] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
    }
    return 'light';
  });

  const { permission, requestPermission } = usePushNotifications(user);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang, isRtl]);

  // Auth Listener
  useEffect(() => {
    const adminEmails = ["almdrydyl335@gmail.com", "fenix.admin@gmail.com"];
    let userUnsubscribe: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const isMasterAdmin = adminEmails.includes(firebaseUser.email || '');
        
        // Listen to user document
        userUnsubscribe = onSnapshot(doc(db, 'users', firebaseUser.uid), (userDoc) => {
          if (userDoc.exists()) {
            setUser({
              uid: firebaseUser.uid,
              name: userDoc.data().name || firebaseUser.displayName || (isMasterAdmin ? 'Master Admin' : 'Student'),
              email: firebaseUser.email || '',
              role: isMasterAdmin ? 'admin' : (userDoc.data().role || 'student'),
              photoUrl: userDoc.data().photoUrl || firebaseUser.photoURL || undefined,
              streakCount: userDoc.data().streakCount || 0,
              lastActiveDate: userDoc.data().lastActiveDate || undefined,
              examCode: userDoc.data().examCode || undefined,
              group: userDoc.data().group || undefined,
              favorites: userDoc.data().favorites || [],
              studied: userDoc.data().studied || [],
              completedWeeklyTasks: userDoc.data().completedWeeklyTasks || [],
              notificationPreferences: userDoc.data().notificationPreferences || { lectures: true, announcements: true }
            });
          } else {
            setUser({
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || (isMasterAdmin ? 'Master Admin' : 'Student'),
              email: firebaseUser.email || '',
              role: isMasterAdmin ? 'admin' : 'student',
              photoUrl: firebaseUser.photoURL || undefined,
              favorites: [],
              studied: [],
              completedWeeklyTasks: [],
              notificationPreferences: { lectures: true, announcements: true }
            });
          }
          setIsAuthReady(true);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
          // Fallback if permission denied
          setUser({
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || (isMasterAdmin ? 'Master Admin' : 'Student'),
            email: firebaseUser.email || '',
            role: isMasterAdmin ? 'admin' : 'student',
            photoUrl: firebaseUser.photoURL || undefined,
            favorites: [],
            studied: [],
            completedWeeklyTasks: [],
            notificationPreferences: { lectures: true, announcements: true }
          });
          setIsAuthReady(true);
        });
      } else {
        if (userUnsubscribe) {
          userUnsubscribe();
        }
        setUser(null);
        setIsAuthReady(true);
      }
    });
    return () => {
      unsubscribe();
      if (userUnsubscribe) {
        userUnsubscribe();
      }
    };
  }, []);

  // Streak Logic
  useEffect(() => {
    if (user && user.uid) {
      const today = new Date().toISOString().split('T')[0];
      const lastActive = user.lastActiveDate;
      
      if (lastActive !== today) {
        let newStreak = user.streakCount || 0;
        
        if (lastActive) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];
          
          if (lastActive === yesterdayStr) {
            newStreak += 1;
          } else {
            newStreak = 1;
          }
        } else {
          newStreak = 1;
        }
        
        // Update in Firestore
        updateDoc(doc(db, 'users', user.uid), {
          lastActiveDate: today,
          streakCount: newStreak
        }).catch(console.error);
      }
    }
  }, [user?.uid, user?.lastActiveDate]);

  // Announcements Listener for Notifications
  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const latestPost = snapshot.docs[0].data();
        const latestTime = latestPost.createdAt?.toMillis?.() || 0;
        const lastRead = parseInt(localStorage.getItem('lastReadAnnouncement') || '0', 10);
        
        if (latestTime > lastRead && currentTab !== 'announcements') {
          setHasUnreadAnnouncements(true);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'announcements');
    });
    return () => unsubscribe();
  }, [currentTab]);

  useEffect(() => {
    if (currentTab === 'announcements') {
      setHasUnreadAnnouncements(false);
      localStorage.setItem('lastReadAnnouncement', Date.now().toString());
    }
  }, [currentTab]);

  // Lectures Listener
  useEffect(() => {
    const q = query(collection(db, 'lectures'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) } as Lecture));
      setLectures(docs);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'lectures');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  let baseLectures = lectures.filter(lecture => {
    const matchesCategory = selectedCategory === 'all' || lecture.category === selectedCategory;
    const matchesType = selectedType === 'all' || lecture.type === selectedType;
    return matchesCategory && matchesType;
  });

  if (searchQuery.trim()) {
    const fuse = new Fuse(baseLectures, {
      keys: ['title', 'description'],
      threshold: 0.4,
      ignoreLocation: true,
    });
    baseLectures = fuse.search(searchQuery).map(result => result.item);
  }

  const filteredLectures = baseLectures.sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'title') {
      comparison = a.title.localeCompare(b.title, lang === 'ar' ? 'ar' : 'en');
    } else if (sortBy === 'date') {
      const dateA = a.createdAt?.toMillis?.() || 0;
      const dateB = b.createdAt?.toMillis?.() || 0;
      comparison = dateA - dateB;
    } else if (sortBy === 'number') {
      const numA = a.number || 0;
      const numB = b.number || 0;
      comparison = numA - numB;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
        <Loader2 className="w-10 h-10 text-sky-600 dark:text-sky-400 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen lang={lang} />;
  }

  if (!user.group || !user.examCode) {
    return <OnboardingScreen user={user} lang={lang} />;
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return isRtl ? 'صباح الخير' : 'Good morning';
    if (hour < 18) return isRtl ? 'مساء الخير' : 'Good afternoon';
    return isRtl ? 'مساء الخير' : 'Good evening';
  };

  const renderLecturesTab = () => (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
      {/* Personalized Greeting Header */}
      <div className={`mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${isRtl ? 'sm:text-right' : 'sm:text-left'}`}>
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-stone-100 tracking-tight mb-1">
            {getGreeting()}, {user?.name?.split(' ')[0] || (isRtl ? 'طالب' : 'Student')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-lg">
            {t.department} - {t.university}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Streak Badge */}
          {user && (
            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl shadow-sm">
              <div className="p-1.5 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
                <Flame className="w-5 h-5 text-orange-500 dark:text-orange-400" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {isRtl ? 'النشاط اليومي' : 'Daily Streak'}
                </div>
                <div className="text-lg font-black text-slate-900 dark:text-stone-100 leading-none">
                  {user.streakCount || 0} {isRtl ? 'أيام' : 'days'}
                </div>
              </div>
            </div>
          )}

          {user && ['admin', 'moderator'].includes(user.role) && (
            <div className="flex gap-2">
              {(user.email === 'almdrydyl335@gmail.com' || user.email === 'fenix.admin@gmail.com') && (
                <button 
                  onClick={() => setShowAdminManage(true)}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-zinc-800 border-2 border-sky-600 dark:border-sky-500 rounded-2xl text-sm font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-all"
                >
                  <Users className="w-4 h-4" />
                  <span className="hidden sm:inline">{t.manageAdmins}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <SubjectBrowser
        lectures={lectures}
        lang={lang}
        user={user}
        searchQuery={searchQuery}
        isLoading={isLoading}
        onEdit={(l) => {
          setLectureToEdit(l);
          setShowUpload(true);
        }}
      />
      </main>
    );

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-zinc-900 text-slate-900 dark:text-stone-100 pb-20 font-sans transition-colors duration-300" dir={isRtl ? 'rtl' : 'ltr'}>
      <Navbar
        user={user}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onShowUpload={() => setShowUpload(true)}
        lang={lang}
        setLang={setLang}
        currentTab={currentTab}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      {user && permission === 'default' && (
        <div className="bg-sky-600 text-white px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">
              {isRtl ? 'قم بتفعيل الإشعارات لتلقي تنبيهات عند إضافة محاضرات جديدة.' : 'Enable notifications to receive alerts when new lectures are added.'}
            </p>
          </div>
          <button
            onClick={requestPermission}
            className="px-4 py-1.5 bg-white text-sky-600 text-sm font-bold rounded-lg hover:bg-sky-50 transition-colors whitespace-nowrap"
          >
            {isRtl ? 'تفعيل' : 'Enable'}
          </button>
        </div>
      )}

      {currentTab === 'lectures' && renderLecturesTab()}
      {currentTab === 'announcements' && <AnnouncementsScreen user={user} lang={lang} />}
      {currentTab === 'weekly' && <WeeklyListScreen user={user} lang={lang} />}
      {currentTab === 'records' && <RecordsScreen user={user} lang={lang} searchQuery={searchQuery} />}
      {currentTab === 'profile' && <ProfileScreen user={user} lang={lang} setLang={setLang} />}

      <AdminUpload 
        isOpen={showUpload} 
        onClose={() => {
          setShowUpload(false);
          setLectureToEdit(null);
        }} 
        lang={lang} 
        lectureToEdit={lectureToEdit}
      />
      <AdminManagement isOpen={showAdminManage} onClose={() => setShowAdminManage(false)} lang={lang} />
      
      <BottomNav currentTab={currentTab} setCurrentTab={setCurrentTab} lang={lang} hasUnreadAnnouncements={hasUnreadAnnouncements} />
    </div>
  );
}
