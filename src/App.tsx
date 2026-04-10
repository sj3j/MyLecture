import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot, getDocs, where, doc, setDoc, serverTimestamp, getDoc, limit } from 'firebase/firestore';
import { Lecture, UserProfile, Category, CATEGORIES, Language, TRANSLATIONS, LectureType } from './types';
import Navbar from './components/Navbar';
import LectureCard from './components/LectureCard';
import AdminUpload from './components/AdminUpload';
import AdminManagement from './components/AdminManagement';
import BottomNav, { Tab } from './components/BottomNav';
import AnnouncementsScreen from './components/AnnouncementsScreen';
import WeeklyListScreen from './components/WeeklyListScreen';
import ProfileScreen from './components/ProfileScreen';
import { Loader2, BookOpen, SearchX, Lock, Shield, Users, UserCircle, AlertCircle, ArrowUp, ArrowDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Fuse from 'fuse.js';

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
  const [sortBy, setSortBy] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentTab, setCurrentTab] = useState<Tab>('lectures');
  const [showUpload, setShowUpload] = useState(false);
  const [lectureToEdit, setLectureToEdit] = useState<Lecture | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdminManage, setShowAdminManage] = useState(false);
  const [hasUnreadAnnouncements, setHasUnreadAnnouncements] = useState(false);

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
              photoUrl: userDoc.data().photoUrl || firebaseUser.photoURL || undefined
            });
          } else {
            setUser({
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || (isMasterAdmin ? 'Master Admin' : 'Student'),
              email: firebaseUser.email || '',
              role: isMasterAdmin ? 'admin' : 'student',
              photoUrl: firebaseUser.photoURL || undefined
            });
          }
          setIsAuthReady(true);
        }, (error) => {
          console.error("Error fetching user role:", error);
          // Fallback if permission denied
          setUser({
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || (isMasterAdmin ? 'Master Admin' : 'Student'),
            email: firebaseUser.email || '',
            role: isMasterAdmin ? 'admin' : 'student',
            photoUrl: firebaseUser.photoURL || undefined
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
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lecture));
      setLectures(docs);
      setIsLoading(false);
    }, (error) => {
      console.error('Firestore Error:', error);
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  const renderLecturesTab = () => (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
      {/* University Header */}
      <div className={`mb-12 text-center ${isRtl ? 'sm:text-right' : 'sm:text-left'}`}>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <div className={`flex items-center justify-center ${isRtl ? 'sm:justify-start' : 'sm:justify-start'} gap-3 mb-3`}>
              <span className="px-3 py-1 bg-indigo-600 text-white text-[10px] font-black rounded-full uppercase tracking-[0.2em]">
                {t.byFenix}
              </span>
              <span className="text-gray-400 font-bold text-xs uppercase tracking-widest">
                {t.university}
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight mb-2">
              {t.department}
            </h1>
            <p className="text-gray-500 font-medium text-lg">
              {t.resourceHub}
            </p>
          </div>
          
          {user?.role === 'admin' && (
            <div className="flex gap-2">
              {(user.email === 'almdrydyl335@gmail.com' || user.email === 'fenix.admin@gmail.com') && (
                <button 
                  onClick={() => setShowAdminManage(true)}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-indigo-600 rounded-2xl text-sm font-bold text-indigo-600 hover:bg-indigo-50 transition-all"
                >
                  <Users className="w-4 h-4" />
                  {t.manageAdmins}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

        {/* Primary Filters (Type) */}
        <div className="flex flex-wrap gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => setSelectedType('all')}
            className={`px-6 py-3 rounded-2xl text-sm font-black transition-all whitespace-nowrap ${
              selectedType === 'all'
                ? 'bg-indigo-900 text-white shadow-lg shadow-indigo-200'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {isRtl ? 'الكل' : 'All'}
          </button>
          <button
            onClick={() => setSelectedType('theoretical')}
            className={`px-6 py-3 rounded-2xl text-sm font-black transition-all whitespace-nowrap ${
              selectedType === 'theoretical'
                ? 'bg-indigo-900 text-white shadow-lg shadow-indigo-200'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {t.theoretical}
          </button>
          <button
            onClick={() => setSelectedType('practical')}
            className={`px-6 py-3 rounded-2xl text-sm font-black transition-all whitespace-nowrap ${
              selectedType === 'practical'
                ? 'bg-indigo-900 text-white shadow-lg shadow-indigo-200'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {t.practical}
          </button>
        </div>

        {/* Secondary Filters (Sub-categories) */}
        <div className="flex flex-wrap gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap ${
              selectedCategory === 'all'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {t.allSubjects}
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap ${
                selectedCategory === cat.value
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {t[cat.labelKey]}
            </button>
          ))}
        </div>

        {/* Sorting Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-gray-500">{t.sortBy}:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-xl focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none font-medium"
            >
              <option value="date">{t.sortDate}</option>
              <option value="title">{t.sortTitle}</option>
              <option value="number">{t.sortNumber}</option>
            </select>
          </div>
          <button
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 transition-colors"
            title={sortOrder === 'asc' ? t.sortAsc : t.sortDesc}
          >
            {sortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            {sortOrder === 'asc' ? t.sortAsc : t.sortDesc}
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <p className="text-gray-500 font-medium">{t.loading}</p>
          </div>
        ) : filteredLectures.length > 0 ? (
          <motion.div
            layout
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            <AnimatePresence mode="popLayout">
              {filteredLectures.map((lecture: Lecture) => (
                <LectureCard 
                  key={lecture.id} 
                  lecture={lecture} 
                  lang={lang} 
                  user={user} 
                  onEdit={(l) => {
                    setLectureToEdit(l);
                    setShowUpload(true);
                  }}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-[2rem] border border-dashed border-gray-300"
          >
            <div className="bg-gray-50 p-6 rounded-full mb-4">
              <SearchX className="w-12 h-12 text-gray-300" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">{t.noLectures}</h3>
            <p className="text-gray-500 max-w-xs mx-auto">
              {t.noLecturesDesc}
            </p>
          </motion.div>
        )}
      </main>
    );

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans" dir={isRtl ? 'rtl' : 'ltr'}>
      <Navbar
        user={user}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onShowUpload={() => setShowUpload(true)}
        lang={lang}
        setLang={setLang}
        currentTab={currentTab}
      />

      {currentTab === 'lectures' && renderLecturesTab()}
      {currentTab === 'announcements' && <AnnouncementsScreen user={user} lang={lang} />}
      {currentTab === 'weekly' && <WeeklyListScreen user={user} lang={lang} />}
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
